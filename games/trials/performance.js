const percentile = (values, fraction) => values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*fraction))] || 0;
export class PerformanceSample {
    constructor() { this.reset(); }
    reset() { this.frames=[];this.physics=[];this.render=[];this.maxDrawCalls=0;this.maxTriangles=0;this.totalFrames=0;this.totalMilliseconds=0;this.cursor=0; }
    add(interval, physics, render, calls=0, triangles=0) {
        if (interval <= 0 || interval > 100) return;
        this.maxDrawCalls=Math.max(this.maxDrawCalls,calls);this.maxTriangles=Math.max(this.maxTriangles,triangles);
        this.totalFrames++;this.totalMilliseconds+=interval;
        if(this.frames.length<3600){this.frames.push(interval);this.physics.push(physics);this.render.push(render);}else{this.frames[this.cursor]=interval;this.physics[this.cursor]=physics;this.render[this.cursor]=render;this.cursor=(this.cursor+1)%3600;}
    }
    report() { return { samples:this.frames.length,totalFrames:this.totalFrames,seconds:this.totalMilliseconds/1000, maxDrawCalls:this.maxDrawCalls, maxTriangles:this.maxTriangles, fps:1000 / (this.totalMilliseconds/this.totalFrames || 1), frameP95:percentile(this.frames,.95), physicsP95:percentile(this.physics,.95), renderP95:percentile(this.render,.95) }; }
}
