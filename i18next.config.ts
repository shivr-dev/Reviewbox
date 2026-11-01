import {defineConfig} from 'i18next-cli';
export default defineConfig({locales:['zh-CN','zh-TW','ja','ko','en','es','fr','ru'],extract:{input:['components/**/*.{ts,tsx}','app/workspace.tsx'],output:'lib/i18n/locales/{{language}}/{{namespace}}.json',functions:['tr','t','*.t'],primaryLanguage:'zh-CN',defaultNS:'common',keySeparator:false,removeUnusedKeys:false},status:{checkIdentical:'warn'}});
