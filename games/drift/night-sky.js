import * as THREE from '../../lib/three/0.180.0/three.module.min.js';

// One self-hosted panorama, one sky draw, and two reusable streaks. No lights,
// particle allocations, bloom pass or network requests during a race.
export class NightSky {
    constructor(scene, { random = Math.random, loader = new THREE.TextureLoader() } = {}) {
        this.random = random;
        this.group = new THREE.Group();
        scene.add(this.group);
        this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        this.fallback.needsUpdate = true;
        this.material = new THREE.ShaderMaterial({
            uniforms: { panorama: { value: this.fallback }, skyTexel: { value: new THREE.Vector2(1/4096,1/2048) } },
            side: THREE.BackSide, depthWrite: false, toneMapped: false,
            vertexShader: `varying vec2 skyUv; varying vec3 direction;
                void main() { skyUv=uv; direction=normalize(position);
                    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
            fragmentShader: `uniform sampler2D panorama; uniform vec2 skyTexel; varying vec2 skyUv; varying vec3 direction;
                float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
                float noise(vec3 p) {
                    vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
                    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                        mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                        mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                        mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
                }
                float cloud(vec3 p) { return noise(p)*0.57+noise(p*2.03)*0.28+noise(p*4.09)*0.15; }
                void main() {
                    vec3 d=normalize(direction);
                    vec3 photo=texture2D(panorama,skyUv).rgb;
                    // Separate small bright stars from the broad photographic
                    // haze, so a darker sky does not erase the star field.
                    vec3 haze=(texture2D(panorama,skyUv+vec2(skyTexel.x*3.0,0.0)).rgb
                        +texture2D(panorama,skyUv-vec2(skyTexel.x*3.0,0.0)).rgb
                        +texture2D(panorama,skyUv+vec2(0.0,skyTexel.y*3.0)).rgb
                        +texture2D(panorama,skyUv-vec2(0.0,skyTexel.y*3.0)).rgb)*0.25;
                    vec3 stars=max(photo-haze-vec3(0.012),vec3(0.0));
                    float above=smoothstep(0.0,0.22,d.y);
                    float mist=pow(smoothstep(0.40,0.82,cloud(d*4.0+vec3(3,0,5))),2.0);
                    vec3 nebula=mix(vec3(0.13,0.045,0.24),vec3(0.02,0.14,0.20),cloud(d*3.0));
                    vec3 colour=vec3(0.0007,0.001,0.004)+above*(photo*vec3(0.025,0.032,0.075)
                        +stars*vec3(0.65,0.78,1.0)+nebula*mist*0.12);
                    gl_FragColor=vec4(colour,1.0);
                    #include <colorspace_fragment>
                }`,
        });
        this.dome = new THREE.Mesh(new THREE.SphereGeometry(980, 48, 24), this.material);
        this.dome.rotation.y = 0.9;
        this.dome.renderOrder = -100;
        this.dome.frustumCulled = false;
        this.group.add(this.dome);
        this.textureCache = new Map();
        this.loader = loader;
        this.ready = new Promise(resolve => {
            loader.load(new URL('./textures/night-sky.webp', import.meta.url).href, texture => {
                texture.colorSpace = THREE.SRGBColorSpace;
                this.texture = texture;
                this.textureCache.set('city',texture);
                this.material.uniforms.panorama.value = texture;
                resolve();
            }, undefined, () => resolve()); // Keep a dark nebula sky if the image fails.
        });
        this.streaks = [false, true].map(meteor => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24*3), 3));
            const colours = new Float32Array(24*3);
            const colour = new THREE.Color(meteor ? 0xffb67a : 0xbbefff);
            for (let i=0;i<24;i++) colour.clone().multiplyScalar(1-i/24).toArray(colours,i*3);
            geometry.setAttribute('color', new THREE.BufferAttribute(colours,3));
            const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
                vertexColors:true, transparent:true, opacity:0, depthWrite:false,
                fog:false, toneMapped:false, blending:THREE.AdditiveBlending,
            }));
            mesh.frustumCulled=false; mesh.visible=false; this.group.add(mesh);
            return { mesh, meteor, remaining:this.delay(meteor), age:0, active:false,
                origin:new THREE.Vector3(), velocity:new THREE.Vector3() };
        });
    }

    delay(meteor) { return meteor ? 180+this.random()*180 : 18+this.random()*30; }

    async setBiome(biome) {
        await this.ready;
        if (biome === 'synthwave' && !this.textureCache.has(biome)) {
            await new Promise(resolve => this.loader.load(new URL('./textures/synthwave-sky.webp',import.meta.url).href,
                texture => { texture.colorSpace=THREE.SRGBColorSpace; this.textureCache.set(biome,texture); resolve(); },undefined,resolve));
        }
        this.material.uniforms.panorama.value=this.textureCache.get(biome)||this.texture||this.fallback;
        if (biome === 'synthwave' && !this.sun) {
            const material=new THREE.ShaderMaterial({ depthWrite:false,toneMapped:false,transparent:true,
                vertexShader:`varying vec2 sunUv; void main(){sunUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragmentShader:`varying vec2 sunUv; void main(){
                    vec2 p=sunUv*2.0-1.0; if(dot(p,p)>1.0) discard;
                    if(sunUv.y<0.58 && fract(sunUv.y*13.0)<mix(0.45,0.10,sunUv.y)) discard;
                    gl_FragColor=vec4(mix(vec3(1.0,0.035,0.46),vec3(1.0,0.69,0.20),sunUv.y),0.95);
                    #include <colorspace_fragment>
                }` });
            this.sun=new THREE.Mesh(new THREE.PlaneGeometry(280,280),material);
            this.sun.position.set(-340,115,-760);this.sun.lookAt(0,0,0);this.sun.renderOrder=-90;
            this.group.add(this.sun);
        }
        if(this.sun) this.sun.visible=biome==='synthwave';
    }

