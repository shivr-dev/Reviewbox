'use client';
import {useState} from 'react';import {downloadDiagram,downloadDiagramPng} from '@/lib/math-svg';import {tr} from '@/lib/i18n';
export default function DiagramExport({getSvg,name,disabled=false}:{getSvg:()=>SVGSVGElement|null|undefined;name:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function png(){const svg=getSvg();if(!svg)return;setBusy(true);setError('');try{await downloadDiagramPng(svg,name);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <span className="diagram-export-controls"><button type="button" className="diagram-export" disabled={disabled||busy} onClick={()=>{const svg=getSvg();if(svg)downloadDiagram(svg,name);}}>{tr('common:导出 SVG')}</button><button type="button" className="diagram-export" disabled={disabled||busy} onClick={()=>void png()}>{busy?tr('common:正在导出…'):tr('common:高清 PNG')}</button>{error&&<small role="alert">{error}</small>}</span>;
}
