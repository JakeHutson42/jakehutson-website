import { TrialsGame } from './simulation/game.js';
/** Load/validate before replacement. Failed or superseded loads keep the current run. */
export class CourseSession {
    constructor(content,world,input,audio){Object.assign(this,{content,world,input,audio});this.game=new TrialsGame(content.bikeSpec,content.course);this.generation=0;this.switches=0;}
    async change(load,environment=null){
        const generation=++this.generation;this.input.enabled=false;this.input.clear();this.audio?.reset();this.game.pause();
        try{const course=await load();if(generation!==this.generation)return false;const next=new TrialsGame(this.content.bikeSpec,course);this.world.setCourse(course,environment);this.content.course=course;this.content.environment=environment;this.game=next;this.switches++;return true;}
        catch(error){if(generation===this.generation)this.input.clear();throw error;}
    }
}
