'use client';
import {useEffect} from 'react';
import i18n,{resolveLocale,LOCALES,LANGUAGE_NAMES,type Locale} from '@/lib/i18n';
import {useTranslation} from 'react-i18next';
import {currentNamespace} from '@/lib/store';
export function ProductLocale({locale,ready}:{locale?:string;ready:boolean}){
 useEffect(()=>{if(!ready)return;const ns=currentNamespace();let saved=locale;try{saved??=localStorage.getItem('review-locale:'+ns)??undefined;}catch{}
 const next=resolveLocale(saved,typeof navigator==='undefined'?[]:navigator.languages);void i18n.changeLanguage(next);document.documentElement.lang=next;
 },[locale,ready,currentNamespace()]);return null;
}
export function LanguageSelect({save,disabled}:{save:(locale:Locale)=>Promise<void>;disabled?:boolean}){
 const {t}=useTranslation('settings');
 return <label className="settings-language"><span>{t('语言')}</span><select aria-label={t('语言')} disabled={disabled} value={i18n.resolvedLanguage??'zh-CN'} onChange={e=>void save(e.target.value as Locale)}>{LOCALES.map(l=><option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}</select></label>;
}
