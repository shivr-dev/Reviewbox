import type { Question } from './model';
export function matchingAnswer(q:Question,value:string,complete=false):Record<string,string>|null{
 const m=q.matching;if(!m)return null;
 try{const raw=JSON.parse(value||'{}');if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 const entries=Object.entries(raw);if(entries.some(([l,r])=>typeof r!=='string'||!m.left.some(x=>x.id===l)||!m.right.some(x=>x.id===r))||new Set(entries.map(([,r])=>r)).size!==entries.length||complete&&entries.length!==m.left.length)return null;
 return Object.fromEntries(m.left.filter(l=>typeof raw[l.id]==='string').map(l=>[l.id,raw[l.id]]));
 }catch{return null;}
}
export function connectMatching(q:Question,current:string,leftId:string,rightId:string){
 if(!q.matching?.left.some(l=>l.id===leftId)||!q.matching.right.some(r=>r.id===rightId))throw new Error('配对选项已经改变，请重新打开题目');
 const mapping=matchingAnswer(q,current)??{},next=Object.fromEntries([...Object.entries(mapping).filter(([l,r])=>l!==leftId&&r!==rightId),[leftId,rightId]]);
 return JSON.stringify(matchingAnswer(q,JSON.stringify(next))!);
}
export function matchingSignature(q:Question){return JSON.stringify({id:q.id,version:q.version,left:q.matching?.left.slice().sort((a,b)=>a.id.localeCompare(b.id)),right:q.matching?.right.slice().sort((a,b)=>a.id.localeCompare(b.id)),answer:matchingAnswer(q,q.answer,true)});}
export function shuffleMatching(q: Question): Question {
  if (!q.matching) return q;
  const answer = matchingAnswer(q,q.answer,true);if(!answer)throw new Error('连线题参考答案与选项标识不一致');
  const left = q.matching.left.map((x) => ({ ...x }));
  let right = q.matching.right.map((x) => ({ ...x }));
  for (let i = right.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [right[i], right[j]] = [right[j], right[i]];
  }
  if (q.matching.left.every((l, i) => answer[l.id] === right[i]?.id))
    right = [...right.slice(1), right[0]];
  // IDs represent item identity, not screen position. Never rename them when
  // shuffling: drafts, graders, explanations and saved events share these IDs.
  return {
    ...q,
    matching: {
      left,
      right,
    },
    answer: JSON.stringify(answer),
  };
}
