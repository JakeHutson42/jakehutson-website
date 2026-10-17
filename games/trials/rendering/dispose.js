/** Dispose each owned resource once, including material maps. */
export function disposeTree(root){
    const geometries=new Set(),materials=new Set(),textures=new Set(),skeletons=new Set(),instances=new Set();
    root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.isInstancedMesh)instances.add(o);if(o.skeleton)skeletons.add(o.skeleton);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    for(const mesh of instances)mesh.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();for(const s of skeletons)s.dispose();
    return {geometries:geometries.size,materials:materials.size,textures:textures.size};
}
