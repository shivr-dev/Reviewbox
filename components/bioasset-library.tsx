'use client';
import {useMemo,useState} from 'react';
import {BIOICONS} from '@/lib/bioicons';
import {assetPath} from '@/lib/runtime';
import type {SemanticDiagram} from '@/lib/diagram-spec';
const PAGE_SIZE=18;
function AssetCard({asset:a,choose}:{asset:typeof BIOICONS[number];choose:(s:SemanticDiagram)=>void}){
 const [failed,setFailed]=useState(false);
 return <article className="bioasset-card"><div className="bioasset-card-art">{failed?<p role="alert">图片未能加载</p>:<img src={assetPath('bioicons/'+a.id+'.svg')} alt={a.displayName} loading="lazy" onError={()=>setFailed(true)}/>}</div><div className="bioasset-card-title"><strong>{a.displayName}</strong><small>{a.categoryZh}</small></div><details><summary>{a.creator} · {a.license.toUpperCase()}</summary><p className="bioasset-attribution">{a.name} · 原始图形未改动</p><div className="bioasset-source-links"><a href={a.sourceUrl} target="_blank" rel="noreferrer">原始来源</a><a href={a.licenseUrl} target="_blank" rel="noreferrer">许可条款</a></div></details><button type="button" className="secondary" onClick={()=>choose({type:'semantic',kind:'bioasset',assetId:a.id,mode:'schematic',label:a.displayName})}>使用素材</button></article>;
}
export default function BioAssetLibrary({choose}:{choose:(spec:SemanticDiagram)=>void}){
 const [query,setQuery]=useState(''),[license,setLicense]=useState('all'),[category,setCategory]=useState('all'),[page,setPage]=useState(0);
 const categories=[...new Set(BIOICONS.map(a=>a.categoryZh))];
 const items=useMemo(()=>{const words=query.toLowerCase().trim().split(/\s+/);return BIOICONS.filter(a=>(license==='all'||a.license===license)&&(category==='all'||a.categoryZh===category)&&words.every(w=>[a.name,a.displayName,a.categoryZh,a.category,a.creator,...a.keywords].join(' ').toLowerCase().includes(w)));},[query,license,category]);
 const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE)),current=Math.min(page,pages-1);
 return <section className="bioasset-library"><div className="bioasset-library-toolbar"><input type="search" aria-label="搜索科学素材" placeholder="搜索细胞、器官、仪器或作者" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><select aria-label="素材分类" value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="all">全部分类</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select aria-label="素材许可" value={license} onChange={e=>{setLicense(e.target.value);setPage(0);}}><option value="all">全部许可</option><option value="cc-0">CC0</option><option value="cc-by-3.0">CC BY 3.0</option><option value="cc-by-4.0">CC BY 4.0</option></select></div><p className="bioasset-count" role="status">{items.length} 张素材 · 共 {BIOICONS.length} 张已审核素材</p><div className="bioasset-library-grid">{items.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE).map(a=><AssetCard key={a.id} asset={a} choose={choose}/>)}</div>{!items.length&&<p className="bioasset-empty">没有符合条件的素材。试试其他名称或分类。</p>}{pages>1&&<nav className="bioasset-pagination" aria-label="素材分页"><button type="button" className="secondary" disabled={current===0} onClick={()=>setPage(p=>p-1)}>上一页</button><span>{current+1} / {pages}</span><button type="button" className="secondary" disabled={current===pages-1} onClick={()=>setPage(p=>p+1)}>下一页</button></nav>}</section>;
}
