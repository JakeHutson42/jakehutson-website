/** Palette-only original liveries; no geometry, sockets or physics mutation. */
export const LIVERIES=[
    {id:'works',name:'Works / ochre',swatches:['#d9a348','#304a43'],colors:{}},
    {id:'signal',name:'Signal / clay',swatches:['#bb5740','#e8dbc2'],colors:{'Works ochre':'#bb5740','Rider helmet':'#e8dbc2','Rider panels':'#bb5740','Rider suit':'#354448'}},
    {id:'survey',name:'Survey / tide',swatches:['#468c89','#253b59'],colors:{'Works ochre':'#468c89','Rider helmet':'#ddd9bf','Rider panels':'#468c89','Rider suit':'#253b59'}}
];
export class Cosmetics {
    constructor(roots){this.materials=new Map();for(const root of roots)root.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(m.color&&!this.materials.has(m))this.materials.set(m,m.color.clone());});}
    apply(id){const preset=LIVERIES.find(p=>p.id===id)||LIVERIES[0];for(const [material,original]of this.materials){material.color.copy(original);if(preset.colors[material.name])material.color.set(preset.colors[material.name]);}return preset.id;}
}
