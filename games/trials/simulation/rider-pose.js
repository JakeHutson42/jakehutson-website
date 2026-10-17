/** Shared visual/sensor torso pose, in chassis-local metres. */
export function riderTorso(pose,bike){
    const chassis=pose.chassis,c=Math.cos(chassis.angle),s=Math.sin(chassis.angle),dx=pose.rider.x-chassis.x,dy=pose.rider.y-chassis.y;
    const hip=[dx*c+dy*s-.03,-dx*s+dy*c-.08,0],lean=pose.lean;
    const bound=(point,target,radius,depth)=>{
        const dx=point[0]-target[0],dy=point[1]-target[1],distance=Math.hypot(dx,dy),max=Math.sqrt(radius*radius-depth*depth);
        if(distance>max){point[0]=target[0]+dx/distance*max;point[1]=target[1]+dy/distance*max;}
    };
    if(bike?.riderReach)bound(hip,bike.peg,bike.riderReach.leg,.08);
    const points={pelvis:hip,spine:[hip[0]+.06,hip[1]+.17,0],chest:[hip[0]+.25-lean*.32,hip[1]+.37-Math.abs(lean)*.04,0]};
    if(bike?.riderReach)bound(points.chest,bike.handlebar,bike.riderReach.arm,.10);
    points.neck=[points.chest[0]+.09,points.chest[1]+.12,0];points.head=[points.neck[0]+.05,points.neck[1]+.15,0];
    return points;
}
export function localToWorld(point,chassis){const c=Math.cos(chassis.angle),s=Math.sin(chassis.angle);return {x:chassis.x+point[0]*c-point[1]*s,y:chassis.y+point[0]*s+point[1]*c};}
