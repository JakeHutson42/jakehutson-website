// Regeneration stays local: deform a validated short circuit, then recheck the
// complete road. Each biome owns one current circuit and its own record identity.
export const BIOMES = { city: 'Night City', synthwave: 'Synthwave Highway' };
export function circuitRandom(seed) {
    return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function safeCircuit(points,width=15) {
    for(let i=0;i<points.length;i++) {
        const p=points[i],a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];
        const ax=p[0]-a[0],az=p[1]-a[1],bx=b[0]-p[0],bz=b[1]-p[1];
        const turn=Math.abs(Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
        if(distance(p,b)/Math.max(turn,1e-6)<15.5) return false;
        for(let j=i+21;j<points.length;j++) {
            if(points.length-(j-i)>20 && distance(p,points[j])<width+3) return false;
        }
    }
    return true;
}

function resample(points) {
    const lengths=[0];
    for(let i=0;i<points.length;i++) lengths.push(lengths.at(-1)+distance(points[i],points[(i+1)%points.length]));
    let segment=0;
    return points.map((_,i)=>{
        const target=lengths.at(-1)*i/points.length;
        while(lengths[segment+1]<target) segment++;
        const t=(target-lengths[segment])/(lengths[segment+1]-lengths[segment]);
        return points[segment].map((v,a)=>v+(points[(segment+1)%points.length][a]-v)*t);
    });
}

export function planStructures(track) {
    if(track.biome!=='synthwave') return [];
    const random=circuitRandom(Math.imul(track.seed^0x54a6e9,0x9e3779b1)), features=[];
    for(const type of ['tunnel','bridge']) {
        if(random()<0.25) continue;
        const span=(type==='tunnel'?65:75)/track.length;
        for(let attempt=0;attempt<80;attempt++) {
            const start=0.08+random()*(0.8-span),end=start+span;
            if(features.some(f=>start<f.end+0.08 && end>f.start-0.08)) continue;
            let clear=true;
            for(let i=Math.floor(start*track.points.length);i<=Math.ceil(end*track.points.length);i+=4) {
                if(type==='tunnel') {
                    const p=track.points[i],a=track.points[i-1],b=track.points[i+1];
                    const ax=p[0]-a[0],az=p[1]-a[1],bx=b[0]-p[0],bz=b[1]-p[1];
                    const turn=Math.abs(Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
                    if(distance(p,b)/Math.max(turn,1e-6)<40) { clear=false;break; }
                }
                for(let j=0;j<track.points.length;j+=4) {
                    const p=j/track.points.length;
                    if(p>start-50/track.length && p<end+50/track.length) continue;
                    if(distance(track.points[i],track.points[j])<48) { clear=false;break; }
                }
                if(!clear) break;
            }
            if(clear) { features.push({type,start,end});break; }
        }
    }
    return features;
}

export function generateCircuit(base,biome,seed) {
    if(!BIOMES[biome]) throw new Error('Unknown biome.');
    const random=circuitRandom(seed);
    for(let attempt=0;attempt<100;attempt++) {
        const phase=random()*Math.PI*2,angle=random()*Math.PI*2;
        const sx=1.04+random()*0.08,sz=1.04+random()*0.08;
        const bend=8+random()*14,mirror=random()<0.5?-1:1;
        let points=base.points.map(([x,z])=>{
            const px=x*sx+bend*Math.sin(z/90+phase);
            const pz=z*sz+bend*0.7*Math.sin(x/105-phase);
            return [mirror*(px*Math.cos(angle)-pz*Math.sin(angle)),px*Math.sin(angle)+pz*Math.cos(angle)];
        });
        points=resample(points);
        const length=points.reduce((sum,p,i)=>sum+distance(p,points[(i+1)%points.length]),0);
        if(length>1810 || !safeCircuit(points)) continue;
        const track={...base,points,seed:seed>>>0,biome,name:BIOMES[biome],
            date:`${biome}-${(seed>>>0).toString(16).padStart(8,'0')}`,
            length,drivingLength:length,elevations:points.map(()=>0),bridges:[],structures:[]};
        delete track.loop;
        track.structures=planStructures(track);
        return track;
    }
    throw new Error('Could not find a clear route. Hit regenerate to try another.');
}

export class CircuitLibrary {
    constructor(base,storage) {
        this.base=base;this.tracks=new Map();this.seeds={};
        try { this.storage=storage||globalThis.localStorage;
            const saved=JSON.parse(this.storage?.getItem('apex-drift:biomes:v1')||'{}');
            for(const biome of Object.keys(BIOMES)) if(Number.isInteger(saved[biome])) this.seeds[biome]=saved[biome]>>>0;
        } catch { /* Memory-only generation still works. */ }
    }
    get(biome) {
        if(!this.tracks.has(biome)) {
            const seed=this.seeds[biome]??((this.base.seed^(biome==='city'?0x3fa468:0x8b7df9))>>>0);
            this.tracks.set(biome,generateCircuit(this.base,biome,seed));this.seeds[biome]=seed;
        }
        return this.tracks.get(biome);
    }
    regenerate(biome,seed=(Math.random()*4294967296)>>>0) {
        if(seed===this.seeds[biome]) seed=(seed+1)>>>0;
        const track=generateCircuit(this.base,biome,seed);
        this.tracks.set(biome,track);this.seeds[biome]=seed;
        try { this.storage?.setItem('apex-drift:biomes:v1',JSON.stringify(this.seeds)); } catch { /* Keep the new route for this visit. */ }
        return track;
    }
}
