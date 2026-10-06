(() => {
 let nonce='',failure='';
 const report=()=>parent.postMessage({channel:'review-act',type:'player-error',nonce,message:failure},location.origin);
 window.addEventListener('error',event=>{
  if(!event.message&&event.target?.tagName!=='SCRIPT')return;
  failure=event.message||'考试脚本未能加载，请重新连接。';report();
 },true);
 window.addEventListener('unhandledrejection',event=>{failure=String(event.reason?.message||event.reason||'考试界面发生错误。');report();});
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||event.data?.channel!=='review-act')return;
  if(event.data.type==='init'){nonce=event.data.nonce;if(failure)report();}
  if(event.data.type==='ping'&&failure)report();
 });
})();
