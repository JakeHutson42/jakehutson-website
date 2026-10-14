import * as THREE from '../../lib/three/0.180.0/three.module.min.js';
import { trackPose, nearestTrackPoint } from './math.js';
import { circuitRandom } from './biome-circuits.js';

const point=(track,p,across,y)=>{
    const pose=trackPose(track,p);
    return [pose.x+Math.cos(pose.heading)*across,y,pose.z-Math.sin(pose.heading)*across];
};
function mesh(vertices,material,name) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.computeVertexNormals();
    const result=new THREE.Mesh(geometry,material); result.name=name;
    result.receiveShadow=true; return result;
}
const quad=(v,a,b,c,d)=>v.push(...a,...b,...c,...a,...c,...d);

export function buildSynthwave(track) {
    const group=new THREE.Group();group.name='synthwave-mountains';
    const random=circuitRandom(track.seed),rock=new THREE.MeshStandardMaterial({color:0x070510,roughness:1,side:THREE.DoubleSide});
    const ground=new THREE.MeshStandardMaterial({color:0x120a24,roughness:0.85});
    const neon=new THREE.MeshBasicMaterial({color:0xff39d4,toneMapped:false,side:THREE.DoubleSide});
    const structures=track.structures||[];
    const bridgeSamples=structures.filter(f=>f.type==='bridge').flatMap(f=>{
        return Array.from({length:25},(_,i)=>{
            const p=trackPose(track,f.start+(f.end-f.start)*i/24);
            // Endpoint falloff makes the canyon meet solid ground at both
            // bridge ends rather than extending a hole under the approach.
            return {...p,depth:Math.sin(Math.PI*i/24)};
        });
    });
    // The road stays at y=0. Only the terrain falls away under bridge spans.
    const floorGeometry=new THREE.PlaneGeometry(1100,1100,160,160);
    floorGeometry.rotateX(-Math.PI/2);
    const positions=floorGeometry.attributes.position;
    for(let i=0;i<positions.count;i++) {
        let depth=0;
        for(const p of bridgeSamples) {
            const distance=Math.hypot(positions.getX(i)-p.x,positions.getZ(i)-p.z);
            const width=24*p.depth;
            depth=Math.max(depth,p.depth*(1-THREE.MathUtils.smoothstep(distance,Math.max(1,width-10),Math.max(2,width))));
        }
        positions.setY(i,-45*depth);
    }
    floorGeometry.computeVertexNormals();
    const floor=new THREE.Mesh(floorGeometry,ground);floor.name='canyon-terrain';floor.receiveShadow=true;group.add(floor);

    const mountainGeometry=new THREE.ConeGeometry(1,1,7);
    const mountains=new THREE.InstancedMesh(mountainGeometry,rock,90),dummy=new THREE.Object3D();
    let count=0;
    for(let attempt=0;attempt<1200 && count<90;attempt++) {
        const x=(random()-0.5)*1000,z=(random()-0.5)*1000,radius=25+random()*65,height=35+random()*130;
        if(nearestTrackPoint(track.points,x,z).distance<radius+30) continue;
        dummy.position.set(x,height/2-1,z);dummy.rotation.y=random()*Math.PI;
        dummy.scale.set(radius,height,radius*(0.7+random()*0.6));dummy.updateMatrix();
        mountains.setMatrixAt(count++,dummy.matrix);
    }
    mountains.count=count;mountains.name='black-mountain-peaks';mountains.castShadow=true;group.add(mountains);
    for(const feature of structures) {
        if(feature.type==='tunnel') {
            // A hollow mountain follows the actual road, including curves.
            // The 22 m opening and 15 m roof leave the chase camera clear.
            const profile=[[-32,0],[-19,27],[0,43],[19,27],[32,0],
                [11,0],[11,10],[7,15],[-7,15],[-11,10],[-11,0]];
            const shell=[],lights=[];
            const steps=Math.ceil((feature.end-feature.start)*track.length/3);
            for(let i=0;i<steps;i++) {
                const a=feature.start+(feature.end-feature.start)*i/steps,b=feature.start+(feature.end-feature.start)*(i+1)/steps;
                for(let k=0;k<profile.length;k++) {
                    const c=profile[k],d=profile[(k+1)%profile.length];
                    quad(shell,point(track,a,...c),point(track,b,...c),point(track,b,...d),point(track,a,...d));
                }
                for(const side of [-1,1]) quad(lights,point(track,a,side*10.97,7.5),point(track,b,side*10.97,7.5),
                    point(track,b,side*10.97,7.7),point(track,a,side*10.97,7.7));
            }
            const tunnel=mesh(shell,rock,'curved-mountain-tunnel');tunnel.castShadow=true;
            group.add(tunnel,mesh(lights,neon,'tunnel-light-strips'));
            for(const progress of [feature.start,feature.end]) {
                const markerProgress=progress+(progress===feature.start?-0.1:0.1)/track.length;
                // Triangulated rock face around the opening, never across it.
                const face=[];
                const triangles=[[[ -32,0],[-19,27],[-11,0]],
                    [[-19,27],[-11,10],[-11,0]],[[-19,27],[-7,15],[-11,10]],
                    [[-19,27],[0,43],[-7,15]],[[0,43],[7,15],[-7,15]],
                    [[0,43],[19,27],[7,15]],[[19,27],[11,10],[7,15]],
                    [[19,27],[11,0],[11,10]],[[19,27],[32,0],[11,0]]];
                triangles.forEach(t=>t.forEach(v=>face.push(...point(track,progress,...v))));
                group.add(mesh(face,rock,'tunnel-rock-portal'));
                // Straight magenta marker bars frame both portals; no arrows.
                const markers=[];
                for(const side of [-1,1]) for(let y=1;y<10;y+=1.5) {
                    quad(markers,point(track,markerProgress,side*11.05,y),point(track,markerProgress,side*12.2,y),
                        point(track,markerProgress,side*12.2,y+0.45),point(track,markerProgress,side*11.05,y+0.45));
                }
                quad(markers,point(track,markerProgress,-7,15.08),point(track,markerProgress,7,15.08),
                    point(track,markerProgress,7,15.5),point(track,markerProgress,-7,15.5));
                group.add(mesh(markers,neon,'straight-portal-markers'));
            }
        } else if(feature.type==='bridge') {
            const deck=[],steps=Math.ceil((feature.end-feature.start)*track.length/3);
            for(let i=0;i<steps;i++) {
                const a=feature.start+(feature.end-feature.start)*i/steps,b=feature.start+(feature.end-feature.start)*(i+1)/steps;
                const half=track.width/2+1.5;
                quad(deck,point(track,a,-half,-0.15),point(track,b,-half,-0.15),point(track,b,half,-0.15),point(track,a,half,-0.15));
                for(const side of [-1,1]) quad(deck,point(track,a,side*half,-0.15),point(track,b,side*half,-0.15),
                    point(track,b,side*half,-1.4),point(track,a,side*half,-1.4));
            }
            group.add(mesh(deck,rock,'flat-curved-bridge-deck'));
            const supports=new THREE.InstancedMesh(new THREE.BoxGeometry(2.2,44,2.2),rock,10);
            let n=0;
            for(let p=feature.start+8/track.length;p<feature.end;p+=16/track.length) {
                for(const side of [-1,1]) {
                    dummy.position.fromArray(point(track,p,side*(track.width/2-1),-23));dummy.scale.set(1,1,1);dummy.rotation.set(0,0,0);dummy.updateMatrix();
                    supports.setMatrixAt(n++,dummy.matrix);
                }
            }
            supports.count=n;supports.name='bridge-piers';group.add(supports);
        }
    }
    return group;
}
