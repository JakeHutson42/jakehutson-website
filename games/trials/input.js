import { clamp } from './simulation/game.js';
const KEYS=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyR','Backspace','Escape']);
export function gamepadInput(pad) {
    if(!pad)return {throttle:0,brake:0,lean:0};
    const raw=pad.axes?.[0]||0,lean=Math.abs(raw)<.14?0:Math.sign(raw)*(Math.abs(raw)-.14)/.86;
    return {throttle:clamp(pad.buttons?.[7]?.value||0,0,1),brake:clamp(pad.buttons?.[6]?.value||0,0,1),lean:clamp(lean,-1,1)};
}
export class TrialsInput {
    constructor(target,command){
        this.target=target;this.command=command;this.keys=new Set();this.buttons=[];this.enabled=false;this.padIndex=null;this.blockPad=true;
        this.abort=new AbortController();const options={signal:this.abort.signal};
        window.addEventListener('keydown',event=>{
            if(event.target.closest('input,select,textarea,[role=slider]')||!KEYS.has(event.code))return;
            if(['KeyR','Backspace','Escape'].includes(event.code)){if(event.target.closest('button,a,dialog')&&event.code!=='Escape'&&event.target.closest('dialog')?.dataset?.kind!=='crash')return;event.preventDefault();if(!event.repeat)command(event.code);return;}
            if(!this.enabled||event.target.closest('dialog,button,a'))return;
            event.preventDefault();this.keys.add(event.code);
        },options);
        window.addEventListener('keyup',event=>this.keys.delete(event.code),options);
        window.addEventListener('blur',()=>{this.clear();command('blur');},options);
        document.addEventListener('visibilitychange',()=>{if(document.hidden){this.clear();command('blur');}},options);
        window.addEventListener('gamepaddisconnected',()=>{this.clear();command('disconnect');},options);
        for(const type of ['resize','orientationchange'])window.addEventListener(type,()=>{this.clear();command('resize');},options);globalThis.screen?.orientation?.addEventListener('change',()=>{this.clear();command('resize');},options);
    }
    get enabled(){return this._enabled;}
    set enabled(value){this._enabled=value;if(!value)this.clear();else this.touch?.paint?.();}
    clear(){this.keys?.clear();this.buttons=[];this.blockPad=true;this.touch?.clear();}
    read(){
        const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected && p.mapping==='standard');
        this.padIndex=pad?.index??null;
        let analog=gamepadInput(pad);
        if(this.blockPad){if(!analog.throttle&&!analog.brake&&!analog.lean&&!pad?.buttons.some(b=>b.pressed))this.blockPad=false;analog={throttle:0,brake:0,lean:0};}
        if(pad && !this.blockPad){
            for(const [index,code] of [[0,'KeyR'],[2,'Backspace'],[9,'Escape']])if((this.enabled||code==='Escape')&&pad.buttons[index]?.pressed&&!this.buttons[index])this.command(code);
            this.buttons=pad.buttons.map(b=>b.pressed);
        }
        if(!this.enabled)return {throttle:0,brake:0,lean:0};
        const touch=this.touch?.read()||{throttle:0,brake:0,lean:0};
        const held=(...codes)=>codes.some(c=>this.keys.has(c));
        return {throttle:Math.max(analog.throttle,touch.throttle,Number(held('KeyW','ArrowUp'))),brake:Math.max(analog.brake,touch.brake,Number(held('KeyS','ArrowDown'))),lean:held('KeyA','ArrowLeft')?-1:held('KeyD','ArrowRight')?1:Math.abs(touch.lean)>Math.abs(analog.lean)?touch.lean:analog.lean};
    }
    dispose(){this.abort.abort();this.clear();this.touch?.dispose?.();}
}
