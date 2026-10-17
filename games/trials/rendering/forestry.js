import * as T from '../../../lib/three/0.180.0/three.module.min.js';
import { mergeGeometries } from '../../../lib/three/0.180.0/addons/utils/BufferGeometryUtils.js';
import { beamGeometry } from './geometry.js';
import { scenerySubset } from '../quality.js';
export function makeForestry(world,pack){
    const palette=pack.spec.palette,material=(name)=>new T.MeshStandardMaterial({color:palette[name],roughness:.9});
    const soil=material('soil'),grass=material('grass'),wood=material('timber'),rock=material('granite'),water=material('water'),snow=material('snow');
    world.materials.push(soil,grass,wood,rock,water,snow);wood.map=world.texture('wood');
    const batches=new Map(),add=(geometry,mat)=>{if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(geometry);};
    const box=(p,size,mat,angle=0)=>{const g=new T.BoxGeometry(...size);g.rotateZ(angle);g.translate(...p);add(g,mat);};
    for(const path of world.course.paths){
        const vertices=[],uv=[],indices=[];
        for(const [x,y]of path){vertices.push(x,y,-1.4,x,y,1.4,x,-3,-1.4,x,-3,1.4);uv.push(x,0,x,1,x,-1,x,-1);}
        for(let i=0;i<path.length-1;i++){const a=i*4,b=a+4;indices.push(a,a+1,b,a+1,b+1,b,a+2,a,b+2,a,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();world.mesh(g,soil);
        for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b[0]-a[0],dy=b[1]-a[1];if(dx<=0)continue;
            const zone=world.course.surfaceZones?.find(z=>a[0]>=z.range[0]&&a[0]<z.range[1]),mat=zone?.material==='timber'?wood:zone?.material==='granite'?rock:grass;
            box([(a[0]+b[0])/2,(a[1]+b[1])/2-.025,0],[Math.hypot(dx,dy),.05,2.8],mat,Math.atan2(dy,dx));
        }
    }
    // The remote forest floor and stream have no collision. The riding gap stays empty.
    box([50,-.8,-50],[240,1,90],grass);box([63,-3.2,0],[5,.08,6],water);
    for(const x of [54,56,58,60])for(const z of [-1.5,1.5]){const y=surface(world.course,x);box([x,(y-2.8)/2,z],[.15,y+2.8,.15],wood);add(beamGeometry([x-1,-2.7,z],[x,y-.08,z],.06),wood);}
    // Mountain silhouettes have authored placement well behind the scenery corridor.
    for(let i=0;i<9;i++){const x=-20+i*22,h=12+(i%3)*4,g=new T.ConeGeometry(16,h,5);g.translate(x,h/2-1,-62-(i%2)*12);add(g,rock);const cap=new T.ConeGeometry(5,h*.32,5);cap.translate(x,h*.84-1,-62-(i%2)*12);add(cap,snow);}
    pack.kit.updateMatrixWorld(true);
    for(const prototype of pack.spec.prototypes){
        const root=pack.kit.getObjectByName(prototype),all=world.course.biomeProps.filter(p=>p.prototype===prototype),props=['pine','granite'].includes(prototype)?scenerySubset(all,world.quality?.scenery??1):all;if(!root)throw Error('Missing forestry prototype '+prototype);if(!props.length)continue;
        root.traverse(source=>{if(!source.isMesh)return;const geometry=source.geometry.clone();geometry.applyMatrix4(source.matrixWorld);const sourceMaterials=Array.isArray(source.material)?source.material:[source.material],materials=sourceMaterials.map(m=>{const clone=m.clone();for(const [key,value]of Object.entries(m))if(value?.isTexture)clone[key]=value.clone();return clone;});
            const mesh=new T.InstancedMesh(geometry,Array.isArray(source.material)?materials:materials[0],props.length),dummy=new T.Object3D();
            props.forEach((p,i)=>{dummy.position.set(...p.position);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(...p.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;world.environment.add(mesh);
        });
    }
    for(const cp of world.course.checkpoints){box([cp.x,cp.y+.3,-1.6],[.1,1.2,.1],wood);box([cp.x,cp.y+.8,-1.6],[.42,.13,.1],snow);}
    for(const [mat,geometries]of batches){const merged=mergeGeometries(geometries);if(!merged||!merged.attributes.position.array.every(Number.isFinite))throw Error('Invalid forestry terrain');world.mesh(merged,mat);for(const g of geometries)g.dispose();}
    world.sign('FORESTRY / TRAIL\n'+world.course.name.toUpperCase(),[.5,1.6,-2.3],2.7,.9);world.sign('TIMBER / CROSSING',[53,1.9,-2.3],1.7,.45);world.sign('RIDGE / FINISH',[103,2.7,-2.2],1.8,.5);
}
function surface(course,x){for(const p of course.paths)for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];if(a[0]<=x&&b[0]>=x&&b[0]>a[0])return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);}throw Error('Support outside riding path');}
