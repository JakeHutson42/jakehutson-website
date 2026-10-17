/** Local development bank loader. Never selects a course for ordinary players. */
export async function loadReview(content, physics) {
    if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))throw Error('Course review is local only');
    const root=new URL('/.trials-build/review/',location.href),get=async url=>{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('Offline review bank is missing. Run Python build.py review.');return r;};
    const bankId=new URLSearchParams(location.search).get('bank');
    if(bankId&&!/^[a-f0-9]{64}$/.test(bankId))throw Error('Invalid review bank identity');
    const pointer=bankId?{bank:bankId+'/bank.json'}:await (await get(new URL('current.json',root))).json();
    if(!/^[a-f0-9]{64}\/bank\.json$/.test(pointer.bank))throw Error('Invalid local review pointer');
    const base=new URL(pointer.bank,root),bank=await (await get(base)).json();
    if(bank.approval!=='pending-human-review'||bank.physics!==physics||bank.assetContentId!==content.manifest.contentId)throw Error('Review bank is stale for this physics/assets revision');
    for(const [path,expected]of Object.entries(bank.runtimeHashes||{})){
        if(!['games/trials/simulation/game.js','games/trials/simulation/rider-pose.js','lib/planck/1.4.2/planck.module.js','games/trials/rendering/camera.js','lib/three/0.180.0/three.module.min.js'].includes(path))throw Error('Invalid physics source reference');
        const bytes=await(await get(new URL('/'+path,location.href))).arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw Error('Review bank is stale for the current production simulation');
    }
    const id=new URLSearchParams(location.search).get('candidate'),candidate=bank.candidates.find(c=>c.id===id);
    if(!candidate)throw Error('Unknown review candidate');
    const checked=async name=>{
        if(name.includes('..')||name.startsWith('/')||!bank.files[name])throw Error('Invalid review resource');
        const data=await (await get(new URL(name,base))).arrayBuffer();
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
        if(hash!==bank.files[name])throw Error('Stale or corrupt review resource');
        return JSON.parse(new TextDecoder().decode(data));
    };
    const [course,replay,report]=await Promise.all([checked(candidate.course),checked(candidate.replay),checked(candidate.report)]);
    if(course.contentHash!==candidate.contentHash||report.status!==candidate.status)throw Error('Review identity/status mismatch');
    if(!Array.isArray(replay)||replay.length>3600||replay.some(f=>['throttle','brake','lean'].some(k=>!Number.isFinite(f[k])||Math.abs(f[k])>1)))throw Error('Invalid review replay');
    return {course,replay,bank,candidate};
}
