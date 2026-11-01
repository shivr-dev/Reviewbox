'use client';
import {tr} from '@/lib/i18n';
import {useState} from 'react';
import type {JsonRepairResult} from '@/lib/import-json-repair';
export default function ImportRepairReview({reports,onConfirm,onCancel}:{reports:JsonRepairResult[];onConfirm:()=>void;onCancel:()=>void}){
 const [confirmed,setConfirmed]=useState(false);
 return <section className="import-repair-review" aria-label={tr("library:JSON 语法修复确认")}><h3>{tr("library:已修复文件格式，请确认内容")}</h3><p>{tr("library:只修复 JSON 语法；题目、答案与评分标准仍会经过原有检查。")}</p>{reports.map((r,i)=><details key={i}><summary>{reports.length>1?tr("common:文件 {{v0}} · ",{v0:(i+1)}):''}{r.changes.join('、')}</summary><div className="pack-compare"><div><h4>{tr("library:原始内容")}</h4><pre>{r.original}</pre></div><div><h4>{tr("library:修复后")}</h4><pre>{r.text}</pre></div></div></details>)}<label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{tr("library:我已检查修复内容，继续预览")}</label><div className="button-row"><button type="button" className="quiet" onClick={onCancel}>{tr("library:返回原文")}</button><button type="button" className="primary" disabled={!confirmed} onClick={onConfirm}>{tr("library:继续检查学习包")}</button></div></section>;
}
