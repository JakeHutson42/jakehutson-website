import { World, Vec2, Circle, Polygon, Chain, WheelJoint, MotorJoint } from '../../../lib/planck/1.4.2/planck.module.js';
import { riderTorso,localToWorld } from './rider-pose.js';

export const STEP = 1 / 120;
export const PHYSICS_VERSION = 'qt-physics-3';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));
const position = body => ({x:body.getPosition().x,y:body.getPosition().y,angle:body.getAngle()});

/** The authoritative simulation has no DOM, renderer, clock or storage dependency. */
export class TrialsGame {
    constructor(bike, course) {
        this.spec=bike; this.course=course; this.state='lobby'; this.elapsed=0; this.faults=0;
        this.checkpoint=0; this.accumulator=0; this.lean=0; this.previousState='running'; this.ticks=0;
        this.spawn();
    }
    spawn() {
        const b=this.spec, checkpoint=this.course.checkpoints[this.checkpoint];
        this.world=new World({gravity:Vec2(0,-9.81),allowSleep:false});
        this.ground=this.world.createBody();
        for(const path of this.course.paths) {
            this.ground.createFixture(Chain(path.slice().reverse().map(p=>Vec2(...p)),false),{friction:b.friction,userData:'ground'});
        }
        const origin=Vec2(checkpoint.x,checkpoint.y);
        this.chassis=this.world.createDynamicBody({position:origin,bullet:true,userData:'chassis'});
        this.chassis.createFixture(Polygon(b.collision.map(p=>Vec2(...p))),{density:1,friction:.6,filterGroupIndex:-1,userData:'frame'});
        this.chassis.setMassData({mass:b.chassisMass,center:Vec2(0,.25),I:b.chassisMass*.17});
        const wheel = axle => {
            const body=this.world.createDynamicBody({position:Vec2(origin.x+axle[0],origin.y+axle[1]),bullet:true,userData:'wheel'});
            body.createFixture(Circle(b.wheelRadius),{density:1,friction:b.friction,restitution:0,filterGroupIndex:-1,userData:'wheel'});
            body.setMassData({mass:b.wheelMass,center:Vec2(),I:b.wheelMass*b.wheelRadius**2/2});
            const joint=this.world.createJoint(new WheelJoint({frequencyHz:b.suspensionHz,dampingRatio:b.suspensionDamping,enableMotor:true,maxMotorTorque:0},this.chassis,body,body.getPosition(),Vec2(0,1)));
            return {body,joint};
        };
        this.rear=wheel(b.rearAxle); this.front=wheel(b.frontAxle);
        this.rider=this.world.createDynamicBody({position:Vec2(origin.x+(b.riderOffset??-.10),origin.y+b.riderHeight),bullet:true,userData:'rider'});
        this.rider.createFixture(Circle(.17),{density:1,friction:.4,filterGroupIndex:-1,userData:'rider'});
        // A zero-gravity sensor follows the same computed head centre as the rig.
        // It has no solid contact or joint, so it adds no load to the motorcycle.
        this.helmet=this.world.createDynamicBody({gravityScale:0,fixedRotation:true,bullet:true});
        this.helmet.createFixture(Circle(.15),{isSensor:true,filterGroupIndex:-1,userData:'helmet'});
        this.rider.setMassData({mass:b.riderMass,center:Vec2(),I:b.riderMass*.09});
        this.riderJoint=this.world.createJoint(new MotorJoint({linearOffset:Vec2(b.riderOffset??-.10,b.riderHeight),angularOffset:0,maxForce:2400,maxTorque:750,correctionFactor:.09},this.chassis,this.rider));
        this.grounded=0; this.contacts=new Set(); this.pendingFault=false;this.reason=null;
        this.throttle=0;this.brake=0;this.events=[];this.wheelieTime=0;this.airTime=0;this.landingCooldown=0;
        this.world.on('begin-contact',contact=>{
            const a=contact.getFixtureA(),c=contact.getFixtureB();
            const terrain=a.getBody()===this.ground?c:c.getBody()===this.ground?a:null;
            if(!terrain)return;
            if(terrain.getUserData()==='wheel')this.contacts.add(contact);
            if(['rider','helmet'].includes(terrain.getUserData())){this.pendingFault=true;this.reason=terrain.getUserData()==='helmet'?'helmet':'body';}
        });
        this.world.on('end-contact',contact=>this.contacts.delete(contact));
        this.world.on('post-solve',(contact,impulse)=>{
            const fixtures=[contact.getFixtureA(),contact.getFixtureB()];
            if(fixtures.some(f=>f.getUserData()==='frame') && impulse.normalImpulses.some(v=>v>90)){this.pendingFault=true;this.reason='impact';}
        });
        this.lean=0; this.previousX=origin.x; this.syncHelmet();this.previousPose=this.pose(); this.currentPose=this.pose();
    }
    start(){if(this.state==='lobby')this.state='running';}
    crash(reason='contact') {
        if(this.state!=='running')return;
        this.state='crashed';this.faults++;this.reason=reason;
    }
    retry() {
        if(!['running','crashed'].includes(this.state))return false;
        if(this.state==='running')this.faults++;
        this.spawn();this.state='running';this.accumulator=0;return true;
    }
    restart(){this.elapsed=0;this.faults=0;this.checkpoint=0;this.ticks=0;this.spawn();this.state='running';this.accumulator=0;}
    pause(){if(['running','crashed'].includes(this.state)){this.previousState=this.state;this.state='paused';this.accumulator=0;}}
    resume(){if(this.state==='paused'){this.state=this.previousState;this.accumulator=0;}}
    advance(dt,input={}) {
        if(!['running','crashed'].includes(this.state)){this.accumulator=0;return 0;}
        this.accumulator+=clamp(dt,0,.1);let steps=0;
        while(this.accumulator>=STEP && steps<12){this.update(typeof input==='function'?input(this):input);this.accumulator-=STEP;steps++;}
        return steps;
    }
    update(input={}) {
        if(!['running','crashed'].includes(this.state))return;
        this.elapsed+=STEP;this.ticks++;this.previousPose=this.currentPose;
        if(this.state==='crashed'){this.currentPose=this.pose();return;}
        const b=this.spec,throttle=clamp(input.throttle,0,1),brake=clamp(input.brake,0,1),lean=clamp(Number.isFinite(input.lean)?input.lean:0,-1,1);
        this.lean+=(lean-this.lean)*(1-Math.exp(-8*STEP));
        this.throttle+=(throttle-this.throttle)*(1-Math.exp(-14*STEP));
        this.brake+=(brake-this.brake)*(1-Math.exp(-18*STEP));
        this.riderJoint.setLinearOffset(Vec2((b.riderOffset??-.10)+this.lean*b.riderTravel,b.riderHeight-Math.abs(this.lean)*.06));
        this.riderJoint.setAngularOffset(-this.lean*.32);
        const revs=Math.abs(this.rear.body.getAngularVelocity())/b.motorSpeed;
        const torqueCurve=1-.42*clamp((revs-.35)/.65,0,1);
        const liftTarget=.22+Math.max(0,-this.lean)*.9;
        const pitchLimit=clamp(1-(this.chassis.getAngle()-liftTarget)/.45,.03,1);
        this.rear.joint.setMotorSpeed(this.brake>.01?0:-b.motorSpeed);
        this.rear.joint.setMaxMotorTorque(this.brake>.01?b.brakeTorque*this.brake:b.motorTorque*this.throttle*torqueCurve*pitchLimit);
        this.front.joint.setMotorSpeed(0);this.front.joint.setMaxMotorTorque(b.brakeTorque*.65*this.brake);
        // Limited posture correction complements real internal weight transfer.
        this.grounded=this.contacts.size;
        if(!this.grounded)this.chassis.applyTorque(clamp(-this.lean*85-this.chassis.getAngularVelocity()*12,-110,110),true);
        const fallingSpeed=this.chassis.getLinearVelocity().y,wasGrounded=this.grounded;
        this.syncHelmet();this.world.step(STEP,10,4);this.syncHelmet();
        this.grounded=this.contacts.size;this.landingCooldown=Math.max(0,this.landingCooldown-STEP);
        if(!wasGrounded&&this.grounded&&fallingSpeed<-.8&&!this.landingCooldown){this.events.push({type:'land',strength:clamp(-fallingSpeed/8,.1,1)});this.landingCooldown=.25;}
        if(!this.grounded)this.airTime+=STEP;
        if(this.grounded&&this.front.body.getPosition().y-this.rear.body.getPosition().y>.20&&this.chassis.getAngle()>.15)this.wheelieTime+=STEP;
        const p=this.chassis.getPosition();
        if(this.pendingFault)this.crash(this.reason||'contact');
        else if(p.y<this.course.killY)this.crash('fall');
        else if(!Number.isFinite(p.x)||p.x<this.course.paths[0][0][0]-5)this.crash('out-of-bounds');
        if(this.state==='running') {
            const next=this.course.checkpoints[this.checkpoint+1];
            if(next && this.previousX<next.x && p.x>=next.x && Math.abs(p.y-next.y)<1.5){this.checkpoint++;this.events.push({type:'checkpoint'});}
            const finishY=this.course.finishY||0;
            if(this.checkpoint===this.course.checkpoints.length-1 && this.previousX<this.course.finish && p.x>=this.course.finish && Math.abs(p.y-finishY)<1.5){this.state='finished';this.events.push({type:'finish'});}
        }
        this.previousX=p.x;this.currentPose=this.pose();
    }
    pose(){return {chassis:position(this.chassis),rear:position(this.rear.body),front:position(this.front.body),rider:position(this.rider),lean:this.lean||0};}
    drainEvents(){const events=this.events;this.events=[];return events;}
    feedback(){const velocity=this.chassis.getLinearVelocity(),wheelSpeed=Math.abs(this.rear.body.getAngularVelocity())*this.spec.wheelRadius;return {speed:velocity.length(),throttle:this.throttle,brake:this.brake,slip:clamp((wheelSpeed-Math.abs(velocity.x))/Math.max(2,wheelSpeed),0,1),grounded:!!this.grounded,rpm:1400+this.throttle*1600+wheelSpeed*150};}
    syncHelmet(){const pose=this.pose(),head=localToWorld(riderTorso(pose,this.spec).head,pose.chassis);this.helmet.setTransform(Vec2(head.x,head.y),0);this.helmet.setLinearVelocity(Vec2());}
    interpolated(alpha=1){
        const result={},a=this.previousPose,b=this.currentPose;
        for(const key of ['chassis','rear','front','rider']){
            const angle=a[key].angle+Math.atan2(Math.sin(b[key].angle-a[key].angle),Math.cos(b[key].angle-a[key].angle))*alpha;
            result[key]={x:a[key].x+(b[key].x-a[key].x)*alpha,y:a[key].y+(b[key].y-a[key].y)*alpha,angle};
        }
        result.lean=b.lean;return result;
    }
}
