export const DEFAULT_GENERATION = Object.freeze({ difficulty:3, variety:50, tightness:50, depth:50 });

export function normaliseGeneration(value={}) {
    const result={};
    for(const [key,fallback] of Object.entries(DEFAULT_GENERATION)) {
        const number=Number(value?.[key]??fallback),max=key==='difficulty'?5:100,min=key==='difficulty'?1:0;
        result[key]=Number.isFinite(number)?Math.max(min,Math.min(max,Math.round(number))):fallback;
    }
    return result;
}

export function generationHash(settings) {
    const normal=normaliseGeneration(settings);
    if(Object.keys(DEFAULT_GENERATION).every(key=>normal[key]===DEFAULT_GENERATION[key])) return 0;
    let hash=2166136261;
    for(const char of JSON.stringify(normal)) hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
    return hash;
}

export class TrackSettings {
    constructor(dialog,{read,apply}) {
        this.dialog=dialog;this.read=read;this.apply=apply;
        this.form=dialog.querySelector('form');this.status=dialog.querySelector('[data-settings-status]');
        this.inputs=[...dialog.querySelectorAll('input[type="range"]')];
        this.inputs.forEach(input=>input.addEventListener('input',()=>this.update()));
        dialog.querySelector('[data-settings-reset]').addEventListener('click',()=>this.fill(DEFAULT_GENERATION));
        this.form.addEventListener('submit',async event=>{
            event.preventDefault();
            if(this.busy) return;
            this.busy=true;this.status.textContent='Finding your next line…';
            const controls=[...this.form.querySelectorAll('button,input')];controls.forEach(c=>c.disabled=true);
            try { await this.apply(this.value());this.dialog.close(); }
            catch(error) { this.status.textContent=error.message; }
            finally { this.busy=false;controls.forEach(c=>c.disabled=false); }
        });
        dialog.addEventListener('cancel',event=>{if(this.busy) event.preventDefault();});
    }
    value() { return normaliseGeneration(Object.fromEntries(this.inputs.map(input=>[input.name,input.value]))); }
    fill(settings) { const values=normaliseGeneration(settings);this.inputs.forEach(input=>input.value=values[input.name]);this.update(); }
    update() {
        const values=this.value();
        this.inputs.forEach(input=>{
            const output=this.dialog.querySelector(`[data-value="${input.name}"]`);
            output.textContent=input.name==='difficulty'?['','Easy','Chilled','Balanced','Technical','Expert'][values.difficulty]:`${values[input.name]}%`;
            input.setAttribute('aria-valuetext',output.textContent);
            input.style.setProperty('--fill',`${(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min))*100}%`);
        });
    }
    open(world) {
        this.dialog.querySelector('[data-settings-world]').textContent=world;
        this.status.textContent='';this.fill(this.read());this.dialog.showModal();
    }
}
