const KEY='quarry-trials:v1';
const valid=r=>r&&Number.isFinite(r.time)&&r.time>0&&r.time<86400&&Number.isInteger(r.faults)&&r.faults>=0&&r.faults<100000;
export class TrialsRecords {
    constructor(storage){
        this.entries=new Map();this.available=false;
        try{
            this.storage=storage===undefined?globalThis.localStorage:storage;
            const raw=this.storage?.getItem(KEY)||'null';const saved=raw.length<=65536?JSON.parse(raw):null;
            if(saved?.version===1&&Array.isArray(saved.entries))for(const pair of saved.entries.slice(-40))if(Array.isArray(pair)&&typeof pair[0]==='string'&&pair[0].length<300&&valid(pair[1]))this.entries.set(pair[0],{time:pair[1].time,faults:pair[1].faults});
            this.available=!!this.storage;
        }catch{this.available=false;}
    }
    read(id){const r=this.entries.get(id);return r?{...r}:null;}
    record(id,result){
        if(typeof id!=='string'||id.length>=300||!valid(result))return false;
        const old=this.read(id);
        if(old&&(old.faults<result.faults||old.faults===result.faults&&old.time<=result.time))return false;
        this.entries.delete(id);this.entries.set(id,{time:result.time,faults:result.faults});
        while(this.entries.size>40)this.entries.delete(this.entries.keys().next().value);
        try{this.storage?.setItem(KEY,JSON.stringify({version:1,entries:[...this.entries]}));this.available=!!this.storage;}catch{this.available=false;}
        return true;
    }
}
