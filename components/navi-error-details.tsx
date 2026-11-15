'use client';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Copy,Check} from 'lucide-react';
import {diagnosticReport,type NaviDiagnostic} from '@/lib/navi-diagnostics';
export default function NaviErrorDetails({diagnostic}:{diagnostic:NaviDiagnostic}){
 const {t}=useTranslation('study'),[copied,setCopied]=useState(false),[failed,setFailed]=useState(false),report=diagnosticReport(diagnostic);
 return <section className="navi-error-diagnostic" aria-label={t('navi.diagnostic.title')}>
  <div><code>{diagnostic.code}</code><button type="button" onClick={()=>{void navigator.clipboard.writeText(report).then(()=>{setCopied(true);setFailed(false);}).catch(()=>setFailed(true));}}>{copied?<Check size={13}/>:<Copy size={13}/>} {t(copied?'navi.diagnostic.copied':'navi.diagnostic.copy')}</button></div>
  <details><summary>{t('navi.diagnostic.details')}</summary><p>{t('navi.diagnostic.safe')}</p><pre tabIndex={0}>{report}</pre></details>
  {failed&&<small role="status">{t('navi.diagnostic.copyFailed')}</small>}
 </section>;
}
