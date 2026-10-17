import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { TrialsGame, STEP } from '../../games/trials/simulation/game.js';
import { witnessControls } from '../../games/trials/qa-controls.js';
const root=new URL('../../',import.meta.url);
export function run(bike,course,actions,witness=false){
    if(!Array.isArray(actions)||actions.length>100||actions.some(a=>!Number.isFinite(a.seconds)||a.seconds<0||a.seconds>120)||actions.reduce((total,a)=>total+a.seconds,0)>120)throw new Error('actions: expected at most 100 timed segments totalling at most 120 seconds');
    const game=new TrialsGame(bike,course);game.start();const samples=[],memory={};let landings=0;
    for(const action of actions){
        const ticks=Math.min(120*120,Math.max(0,Math.round(action.seconds/STEP)));
        for(let tick=0;tick<ticks;tick++){
            game.update(witness?witnessControls(game,memory):action);landings+=game.drainEvents().filter(e=>e.type==='land').length;if(tick%12===0)samples.push({time:game.elapsed,...game.pose().chassis,state:game.state});
            if(game.state==='finished'||game.state==='crashed')break;
        }
        if(game.state==='finished'||game.state==='crashed')break;
    }
    return {state:game.state,elapsed:game.elapsed,faults:game.faults,checkpoint:game.checkpoint,pose:game.pose(),reason:game.reason,landings,wheelieTime:game.wheelieTime,airTime:game.airTime,samples};
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
    try{
    const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
    const request=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    const bike=request.bike||JSON.parse(await readFile(new URL('games/trials/content/bike.json',root)));
    const course=request.course||JSON.parse(await readFile(new URL('games/trials/content/course.json',root)));
    process.stdout.write(JSON.stringify(run(bike,course,request.actions||(request.witness?[{seconds:30}]:[{seconds:3,throttle:.45,lean:0}]),request.witness===true))+'\n');
    }catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;}
}
