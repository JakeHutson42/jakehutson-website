import { resourceBytes,decodeJSON } from './resources.js';
import { recordIdentity } from './record-identity.js';
import { BiomeCache,validateBiomeReferences } from './biomes.js';
const HASH=/^[a-f0-9]{64}$/, PATH=/^[a-z0-9][a-z0-9/._-]*$/;
export function validateCatalog(catalog, content, physics, review=false) {
    if(catalog?.schemaVersion!==1||catalog.physics!==physics||catalog.bike!==content.bikeSpec.id||catalog.assetContentId!==content.manifest.contentId||!HASH.test(catalog.id)||!Array.isArray(catalog.courses)||catalog.courses.length<1||catalog.courses.length>12)throw Error('Stale or invalid course catalogue');
    validateBiomeReferences(catalog.biomes,catalog.files);
    const ids=new Set(),hashes=new Set();
    for(const c of catalog.courses){
        if(!/^[a-z][a-z0-9-]{0,39}$/.test(c.id)||ids.has(c.id)||!HASH.test(c.contentHash)||hashes.has(c.contentHash)||typeof c.name!=='string'||c.name.length>60||!['beginner','intermediate'].includes(c.difficulty)||!['curated','generated'].includes(c.kind)||!['approved','pending'].includes(c.approval)||(!review&&c.approval!=='approved'))throw Error('Invalid or unapproved course entry');
        ids.add(c.id);hashes.add(c.contentHash);
        if(!['quarry','forestry'].includes(c.biome||'quarry')||(c.biome==='forestry'&&!catalog.biomes?.forestry))throw Error('Course biome unavailable');
        if(c.approval==='approved'&&(!c.evidence?.quote||c.evidence.contentHash!==c.contentHash))throw Error('Missing human approval evidence');
        for(const p of [c.course,c.thumbnail,c.replay])if(p&&(!PATH.test(p)||p.includes('..')||!HASH.test(catalog.files?.[p])))throw Error('Invalid course resource');
        if(!c.course||!c.thumbnail||!Array.isArray(c.skills)||!c.skills.length||c.skills.length>12||!c.skills.every(s=>typeof s==='string'&&s.length<40)||typeof c.description!=='string'||c.description.length>250)throw Error('Invalid course presentation');
        for(const name of ['gold','silver','bronze']){const m=c.medals?.[name];if(!m||!Number.isInteger(m.faults)||m.faults<0||!Number.isFinite(m.time)||m.time<=0||m.time>180)throw Error('Invalid medal targets');}
        if(c.medals.gold.faults>c.medals.silver.faults||c.medals.silver.faults>c.medals.bronze.faults||c.medals.gold.time>c.medals.silver.time||c.medals.silver.time>c.medals.bronze.time)throw Error('Unordered medals');
    }
    if(!ids.has(catalog.default))throw Error('Missing curated fallback');
    return catalog;
}
export function validateCourseEntry(course, entry) {
    if(course?.contentHash!==entry.contentHash||!Array.isArray(course.paths)||!course.paths.length||course.paths.length>12||!Array.isArray(course.checkpoints)||!course.checkpoints.length||course.checkpoints.length>20||!Array.isArray(course.sections)||!course.sections.length||!Number.isFinite(course.finish))throw Error('Course identity or geometry mismatch');
    let points=0;
    for(const path of course.paths){if(!Array.isArray(path)||path.length<2)throw Error('Invalid course path');let x=-Infinity;for(const p of path){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<x||Math.abs(p[0])>500||Math.abs(p[1])>30)throw Error('Invalid course point');x=p[0];if(++points>5000)throw Error('Course exceeds geometry budget');}}
    let checkpointX=-Infinity;for(const p of course.checkpoints){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<=checkpointX||p.x>=course.finish)throw Error('Invalid checkpoint order');checkpointX=p.x;}
    if(entry.biome==='forestry'&&(course.biome!=='forestry'||!Array.isArray(course.biomeProps)||course.biomeProps.length>160||course.biomeProps.some(p=>!['pine','granite','fallen_log','stump','timber_frame','trail_marker','cabin'].includes(p.prototype)||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||!Array.isArray(p.scale)||p.scale.length!==3||!p.scale.every(n=>Number.isFinite(n)&&n>0&&n<=2)||p.position[2]+2*p.scale[2]>-2.4||!Number.isFinite(p.yaw))))throw Error('Invalid forestry clearance/props');
    return {...course,medals:entry.medals,name:entry.name,biome:entry.biome||'quarry'};
}
export function courseProgress(catalog, records, bike, physics){
    return catalog.courses.map(c=>({id:c.id,best:records.read(recordIdentity(physics,c,bike))}));
}
export function chooseChallenge(catalog,current,random=Math.random,biome=catalog.courses.find(c=>c.id===current)?.biome||'quarry'){
    const pool=catalog.courses.filter(c=>(c.biome||'quarry')===biome&&c.kind==='generated'&&c.approval==='approved'&&c.id!==current);
    return pool.length?pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))]:null;
}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function loadCatalog(content,physics,{review=false,fetcher=fetch}={}){
    if(review&&!['localhost','127.0.0.1','[::1]'].includes(location.hostname))throw Error('Release review is local only');
    const root=new URL(review?'/.trials-build/release/':'./courses/',import.meta.url);
    const get=url=>resourceBytes(url,{fetcher});
    const pointer=decodeJSON(await get(new URL('current.json',root)));
    if(!/^releases\/[a-f0-9]{64}\/catalog\.json$/.test(pointer.catalog)||!HASH.test(pointer.sha256))throw Error('Invalid catalogue pointer');
    const base=new URL(pointer.catalog,root),bytes=await get(base);if(await sha(bytes)!==pointer.sha256)throw Error('Course catalogue checksum mismatch');
    const catalog=validateCatalog(JSON.parse(new TextDecoder().decode(bytes)),content,physics,review);
    const checked=async path=>{if(!PATH.test(path)||path.includes('..')||!catalog.files[path])throw Error('Invalid course resource');const data=await get(new URL(path,base));if(data.byteLength>2_000_000||await sha(data)!==catalog.files[path])throw Error('Stale or corrupt course resource');return data;};
    const biomes=new BiomeCache(catalog,checked,base);
    return {catalog,base,checked,environment(id){const entry=catalog.courses.find(c=>c.id===id);if(!entry)throw Error('Unknown course');return biomes.load(entry.biome||'quarry');},dispose(){biomes.dispose();},async load(id){const entry=catalog.courses.find(c=>c.id===id);if(!entry)throw Error('Unknown course');return validateCourseEntry(JSON.parse(new TextDecoder().decode(await checked(entry.course))),entry);},async replay(id){const entry=catalog.courses.find(c=>c.id===id);if(!entry?.replay)return null;const frames=JSON.parse(new TextDecoder().decode(await checked(entry.replay)));if(!Array.isArray(frames)||frames.length>3600||frames.some(f=>!['throttle','brake','lean'].every(k=>Number.isFinite(f[k])&&f[k]>=(k==='lean'?-1:0)&&f[k]<=1)))throw Error('Invalid retained replay');return frames;}};
}
