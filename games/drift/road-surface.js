import { clamp, trackPose } from './math.js';

export function roadHeight(track, progress) {
    if (!track.elevations) return 0;
    const p = ((progress % 1 + 1) % 1) * track.points.length;
    const i = Math.floor(p), f = p - i;
    return track.elevations[i] * (1 - f) + track.elevations[(i + 1) % track.points.length] * f;
}

export function loopPose(track, t) {
    const loop = track.loop;
    const start = trackPose(track, loop.start), end = trackPose(track, loop.end);
    const heading = loop.heading ?? Math.atan2(end.x-start.x,end.z-start.z);
    const fx = Math.sin(heading), fz = Math.cos(heading), rx = fz, rz = -fx;
    const span = (end.x-start.x)*fx+(end.z-start.z)*fz;
    const shift = loop.offset ?? 0;
    const r = loop.radius;
    // One full turn with a smooth left-to-right lane shift: the two feet of the
    // loop no longer occupy the same road. Lateral slope is zero at both feet.
    const circle = t >= 0.25 && t <= 0.75;
    const angle = clamp((t - 0.25) * 2, 0, 1) * Math.PI * 2;
    const along = circle ? span / 2 + r * Math.sin(angle) : t < 0.25 ? span * t * 2 : span * (t * 2 - 1);
    const tangent = circle ? r * Math.PI * 4 * Math.cos(angle) : span * 2;
    const vertical = circle ? r * Math.PI * 4 * Math.sin(angle) : 0;
    const u = clamp((t-0.25)*2,0,1);
    const across = shift*(u-Math.sin(angle)/(2*Math.PI));
    const lateral = circle ? shift*2*(1-Math.cos(angle)) : 0;
    const metric = Math.hypot(tangent,vertical,lateral);
    const forward = [(fx*tangent+rx*lateral)/metric,vertical/metric,(fz*tangent+rz*lateral)/metric];
    const dot = rx*forward[0]+rz*forward[2];
    const right = [rx-dot*forward[0],-dot*forward[1],rz-dot*forward[2]];
    const norm = Math.hypot(...right); for(let i=0;i<3;i++) right[i]/=norm;
    const up = [forward[1]*right[2]-forward[2]*right[1],forward[2]*right[0]-forward[0]*right[2],forward[0]*right[1]-forward[1]*right[0]];
    return { x: start.x + fx*along+rx*across, z: start.z + fz*along+rz*across,
        y: roadHeight(track, loop.start) + r * (1 - Math.cos(angle)),
        heading: Math.atan2(forward[0],forward[2]), pitch: Math.atan2(forward[1],Math.hypot(forward[0],forward[2])),
        frame: { forward,right,up }, metric, progress: loop.start + (loop.end - loop.start) * t };
}

const loopPaths = new WeakMap();
function loopPath(track) {
    if (loopPaths.has(track)) return loopPaths.get(track);
    const distances = [0]; let previous = loopPose(track,0);
    for(let i=1;i<=240;i++) {
        const pose=loopPose(track,i/240);
        distances.push(distances.at(-1)+Math.hypot(pose.x-previous.x,pose.y-previous.y,pose.z-previous.z)); previous=pose;
    }
    loopPaths.set(track,distances); return distances;
}

export function advanceLoop(track,t,distance) {
    const path=loopPath(track), p=clamp(t,0,1)*240, i=Math.min(239,Math.floor(p));
    const target=path[i]+(path[i+1]-path[i])*(p-i)+distance;
    if(target>=path[240]) return 1;
    let lo=0,hi=240;
    while(hi-lo>1){const mid=Math.floor((lo+hi)/2);if(path[mid]<target)lo=mid;else hi=mid;}
    return (lo+(target-path[lo])/(path[hi]-path[lo]))/240;
}

export function surfaceFrame(pose) {
    if(pose.frame) return pose.frame;
    const s=Math.sin(pose.heading),c=Math.cos(pose.heading),p=pose.pitch||0;
    return { forward:[s*Math.cos(p),Math.sin(p),c*Math.cos(p)], right:[c,0,-s], up:[-s*Math.sin(p),Math.cos(p),-c*Math.sin(p)] };
}

export function loopChaseView(car, distance, height, ahead, targetHeight) {
    const {forward,up}=surfaceFrame(car), origin=[car.x,car.y||0,car.z];
    return { position:origin.map((v,i)=>v-forward[i]*distance+up[i]*height),
        target:origin.map((v,i)=>v+forward[i]*ahead+up[i]*targetHeight), up };
}

export function surfacePose(track, progress) {
    if (track.loop && progress >= track.loop.start && progress <= track.loop.end) {
        return loopPose(track, (progress - track.loop.start) / (track.loop.end - track.loop.start));
    }
    const pose = trackPose(track, progress);
    const step = 1 / track.points.length;
    const a = trackPose(track, progress - step), b = trackPose(track, progress + step);
    return { ...pose, heading: Math.atan2(b.x - a.x, b.z - a.z), y: roadHeight(track, progress), pitch: Math.atan2(
        roadHeight(track, progress + step) - roadHeight(track, progress - step), Math.hypot(b.x - a.x, b.z - a.z)), progress };
}

// Local progress separates overlapping roads: the lower road is never an exit
// from the bridge, even where their x/z coordinates coincide.
export function nearestRoadPoint(track, x, z, hint) {
    const n = track.points.length;
    const center = Number.isFinite(hint) ? Math.floor(hint * n) : null;
    let closest = { distance: Infinity, progress: 0, x: 0, z: 0 };
    const local = track.elevations && center !== null;
    const from = local ? center - 14 : 0, to = local ? center + 14 : n - 1;
    for (let segment = from; segment <= to; segment++) {
        const i = ((segment % n) + n) % n;
        const a = track.points[i], b = track.points[(i + 1) % n];
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const f = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a[0] + dx * f, pz = a[1] + dz * f;
        const distance = Math.hypot(x - px, z - pz);
        if (distance < closest.distance) closest = { x: px, z: pz, distance, progress: (i + f) / n };
    }
    return closest;
}

export function roadSamples(track) {
    const samples = [];
    for (let i = 0; i < track.points.length; i++) {
        const progress = i / track.points.length;
        if (!track.loop || progress < track.loop.start || progress > track.loop.end) samples.push(surfacePose(track, progress));
    }
    if (track.loop) for (let i = 0; i <= 120; i++) samples.push(loopPose(track, i / 120));
    samples.sort((a, b) => a.progress - b.progress);
    return samples;
}

export function offsetSurface(pose, across, height = 0) {
    const {right,up}=surfaceFrame(pose);
    return [pose.x+right[0]*across+up[0]*height,(pose.y||0)+right[1]*across+up[1]*height,pose.z+right[2]*across+up[2]*height];
}
