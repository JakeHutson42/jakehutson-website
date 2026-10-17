import { CylinderGeometry, Quaternion, Vector3 } from '../../../lib/three/0.180.0/three.module.min.js';
export function beamGeometry(a,b,radius,segments=6){
    const start=new Vector3(...a),end=new Vector3(...b),direction=end.clone().sub(start),length=direction.length();
    if(!Number.isFinite(length)||length<=0||!Number.isFinite(radius)||radius<=0)throw new Error('Beam requires finite endpoints, positive length and radius');
    const geometry=new CylinderGeometry(radius,radius,length,segments);
    geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
    return geometry;
}
