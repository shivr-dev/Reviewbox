'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,Check,ChevronRight,X,Workflow,ScanLine} from 'lucide-react';
import MemberAgentTools from './member-agent-tools';
import {useReview} from './review-context';
import {currentNamespace} from '@/lib/store';
import {membershipRequest,membershipState} from '@/lib/membership-client';
import {MEMBERSHIP_PLANS,type MembershipSnapshot,type MembershipPlan} from '@/lib/membership-policy';
import {tr} from '@/lib/i18n';
const text=(key:string)=>tr('membership:'+key);
export function useMembership(){
 const {cloudUser}=useReview(),ns=currentNamespace();
 const [snapshot,setSnapshot]=useState<MembershipSnapshot|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  if(!cloudUser){setSnapshot(null);return;}setBusy(true);
  try{const value=await membershipState();if(ns===currentNamespace()){setSnapshot(value);setError('');}}
  catch(e){if(ns===currentNamespace())setError((e as Error).message);}
  finally{if(ns===currentNamespace())setBusy(false);}
 }
 useEffect(()=>{
  setSnapshot(null);void refresh();const update=()=>{void refresh();};
  window.addEventListener('review:membership-updated',update);
  return()=>window.removeEventListener('review:membership-updated',update);
 },[cloudUser?.id,ns]);
 return {snapshot,error,busy,refresh};
}
const features={
 free:['完整学习、考试与真实 GPA','学习包、离线记录与设备同步','基础 Navi · 每月 60 AI Credits','每月 3 次 Plus 功能体验'],
 plus:['包含 Free 全部功能','深度辅导、多资料上下文与错因分析','实时工作区控制','每月 500 AI Credits'],
 pro:['包含 Plus 全部功能','跨页面学习 Agent','工作流与长期学习画像','每月 1,800 AI Credits'],
} as const;
function Disclosure({title,children}:{title:string;children:React.ReactNode}){
 return <details className="member-disclosure"><summary><span>{text(title)}</span><ChevronRight size={16}/></summary><div>{children}</div></details>;
}
export default function MembershipView(){
 const {navigate,cloudUser,section}=useReview(),{snapshot,error,busy,refresh}=useMembership();
 const [yearly,setYearly]=useState(false),[code,setCode]=useState(''),[working,setWorking]=useState(''),[notice,setNotice]=useState(''),[failure,setFailure]=useState('');
 const [admin,setAdmin]=useState(false),[codes,setCodes]=useState<any[]>([]),[newCode,setNewCode]=useState(''),[plan,setPlan]=useState<'plus'|'pro'>('plus'),[days,setDays]=useState(30),[maxUses,setMaxUses]=useState(1);
 const tool=section==='workflows'||section==='twin'?section:undefined;
 async function run(key:string,action:()=>Promise<void>){
  if(working)return;setWorking(key);setFailure('');setNotice('');
  try{await action();await refresh();window.dispatchEvent(new Event('review:membership-updated'));}
  catch(e){setFailure((e as Error).message);}finally{setWorking('');}
 }
 if(tool)return <section className="membership-page member-tool-page">
  <button className="settings-back" onClick={()=>navigate('membership')}><ArrowLeft size={16}/>{text('我的会员')}</button>
  {snapshot?<MemberAgentTools membership={snapshot} view={tool}/>:!cloudUser?<button className="primary" onClick={()=>navigate('you','all','account')}>{text('登录后查看会员与用量')}</button>:<p role="status">{error||text('读取中…')}</p>}
 </section>;
 return <section className="membership-page">
  <button className="settings-back" onClick={()=>navigate('you')}><ArrowLeft size={16}/>{text('我的')}</button>
  <header className="membership-heading"><span className="membership-eyebrow">REVIEWBOX MEMBERSHIP</span>
   <h1>{text('为每一个学习阶段，选择合适的支持。')}</h1>
   <p>{text('学习、考试与 GPA 始终完整。会员增加智能辅导能力，不改变你的真实学习成果。')}</p>
  </header>
  <div className="membership-billing" role="group" aria-label={text('计费周期')}>
   <button aria-pressed={!yearly} onClick={()=>setYearly(false)}>{text('按月')}</button>
   <button aria-pressed={yearly} onClick={()=>setYearly(true)}>{text('按年')}</button>
  </div>
  <div className="membership-plans">{Object.entries(MEMBERSHIP_PLANS).map(([key,p])=><article key={key} className={'membership-tier tier-'+key}>
   <div className="member-tier-name"><strong>{p.name}</strong>{snapshot?.plan===key&&<small>{text('当前计划')}</small>}</div>
   <h2>¥{yearly?p.yearly:p.monthly}<small> / {text(yearly?'年':'月')}</small></h2><p>{p.tagline}</p>
   <ul>{features[key as MembershipPlan].map(f=><li key={f}><Check size={15}/><span>{text(f)}</span></li>)}</ul>
   <button className="secondary" disabled={key!=='free'||snapshot?.plan==='free'} onClick={()=>navigate('you','all','account')}>
    {snapshot?.plan===key?text('当前计划'):key==='free'?text('管理账户'):text('暂未开放购买')}
   </button>
  </article>)}</div>
  <p className="membership-payment-note">{text('支付渠道尚未接入，不会创建订单或扣款。已有会员可通过授权兑换码激活。')}</p>
  {!cloudUser?<button className="primary" onClick={()=>navigate('you','all','account')}>{text('登录后查看会员与用量')}</button>:<section className="membership-account">
   <div className="member-section-heading"><h2>{text('我的会员')}</h2>{snapshot&&<span>{MEMBERSHIP_PLANS[snapshot.plan].name} · {text(snapshot.status)}</span>}</div>
   {busy&&!snapshot&&<p role="status">{text('读取中…')}</p>}
   {error&&<p role="alert">{error} <button className="text-button" onClick={()=>void refresh()}>{text('重试')}</button></p>}
   {snapshot&&<>
    <div className="member-usage-overview">
     <div className="membership-meter"><span>AI Credits <b>{snapshot.period.remaining} <small>/ {snapshot.period.allowance}</small></b></span><progress value={snapshot.period.remaining} max={snapshot.period.allowance}/><small>{text('预留')} {snapshot.period.reserved} · {text('下次重置')} {new Date(snapshot.period.end).toLocaleDateString()}</small></div>
     <dl className="member-trial-counts"><div><dt>{text('Plus 体验剩余')}</dt><dd>{snapshot.plusTrial.remaining}</dd></div><div><dt>{text('Pro Agent 预览剩余')}</dt><dd>{snapshot.proPreview.eligible?snapshot.proPreview.remaining:text('尚未解锁')}</dd></div></dl>
    </div>
    <p className="member-validity">{snapshot.expiresAt?text('会员有效至')+' · '+new Date(snapshot.expiresAt).toLocaleDateString():text('永久免费')}
     {!snapshot.proPreview.eligible&&snapshot.proPreview.eligibleAt?' · Pro Agent '+text('可用日期')+' '+new Date(snapshot.proPreview.eligibleAt).toLocaleDateString():''}
    </p>
    {snapshot.legacyUntil&&<p className="member-validity">{text('旧版 SuperReview 权益保留至')} {new Date(snapshot.legacyUntil).toLocaleDateString()}</p>}
    {snapshot.autoRenew&&!snapshot.cancelAtPeriodEnd&&<button className="text-button" disabled={!!working} onClick={()=>{if(confirm(text('确认取消续费？当前权益保留至到期。')))void run('cancel',async()=>{await membershipRequest('cancel');setNotice(text('已取消续费，当前权益保留至到期。'));});}}>{text('取消续费')}</button>}
    <div className="member-tool-entries"><button onClick={()=>navigate('membership','all','workflows')}><Workflow size={19}/><span><strong>{text('Pro 学习工作流')}</strong><small>{text('每周学习摘要')} · {text('近期考试检查')}</small></span><ChevronRight size={16}/></button><button onClick={()=>navigate('membership','all','twin')}><ScanLine size={19}/><span><strong>{text('Learning Twin · 学习画像')}</strong><small>{text('查看只读画像 / 比较安排')}</small></span><ChevronRight size={16}/></button></div>
    <Disclosure title="Credits 使用记录">{!snapshot.ledger.length?<p className="member-empty">{text('暂无使用记录')}</p>:<ul className="member-history">{snapshot.ledger.map(l=><li key={l.id}><time>{new Date(l.at).toLocaleString()}</time><span>{l.feature}</span><b>{l.charged} Credits</b><small>{text(l.status)}</small></li>)}</ul>}</Disclosure>
    <Disclosure title="会员变更记录"><ul className="member-history">{snapshot.subscriptionEvents.map(e=><li key={e.id}><time>{new Date(e.at).toLocaleString()}</time><span>{e.plan}</span><small>{e.type}</small></li>)}</ul>{!snapshot.subscriptionEvents.length&&<p className="member-empty">{text('暂无使用记录')}</p>}</Disclosure>
   </>}
   <Disclosure title="兑换会员码"><form className="member-redeem-form" onSubmit={e=>{e.preventDefault();void run('redeem',async()=>{await membershipRequest('redeem',{code,requestId:crypto.randomUUID()});setCode('');setNotice(text('兑换成功，会员状态已更新。'));});}}><label>{text('兑换码')}<input value={code} onChange={e=>setCode(e.target.value)} maxLength={64} minLength={6} autoComplete="off" required/></label><button className="primary" disabled={!!working}>{text('确认兑换')}</button></form></Disclosure>
   {snapshot?.admin&&<details className="member-disclosure member-admin" onToggle={e=>{if(e.currentTarget.open&&!admin)void run('admin',async()=>{const value=await membershipRequest('admin-code-list');setCodes(value.codes??[]);setAdmin(true);});}}><summary><span>{text('会员码管理（管理员）')}</span><ChevronRight size={16}/></summary>
    {admin&&<div><form className="member-form" onSubmit={e=>{e.preventDefault();void run('code',async()=>{await membershipRequest('admin-code-save',{code:newCode,rewards:{membershipPlan:plan,membershipDays:days},maxUses});const value=await membershipRequest('admin-code-list');setCodes(value.codes??[]);setNotice(text('会员码已保存'));});}}>
     <label>{text('兑换码')}<input value={newCode} onChange={e=>setNewCode(e.target.value)} required minLength={6}/></label>
     <label>{text('我的会员')}<select value={plan} onChange={e=>setPlan(e.target.value as 'plus'|'pro')}><option>plus</option><option>pro</option></select></label>
     <label>{text('有效天数')}<input type="number" min={1} max={3650} value={days} onChange={e=>setDays(+e.target.value)}/></label>
     <label>{text('使用上限')}<input type="number" min={1} value={maxUses} onChange={e=>setMaxUses(+e.target.value)}/></label>
     <div className="member-form-actions"><button className="primary" disabled={!!working}>{text('保存')}</button></div>
    </form>{codes.map(c=><div className="member-code-row" key={c.code}><b>{c.code}</b><span>{c.rewards?.membershipPlan} · {c.used??0} / {c.max_uses}</span><button className="secondary" disabled={!!working||c.active===false} onClick={()=>void run('disable',async()=>{await membershipRequest('admin-code-disable',{code:c.code});setCodes(v=>v.map(r=>r.code===c.code?{...r,active:false}:r));})}>{text('停用')}</button></div>)}</div>}
   </details>}
  </section>}
  {notice&&<p className="member-notice" role="status">{notice}</p>}{failure&&<p className="member-error" role="alert">{failure}</p>}
 </section>;
}
export function MembershipPromo(){
 const {navigate}=useReview(),{snapshot}=useMembership(),ns=currentNamespace(),[dismissed,setDismissed]=useState(false),day=new Date().toLocaleDateString('sv');
 useEffect(()=>{try{setDismissed(localStorage.getItem('review-membership-promo:'+ns)===day);}catch{}},[ns,day]);
 if(!snapshot||snapshot.plan!=='free'||dismissed)return null;
 return <aside className="membership-promo"><span><b>Reviewbox Plus</b> · {text('让 Navi 陪你深入理解')}</span><button onClick={()=>navigate('membership')}>{text('了解会员')}<ChevronRight size={14}/></button><button aria-label={text('今天不再显示')} onClick={()=>{setDismissed(true);try{localStorage.setItem('review-membership-promo:'+ns,day);}catch{}}}><X size={15}/></button></aside>;
}
