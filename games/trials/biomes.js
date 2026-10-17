import { GLTFLoader } from '../../lib/three/0.180.0/addons/loaders/GLTFLoader.js';
import { disposeTree } from './rendering/dispose.js';
export function validateBiomeReferences(biomes,files){
    if(biomes===undefined)return;
    if(!biomes||typeof biomes!=='object'||Array.isArray(biomes)||Object.keys(biomes).length>4)throw Error('Invalid biome bank');
    for(const [id,b]of Object.entries(biomes)){
        if(!['quarry','forestry'].includes(id)||b.id!==id||typeof b.name!=='string'||b.name.length>60)throw Error('Invalid biome identity');
        if(id==='forestry')for(const key of ['spec','kit','ambience'])if(typeof b[key]!=='string'||b[key].includes('..')||b[key].startsWith('/')||!files[b[key]])throw Error('Missing hashed biome resource');
    }
}
export function validateBiomeSpec(spec){
    if(spec?.schemaVersion!==1||spec.id!=='forestry'||!spec.palette||Object.values(spec.palette).some(v=>!/^#[a-f0-9]{6}$/i.test(v))||spec.corridor?.halfWidth!==1.4||spec.corridor?.height!==2.4||!Array.isArray(spec.prototypes)||spec.prototypes.length!==7)throw Error('Invalid forestry specification');
    for(const [key,min,max]of [['exposure',.5,2],['sunIntensity',.5,5],['fogNear',20,40],['fogFar',80,150]])if(!Number.isFinite(spec.lighting?.[key])||spec.lighting[key]<min||spec.lighting[key]>max)throw Error('Invalid biome lighting');
    return spec;
}
export class BiomeCache {
    constructor(catalog,checked,base){Object.assign(this,{catalog,checked,base});this.entries=new Map();this.closed=false;}
    async load(id='quarry'){
        if(id==='quarry')return null;if(this.closed)throw Error('Biome cache disposed');
        if(!this.catalog.biomes?.[id])throw Error('Unknown biome');
        if(!this.entries.has(id)){
            const promise=this.prepare(id).catch(error=>{this.entries.delete(id);throw error;});this.entries.set(id,promise);
        }
        return this.entries.get(id);
    }
    async prepare(id){const ref=this.catalog.biomes[id];const [specBytes,kitBytes,ambience]=await Promise.all([this.checked(ref.spec),this.checked(ref.kit),this.checked(ref.ambience)]);const spec=validateBiomeSpec(JSON.parse(new TextDecoder().decode(specBytes))),gltf=await new GLTFLoader().parseAsync(kitBytes,this.base.href);if(this.closed){disposeTree(gltf.scene);throw Error('Biome load cancelled');}if(spec.prototypes.some(name=>!gltf.scene.getObjectByName(name))){disposeTree(gltf.scene);throw Error('Incomplete forestry kit');}return {id,spec,kit:gltf.scene,ambience};}
    dispose(){this.closed=true;for(const promise of this.entries.values())promise.then(pack=>disposeTree(pack.kit)).catch(()=>{});this.entries.clear();}
}
