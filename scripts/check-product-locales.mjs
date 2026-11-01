import fs from 'node:fs';
import assert from 'node:assert/strict';
const files=['components/bug-feedback.tsx','components/product-insights.tsx','components/product-data-settings.tsx','components/usage-agreement.tsx','components/onboarding-view.tsx','components/onboarding-account.tsx'];
const keys=new Set(['反馈','Bug','建议','问题','正在确认送达','已接收，等待自动发布','正在发布到 GitHub','发布暂时失败，系统会自动重试','已发布','自动发布失败，请稍后重新提交','今天','学习计划与练习','学科与资料','成绩与考试','工坊','我的','手表与设备','其他','连接你的学习账户','一起打磨 Reviewbox 测试版']);
let clauses=[];
for(const file of files){const source=fs.readFileSync(file,'utf8');for(const m of source.matchAll(/tr\(\s*'settings:([^']+)'/g))keys.add(m[1]);if(file.endsWith('usage-agreement.tsx')){clauses=[...source.matchAll(/\[\s*'([^']+)',\s*'([^']+)',?\s*\]/g)];for(const m of clauses){keys.add(m[1]);keys.add(m[2]);}}}
assert.equal(clauses.length,7);
for(const locale of ['zh-CN','zh-TW','en','ja','ko','es','fr','ru']){
 const resource=JSON.parse(fs.readFileSync(`lib/i18n/locales/${locale}/settings.json`,'utf8'));
 const missing=[...keys].filter(k=>typeof resource[k]!=='string'||!resource[k].trim());
 assert.deepEqual(missing,[],locale+' has missing product UI translations');
 if(!locale.startsWith('zh'))for(const c of clauses)assert.notEqual(resource[c[2]],c[2],locale+' has untranslated agreement text');
 console.log(locale+': '+keys.size+' UI/terms keys present; 7 clauses translated');
}
