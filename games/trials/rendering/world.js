import * as T from '../../../lib/three/0.180.0/three.module.min.js';
import { mergeGeometries } from '../../../lib/three/0.180.0/addons/utils/BufferGeometryUtils.js';
import { solveLimb } from './ik.js';
import { riderTorso } from '../simulation/rider-pose.js';
import { cameraFrame } from './camera.js';
import { beamGeometry } from './geometry.js';
import { disposeTree } from './dispose.js';
import { makeForestry } from './forestry.js';
import { resolveQuality, scenerySubset } from '../quality.js';
const V=p=>new T.Vector3(...p),mat=(color,roughness=.85,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const rng=seed=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
export class TrialsWorld {
    constructor(canvas,content,quality='auto'){
        this.canvas=canvas;this.content=content;this.course=content.course;this.spec=content.bikeSpec;
        this.qualityChoice=quality;this.quality=resolveQuality(quality,{coarse:matchMedia('(pointer: coarse)').matches,width:innerWidth,dpr:devicePixelRatio});
        this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
        try{
        const gl=this.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');canvas.dataset.renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
        this.renderer.setPixelRatio(this.quality.pixelRatio);this.renderer.shadowMap.enabled=!!this.quality.shadow;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
        this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
        this.scene=new T.Scene();this.scene.background=new T.Color('#b9c4bc');this.scene.fog=new T.Fog('#b9c4bc',25,105);
        this.camera=new T.PerspectiveCamera(32,1,.1,160);this.cameraTarget=new T.Vector3(4,1.1,0);
        this.scene.add(new T.HemisphereLight('#e4edeb','#65523e',2.4));
        this.sun=new T.DirectionalLight('#fff0cf',3.3);this.sun.position.set(-5,12,6);this.sun.castShadow=!!this.quality.shadow;this.sun.shadow.mapSize.set(this.quality.shadow||512,this.quality.shadow||512);
        Object.assign(this.sun.shadow.camera,{left:-15,right:15,top:10,bottom:-10,near:.1,far:45});this.sun.shadow.bias=-.0004;this.sun.shadow.normalBias=.025;
        this.scene.add(this.sun,this.sun.target);
        this.bike=content.bike;this.rider=content.rider;this.scene.add(this.bike,this.rider);
        for(const root of [this.bike,this.rider])root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
        this.nodes=Object.fromEntries(['chassis','frontWheel','rearWheel','forkSlider','swingarm','shock'].map(name=>[name,this.bike.getObjectByName(name)]));
        this.riderRoot=this.rider.getObjectByName('riderRoot');this.rider.updateMatrixWorld(true);
        this.bones={};this.restQ={};this.bindEnds={};
        const rootQ=this.riderRoot.getWorldQuaternion(new T.Quaternion());
        for(const def of content.rig.bones){const bone=this.rider.getObjectByName(def.name);this.bones[def.name]=bone;this.restQ[def.name]=rootQ.clone().invert().multiply(bone.getWorldQuaternion(new T.Quaternion()));this.bindEnds[def.name]=bone.worldToLocal(this.riderRoot.localToWorld(V(content.rig.joints[def.end])));}
        this.geometry=[];this.materials=[];this.textures=[];this.biome=content.environment||null;this.environment=new T.Group();this.scene.add(this.environment);this.makeEnvironment();
        this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas.parentElement);this.resize();
        this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        }catch(error){this.observer?.disconnect();this.sun?.shadow.dispose();if(this.scene)disposeTree(this.scene);this.renderer.dispose();throw error;}
    }
    texture(kind){
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),random=rng(42512);
        ctx.fillStyle=kind==='rock'?'#b3b1a0':'#ab9270';ctx.fillRect(0,0,256,256);
        for(let i=0;i<4500;i++){const shade=Math.floor(random()*80+80);ctx.fillStyle=`rgba(${shade},${shade-5},${shade-16},.18)`;ctx.fillRect(random()*256,random()*256,random()*14+1,random()*3+.5);}
        for(let i=0;i<(kind==='rock'?9:26);i++){ctx.strokeStyle=`rgba(40,39,30,${random()*.25})`;ctx.beginPath();if(kind==='rock'){const x=random()*256,y=random()*256;ctx.moveTo(x,y);ctx.lineTo(x+random()*40-20,y+random()*50);}else{ctx.moveTo(0,i*10);ctx.bezierCurveTo(70,i*10+6,170,i*10-6,256,i*10);}ctx.stroke();}
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(1,1);this.textures.push(texture);return texture;
    }
    mesh(geometry,material,parent=this.environment){const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
    makeEnvironment(){if(this.course.biome==='forestry'){if(!this.biome)throw Error('Forestry package unavailable');makeForestry(this,this.biome);}else this.makeQuarry();this.configureBiome();}
    configureBiome(){if(!this.sun)return;const spec=this.biome?.spec,light=spec?.lighting;this.scene.background=new T.Color(spec?.palette.sky||'#b9c4bc');this.scene.fog=new T.Fog(spec?.palette.fog||'#b9c4bc',light?.fogNear||25,light?.fogFar||105);this.renderer.toneMappingExposure=light?.exposure||1.25;this.sun.color.set(light?.sun||'#fff0cf');this.sun.intensity=light?.sunIntensity||3.3;}
    setQuality(choice){const old=this.quality;this.quality=resolveQuality(choice,{coarse:matchMedia('(pointer: coarse)').matches,width:innerWidth,dpr:devicePixelRatio});try{this.setCourse(this.course,this.biome);}catch(error){this.quality=old;throw error;}this.qualityChoice=choice;this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.sun.shadow.mapPass?.dispose();this.sun.shadow.mapPass=null;this.sun.castShadow=!!this.quality.shadow;this.sun.shadow.mapSize.set(this.quality.shadow||512,this.quality.shadow||512);this.renderer.shadowMap.enabled=!!this.quality.shadow;this.renderer.setPixelRatio(this.quality.pixelRatio);this.resize();}
    setCourse(course,biome=null){
        const old={course:this.course,biome:this.biome,environment:this.environment,materials:this.materials,textures:this.textures,containerDark:this.containerDark};
        this.course=course;this.biome=biome;this.environment=new T.Group();this.materials=[];this.textures=[];this.containerDark=null;
        try{this.makeEnvironment();this.scene.add(this.environment);this.scene.remove(old.environment);disposeTree(old.environment);this.initialised=false;this.maxIKError=0;}
        catch(error){disposeTree(this.environment);Object.assign(this,old);throw error;}
    }
    makeQuarry(){
        const stone=mat('#e0dbc9'),soil=mat('#92947d'),steel=mat('#435b57',.55,.55),amber=mat('#d9a64c',.55,.2),wood=mat('#b9a078');
        stone.map=this.texture('rock');wood.map=this.texture('wood');this.materials.push(stone,soil,steel,amber,wood);
        this.batches=new Map();
        const block=(p,size,material,rotation=0)=>{const g=new T.BoxGeometry(...size);g.rotateZ(rotation);g.translate(...p);if(!this.batches.has(material))this.batches.set(material,[]);this.batches.get(material).push(g);};
        const beam=(a,b,r,material)=>{const g=beamGeometry(a,b,r);if(!this.batches.has(material))this.batches.set(material,[]);this.batches.get(material).push(g);};
        for(const path of this.course.paths){
            const vertices=[],uvs=[],indices=[];
            path.forEach(([x,y])=>{vertices.push(x,y,-1.4,x,y,1.4,x,-2.8,-1.4,x,-2.8,1.4);uvs.push(x*.6,0,x*.6,1.68,x*.6,-1.68,x*.6,-1.68);});
            for(let i=0;i<path.length-1;i++){const a=i*4,b=a+4;indices.push(a,a+1,b,a+1,b+1,b,a+1,a+3,b+1,a+3,b+3,b+1,a+2,a,b+2,a,b,b+2);}
            const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();this.mesh(g,stone);
            for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1];if(dx<.05){if(dy>0)block([a[0],(a[1]+b[1])/2,1.415],[.18,dy,.025],amber);continue;}block([(a[0]+b[0])/2,(a[1]+b[1])/2-.025,0],[Math.hypot(dx,dy)+.015,.045,2.8],a[0]>=53&&a[0]<61?wood:soil,Math.atan2(dy,dx));}
        }
        // Ground and skyline sit behind the rideable layer; gaps remain genuinely empty.
        block([50,-.75,-55],[240,1,100],soil);
        const rockGeometry=new T.IcosahedronGeometry(1,1),rockMaterial=mat('#b2b9a4');
        const positions=rockGeometry.getAttribute('position'),rockUV=[];
        for(let i=0;i<positions.count;i++)rockUV.push(positions.getX(i)*.5,positions.getY(i)*.5);
        rockGeometry.setAttribute('uv',new T.Float32BufferAttribute(rockUV,2));rockMaterial.map=stone.map;
        rockGeometry.computeBoundingBox();rockMaterial.flatShading=true;
        const scenery=scenerySubset(this.course.scenery,this.quality?.scenery??1),rocks=new T.InstancedMesh(rockGeometry,rockMaterial,scenery.length),dummy=new T.Object3D();
        scenery.forEach((prop,i)=>{dummy.position.set(prop.position[0],-.25-rockGeometry.boundingBox.min.y*prop.scale[1],prop.position[2]);dummy.scale.set(...prop.scale);dummy.rotation.set(...prop.rotation);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);});
        rocks.receiveShadow=true;rocks.castShadow=true;this.environment.add(rocks);
        const cliff=mat('#a2a38c'),cliffShade=mat('#8c967f');cliff.map=stone.map;cliffShade.map=stone.map;this.materials.push(cliff,cliffShade);
        for(let tier=0;tier<(this.quality?.benches??4);tier++){
            const z=-22-tier*10;
            for(let x=-30;x<145;x+=7){
                const top=1.2+tier*1.9+Math.sin(x*.16+tier)*.45;
                block([x,top/2-.3,z-Math.sin(x*.2)*1.6],[7.1,top,8],(Math.floor(x/7)+tier)%3?cliff:cliffShade);
                for(let seam=0;seam<(this.quality?.name==='low'?0:3);seam++)block([x-2+seam*1.8,top*.42,z+4.03-Math.sin(x*.2)*1.6],[.018,top*.65,.02],soil);
            }
        }
        // Exposed timber bracing under the launch and technical platforms.
        for(const x of [55,57,59,60,86,88,90,94,96,98]){
            const path=this.course.paths.find(p=>x>=p[0][0]&&x<=p.at(-1)[0]);
            const i=path?.findIndex((p,i)=>i&&p[0]>=x);
            if(!i||i<0)continue;const a=path[i-1],b=path[i];
            const y=a[1]+(b[1]-a[1])*(x-a[0])/Math.max(.001,b[0]-a[0]);
            for(const z of [-1.45,1.45]){block([x,(y-2.6)/2,z],[.16,y+2.6,.16],wood);beam([x-1,-2.5,z],[x,y-.05,z],.055,wood);}
        }
        for(const x of [38,53,78,87,95])this.sign(x===53?`GAP / ${(this.course.jump.landing[0]-61).toFixed(1)} M`:x===78?'BRAKE / RESET':'LIFT / SETTLE',[x,1.9,-2.3],1.35,.46);
        for(const x of [101.6,104.4]){block([x,2.6,-1.9],[.16,2.7,.16],steel);}
        block([103,4,-1.9],[2.96,.18,.18],amber);
        // Timberwork, bolts, back fence, containers and a recognisable lattice crane.
        for(let x=-3;x<34;x+=2.4){block([x,.7,-1.8],[.08,1.4,.08],steel);beam([x,.95,-1.8],[x+2.4,.95,-1.8],.018,steel);beam([x,.45,-1.8],[x+2.4,.45,-1.8],.018,steel);}
        for(let x=0;x<9;x+=1.6){block([x,-.25,1.35],[.18,.35,.16],wood);block([x,-.25,-1.35],[.18,.35,.16],wood);}
        for(const {x,y} of this.course.checkpoints){
            block([x,y+.23,-1.52],[.09,1.3,.09],steel);block([x,y+.83,-1.52],[.35,.12,.08],amber);
            for(let i=0;i<4;i++)block([x,.2+i*.22,-1.47],[.10,.10,.02],amber);
        }
        for(let i=0;i<3;i++){
            const x=16+i*5;block([x,.7,-5],[4.6,1.4,2],i===1?amber:steel);
            for(let j=0;j<16;j++)block([x-2.1+j*.27,.7,-3.98],[.035,1.3,.04],darkMaterial(this));
        }
        for(let y=0;y<4.4;y+=.8){
            for(const x of [7.5,8.4])beam([x,y,-10],[x,y+.8,-10],.05,steel);
            beam([7.5,y,-10],[8.4,y+.8,-10],.028,steel);beam([8.4,y,-10],[7.5,y+.8,-10],.028,steel);
        }
        beam([3,4.4,-10],[18,4.4,-10],.11,amber);beam([3,4.9,-10],[18,4.9,-10],.07,amber);
        for(let x=3;x<18;x+=1)beam([x,4.4,-10],[x+1,4.9,-10],.035,amber);
        beam([16,4.4,-10],[16,2,-10],.018,steel);block([16,1.9,-10],[.23,.23,.23],steel);
        block([5,3.9,-10],[1.2,.8,1.1],steel);
        // A few useful-scale stacks, never crossing the riding corridor.
        for(let i=0;i<10;i++)block([5+(i%3)*.6,.15+Math.floor(i/3)*.22,-3],[.55,.2,.9],wood);
        for(const [material,geometries]of this.batches){const merged=mergeGeometries(geometries);if(!merged||!merged.getAttribute('position').array.every(Number.isFinite))throw new Error('Invalid generated quarry geometry');this.mesh(merged,material);for(const g of geometries)g.dispose();}
        this.sign(`QUARRY / WORKS\n${this.course.name.toUpperCase()}`,[-.5,1.7,-2.1],2.6,1.1);
        this.sign('WORKS\nQT 250',[13,1.7,-4.1],1.3,.85);
        this.sign('FINISH',[this.course.finish,3,-1.55],1.5,.55);
    }
    sign(text,p,w,h){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#233d37';ctx.fillRect(0,0,512,256);ctx.fillStyle='#dfa747';ctx.fillRect(0,0,12,256);ctx.fillStyle='#f4e8cb';ctx.font='bold 45px sans-serif';text.split('\n').forEach((line,i)=>ctx.fillText(line,30,95+i*65));
        const stand=darkMaterial(this),posts=[beamGeometry([p[0]-w*.32,-.25,p[2]-.05],[p[0]-w*.32,p[1],p[2]-.05],.025),beamGeometry([p[0]+w*.32,-.25,p[2]-.05],[p[0]+w*.32,p[1],p[2]-.05],.025)];this.mesh(mergeGeometries(posts),stand);for(const g of posts)g.dispose();
        const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;this.textures.push(texture);const material=new T.MeshStandardMaterial({map:texture,roughness:.8});this.materials.push(material);this.mesh(new T.PlaneGeometry(w,h),material).position.set(...p);
    }
    resize(){const {width,height}=this.canvas.parentElement.getBoundingClientRect();if(!width||!height)return;this.renderer.setSize(width,height,false);this.canvas.dataset.quality=this.quality?.name||'high';this.canvas.dataset.resolution=JSON.stringify({width,height,dpr:this.renderer.getPixelRatio(),userAgent:navigator.userAgent});this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
    setRider(pose){
        const chassis=pose.chassis,points=riderTorso(pose,this.spec),hip=points.pelvis;
        for(const side of ['L','R']){
            const z=side==='L'?1:-1;
            points[`shoulder_${side}`]=[...points.chest.slice(0,2),.15*z];
            points[`hand_${side}`]=[...this.spec.handlebar,.25*z];
            const rest=this.content.rig.joints,length=(a,b)=>V(rest[a]).distanceTo(V(rest[b]));
            points[`elbow_${side}`]=solveLimb(points[`shoulder_${side}`],points[`hand_${side}`],length(`shoulder_${side}`,`elbow_${side}`),length(`elbow_${side}`,`hand_${side}`),-1,this.content.riderSpec.elbowLimits);
            points[`hip_${side}`]=[...hip.slice(0,2),.12*z];points[`foot_${side}`]=[...this.spec.peg,.20*z];
            points[`knee_${side}`]=solveLimb(points[`hip_${side}`],points[`foot_${side}`],length(`hip_${side}`,`knee_${side}`),length(`knee_${side}`,`foot_${side}`),1,this.content.riderSpec.kneeLimits);
        }
        this.riderRoot.position.set(chassis.x,chassis.y,0);this.riderRoot.quaternion.setFromAxisAngle(new T.Vector3(0,0,1),chassis.angle);this.rider.updateMatrixWorld(true);
        const rootQ=this.riderRoot.getWorldQuaternion(new T.Quaternion());
        for(const def of this.content.rig.bones){
            const bone=this.bones[def.name],a=V(points[def.start]),b=V(points[def.end]);
            const restDirection=V(this.content.rig.joints[def.end]).sub(V(this.content.rig.joints[def.start])).normalize();
            const desired=b.clone().sub(a).normalize(),delta=new T.Quaternion().setFromUnitVectors(restDirection,desired);
            const worldQ=rootQ.clone().multiply(delta).multiply(this.restQ[def.name]);
            const worldStart=this.riderRoot.localToWorld(a.clone());bone.position.copy(bone.parent.worldToLocal(worldStart));
            bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(worldQ));bone.updateMatrixWorld(true);
        }
        let error=0;
        for(const def of this.content.rig.bones.filter(d=>d.name.startsWith('forearm')||d.name.startsWith('shin'))){const actual=this.bones[def.name].localToWorld(this.bindEnds[def.name].clone()),target=this.riderRoot.localToWorld(V(points[def.end]));error=Math.max(error,actual.distanceTo(target));}
        this.canvas.dataset.ikError=error.toFixed(6);this.maxIKError=Math.max(this.maxIKError||0,error);this.canvas.dataset.maxIkError=this.maxIKError.toFixed(6);
    }
    render(game,dt){
        const pose=game.interpolated(game.state==='running'?game.accumulator/(1/120):1),chassis=pose.chassis;
        this.nodes.chassis.position.set(chassis.x,chassis.y,0);this.nodes.chassis.rotation.z=chassis.angle;
        for(const [key,name]of [['front','frontWheel'],['rear','rearWheel']]){this.nodes[name].position.set(pose[key].x,pose[key].y,0);this.nodes[name].rotation.z=pose[key].angle;}
        this.nodes.forkSlider.position.set(pose.front.x,pose.front.y,0);this.nodes.forkSlider.rotation.z=chassis.angle;
        const pivot=V([...this.spec.swingPivot,0]).applyAxisAngle(new T.Vector3(0,0,1),chassis.angle).add(V([chassis.x,chassis.y,0]));
        this.nodes.swingarm.position.copy(pivot);this.nodes.swingarm.rotation.z=Math.atan2(pose.rear.y-pivot.y,pose.rear.x-pivot.x)-Math.atan2(this.spec.rearAxle[1]-this.spec.swingPivot[1],this.spec.rearAxle[0]-this.spec.swingPivot[0]);
        const swingLength=Math.hypot(pose.rear.x-pivot.x,pose.rear.y-pivot.y)/Math.hypot(this.spec.rearAxle[0]-this.spec.swingPivot[0],this.spec.rearAxle[1]-this.spec.swingPivot[1]);this.nodes.swingarm.scale.set(swingLength,swingLength,1);
        this.nodes.shock.scale.y=Math.max(.65,Math.min(1.15,(pose.chassis.y-pose.rear.y+.25)/.25));
        this.setRider(pose);
        const speed=Math.max(0,game.chassis.getLinearVelocity().x),framing=cameraFrame(this.course,this.previewAt?{x:this.previewAt,y:2}:chassis,this.previewAt?7:speed,this.camera.aspect);
        const target=new T.Vector3(framing.x,framing.y,0),blend=this.reduced?1:1-Math.exp(-5*Math.min(dt,.1));
        if(!this.initialised||Math.abs(this.cameraTarget.x-target.x)>12){this.cameraTarget.copy(target);this.initialised=true;}else this.cameraTarget.lerp(target,blend);
        this.camera.position.copy(this.cameraTarget).add(new T.Vector3(.7,2.2,framing.distance));this.camera.lookAt(this.cameraTarget);
        this.sun.position.set(chassis.x-5,12,6);this.sun.target.position.set(chassis.x,0,0);
        this.renderer.render(this.scene,this.camera);
        this.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);this.canvas.dataset.triangles=String(this.renderer.info.render.triangles);
        this.canvas.dataset.resources=JSON.stringify({...this.renderer.info.memory,programs:this.renderer.info.programs.length});
    }
    dispose(){this.observer.disconnect();this.sun.shadow.dispose();disposeTree(this.scene);this.renderer.dispose();}
}
function darkMaterial(world){if(!world.containerDark){world.containerDark=mat('#334b46',.8,.4);world.materials.push(world.containerDark);}return world.containerDark;}
