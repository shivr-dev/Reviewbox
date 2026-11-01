import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n, { tr } from '../lib/i18n';
import { UsageAgreement } from '../components/usage-agreement';
test('all agreement bodies render in the selected language, including long keys with spaces', async () => {
  const source=fs.readFileSync('components/usage-agreement.tsx','utf8');
  const clauses=[...source.matchAll(/\[\s*'([^']+)',\s*'([^']+)',?\s*\]/g)];
  assert.equal(clauses.length,7);
  try {
    for(const locale of ['zh-CN','zh-TW','en','ja','ko','es','fr','ru']){
      const resource=JSON.parse(fs.readFileSync(`lib/i18n/locales/${locale}/settings.json`,'utf8'));
      i18n.addResourceBundle(locale,'settings',resource,true,true);
      await i18n.changeLanguage(locale);
      for(const clause of clauses)assert.equal(tr('settings:'+clause[2]),resource[clause[2]],locale+' clause '+clause[1]);
      for(const key of ['一起打磨 Reviewbox 测试版','发现问题，欢迎通过 反馈告诉我们。','有些功能仍在打磨。遇到卡住、显示异常或答案问题，欢迎帮忙找 Bug。','反馈入口：我的 → 数据与隐私 → 反馈。写下操作步骤、预期和实际结果，就很有帮助。']){
        assert.equal(tr('settings:'+key),resource[key],locale+' beta notice did not translate');
        if(!locale.startsWith('zh'))assert.notEqual(tr('settings:'+key),key);
      }
      const rendered=renderToStaticMarkup(<UsageAgreement/>);
      for(const clause of clauses)assert.ok(rendered.includes(resource[clause[2]].slice(0,24)),locale+' rendered paragraph missing');
      if(!locale.startsWith('zh')){
        assert.ok(!rendered.includes(clauses[5][2]),locale+' clause 6 fell back to Chinese');
        assert.ok(!rendered.includes(clauses[6][2]),locale+' clause 7 fell back to Chinese');
      }
    }
    i18n.addResource('ja','settings','literal: with spaces','区切り記号と空白を含む文章');
    await i18n.changeLanguage('ja');
    assert.equal(tr('settings:literal: with spaces'),'区切り記号と空白を含む文章');
  } finally { await i18n.changeLanguage('zh-CN'); }
});
