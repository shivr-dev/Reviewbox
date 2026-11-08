import {z} from 'zod';

export const workspaceModes=['default','focus','comparison','derivation','evidence','board'] as const;
export const panelNames=['question','explanation','diagram','steps','rubric','answer','source','notes','knowledge'] as const;
const panel=z.enum(panelNames),id=z.string().min(1).max(200);
/** An intentionally finite protocol. Neither selectors nor executable code are accepted. */
export const naviUIAction=z.discriminatedUnion('type',[
 z.object({type:z.literal('setLayout'),mode:z.enum(workspaceModes)}).strict(),
 z.object({type:z.literal('splitView'),questionId:id.optional()}).strict(),
 z.object({type:z.literal('setFocusMode'),enabled:z.boolean()}).strict(),
 z.object({type:z.literal('resizePanel'),panel,percent:z.number().min(25).max(75)}).strict(),
 z.object({type:z.literal('collapsePanel'),panel}).strict(),
 z.object({type:z.literal('expandPanel'),panel}).strict(),
 z.object({type:z.literal('setZoom'),value:z.number().min(.75).max(2)}).strict(),
 z.object({type:z.literal('setFontSize'),value:z.number().int().min(14).max(26)}).strict(),
 z.object({type:z.literal('expandAnswer')}).strict(),
 z.object({type:z.literal('collapseAnswer')}).strict(),
 z.object({type:z.literal('showExplanation')}).strict(),
 z.object({type:z.literal('toggleSourcePanel'),visible:z.boolean()}).strict(),
 z.object({type:z.literal('mountRegisteredComponent'),component:panel}).strict(),
 z.object({type:z.literal('removeRegisteredComponent'),component:panel}).strict(),
 z.object({type:z.literal('arrangeComponents'),panels:z.array(panel).min(1).max(9)}).strict(),
 z.object({type:z.literal('configureComponent'),component:z.enum(['steps','molecule']),visibleSteps:z.number().int().min(1).max(50).optional(),model:z.enum(['ball-stick','spacefill','surface']).optional()}).strict(),
 z.object({type:z.literal('restoreLayout'),target:z.enum(['undo','default','previous'])}).strict(),
]);
export type NaviUIAction=z.infer<typeof naviUIAction>;
export type WorkspaceLayout={mode:typeof workspaceModes[number];panels:typeof panelNames[number][];width:number;zoom:number;fontSize:number;visibleSteps:number;questionId?:string;molecule?:'ball-stick'|'spacefill'|'surface'};
export const defaultLayout=():WorkspaceLayout=>({mode:'default',panels:[],width:50,zoom:1,fontSize:18,visibleSteps:1});
export type UICapabilities={panels:readonly string[];questionIds:readonly string[];molecule:boolean;protected:boolean};
export type UIReceipt={ok:boolean;reason?:'unsupported'|'protected'|'invalid'|'manual'|'empty';count:number};
const layouts:Record<WorkspaceLayout['mode'],WorkspaceLayout['panels']>={default:[],focus:[],comparison:['explanation'],derivation:['diagram','steps'],evidence:['answer','explanation','rubric'],board:['knowledge','notes','source']};

/** Prepare a whole batch before committing. A rejected last action changes nothing. */
export function reduceNaviUI(current:WorkspaceLayout,input:unknown,cap:UICapabilities):WorkspaceLayout{
 const actions=z.array(naviUIAction).min(1).max(12).parse(input);
 if(cap.protected)throw new Error('protected');
 let next:WorkspaceLayout=structuredClone(current);
 const requirePanel=(p:string)=>{if(!cap.panels.includes(p))throw new Error('unsupported');};
 for(const a of actions){
  if(a.type==='restoreLayout'){
   if(a.target!=='default')throw new Error('unsupported');next=defaultLayout();
  }else if(a.type==='setLayout'){
   const panels=layouts[a.mode];for(const p of panels)requirePanel(p);next={...next,mode:a.mode,panels:[...panels]};
  }else if(a.type==='splitView'){
   requirePanel('explanation');if(a.questionId&&!cap.questionIds.includes(a.questionId))throw new Error('unsupported');
   next={...next,mode:'comparison',panels:['explanation'],questionId:a.questionId};
  }else if(a.type==='setFocusMode')next={...next,mode:a.enabled?'focus':'default',panels:[]};
  else if(a.type==='resizePanel'){requirePanel(a.panel);next.width=a.percent;}
  else if(a.type==='setZoom'){requirePanel('diagram');next.zoom=a.value;}
  else if(a.type==='setFontSize')next.fontSize=a.value;
  else if(a.type==='arrangeComponents'){for(const p of a.panels)requirePanel(p);if(new Set(a.panels).size!==a.panels.length)throw new Error('invalid');next.panels=[...a.panels];next.mode='board';}
  else if(a.type==='configureComponent'){
   if(a.component==='steps'){requirePanel('steps');if(!a.visibleSteps||a.model)throw new Error('invalid');next.visibleSteps=a.visibleSteps;}
   else{if(!cap.molecule)throw new Error('unsupported');if(!a.model||a.visibleSteps)throw new Error('invalid');next.molecule=a.model;}
  }else{
   const p='panel'in a?a.panel:'component'in a?a.component:a.type==='toggleSourcePanel'?'source':a.type==='showExplanation'?'explanation':'answer';requirePanel(p);
   const remove=a.type==='collapsePanel'||a.type==='removeRegisteredComponent'||a.type==='collapseAnswer'||a.type==='toggleSourcePanel'&&!a.visible;
   next.panels=remove?next.panels.filter(v=>v!==p):[...new Set([...next.panels,p])];if(next.mode==='default'&&next.panels.length)next.mode='board';
  }
 }
 return next;
}

