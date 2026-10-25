import {validatePack} from './importer';
import type {Pack} from './model';
/** Opt-in publication parses content only; never copies records, history or identity. */
export function preparePublicPack(input:unknown):Pack {
  const pack=validatePack(input);
  if(!pack.manifest.title.trim()||!pack.knowledge.length||!pack.questions.length)throw new Error('公开学习包需要标题、知识点和题目');
  if(pack.questions.length>5000||new TextEncoder().encode(JSON.stringify(pack)).length>4500000)throw new Error('公开学习包最多 5000 题、4.5 MB，请拆分后上传');
  return pack;
}
