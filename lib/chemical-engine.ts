import type {MainModule} from '@rdkit/rdkit';
import type {SemanticDiagram} from './diagram-spec';
import {assetPath} from './runtime';
export type ChemicalSpec=Extract<SemanticDiagram,{kind:'chemistry'}>;
let modulePromise:Promise<MainModule>|undefined;
/** Trusted local glue and WASM, loaded only by chemical pages. Never evaluates imported code. */
export function loadRDKit(){
 if(modulePromise)return modulePromise;
 modulePromise=(async()=>{const w=window as unknown as {initRDKitModule?:(options:unknown)=>Promise<MainModule>};if(!w.initRDKitModule)await new Promise<void>((resolve,reject)=>{const script=document.createElement('script'),timeout=setTimeout(()=>{script.remove();reject(new Error('化学引擎加载超时，请重试'));},25000);script.src=assetPath('vendor/rdkit/RDKit_minimal.js');script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=()=>{clearTimeout(timeout);script.remove();reject(new Error('化学引擎未能加载'));};document.head.appendChild(script);});if(!w.initRDKitModule)throw new Error('RDKit 初始化入口缺失');return w.initRDKitModule({locateFile:(name:string)=>assetPath('vendor/rdkit/'+name)});})();
 modulePromise.catch(()=>{modulePromise=undefined;});return modulePromise;
}
export function chemicalRecord(spec:ChemicalSpec){return spec.format==='sdf'?spec.data.split(/\$\$\$\$\r?\n?/).filter(r=>r.trim())[spec.moleculeIndex]:spec.data;}
const elements='* H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
export function commonChemFormula(json:any){
 const molecule=json.molecules?.[0],defaults=json.defaults?.atom??{z:6,impHs:0,chg:0},counts=new Map<string,number>();let charge=0;
 if(!molecule?.atoms?.length||molecule.atoms.length>2000)throw new Error('分子原子数为空或超过 2000');
 const add=(symbol:string,n:number)=>counts.set(symbol,(counts.get(symbol)??0)+n);
 for(const a of molecule.atoms){const atom={...defaults,...a},element=elements[atom.z];if(!element||atom.z===0)throw new Error('暂不能为通配原子计算确定分子式');add(atom.isotope?`[${atom.isotope}${element}]`:element,1);if(atom.impHs)add('H',atom.impHs);charge+=atom.chg??0;}
 const keys=[...counts.keys()].sort((a,b)=>counts.has('C')?(a==='C'?-1:b==='C'?1:a==='H'?-1:b==='H'?1:a.localeCompare(b)):a.localeCompare(b));
 return keys.map(k=>k+(counts.get(k)===1?'':counts.get(k))).join('')+(charge?'^'+(Math.abs(charge)===1?'':Math.abs(charge))+(charge>0?'+':'-'):'');
}
export function validateWithRDKit(rdkit:MainModule,spec:ChemicalSpec){
 const record=chemicalRecord(spec);if(!record)throw new Error('没有选中的分子记录');const mol=rdkit.get_mol(record);if(!mol)throw new Error('RDKit 无法解析或核验该化学结构');
 try{const graph=JSON.parse(mol.get_json()),formula=commonChemFormula(graph),descriptors=JSON.parse(mol.get_descriptors()),mass=descriptors.amw,conformer=graph.molecules?.[0]?.conformers?.[0];
  if(!Number.isFinite(mass))throw new Error('结构无法计算可靠分子量');
  if(spec.expectedFormula&&spec.expectedFormula.replace(/\s/g,'')!==formula)throw new Error('声明的分子式与实际结构不一致：'+formula);
  if(spec.expectedMass!==undefined&&Math.abs(spec.expectedMass-mass)>.01)throw new Error('声明的分子量与实际结构不一致');
  if(spec.view==='molecule3d'&&(!conformer||conformer.dim!==3||!conformer.coords?.length||conformer.coords.some((p:number[])=>p.length!==3||p.some(v=>!Number.isFinite(v)))))throw new Error('结构没有有效的三维构象；二维排版不能当作三维模型');
  return {svg:mol.get_svg(600,340),formula,mass,smiles:mol.get_smiles(),atomCount:graph.molecules[0].atoms.length,record};
 }finally{mol.delete();}
}
export async function validateChemicalDiagram(spec:ChemicalSpec){return validateWithRDKit(await loadRDKit(),spec);}
export function safeChemicalSvg(svg:string){
 const document=new DOMParser().parseFromString(svg,'image/svg+xml');if(document.querySelector('parsererror')||document.documentElement.localName!=='svg')throw new Error('化学 SVG 无效');
 const allowed=new Set(['svg','g','path','line','polyline','polygon','circle','rect','ellipse','text','tspan','defs','clipPath']);
 for(const element of [...document.querySelectorAll('*')]){if(!allowed.has(element.localName))throw new Error('化学 SVG 包含不支持的内容');for(const a of [...element.attributes])if(/^on/i.test(a.name)||/href$/i.test(a.name)||/url\(\s*[^#]/i.test(a.value))throw new Error('化学 SVG 包含不安全的引用');}
 document.documentElement.setAttribute('viewBox','0 0 600 340');document.documentElement.setAttribute('width','100%');document.documentElement.setAttribute('height','100%');return new XMLSerializer().serializeToString(document.documentElement);
}