    update(camera, seconds, { paused=false, reducedMotion=false } = {}) {
        this.group.position.copy(camera.position);
        if (reducedMotion) {
            this.streaks.forEach(s => { s.active=false; s.mesh.visible=false; });
            return;
        }
        if (paused) return;
        const dt=Math.max(0,Math.min(seconds,0.1));
        for (const s of this.streaks) {
            if (!s.active) {
                s.remaining-=dt;
                if (s.remaining>0) continue;
                const forward=new THREE.Vector3(); camera.getWorldDirection(forward);
                const angle=Math.atan2(forward.x,forward.z)+(this.random()-0.5)*1.2;
                s.origin.set(Math.sin(angle)*720,150+this.random()*180,Math.cos(angle)*720);
                s.velocity.set(Math.cos(angle)*260,-100,-Math.sin(angle)*260);
                s.age=0; s.active=true; s.mesh.visible=true;
            }
            s.age+=dt;
            const duration=s.meteor ? 2.4 : 0.85;
            if (s.age>=duration) {
                s.active=false; s.mesh.visible=false; s.remaining=this.delay(s.meteor); continue;
            }
            s.mesh.material.opacity=Math.min(1,s.age/0.08)*Math.min(1,(duration-s.age)/0.25);
            const positions=s.mesh.geometry.attributes.position;
            const tail=s.meteor ? 0.65 : 0.28;
            for (let i=0;i<24;i++) {
                const t=s.age-(Math.floor(i/2)+(i%2))*tail/12;
                positions.setXYZ(i,s.origin.x+s.velocity.x*t,s.origin.y+s.velocity.y*t,s.origin.z+s.velocity.z*t);
            }
            positions.needsUpdate=true;
        }
    }

    dispose() {
        this.group.removeFromParent();
        this.dome.geometry.dispose(); this.material.dispose();
        this.textureCache.forEach(texture=>texture.dispose()); this.fallback.dispose();
        if(this.sun) { this.sun.geometry.dispose();this.sun.material.dispose(); }
        this.streaks.forEach(s => { s.mesh.geometry.dispose(); s.mesh.material.dispose(); });
    }
}
