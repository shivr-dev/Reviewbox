/* ACT international PSI interface study. All responses stay on this device. */
(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = {
    tools:'<path d="m14 7 3-3 3 1-3 3 1 3-3 3-3-1-7 7-2-2 7-7-1-3 3-3 3 1ZM4 3l4 4M3 4l4 4M15 16l5 5M17 14l4 5"/>',
    contrast:'<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 21h8M12 16v5M3 7h18"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:'<path d="m3 3 18 18M10 5c6-1 10 5 12 7-1 2-3 4-5 5M6 6c-2 2-3 4-4 6 3 5 7 8 13 6M9 9a4 4 0 0 0 6 6"/>',
    index:'<path d="M4 5h16M4 12h16M4 19h16"/>',
    flag:'<path d="M5 22V3c5-4 9 4 15 0v10c-6 4-10-4-15 0" fill="currentColor" stroke-width="1"/>',
    help:'<rect x="5" y="3" width="15" height="18" rx="2" fill="currentColor"/><path d="M9 8h7M9 12h7M6 18h13" stroke="var(--paper)" stroke-width="1.5"/>',
    question:'<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v.1" stroke="var(--paper)"/>',
    next:'<path d="m9 4 8 8-8 8"/>', prev:'<path d="m15 4-8 8 8 8"/>',
    close:'<path d="m5 5 14 14M19 5 5 19" stroke-width="3"/>',
    check:'<path d="m4 12 5 5L20 5" stroke-width="2.5"/>',
    highlighter:'<path d="m14 3 7 7-10 10-7-7ZM4 13l-2 7 7-2M3 22h17M12 5l7 7"/>',
    clear:'<path d="m14 3 7 7-10 10H6l-4-4Zm-8 9 7 7M9 21h13"/>',
    network:'<path d="M3 21v-3m4 3v-6m4 6v-10m4 10V7m4 14V3" stroke-width="2.5"/>',
    magnify:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7M7 10h6M10 7v6"/>',
    reader:'<rect x="2" y="3" width="20" height="18"/><path d="M2 9h20M2 15h20"/>',
    mask:'<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M3 14h18"/>',
    eliminate:'<path d="m4 4 16 16M20 4 4 20M3 12h18"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]||''}</svg>`;
  let D = {sections:[],banks:{}}; let bridge=null, sequence=0, initialized=false;
  const post=(type,extra={})=>parent.postMessage({channel:"review-act",nonce:bridge,type,...extra},location.origin);
  const initial = () => ({section:0,item:0,answers:{},flags:{},eliminated:{},revealed:{},highlights:{},essay:'',deadline:null,started:false,expired:false,completed:[],contrast:'',timerHidden:false,accepted:false});
  let state=initial();
  let scene='notice', menu='', indexOpen=false, indexFilter='all', helpReturn='', lastFocus=null, toastTimer, submitTimer;
  const activeTools={highlighter:false,eliminate:false,mask:false,reader:false,magnify:false};
  let fiveMinuteShown=false, breakDeadline=0, resizeObserver,lastAccounted=Date.now();
  const sec = () => D.sections[state.section];
  const key = () => `${sec().id}:${state.item}`;
  const question = (i=state.item) => D.banks[sec().id][i];
  const answered = () => sec().writing ? (state.essay.trim()?1:0) : Object.keys(state.answers).filter(k=>k.startsWith(sec().id+':')).length;
  const snapshot=()=>({...state,actVersion:1,scene,breakDeadline,fiveMinuteShown,helpReturn,tools:activeTools});
  const save=()=>{if(initialized){state.times??={};if(scene==='exam'){state.times[key()]=(state.times[key()]||0)+Math.max(0,(Date.now()-lastAccounted)/1000);}lastAccounted=Date.now();if(sec().writing)state.answers[key()]=state.essay;post("snapshot",{sequence:++sequence,snapshot:snapshot()});}};
  const seconds = () => state.deadline ? Math.max(0,Math.ceil((state.deadline-Date.now())/1000)) : sec().minutes*60;
  const fmt = n => `${String(Math.floor(n/3600)).padStart(2,'0')}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function notify(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2400);}
  function go(next){if(scene==='exam')captureHighlights();menu='';indexOpen=false;closeModal();scene=next;save();render();}
  function startClock(){if(!state.started&&!state.expired){state.started=true;state.deadline=Date.now()+sec().minutes*60000;save();}}
  function title(){return ({notice:'Information',statement:'Examinee Statement',help:'Help Screen',information:'Information',instructions:'Instructions',exam:`Item ${state.item+1}`,review:'Review',break:'Break',submitting:'End Test',complete:'Next Steps',declined:'Test Closed'})[scene]||'Information';}
  function render(){
    document.body.className=`${state.contrast?'contrast-'+state.contrast:''} ${activeTools.highlighter?'highlighter-on':''}`;
    const timed=['instructions','exam','review','help'].includes(scene)&&state.started;
    $('#app').innerHTML=`<header class="topbar"><div class="brand"><img src="assets/act-logo.png" width="155" height="40" alt="A. C. T Logo"></div><nav class="utilities" aria-label="Utilities"><button class="utility" data-action="tools" aria-label="Tools" aria-expanded="${menu==='tools'}">${icon('tools')}<span class="caret"></span></button><button class="utility" data-action="contrast" aria-label="Contrast" aria-expanded="${menu==='contrast'}">${icon('contrast')}<span class="caret"></span></button></nav><div class="metrics"><span class="metric-label">${esc(D.student)}</span><span class="metric-label">Answered</span><span id="answered-count">${answered()} of ${sec().count}</span><div class="clock ${seconds()<=300&&timed?'warning':''}" role="region" aria-label="Clock"><span class="metric-label">Total time left</span><span class="clock-value" id="clock-value">${state.timerHidden?'':fmt(seconds())}</span><button class="clock-hide" aria-label="${state.timerHidden?'Show':'Hide'} Timer" data-action="timer">${icon(state.timerHidden?'eye':'eyeOff')}</button></div></div><button class="end-button" data-action="end" ${!state.started||['complete','declined','break','submitting'].includes(scene)?'disabled':''}><span class="stop-icon"></span>END TEST</button></header><div class="workspace"><main class="test-card"><div class="item-header"><h1 tabindex="-1" id="item-heading">${title()}</h1><button class="flag ${state.flags[key()]&&scene==='exam'?'active':''}" data-action="flag" aria-pressed="${!!state.flags[key()]&&scene==='exam'}" ${scene!=='exam'?'disabled':''}>${icon('flag')}FLAG</button></div><div class="test-content" id="test-content">${page()}</div><footer class="bottom-nav">${nav()}</footer></main>${indexOpen?indexMarkup():''}<aside class="side-menu" aria-label="Side Menu"><button class="side-btn ${indexOpen?'active':''}" data-action="index" aria-label="Index" aria-expanded="${indexOpen}">${icon('index')}<span>Index</span></button><button class="side-btn ${scene==='help'?'active':''}" data-action="help" aria-label="Help Screen">${icon('help')}<span>Help Screen</span></button>${activeTools.highlighter?`<button class="side-btn active" data-action="highlighter">${icon('highlighter')}<span>Highlighter</span></button><button class="side-btn" data-action="clear-highlights">${icon('clear')}<span>Clear Highlights</span></button>`:''}<div class="network" role="status" aria-label="Local demo status">${icon('network')}Connected</div></aside></div>`;
    drawMenu();drawFloating();
    if(scene==='exam'){
      restoreHighlights();
      const input=$('.essay'); if(input){input.value=state.essay;input.addEventListener('input',()=>{state.essay=input.value;save();$('.chars').textContent=`Chars left: ${12000-input.value.length}`;$('#answered-count').textContent=`${answered()} of 1`;});}
      bindHighlighter();
    }
    if(state.expired&&['exam','instructions','review','help','information'].includes(scene)){showExpired();}
    if(scene==='submitting'){clearTimeout(submitTimer);submitTimer=setTimeout(()=>finishSection(),3000+Math.random()*3000);}
  }
  function nav(){
    if(scene==='statement')return '';
    if(scene==='complete'||scene==='declined')return `<button class="nav-btn" data-action="restart">RETURN TO START ${icon('next')}</button>`;
    if(scene==='submitting')return '';
    if(scene==='break')return `<button class="nav-btn" data-action="continue-section">CONTINUE ${icon('next')}</button>`;
    return `<button class="nav-btn" data-action="prev" aria-label="Previous" ${scene==='notice'||(scene==='help'&&!helpReturn)?'disabled':''}>${icon('prev')}PREV</button><button class="nav-btn" data-action="next" aria-label="Next">NEXT ${icon('next')}</button>`;
  }
  function page(){
    if(scene==='notice')return `<article class="page-copy prep-copy"><h2>Before You Begin</h2><p>Review each information page before continuing to the test.</p><ul><li>Follow the instructions given by your test supervisor.</li><li>Use only the materials permitted for this section.</li><li>If you need assistance, raise your hand and wait for the supervisor.</li></ul><p>Select <strong>Next</strong> to continue.</p></article>`;
    if(scene==='statement')return `<article class="page-copy prep-copy"><h2>Examinee Statement</h2><div class="statement-box"><p>I understand that I must follow the testing instructions and work independently. I will not use unauthorized materials, obtain assistance, or share test content.</p><p>I have reviewed the instructions and am ready to continue.</p></div><p>Select <strong>Accept</strong> to continue. Selecting <strong>Decline</strong> closes this local test session.</p><div class="statement-actions"><button class="primary" data-action="accept">Accept</button><button class="secondary" data-action="decline">Decline</button></div></article>`;
    if(scene==='help')return helpPage();
    if(scene==='information')return `<article class="page-copy prep-copy"><h3>${sec().name} Test Directions</h3><p>The next page contains instructions for this section. You can return to those instructions during the test using the Index.</p><p>Use the scratch paper provided by the test supervisor. Return it at the end of the test.</p><p>The timer starts when you open the instructions page.</p><p>When you are ready, select <strong>Next</strong>.</p></article>`;
    if(scene==='instructions')return `<article class="page-copy prep-copy"><h2>${sec().name} Test — ${sec().count} ${sec().count===1?'task':'questions'}</h2><h3>${sec().minutes} minutes</h3>${directions()}<p>Your time for this section includes time spent reading these instructions. Use the Index to return to an item or to review flagged and unanswered questions.</p><p>Select <strong>Next</strong> to begin.</p></article>`;
    if(scene==='exam')return examPage();
    if(scene==='review')return `<article class="page-copy prep-copy"><h2>Review Your Answers</h2><p>You have answered <strong>${answered()} of ${sec().count}</strong> questions in this section.</p><p>You may return to any question in this section while time remains.</p><div class="statement-actions"><button class="primary" data-action="index">Open Index</button><button class="secondary" data-action="end">End Test</button></div></article>`;
    if(scene==='submitting')return `<section class="center-page"><div class="loader" role="progressbar" aria-label="Saving responses"></div><h2>Saving Your Responses</h2><p>Please wait.</p></section>`;
    if(scene==='break')return `<section class="center-page"><h2>Break</h2><p>The ${D.sections[state.section-1]?.name||'previous'} section is complete.</p><p>Follow your test supervisor’s instructions before continuing.</p><div class="break-clock" id="break-clock">${fmt(Math.max(0,Math.ceil((breakDeadline-Date.now())/1000))).slice(3)}</div><button class="primary" data-action="continue-section">Continue</button></section>`;
    if(scene==='complete')return `<section class="center-page"><div class="complete-symbol">${icon('check')}</div><h2>Test Complete</h2><p>Your responses have been saved in your personal learning space.</p><div class="receipt"><h3>Next Steps</h3><p>Select the button below to review each answer and explanation.</p><p>This is an English-only personal simulation; it does not produce an official ACT score.</p></div><button class="primary" data-action="results">View Answers and Analysis</button></section>`;
    if(scene==='declined')return `<section class="center-page"><h2>Test Closed</h2><p>You did not accept the examinee statement.</p><button class="primary" data-action="restart">Return to Start</button></section>`;
    return '';
  }
  function directions(){return ({english:'<p>Read each passage and consider the underlined portions. Choose the response that best follows standard written English and fits the passage. Some questions ask about the passage as a whole.</p>',math:'<p>Choose the best answer to each mathematics question. You may use an approved calculator. Unless stated otherwise, figures are not necessarily drawn to scale.</p>',reading:'<p>Read the passage and answer the questions using the information it provides. Choose the best response for each question.</p>',science:'<p>Use the descriptions, tables, and figures to answer the questions. Choose the response best supported by the information presented.</p>',writing:'<p>Read the issue and the different perspectives. Plan and write an organized essay that explains your position and supports it with reasoning and examples.</p>'})[sec().name.toLowerCase()];}
  function helpPage(){
    const rows=[['tools','Tools','Open the tool menu to turn reading and answer tools on or off. More than one tool can be active.'],['contrast','Contrast','Choose a different foreground and background color combination.'],['','Answered','The counter reports how many questions in this section have a response.'],['eyeOff','Total time left','The clock shows the remaining section time. Use the eye button to hide or show it.'],['','End Test','Open the confirmation before ending this local section.'],['flag','Flag','Mark the current item so that you can find it again in the Index.'],['next','Prev / Next','Move between information pages and questions.'],['index','Index','Open the item list. Answered and flagged labels help you find items to review.'],['help','Help Screen','Open these descriptions. Select this button again to return to the test.'],['highlighter','Highlighter','Select text in the passage or prompt to highlight it. Clear Highlights removes marks on this item.'],['reader','Line Reader','Move the floating window by its title bar. Resize its reading opening or the outer frame.'],['magnify','Magnifier','Move your pointer over the question to enlarge the text in the floating window.'],['eliminate','Answer Eliminator','Use the X beside an answer to cross it out. This does not select an answer.'],['mask','Answer Masking','Use Show or Hide beside each answer to reveal or cover its text.']];
    return `<article class="page-copy"><h2>Help Screen</h2><p>This page describes the controls available in this local interface. Open it again at any time from the side menu.</p><p>Select <strong>Next</strong> to continue.</p><table class="help-table"><tbody>${rows.map(([i,t,d])=>`<tr><td><span class="help-example">${i?icon(i):''}${t}</span></td><td>${d}</td></tr>`).join('')}</tbody></table></article>`;
  }
  function examPage(){
    const q=question(); const elim=state.eliminated[key()]||[]; const revealed=state.revealed[key()]||[];
    const choices=(q.choices||[]).map((answer,i)=>`<div class="answer-row ${activeTools.eliminate&&elim.includes(i)?'eliminated':''} ${activeTools.mask&&!revealed.includes(i)?'masked':''}">${activeTools.eliminate?`<button class="eliminate" data-eliminate="${i}" aria-label="${elim.includes(i)?'Restore':'Eliminate'} answer ${'ABCD'[i]}" aria-pressed="${elim.includes(i)}">×</button>`:''}<label class="answer-label"><input type="radio" name="answer" value="${i}" ${state.answers[key()]===i?'checked':''} aria-label="${'ABCD'[i]}. ${esc(answer)}"><span class="answer-letter">${'ABCD'[i]}.</span><span class="answer-text">${esc(answer)}</span></label>${activeTools.mask?`<button class="mask-toggle" data-reveal="${i}" aria-label="${revealed.includes(i)?'Hide':'Show'} answer ${'ABCD'[i]}">${revealed.includes(i)?'Hide':'Show'}</button>`:''}</div>`).join('');
    const figure=q.figure==='rectangle'?'<svg class="math-figure" viewBox="0 0 280 160" aria-label="Rectangle with sides 12 centimeters and 5 centimeters"><rect x="30" y="25" width="200" height="95" fill="none" stroke="currentColor"/><path d="M30 120 230 25" stroke="currentColor" stroke-dasharray="5 4"/><text x="125" y="145" text-anchor="middle" fill="currentColor">12</text><text x="245" y="78" fill="currentColor">5</text></svg>':'';
    return `<article class="question-layout">${q.passage?`<section class="passage" aria-label="Passage"><div class="highlight-zone" data-zone="passage">${q.passage.replace('data-target','data-target class="target"')}</div></section>`:''}<section class="question-pane ${q.passage?'':'single'}" aria-label="Question"><div class="highlight-zone prompt" data-zone="prompt">${esc(q.prompt)}</div>${figure}${sec().writing?'<textarea class="essay" aria-label="Essay response" maxlength="12000" spellcheck="false"></textarea><div class="chars">Chars left: '+(12000-state.essay.length)+'</div>':`<div class="answer-list" role="radiogroup" aria-label="Answer choices">${choices}</div>`}</section></article>`;
  }
  function indexMarkup(){
    const entries=Array.from({length:sec().count},(_,i)=>{const k=`${sec().id}:${i}`;const done=sec().writing?!!state.essay.trim():Object.hasOwn(state.answers,k);const flagged=!!state.flags[k];if(indexFilter==='unanswered'&&done||indexFilter==='flagged'&&!flagged)return '';return `<button class="index-item ${i===state.item&&scene==='exam'?'current':''}" data-item="${i}" aria-label="Question ${i+1}${done?', Answered':''}${flagged?', Flagged':''}"><span class="index-status">${done?`<span>${icon('check')}Answered</span>`:''}${flagged?`<span>${icon('flag')}Flagged</span>`:''}</span><h3>Question ${i+1}</h3><p>${esc(question(i).prompt)}</p></button>`;}).join('');
    return `<aside class="index-panel" aria-label="Item Index"><div class="index-top"><h2>Index</h2><button aria-label="Close Index" data-action="index">${icon('close')}</button></div><div class="index-filters">${['all','unanswered','flagged'].map(f=>`<button data-filter="${f}" class="${indexFilter===f?'active':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</div><div class="index-list"><button class="index-item" data-action="index-instructions"><h3>Instructions</h3><p>${sec().name} — ${sec().count} questions</p></button>${entries||'<p>No items match this filter.</p>'}</div></aside>`;
  }
  function drawMenu(){
    const target=$('#menus');target.innerHTML=''; if(!menu)return;
    const anchor=$(`[data-action="${menu}"]`).getBoundingClientRect();
    const opts=menu==='tools'?[['highlighter','Highlighter'],['reader','Line Reader'],['magnify','Magnifier'],...(scene==='exam'&&!sec().writing?[['eliminate','Answer Eliminator'],['mask','Answer Masking']]:[])]:[['','Default'],['cream','Black on Cream'],['blue','Black on Light Blue'],['dark','White on Black']];
    target.innerHTML=`<div class="dropdown" role="menu" aria-label="${menu==='tools'?'Tools':'Contrast'}" style="left:${Math.min(anchor.left,innerWidth-230)}px">${opts.map(([v,label])=>`<button role="menuitemcheckbox" aria-checked="${menu==='tools'?activeTools[v]:state.contrast===v}" data-${menu==='tools'?'tool':'contrast'}="${v}"><span class="menu-check">${(menu==='tools'?activeTools[v]:state.contrast===v)?'✓':''}</span>${label}</button>`).join('')}</div>`;
  }
  function captureHighlights(){if(scene!=='exam')return;const zones=$$('.highlight-zone');if(zones.length)state.highlights[key()]=Object.fromEntries(zones.map(z=>[z.dataset.zone,z.innerHTML]));save();}
  function restoreHighlights(){const saved=state.highlights[key()];if(saved)$$('.highlight-zone').forEach(z=>{if(saved[z.dataset.zone]){const t=document.createElement('template');t.innerHTML=saved[z.dataset.zone];for(const n of [...t.content.querySelectorAll('*')]){if(!['BR','MARK'].includes(n.tagName)){n.replaceWith(...n.childNodes);continue;}for(const attr of [...n.attributes])if(!(n.tagName==='MARK'&&attr.name==='data-highlight'))n.removeAttribute(attr.name);}z.replaceChildren(t.content.cloneNode(true));}});}
  function bindHighlighter(){
    $('#test-content').addEventListener('mouseup',()=>{
      if(!activeTools.highlighter)return; const selection=getSelection();if(!selection.rangeCount||selection.isCollapsed)return;
      const range=selection.getRangeAt(0), node=range.commonAncestorContainer, element=node.nodeType===1?node:node.parentElement,zone=element.closest('.highlight-zone');if(!zone||!zone.contains(range.startContainer)||!zone.contains(range.endContainer))return;
      const walker=document.createTreeWalker(zone,NodeFilter.SHOW_TEXT);const texts=[];while(walker.nextNode()){const n=walker.currentNode;if(range.intersectsNode(n)&&n.textContent.trim())texts.push(n);}texts.forEach(n=>{let start=n===range.startContainer?range.startOffset:0,end=n===range.endContainer?range.endOffset:n.length;if(end<=start)return;const r=document.createRange();r.setStart(n,start);r.setEnd(n,end);const mark=document.createElement('mark');mark.dataset.highlight='true';r.surroundContents(mark);});selection.removeAllRanges();captureHighlights();
    });
  }
  function drawFloating(){
    resizeObserver?.disconnect();$('#floating').innerHTML='';
    const head=(label,tool)=>`<div class="float-title" tabindex="0" aria-label="Move ${label}">${label}<div class="float-actions"><button data-tool-help="${tool}" aria-label="${label} help">${icon('question')}</button><button data-tool="${tool}" aria-label="Close ${label}">${icon('close')}</button></div></div>`;
    if(activeTools.reader){$('#floating').insertAdjacentHTML('beforeend',`<div class="reader-frame" aria-label="Line Reader">${head('Line Reader','reader')}<div class="reader-body"><div class="reader-window" tabindex="0" aria-label="Resize reading window"></div></div></div>`);const hole=$('.reader-window');resizeObserver=new ResizeObserver(()=>{$('.reader-body')?.style.setProperty('--hole',hole.offsetHeight+'px');});resizeObserver.observe(hole);}
    if(activeTools.magnify){$('#floating').insertAdjacentHTML('beforeend',`<div class="magnifier-frame" aria-label="Magnifier">${head('Magnifier','magnify')}<div class="magnifier-view"><div class="magnified-content"></div></div></div>`);const content=$('.magnified-content');const original=$('#test-content');const clone=original.cloneNode(true);clone.removeAttribute('id');$$('[id]',clone).forEach(n=>n.removeAttribute('id'));$$('input,textarea,button',clone).forEach(n=>{n.disabled=true;n.removeAttribute('name');});clone.style.width=original.clientWidth+'px';clone.style.height=original.clientHeight+'px';content.append(clone);content.style.transform='scale(1.7)';original.addEventListener('pointermove',e=>{const b=original.getBoundingClientRect();content.style.left=80-(e.clientX-b.left)*1.7+'px';content.style.top=60-(e.clientY-b.top)*1.7+'px';});}
    $$('.float-title').forEach(handle=>{
      handle.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();handle.setPointerCapture(e.pointerId);const frame=handle.parentElement,box=frame.getBoundingClientRect(),start={x:e.clientX,y:e.clientY};const move=m=>{frame.style.left=Math.max(0,Math.min(innerWidth-70,box.left+m.clientX-start.x))+'px';frame.style.top=Math.max(56,Math.min(innerHeight-45,box.top+m.clientY-start.y))+'px';};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',()=>handle.removeEventListener('pointermove',move),{once:true});});
      handle.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const frame=handle.parentElement,b=frame.getBoundingClientRect();frame.style.left=Math.max(0,b.left+(e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0))+'px';frame.style.top=Math.max(56,b.top+(e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0))+'px';});
    });
    $('.reader-window')?.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.currentTarget.style.height=Math.max(25,e.currentTarget.offsetHeight+(e.key==='ArrowDown'?5:-5))+'px';}});
  }
  function dialog(heading,body,buttons){lastFocus=document.activeElement;$('#modal-root').innerHTML=`<div class="modal-shade"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title">${heading}</h2><button data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-content">${body}</div><div class="dialog-actions">${buttons.map(b=>`<button class="${b.primary?'primary':'secondary'}" data-action="${b.action}">${b.label}</button>`).join('')}</div></section></div>`;$('.dialog button').focus();}
  function closeModal(){const exists=$('.dialog');$('#modal-root').innerHTML='';if(exists&&lastFocus?.isConnected)lastFocus.focus();}
  function endConfirm(){dialog('End Test',`<p>You have answered <strong>${answered()} of ${sec().count}</strong> questions.</p><p>Are you sure you want to end this section? You will not be able to change your answers after continuing.</p>`,[{label:'Return to Test',action:'close-modal'},{label:'End Test',action:'confirm-end',primary:true}]);}
  function finishSection(){
    if(!state.completed.includes(sec().id))state.completed.push(sec().id);state.started=false;state.deadline=null;state.item=0;state.expired=false;fiveMinuteShown=false;
    if(state.section<D.sections.length-1){state.section++;save();if(D.sections[state.section-1].breakAfter){breakDeadline=Date.now()+D.sections[state.section-1].breakAfter*1000;go('break');}else go('information');}
    else {save();post('submit',{snapshot:snapshot()});}
  }
  function results(){dialog('Local Session Summary',`<p>These are demonstration responses, not an ACT score.</p><table class="result-table"><thead><tr><th>Section</th><th>Answered</th></tr></thead><tbody>${D.sections.map(s=>`<tr><td>${s.name}</td><td>${s.id==='writing'?(state.essay.trim()?1:0):Object.keys(state.answers).filter(k=>k.startsWith(s.id+':')).length} / ${s.count}</td></tr>`).join('')}</tbody></table>`,[{label:'Close',action:'close-modal',primary:true}]);}
  function showScenes(){dialog('界面场景 / Local Preview',`<div class="demo-select"><label for="demo-section">科目</label><select id="demo-section">${D.sections.map((s,i)=>`<option value="${i}" ${state.section===i?'selected':''}>${s.name}</option>`).join('')}</select></div><div class="demo-grid">${[['notice','考前提示'],['statement','考生声明'],['help','工具帮助'],['information','准备开始'],['instructions','科目说明 / 开始计时'],['exam','作答界面'],['review','检查作答'],['break','休息'],['complete','考试结束'],['declined','拒绝声明 / 退出']].map(([s,l])=>`<button data-scene="${s}">${l}</button>`).join('')}<button data-action="five-minute">剩余五分钟提醒</button><button data-action="expire">时间到</button></div><p class="demo-note">F2 打开此面板。示例题目循环填充题号。考前声明、休息和结束页的完整现行截图尚未核实；这些页面为流程示意。此面板不属于官方界面。</p><p class="shortcut-note"><a href="library.html" target="_blank">资源库与格式规范</a></p>`,[{label:'重新开始本地演示',action:'reset-demo'},{label:'Close',action:'close-modal',primary:true}]);}
  function navigateNext(){
    if(scene==='notice')go('statement');
    else if(scene==='help'){if(helpReturn){const back=helpReturn;helpReturn='';go(back);}else go('information');}
    else if(scene==='information'){startClock();go('instructions');}
    else if(scene==='instructions')go('exam');
    else if(scene==='exam'){if(state.item<sec().count-1){captureHighlights();state.item++;save();render();$('#item-heading').focus();}else go('review');}
    else if(scene==='review')endConfirm();
  }
  function navigatePrev(){if(scene==='exam'){if(state.item>0){captureHighlights();state.item--;save();render();}else go('instructions');}else if(scene==='instructions')go('information');else if(scene==='review')go('exam');else if(scene==='information')go('statement');else if(scene==='help'&&helpReturn){const back=helpReturn;helpReturn='';go(back);}}
  const actions={
    next:navigateNext,prev:navigatePrev,
    accept:()=>{state.accepted=true;save();helpReturn='';go('help');},
    decline:()=>dialog('Decline Statement','<p>Declining closes this local test session. Do you want to continue?</p>',[{label:'Cancel',action:'close-modal'},{label:'Decline',action:'confirm-decline',primary:true}]),
    'confirm-decline':()=>go('declined'),
    tools:()=>{menu=menu==='tools'?'':'tools';drawMenu();$('[data-action="tools"]').setAttribute('aria-expanded',String(menu==='tools'));},
    contrast:()=>{menu=menu==='contrast'?'':'contrast';drawMenu();$('[data-action="contrast"]').setAttribute('aria-expanded',String(menu==='contrast'));},
    timer:()=>{state.timerHidden=!state.timerHidden;save();render();},
    flag:()=>{if(scene==='exam'){state.flags[key()]=!state.flags[key()];save();captureHighlights();render();}},
    index:()=>{captureHighlights();indexOpen=!indexOpen;render();},
    'index-instructions':()=>{if(!state.started){notify('Complete the preparation pages first.');return;}go('instructions');},
    help:()=>{if(scene==='help'){const back=helpReturn||'information';helpReturn='';go(back);}else{helpReturn=scene;go('help');}},
    highlighter:()=>{activeTools.highlighter=!activeTools.highlighter;captureHighlights();render();},
    'clear-highlights':()=>{$$('mark[data-highlight]',$('#test-content')).forEach(n=>n.replaceWith(...n.childNodes));captureHighlights();notify('Highlights cleared.');},
    end:endConfirm,
    'confirm-end':()=>{captureHighlights();state.deadline=null;state.started=false;state.expired=false;save();go('submitting');},
    'continue-section':()=>{if(Date.now()<breakDeadline){notify('Please wait until the break ends.');return;}breakDeadline=0;go('information');},
    'close-modal':()=>{if(!state.expired)closeModal();},
    restart:()=>post('exit',{snapshot:snapshot()}),results:()=>post('report'),
    'reset-demo':()=>{state=initial();Object.keys(activeTools).forEach(k=>activeTools[k]=false);fiveMinuteShown=false;save();go('notice');},
    'five-minute':()=>{state.started=true;state.deadline=Date.now()+300000;fiveMinuteShown=false;save();closeModal();go('exam');},
    expire:()=>{state.started=true;state.deadline=Date.now();save();go('exam');}
  };
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b){if(!e.target.closest('.dropdown')){menu='';drawMenu();}return;}
    if(b.dataset.action)actions[b.dataset.action]?.();
    else if(b.dataset.tool){const t=b.dataset.tool;activeTools[t]=!activeTools[t];menu='';captureHighlights();render();}
    else if(Object.hasOwn(b.dataset,'contrast')){state.contrast=b.dataset.contrast;menu='';save();captureHighlights();render();}
    else if(b.dataset.filter){indexFilter=b.dataset.filter;captureHighlights();render();}
    else if(Object.hasOwn(b.dataset,'item')){if(!state.started){notify('Complete the preparation pages first.');return;}captureHighlights();state.item=Number(b.dataset.item);save();go('exam');}
    else if(b.dataset.eliminate){toggleArray('eliminated',Number(b.dataset.eliminate));}
    else if(b.dataset.reveal){toggleArray('revealed',Number(b.dataset.reveal));}
    else if(b.dataset.toolHelp){dialog(b.dataset.toolHelp==='reader'?'Line Reader':'Magnifier','<p>Drag the title bar to move this window. Use the lower-right corner to resize it. The reading opening can be resized separately.</p>',[{label:'Close',action:'close-modal',primary:true}]);}
    else if(b.dataset.scene){captureHighlights();state.section=Number($('#demo-section').value);state.item=0;state.started=false;state.expired=false;state.deadline=null;fiveMinuteShown=false;if(['instructions','exam','review'].includes(b.dataset.scene))startClock();if(b.dataset.scene==='break')breakDeadline=Date.now()+900000;save();go(b.dataset.scene);}
  });
  function toggleArray(field,i){const list=state[field][key()]||[];state[field][key()]=list.includes(i)?list.filter(n=>n!==i):[...list,i];save();captureHighlights();render();}
  document.addEventListener('change',e=>{if(e.target.matches('input[name="answer"]')){state.answers[key()]=Number(e.target.value);save();$('#answered-count').textContent=`${answered()} of ${sec().count}`;if(indexOpen){captureHighlights();render();}}});
  document.addEventListener('keydown',e=>{
    if(e.key==='F2'){e.preventDefault();window.open('preview.html','_blank','noopener');return;}
    if(e.key==='Escape'){if($('.dialog')){if(!state.expired)closeModal();}else{menu='';indexOpen=false;captureHighlights();render();}return;}
    if($('.dialog')&&e.key==='Tab'){const focusables=$$('button,a,select,input', $('.dialog'));const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
    if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='i'){e.preventDefault();actions.index();}
    if(e.ctrlKey&&e.altKey&&e.key.toLowerCase()==='h'){e.preventDefault();actions.help();}
  });
  window.addEventListener('beforeunload',()=>{captureHighlights();save();});
  function showExpired(){dialog('Time Expired','<p>The time for this section has ended. Select Continue to save your responses.</p>',[{label:'Continue',action:'confirm-end',primary:true}]);$('.dialog [data-action="close-modal"]')?.remove();$$('input,textarea',$('#app')).forEach(n=>n.disabled=true);}
  setInterval(()=>{
    const clock=$('#clock-value');if(clock)clock.textContent=state.timerHidden?'':fmt(seconds());
    const b=$('#break-clock');if(b)b.textContent=fmt(Math.max(0,Math.ceil((breakDeadline-Date.now())/1000))).slice(3);
    if(!initialized||!state.started||!['exam','instructions','information','review','help'].includes(scene))return;
    if(seconds()===0){state.started=false;state.expired=true;save();showExpired();}
    else if(seconds()<=300&&!fiveMinuteShown){fiveMinuteShown=true;dialog('5 Minutes Remaining','<p>You have 5 minutes remaining in this section.</p>',[{label:'Return to Test',action:'close-modal',primary:true}]);$('.clock')?.classList.add('warning');}
  },500);
  
  window.addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin||e.data?.channel!=='review-act')return;
    const m=e.data;if(m.type==='ping'){post('ready');return;}
    if(m.type==='init'&&!initialized){
      bridge=m.nonce;
      try{
        D=m.pack;
        if(!Array.isArray(D?.sections)||!D.sections.length||D.sections.some(s=>!Number.isInteger(s.count)||s.count<1||!Array.isArray(D.banks?.[s.id])||D.banks[s.id].length!==s.count))throw Error('ACT 试卷内容未完整加载，请返回 CE 重新选择已保存试卷。');
        state={...initial(),...m.snapshot};
        state.section=Math.max(0,Math.min(D.sections.length-1,Number.isInteger(state.section)?state.section:0));
        state.item=Math.max(0,Math.min(sec().count-1,Number.isInteger(state.item)?state.item:0));
        for(const field of ['answers','flags','eliminated','revealed','highlights','times'])if(!state[field]||typeof state[field]!=='object'||Array.isArray(state[field]))state[field]={};
        state.essay=typeof state.essay==='string'?state.essay:'';if(!Array.isArray(state.completed))state.completed=[];
        scene=state.scene||'notice';breakDeadline=state.breakDeadline||0;fiveMinuteShown=!!state.fiveMinuteShown;helpReturn=state.helpReturn||'';Object.assign(activeTools,state.tools||{});lastAccounted=Date.now();render();initialized=true;post('initialized');save();
      }catch(error){post('player-error',{message:error.message||'ACT 初始化失败，请重新连接。'});}
      return;
    }
    if(m.nonce!==bridge||!initialized)return;
    if(m.type==='submitted'){go('complete');}
    if(m.type==='error'){notify(m.message);if(scene==='submitting')dialog('Responses could not be saved', '<p>'+esc(m.message)+'</p>',[{label:'Try again',action:'retry-save',primary:true}]);}
    if(m.type==='request-exit'){captureHighlights();save();post('exit',{snapshot:snapshot()});}
  });
  actions['retry-save']=()=>{closeModal();post('submit',{snapshot:snapshot()});};
  post('ready');

})();
