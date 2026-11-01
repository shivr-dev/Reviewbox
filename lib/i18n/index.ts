import i18n from 'i18next';
import {initReactI18next} from 'react-i18next';
import {resources} from './resources';
import {localeLoaders} from './loaders';
export const LOCALES=['zh-CN','zh-TW','ja','ko','en','es','fr','ru'] as const;
export type Locale=typeof LOCALES[number];
export const LANGUAGE_NAMES:Record<Locale,string>={'zh-CN':'简体中文','zh-TW':'繁體中文',ja:'日本語',ko:'한국어',en:'English',es:'Español',fr:'Français',ru:'Русский'};
export function supportedLocale(value:string|undefined):Locale|undefined{
 if(!value)return;const normalized=value.toLowerCase().replace('_','-');
 if(['zh-tw','zh-hk','zh-hant'].some(l=>normalized.startsWith(l)))return 'zh-TW';
 if(normalized.startsWith('zh'))return 'zh-CN';
 return LOCALES.find(l=>l===normalized.split('-')[0]);
}
export function resolveLocale(saved:string|undefined,browser:readonly string[]=[]):Locale{
 return supportedLocale(saved)??browser.map(supportedLocale).find(Boolean)??'zh-CN';
}
void i18n.use({type:'backend',init(){},read(language:string,namespace:string,callback:(error:Error|null,data?:Record<string,string>)=>void){const loader=localeLoaders[language]?.[namespace];if(!loader){callback(null,{});return;}void loader().then(m=>callback(null,m.default)).catch(e=>callback(e));}}).use(initReactI18next).init({resources,partialBundledLanguages:true,lng:'zh-CN',fallbackLng:'zh-CN',supportedLngs:LOCALES,defaultNS:'common',ns:Object.keys(resources['zh-CN']),keySeparator:false,initAsync:false,interpolation:{escapeValue:false},returnEmptyString:false});
/** Only authored UI strings call this. Imported content never passes through it. */
export function tr(key:string,options:Record<string,unknown>={}){
 const split=key.indexOf(':'), namespace=split>=0?key.slice(0,split):'';
 if(namespace&&Object.hasOwn(resources['zh-CN'],namespace)){
  const text=key.slice(split+1);
  // Natural-language keys containing spaces/punctuation bypass i18next's namespace
  // heuristic. Pass the namespace explicitly and keep literal colons in authored text.
  return String(i18n.t(text,{ns:namespace,nsSeparator:false,defaultValue:text,...options}));
 }
 return String(i18n.t(key,{defaultValue:key,...options}));
}
export function formatNumber(value:number,options?:Intl.NumberFormatOptions){return new Intl.NumberFormat(i18n.resolvedLanguage??'zh-CN',options).format(value);}
export function formatDate(value:Date|string|number,options:Intl.DateTimeFormatOptions={dateStyle:'medium'}){return new Intl.DateTimeFormat(i18n.resolvedLanguage??'zh-CN',options).format(new Date(value));}
export default i18n;
