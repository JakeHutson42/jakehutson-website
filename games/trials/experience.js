export function medal(course, result) {
    for (const name of ['gold', 'silver', 'bronze']) {
        const target = course.medals[name];
        if (result.faults <= target.faults && result.time <= target.time) return name;
    }
    return 'finisher';
}
export class Preferences {
    constructor(storage) {
        this.sound = true; this.hints = true;this.livery='works';this.quality='auto';this.touch='auto';this.handedness='right';
        try { this.storage = storage === undefined ? globalThis.localStorage : storage; const raw=this.storage?.getItem('quarry-trials:preferences')||'null';const saved = raw.length<=4096?JSON.parse(raw):null; for (const key of ['sound','hints']) if (typeof saved?.[key] === 'boolean') this[key] = saved[key];if(['works','signal','survey'].includes(saved?.livery))this.livery=saved.livery;for(const [key,allowed]of Object.entries({quality:['auto','high','balanced','low'],touch:['auto','on','off'],handedness:['right','left']}))if(allowed.includes(saved?.[key]))this[key]=saved[key]; } catch { /* Defaults remain usable. */ }
    }
    save() { try { this.storage?.setItem('quarry-trials:preferences', JSON.stringify({ sound:this.sound, hints:this.hints,livery:this.livery,quality:this.quality,touch:this.touch,handedness:this.handedness })); } catch { /* Preference remains valid for this visit. */ } }
}
