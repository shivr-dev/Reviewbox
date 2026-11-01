import type {SemanticDiagram} from './diagram-spec';
import type {DiagramStage} from './shaded-regions';
/** Capability declarations are deliberately finite: unsupported future kinds fail import. */
export const DIAGRAM_RENDERERS={
 chemistry:{engine:'rdkit/3dmol',module:'chemistry',quantitative:true},macromolecule:{engine:'molstar',module:'macromolecule',quantitative:false},bioasset:{engine:'bioicons',module:'bioasset',quantitative:false},
 biology:{engine:'reviewbox-svg',module:'biology',quantitative:false},
 geometry:{engine:'jsxgraph',module:'math',quantitative:true},function:{engine:'jsxgraph',module:'math',quantitative:true},
 optics:{engine:'ray-optics',module:'optics',quantitative:true},
 measurement:{engine:'reviewbox-svg',module:'measurement',quantitative:true},wave:{engine:'reviewbox-svg',module:'wave',quantitative:true},
 motion:{engine:'reviewbox-svg',module:'motion',quantitative:true},forces:{engine:'reviewbox-svg',module:'mechanics',quantitative:true},lever:{engine:'reviewbox-svg',module:'mechanics',quantitative:true},
 buoyancy:{engine:'reviewbox-svg',module:'mechanics',quantitative:true},
 experiment:{engine:'reviewbox-svg',module:'apparatus',quantitative:false},circuit:{engine:'reviewbox-svg',module:'legacy-subject',quantitative:false},statistics:{engine:'reviewbox-svg',module:'statistics',quantitative:true},
} as const satisfies Record<SemanticDiagram['kind'],{engine:string;module:string;quantitative:boolean}>;
export function visiblePhase(phase:DiagramStage|undefined,stage:DiagramStage){return !phase||phase==='question'||phase===stage||stage==='solution';}
/** A pure stage projection. Source objects, answers and stored conditions never change. */
export function diagramForStage(spec:SemanticDiagram,stage:DiagramStage):SemanticDiagram|null{
 if(!visiblePhase(spec.phase,stage))return null;
 if(spec.kind==='geometry'){
  const points=spec.points.filter(p=>visiblePhase(p.phase,stage)),ids=new Set(points.map(p=>p.id)),present=(pair:string[])=>pair.every(id=>ids.has(id));
  return {...spec,points,segments:spec.segments.filter(present),auxiliary:[...(spec.auxiliary??[]),...(spec.steps??[]).filter(s=>visiblePhase(s.phase,stage)).flatMap(s=>s.segments)].filter(present),steps:undefined,circles:spec.circles?.filter(c=>ids.has(c.center)),marks:spec.marks?.filter(m=>visiblePhase(m.phase,stage)&&present(m.points))};
 }
 if(spec.kind==='forces')return {...spec,forces:spec.forces.filter(f=>visiblePhase(f.phase,stage))};
 if(spec.kind==='wave')return {...spec,waves:spec.waves.filter(w=>visiblePhase(w.phase,stage))};
 if(spec.kind==='motion')return {...spec,series:spec.series?.filter(s=>visiblePhase(s.phase,stage))};
 // Preserve function indices referenced by region boundaries; the renderer hides
 // functions by phase without renumbering them.
 if(spec.kind==='function')return spec;
 return spec;
}

export function diagramEngine(spec:SemanticDiagram){if(spec.kind==='chemistry')return spec.view==='structure2d'?'rdkit':'3dmol';if(spec.kind==='biology'&&(spec.view==='food-web'||spec.view==='network'))return 'cytoscape';return DIAGRAM_RENDERERS[spec.kind].engine;}