export class NaviUIController{
 state=defaultLayout();history:WorkspaceLayout[]=[];private listeners=new Set<()=>void>();manualAt=0;
 readEvidence?:()=>{questionId:string;answer:string;grade?:unknown;steps?:unknown};
 assistance?:(level:1|2|3|4)=>void;
 constructor(public capabilities:UICapabilities){}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
 snapshot=()=>this.state;
 private commit(next:WorkspaceLayout){this.history=[...this.history.slice(-19),this.state];this.state=next;this.listeners.forEach(fn=>fn());}
 execute(input:unknown,origin:'user'|'suggestion'|'command'='command'):UIReceipt{
  if(origin==='suggestion'&&this.manualAt)return{ok:false,reason:'manual',count:0};
  try{
   const actions=z.array(naviUIAction).min(1).max(12).parse(input);
   if(this.capabilities.protected)return{ok:false,reason:'protected',count:0};
   if(actions.some(a=>a.type==='restoreLayout'&&a.target!=='default')){
    if(actions.length!==1)return{ok:false,reason:'invalid',count:0};
    if(!this.history.length)return{ok:false,reason:'empty',count:0};
    this.state=this.history[this.history.length-1];this.history=this.history.slice(0,-1);this.listeners.forEach(fn=>fn());
   }else this.commit(reduceNaviUI(this.state,actions,this.capabilities));
   if(this.state.panels.includes('explanation'))this.assistance?.(4);
   else if(this.state.panels.includes('steps'))this.assistance?.(3);
   if(origin==='user')this.manualAt=Date.now();return{ok:true,count:actions.length};
  }catch(e){return{ok:false,reason:e instanceof Error&&e.message==='unsupported'?'unsupported':'invalid',count:0};}
 }
}

// Transient bridge: only mounted, explicit React controllers can execute an action.
let active:NaviUIController|undefined;
export function registerNaviUI(controller:NaviUIController){active=controller;return()=>{if(active===controller)active=undefined;};}
export function currentNaviUI(){return active;}
export function executeNaviUI(input:unknown){return active?.execute(input)??{ok:false,reason:'unsupported',count:0} as UIReceipt;}

/** Local commands work without an AI request. Unrecognized language goes to the tutor. */
export function parseNaviUICommand(text:string):NaviUIAction[]|null{
 const s=text.trim().toLowerCase();
 if(/^(撤销|undo|元に戻す|실행 취소|annuler|deshacer|отменить)[。.!！]?$/.test(s))return[{type:'restoreLayout',target:'undo'}];
 if(/恢复默认|默认界面|reset.*layout|restore.*default|rétablir.*défaut|restablecer|標準.*戻|기본.*복원|сброс.*макет/.test(s))return[{type:'restoreLayout',target:'default'}];
 if(/恢复刚才|previous layout|布局撤销/.test(s))return[{type:'restoreLayout',target:'previous'}];
 if(/专注模式|專注模式|focus mode|集中モード|집중 모드|mode concentration|modo concentración|режим фокуса/.test(s))return[{type:'setFocusMode',enabled:true}];
 if(/左右并排|左右並排|side.by.side|split view|côte à côte|lado a lado|並べて|나란히|рядом/.test(s))return[{type:'splitView'}];
 if(/(放大|zoom in|agrandir|拡大|확대|ampliar|увеличить).*(图|圖|diagram|graph|光路|figure|図|그림|gráfico|схем)/.test(s))return[{type:'setZoom',value:1.5}];
 if(/展开.*推导|展開.*推導|show.*derivation|dérivation|derivación|導出|유도.*펼|вывод/.test(s))return[{type:'setLayout',mode:'derivation'},{type:'configureComponent',component:'steps',visibleSteps:50}];
 return null;
}
