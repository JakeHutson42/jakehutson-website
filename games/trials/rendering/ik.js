/** Two-bone IK in a stable plane, with fixed lengths and flexion limits. */
export function solveLimb(start,end,a,b,bend=1,limits=[.08,2.85]) {
    const delta=end.map((v,i)=>v-start[i]),distance=Math.hypot(...delta)||1e-8,unit=delta.map(v=>v/distance);
    const flex=Math.acos(Math.max(-1,Math.min(1,(distance*distance-a*a-b*b)/(2*a*b))));
    const bounded=Math.max(limits[0],Math.min(limits[1],flex));
    const reach=Math.sqrt(a*a+b*b+2*a*b*Math.cos(bounded));
    const d=Math.min(distance,reach),along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
    const perpendicular=[-unit[1],unit[0],0],magnitude=Math.hypot(...perpendicular)||1;
    return start.map((v,i)=>v+unit[i]*along+perpendicular[i]/magnitude*height*bend);
}
