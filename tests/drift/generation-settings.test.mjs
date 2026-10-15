import test from 'node:test';
import assert from 'node:assert/strict';
import {TrackSettings,DEFAULT_GENERATION} from '../../games/drift/generation-settings.js';

class Control {
    constructor(properties={}) { Object.assign(this,properties);this.listeners={};this.attributes={};this.style={setProperty(){}}; }
    addEventListener(name,callback) { this.listeners[name]=callback; }
    setAttribute(key,value) { this.attributes[key]=value; }
}
function modal(apply) {
    const inputs=Object.keys(DEFAULT_GENERATION).map(name=>new Control({name,min:name==='difficulty'?'1':'0',max:name==='difficulty'?'5':'100'}));
    const outputs=Object.fromEntries(inputs.map(input=>[input.name,new Control()]));
    const reset=new Control(),submit=new Control(),status=new Control(),world=new Control();
    const form=new Control();form.querySelectorAll=()=>[...inputs,reset,submit];
    const dialog=new Control();dialog.open=false;dialog.showModal=()=>dialog.open=true;dialog.close=()=>dialog.open=false;
    dialog.querySelectorAll=()=>inputs;
    dialog.querySelector=selector=>selector==='form'?form:selector==='[data-settings-reset]'?reset:
        selector==='[data-settings-status]'?status:selector==='[data-settings-world]'?world:outputs[selector.match(/data-value="(.+)"/)?.[1]];
    const settings=new TrackSettings(dialog,{read:()=>DEFAULT_GENERATION,apply});
    return {settings,dialog,form,inputs,outputs,reset,status};
}

test('sliders update their labels; reset is a draft change until Apply',async()=>{
    let applied;const m=modal(async values=>{applied=values;});
    m.settings.open('Synthwave Highway');
    const difficulty=m.inputs.find(input=>input.name==='difficulty');difficulty.value='5';difficulty.listeners.input();
    assert.equal(m.outputs.difficulty.textContent,'Expert');
    assert.equal(difficulty.attributes['aria-valuetext'],'Expert');
    assert.equal(applied,undefined);
    m.reset.listeners.click();assert.equal(m.outputs.difficulty.textContent,'Balanced');
    await m.form.listeners.submit({preventDefault(){}});
    assert.deepEqual(applied,DEFAULT_GENERATION);assert.equal(m.dialog.open,false);
    assert.ok(m.inputs.every(input=>input.disabled===false));
});

test('failed generation keeps settings open, explains the failure and permits another try',async()=>{
    const m=modal(async()=>{throw new Error('Try a gentler line.');});m.settings.open('Night City');
    await m.form.listeners.submit({preventDefault(){}});
    assert.equal(m.dialog.open,true);assert.equal(m.status.textContent,'Try a gentler line.');
    assert.ok(m.inputs.every(input=>input.disabled===false));
    assert.equal(m.settings.busy,false);
});
