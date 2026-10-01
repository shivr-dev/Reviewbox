/* Framework-free UI shell. Questions are loaded locally; all answer state stays in memory. */
(() => {
 'use strict';
 const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
 const stage=$('#stage'), question=$('#question'), bank=window.MAP_QUESTIONS||[];
 const state={question:null,answers:{},gaps:{},pronoun:null,text:'',zoom:100,highlight:false,erase:false,eliminate:false,armed:null};
 const setup={grade:'',course:'',language:'',active:false};
 let review=null,restoring=false,bridgeBusy=false,displayed=Date.now(),quickCount=0;
 const sendReview=(type,payload={})=>{if(review)parent.postMessage({channel:'review-map',nonce:review.nonce,type,...payload},'*');};
 const testName=()=>`${review?.practice?'Practice Items':'MAP Simulation'}: ${setup.course||'Reading'}`;
 const firstQuestion=()=>bank[0]?.id;
 let pendingTimer=0,bootTimer=0,confirmationTimer=0,restoreFocus=null;
 function fit(){const scale=window.innerWidth<=700?1:window.innerWidth/1556;stage.style.setProperty('--scale',scale);stage.style.setProperty('--stage-height',`${window.innerHeight/scale}px`);}
 window.addEventListener('resize',fit);fit();
 function point(e){const r=stage.getBoundingClientRect();const s=window.innerWidth<=700?1:r.width/1556;return{x:(e.clientX-r.left)/s,y:(e.clientY-r.top)/s};}
 function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function announce(s){$('#live-status').textContent=s;}
 function choices(items,group='main',multiple=false){return `<div class="choices ${multiple?'multiple-choices':''}" role="${multiple?'group':'radiogroup'}" aria-label="${group==='main'?'Answer choices':`Part ${group==='0'?'A':'B'}`}">${items.map((s,i)=>`<div class="choice ${multiple?'checkbox':''}" data-group="${group}" data-index="${i}"><button class="eliminate-button" aria-label="Eliminate answer ${i+1}" aria-pressed="false"><span>×</span></button><button class="choice-main" role="${multiple?'checkbox':'radio'}" aria-checked="false"><span class="choice-indicator" aria-hidden="true"></span><span class="choice-number">${i+1}.</span><span class="choice-text">${s}</span></button></div>`).join('')}</div>`;}
 function wordBank(q){return `<div class="word-bank" aria-label="Available words">${q.choices.map((w,i)=>`<button class="word-chip" data-word="${i}" aria-label="Move ${escape(w)}">${w}</button>`).join('')}</div>`;}
 function slot(i){return `<button class="drop-slot" data-slot="${i}" aria-label="Blank ${i+1}, choose or drop a word"></button>`;}
 function render(q){
  state.question=q;state.answers={};state.gaps={};state.pronoun=null;state.text='';state.armed=null;state.zoom=100;state.highlight=false;state.erase=false;state.eliminate=false;
  $('#notepad').hidden=true;$('#reading-guide').hidden=true;$('#notepad textarea').value='';$('#note-count').textContent='0';
  $$('.tool.active').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});
  question.className='';
  const bar=q.instruction?`<div class="instruction-bar">${q.instruction}</div>`:'';
  let html='';
  if(q.type==='word-table')html=`${bar}<section class="passage-block"><h1 class="passage-title">${q.title}</h1><p class="passage-copy">${q.passage}</p></section><p class="prompt">${q.prompt}</p><section class="interaction-card"><div class="word-table-area"><table class="word-table"><thead><tr><th>Word in Passage</th><th>Meaning of Word</th></tr></thead><tbody><tr><td><u>${q.word}</u></td><td>${slot(0)}</td></tr></tbody></table></div>${wordBank(q)}</section>`;
  if(q.type==='split-parts')html=`${bar}<div class="split-layout"><section class="passage-pane" aria-label="Reading passage">${q.passage}</section><section class="answer-pane"><p class="answer-preamble">${q.preamble}</p>${q.parts.map((p,i)=>`<section class="answer-part"><p class="part-heading"><span class="part-label">${p.label}</span>${p.prompt}</p>${choices(p.choices,String(i))}</section>`).join('')}</section></div>`;
  if(q.type==='single-choice')html=`${bar}<section class="passage-block anne-passage"><div class="passage-title">${q.title}</div>${q.image||''}${q.paragraphs.map((p,i)=>`<div class="numbered-paragraph"><b>${i+1}</b><p>${p}</p></div>`).join('')}<p class="attribution">${q.attribution}</p></section><p class="prompt">${q.prompt}</p><div class="single-options">${choices(q.choices)}</div>`;
  if(q.type==='split-multiple')html=`${bar}<div class="split-layout"><section class="passage-pane flower-passage" aria-label="Scrollable reading passage">${q.passage}</section><section class="answer-pane"><p class="answer-preamble multi-preamble">${q.preamble}</p><p class="multi-prompt">${q.prompt}</p>${choices(q.choices,'main',true)}</section></div>`;
  if(q.type==='pronoun')html=`<section class="pronoun-section"><p class="prompt">${q.prompt}</p><div class="interaction-card"><p class="pronoun-copy">${q.passage.replace(/\{\{(.*?)\}\}/g,(_,w)=>`<button class="pronoun-token" data-pronoun="${w}" aria-pressed="false">${q.tokens?.[Number(w)] ?? w}</button>`)}</p></div></section>${q.requiresCorrection?`<p class="prompt">${q.secondaryPrompt}</p><div class="interaction-card pronoun-entry"><input aria-label="Correct word" maxlength="1000" spellcheck="false"></div>`:''}`;
  if(q.type==='text-entry')html=`${bar}<section class="passage-block"><h1 class="passage-title">${q.title}</h1><p class="passage-copy">${q.passage}</p></section><p class="prompt">${q.prompt}</p><div class="interaction-card pronoun-entry"><input aria-label="Your answer" maxlength="1000" spellcheck="false"></div>`;
  if(q.type==='gap-match')html=`<p class="intro-line">${q.preamble}</p><p class="prompt">${q.prompt}</p><section class="interaction-card"><p class="gap-copy">${q.passage.replace(/\{\{(\d)\}\}/g,(_,i)=>slot(Number(i)))}</p>${wordBank(q)}</section>`;
  question.innerHTML=`<div class="question-content ${q.type.startsWith('split')?'split-question':''} ${q.subject==='Language Usage'?'language-question':''}">${html}</div>`;
  question.scrollTop=0;
  $('#test-name').textContent=`Practice Items: ${q.subject==='Reading'?'Reading':'Language'}`;$('#grade').textContent=`Grade ${setup.active?setup.grade:q.grade}`;$('#subject').textContent=q.subject;$('#question-number').textContent=`Question # ${q.number}`;
  $('.elim').hidden=!['single-choice','split-parts','split-multiple'].includes(q.type);
  updateZoom();updateNext();wireQuestion();
 }
 function answer(row){
  const q=state.question,g=row.dataset.group,i=Number(row.dataset.index);
  if(row.classList.contains('eliminated'))return;
  if(q.type==='split-multiple'){
   const vals=state.answers[g]||[];
   if(vals.includes(i))state.answers[g]=vals.filter(x=>x!==i);else if(vals.length<q.maxSelections)state.answers[g]=[...vals,i];else {announce(`Choose only ${q.maxSelections} answers.`);return;}
  }else state.answers[g]=[i];
  updateChoices();updateNext();
 }
 function updateChoices(){ $$('.choice').forEach(r=>{const yes=(state.answers[r.dataset.group]||[]).includes(Number(r.dataset.index));r.classList.toggle('selected',yes);$('.choice-main',r).setAttribute('aria-checked',String(yes));}); }
 function wireQuestion(){
  $$('.choice-main',question).forEach(b=>b.addEventListener('click',()=>answer(b.closest('.choice'))));
  $$('.choice-main',question).forEach(b=>b.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const all=$$('.choice-main',b.closest('.choices'));const dir=['ArrowDown','ArrowRight'].includes(e.key)?1:-1;const next=all[(all.indexOf(b)+dir+all.length)%all.length];next.focus();if(state.question.type!=='split-multiple')answer(next.closest('.choice'));}));
  $$('.eliminate-button',question).forEach(b=>b.addEventListener('click',()=>{const row=b.closest('.choice'),gone=row.classList.toggle('eliminated');b.setAttribute('aria-pressed',String(gone));b.setAttribute('aria-label',`${gone?'Restore':'Eliminate'} answer ${Number(row.dataset.index)+1}`);const g=row.dataset.group;if(gone)state.answers[g]=(state.answers[g]||[]).filter(x=>x!==Number(row.dataset.index));updateChoices();updateNext();}));
  $$('.pronoun-token',question).forEach(b=>b.addEventListener('click',()=>{state.pronoun=b.dataset.pronoun;$$('.pronoun-token').forEach(x=>{x.classList.toggle('chosen',x===b);x.setAttribute('aria-pressed',String(x===b));});updateNext();}));
  const input=$('.pronoun-entry input',question);if(input)input.addEventListener('input',()=>{state.text=input.value;updateNext();});
  $$('.word-chip',question).forEach(b=>{b.addEventListener('click',()=>{if(b.dataset.dragged==='yes'){b.dataset.dragged='';return;}state.armed=Number(b.dataset.word);$$('.word-chip').forEach(x=>x.classList.toggle('armed',x===b));announce('Choose a blank to place '+b.textContent);});draggableWord(b);});
  $$('.drop-slot',question).forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.slot);if(state.armed!==null){placeWord(state.armed,i);state.armed=null;}else if(state.gaps[i]!==undefined){delete state.gaps[i];syncWords();updateNext();announce('Word returned to the word bank.');}}));
 }
 function placeWord(word,slotIndex){for(const k in state.gaps)if(state.gaps[k]===word)delete state.gaps[k];state.gaps[slotIndex]=word;syncWords();updateNext();announce(state.question.choices[word]+' placed in blank '+(slotIndex+1));}
 function syncWords(){const vals=Object.values(state.gaps);$$('.word-chip').forEach(b=>{b.classList.toggle('used',vals.includes(Number(b.dataset.word)));b.classList.remove('armed');});$$('.drop-slot').forEach(b=>{const w=state.gaps[b.dataset.slot];b.textContent=w===undefined?'':state.question.choices[w];b.classList.toggle('filled',w!==undefined);b.setAttribute('aria-label',w===undefined?`Blank ${Number(b.dataset.slot)+1}, choose or drop a word`:`${state.question.choices[w]}, click to return to word bank`);});}
 function draggableWord(b){b.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const start=point(e);let ghost=null,target=null,moved=false;b.setPointerCapture(e.pointerId);
  function move(ev){const p=point(ev);if(!moved&&Math.hypot(p.x-start.x,p.y-start.y)<5)return;moved=true;
   if(!ghost){ghost=document.createElement('div');ghost.className='drag-ghost';ghost.textContent=b.textContent;stage.append(ghost);}
   ghost.style.left=p.x-ghost.offsetWidth/2+'px';ghost.style.top=p.y-17+'px';target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('.drop-slot');$$('.drop-slot').forEach(x=>x.classList.toggle('over',x===target));
  }
  function end(){b.removeEventListener('pointermove',move);b.removeEventListener('pointerup',end);b.removeEventListener('pointercancel',cancel);if(moved){b.dataset.dragged='yes';if(target)placeWord(Number(b.dataset.word),Number(target.dataset.slot));}ghost?.remove();$$('.drop-slot').forEach(x=>x.classList.remove('over'));}
  function cancel(){target=null;end();}
  b.addEventListener('pointermove',move);b.addEventListener('pointerup',end);b.addEventListener('pointercancel',cancel);
 });}
 function complete(){const q=state.question;if(!q)return false;switch(q.type){case 'word-table':return state.gaps[0]!==undefined;case 'gap-match':return Object.keys(state.gaps).length===q.gapCount;case 'text-entry':return !!state.text.trim();case 'pronoun':return state.pronoun!==null&&(!state.question.requiresCorrection||!!state.text.trim());case 'split-parts':return q.parts.every((_,i)=>state.answers[i]?.length===1);case 'split-multiple':return state.answers.main?.length===q.maxSelections;default:return state.answers.main?.length===1;}}
 function updateNext(){$('.next').disabled=bridgeBusy||!complete();if(review&&!restoring)publishSnapshot();}
 function updateZoom(){const z=state.zoom/100;$('#zoom-value').textContent=state.zoom+'%';$('.zoom-out').disabled=state.zoom===100;$('.zoom-in').disabled=state.zoom===200;const c=$('.question-content');if(c){c.style.zoom=z;if(c.classList.contains('split-question'))c.style.height=question.clientHeight/z+'px';}}
 window.addEventListener('resize',updateZoom);
 function active(name,on){const b=$(`.tool[data-action="${name}"]`);if(b){b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));}}
 function tool(name){
  if(name==='highlighter'){state.highlight=!state.highlight;state.erase=false;active('highlighter',state.highlight);active('eraser',false);}
  if(name==='eraser'){state.erase=!state.erase;state.highlight=false;active('eraser',state.erase);active('highlighter',false);}
  question.classList.toggle('highlight-mode',state.highlight);question.classList.toggle('erase-mode',state.erase);
  if(name==='elim'){state.eliminate=!state.eliminate;question.classList.toggle('elimination-mode',state.eliminate);active('elim',state.eliminate);}
  if(name==='notepad'){$('#notepad').hidden=!$('#notepad').hidden;active(name,!$('#notepad').hidden);if(!$('#notepad').hidden)$('#notepad textarea').focus();}
  if(name==='line-reader'){const guide=$('#reading-guide');guide.hidden=!guide.hidden;active(name,!guide.hidden);if(!guide.hidden){guide.style.top=(question.offsetTop+100)+'px';guide.style.left=question.offsetLeft+'px';guide.style.width=question.clientWidth+'px';}}
 }
 question.addEventListener('pointerup',()=>{if(!state.highlight)return;setTimeout(()=>{
  const sel=window.getSelection();if(!sel||sel.isCollapsed||!sel.rangeCount)return;const range=sel.getRangeAt(0);if(!question.contains(range.commonAncestorContainer))return;
  const walker=document.createTreeWalker(question,NodeFilter.SHOW_TEXT);const texts=[];let n;while(n=walker.nextNode()){if(range.intersectsNode(n)&&n.textContent.trim()&&!n.parentElement.closest('button,input,textarea,mark'))texts.push(n);}
  for(const text of texts){const sub=document.createRange();const start=text===range.startContainer?range.startOffset:0,end=text===range.endContainer?range.endOffset:text.length;if(start>=end)continue;sub.setStart(text,start);sub.setEnd(text,end);const mark=document.createElement('mark');sub.surroundContents(mark);}sel.removeAllRanges();
 if(review)publishSnapshot();},0);});
 question.addEventListener('click',e=>{if(state.erase&&e.target.closest('mark')){const m=e.target.closest('mark');m.replaceWith(...m.childNodes);question.normalize();if(review)publishSnapshot();}});
 function openReset(){restoreFocus=document.activeElement;$('#modal-layer').hidden=false;$('.confirm-reset').focus();}
 function closeReset(){$('#modal-layer').hidden=true;restoreFocus?.focus();}
 $('.dialog-close').onclick=closeReset;$('.cancel-reset').onclick=closeReset;
 $('.confirm-reset').onclick=()=>{render(state.question);closeReset();announce('Answer cleared.');if(review)publishSnapshot();};
 function loadItem(callback,duration=650){clearTimeout(pendingTimer);$('#item-loader').hidden=false;$('#player').inert=true;pendingTimer=setTimeout(()=>{callback();$('#item-loader').hidden=true;$('#player').inert=false;},duration);}
 function showBoot(callback,duration=1600){clearTimeout(bootTimer);$('#boot-loader').hidden=false;$('#boot-loader').classList.remove('fading');bootTimer=setTimeout(()=>{$('#boot-loader').classList.add('fading');bootTimer=setTimeout(()=>{$('#boot-loader').hidden=true;$('#boot-loader').classList.remove('fading');callback?.();},300);},duration);}
 function showQuestion(id){$('#login').hidden=true;$('#session-screen').hidden=true;$('#player').hidden=false;const q=bank.find(x=>x.id===id)||bank[0];if(!q)return;render(q);if(review)sendReview('visible',{visible:true});}
 function sessionPage(id){
  if(review)sendReview('visible',{visible:false});
  $('#login').hidden=true;$('#player').hidden=true;$('#notepad').hidden=true;$('#reading-guide').hidden=true;const host=$('#session-screen');host.hidden=false;host.className='session-'+id;
  if(id==='select-test'){
   host.innerHTML=`<div class="paper selection-paper"><div class="paper-top"></div><div class="paper-body"></div><div class="paper-bottom"></div><img class="brand" src="assets/nweaYellowTmLarge.1e8086e2.svg" alt="NWEA"><div class="paper-drawings"></div><button class="paper-close setup-close" aria-label="Log out">×</button><form id="test-selection-form"><h1>Select a practice test</h1><div class="selection-fields"><div class="metadata-select"><select id="test-grade" aria-label="Select a test grade"><option value="">Grade</option>${['K',...Array.from({length:12},(_,i)=>String(i+1))].map(g=>`<option${setup.grade===g?' selected':''}>${g}</option>`).join('')}</select></div><div class="metadata-select"><select id="test-course" aria-label="Select a test course" ${setup.grade?'':'disabled'}><option value="">Course</option>${['Reading','Language Usage'].map(c=>`<option${setup.course===c?' selected':''}>${c}</option>`).join('')}</select></div><div class="metadata-select"><select id="test-language" aria-label="Select a test language" ${setup.course?'':'disabled'}><option value="">Test Language</option><option value="en" ${setup.language==='en'?'selected':''}>English</option><option value="es" ${setup.language==='es'?'selected':''}>Spanish</option></select></div><label class="tts-option"><input type="checkbox" disabled> Text-To-Speech</label><div class="selection-actions"><button class="login-next" type="submit" aria-label="Start test" ${setup.grade&&setup.course&&setup.language?'':'disabled'}><span class="icon">&#xe901;</span></button></div></div></form><div class="copyright">Copyright © 2025 by Houghton Mifflin Harcourt Publishing Company. All<br>rights reserved.</div><img class="footer-brand" src="assets/nweaGraphite.957cd108.png" alt="NWEA"></div>`;
   const sync=()=>{$('#test-course').disabled=!setup.grade;$('#test-language').disabled=!setup.course;$('.selection-actions button').disabled=!(setup.grade&&setup.course&&setup.language);};
   $('#test-grade').onchange=e=>{setup.grade=e.target.value;setup.course='';setup.language='';$('#test-course').value='';$('#test-language').value='';sync();};
   $('#test-course').onchange=e=>{setup.course=e.target.value;setup.language='';$('#test-language').value='';sync();};
   $('#test-language').onchange=e=>{setup.language=e.target.value;sync();};
   $('#test-selection-form').onsubmit=e=>{e.preventDefault();if(!$('.selection-actions button').disabled){setup.active=true;navigate('self-confirm');}};
   $('.setup-close').onclick=()=>navigate('login');
  }else if(id==='self-confirm'){
   const es=setup.language==='es';
   const rows=(items,small=false)=>`<dl class="self-info ${small?'self-info-small':''}">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>`;
   host.innerHTML=`<div class="confirmation-container self-confirm-container"><div class="confirmation-paper-top"></div><button class="self-close" aria-label="Log out">×</button><div class="confirmation-paper-body"><div class="self-confirm-content"><h1>${es?'¿Es esta información correcta?':'Is this correct?'}</h1><div class="pen-line"></div>${rows([[es?'Nombre:':'Name:',(review?.student||'Student Guest')],[es?'Prueba:':'Test:',testName()],[es?'Sesión:':'Session:','Practice Test']])}${rows([[es?'Escuela:':'School:','Sample School'],[es?'Grado:':'Grade:',setup.grade||'8'],[es?'Año de nacimiento:':'Birth Year:','2012']],true)}<div class="pen-line"></div><div class="self-actions"><button class="self-no"><span class="icon back-arrow">&#xe901;</span> No</button><button class="self-yes">${es?'Sí':'Yes'} <span class="icon">&#xe901;</span></button></div></div></div><div class="confirmation-paper-bottom"></div><div class="session-brand"><img src="assets/nweaGraphite.957cd108.png" alt="NWEA"></div></div>`;
   $('.self-no').onclick=()=>navigate('select-test');$('.self-yes').onclick=()=>showBoot(()=>navigate('waiting'),650);$('.self-close').onclick=()=>navigate('login');
  }else if(id==='waiting'||id==='confirmed'){
   const confirmed=id==='confirmed';
   host.innerHTML=`<div class="confirmation-container"><div class="confirmation-paper-top"></div><div class="confirmation-paper-body"><div class="confirmation-note" role="status"><h1>${confirmed?'You are confirmed to start the test.':'Please wait for the proctor to confirm your information.'}</h1></div><div class="confirmation-content"><div class="confirmation-arrow">${confirmed?'<button class="session-next" aria-label="Continue"><span class="icon">&#xe901;</span></button>':''}</div><div class="pen-line"></div><div class="student-test-info">Student Guest - Practice Items: Reading</div><div class="test-instructions"><div class="instruction-row"><img src="assets/Star.9c060c07.svg" alt=""><div><p>Try your best</p><span>This test will show what you are ready to learn next</span></div></div><div class="instruction-row"><img src="assets/Head.7e24f6b4.svg" alt=""><div><p>It's ok not to know all of the answers</p><span>Some questions will be easy, others more difficult</span></div></div><div class="instruction-row"><img src="assets/Clock.b0ba0593.svg" alt=""><div><p>Take your time</p><span>If you seem to be going quickly, a teacher may check on you</span></div></div></div><div class="pen-line"></div></div></div><div class="confirmation-paper-bottom"></div><div class="session-brand"><img src="assets/nweaGraphite.957cd108.png" alt="NWEA"></div></div>`;
   $('.student-test-info',host).textContent=`${review?.student||'Student Guest'} - ${testName()}`;
   if(confirmed)$('.session-next',host).onclick=()=>review?requestReview('start'):showBoot(()=>navigate(firstQuestion()),1100);
  }else if(id==='slow-down'){
   host.innerHTML=`<div class="slow-wrapper"><div class="slow-card" role="alertdialog" aria-labelledby="slow-heading"><div class="slow-instructions"><h1 id="slow-heading">YOU SEEM TO BE ANSWERING QUICKLY...</h1><p class="slow-message">No need to rush.</p><p class="raise-hand">Please raise your hand for help.</p><form id="proctor-form" autocomplete="off"><h2>PROCTOR DIRECTIONS</h2><p>Resume the test using the PIN<br>or from your proctor console.</p><label class="pin-label" for="proctor-pin" hidden>Proctor PIN</label><div class="pin-row"><input type="password" id="proctor-pin" placeholder="Proctor PIN" aria-label="Proctor PIN" inputmode="numeric" maxlength="4" autocomplete="off"><button type="submit" id="resume-button" disabled>RESUME</button></div><span class="pin-help">*4-digit PIN on the proctor console</span></form></div><img class="sloth" src="assets/Sloth_CrossingGuard-en.c57f521d.svg" alt="Mr. Sloth the crossing guard reminds you to slow down"></div><div class="session-brand"><img src="assets/nweaGraphite.957cd108.png" alt="NWEA"></div></div>`;
   $('#proctor-pin').oninput=e=>{const v=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=v;$('.pin-label').hidden=!v;const valid=review?v==='0000':v.length===4;$('#resume-button').disabled=!valid;$('.pin-help').textContent=valid?'PIN accepted, click Resume.':'*4-digit PIN on the proctor console';$('.pin-help').classList.toggle('accepted',valid);};
   $('#proctor-form').onsubmit=e=>{e.preventDefault();if($('#resume-button').disabled)return;$('#proctor-pin').value='';if(review){requestReview('resume');}else showBoot(()=>navigate(state.question?.id||'reading-1'),800);};
  }else if(id==='finished'){
   host.innerHTML=`<div class="practice-finished"><h1>Congratulations, you finished the test.</h1><div class="finish-actions"><button class="take-another">TAKE ANOTHER TEST</button><button class="finish-done">DONE <span class="icon">&#xe901;</span></button></div></div>`;
   $('.take-another').onclick=()=>navigate('select-test');$('.finish-done').onclick=()=>navigate('login');
  }else{
   host.innerHTML=`<div class="test-ended-body"><h1><span>Student Guest</span><br>Congratulations, you finished the test!</h1><div class="ending-summary"><p>The total test time was: 00:00:00<br><b>Date:</b> October 1, 2026 &nbsp; <b>Test Name:</b> Practice Items: Reading</p></div><p class="confidentiality">CONFIDENTIALITY NOTICE: This information may be confidential and legally protected from disclosure.</p><img src="assets/nweaGraphite.957cd108.png" alt="NWEA"></div><div class="ending-footer"><div><button class="ending-print" aria-label="Print"><span class="icon">&#xe953;</span></button><button class="ending-done" aria-label="Done"><span class="icon">&#xe901;</span></button></div></div>`;
   $('.ending-done').onclick=()=>navigate('login');$('.ending-print').onclick=()=>window.print();
  }
 }
 // Embedded exams use their own router; an opaque sandbox must not navigate
 // the iframe URL, and parent initialization must not cancel the login animation.
 function navigate(id){if(review){if(reviewRoutes().includes(id))route(id);return;}location.hash=id;}
 function route(screen){document.body.scrollTop=0;document.documentElement.scrollTop=0;stage.scrollTop=0;$('#session-screen').scrollTop=0;clearTimeout(pendingTimer);clearTimeout(bootTimer);clearTimeout(confirmationTimer);$('#item-loader').hidden=true;$('#boot-loader').hidden=true;$('#session-screen').hidden=true;$('#player').inert=false;$('#modal-layer').hidden=true;$('#screen-picker').hidden=true;let id=screen||location.hash.slice(1)||'login';if(review&&!reviewRoutes().includes(id))id=review.screen==='question'?bank[0].id:review.screen;
  if(['select-test','self-confirm','waiting','confirmed','slow-down','finished','test-ended'].includes(id)){sessionPage(id);if(review)wireReviewScreen(id);return;}
  if(id==='login'){if(review)sendReview('visible',{visible:false});$('#login').hidden=false;$('#player').hidden=true;$('#notepad').hidden=true;$('#reading-guide').hidden=true;return;}
  if(id==='loading'){showQuestion('reading-1');showBoot(()=>navigate('reading-1'),4200);return;}
  if(id==='item-loading'){showQuestion('language-1');loadItem(()=>{},4200);return;}
  if(id==='reset'){showQuestion('reading-3');openReset();return;}
  if(id==='reading-2-marked'){showQuestion('reading-2');state.answers={'0':[0],'1':[0]};updateChoices();tool('elim');tool('highlighter');$$('.answer-part').forEach(p=>{$$('.choice',p).forEach((r,i)=>{if(i===1||i===2){r.classList.add('eliminated');$('.eliminate-button',r).setAttribute('aria-pressed','true');}});});const verse=$$('.poem>div')[4];verse.innerHTML='Be a frie<mark>nd. The pay is bigger</mark><span class="line-number">5</span>';updateNext();return;}
  showQuestion(id);
 }
 window.addEventListener('hashchange',()=>{if(!review)route();});
 $$('[data-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.action;if(a==='reset')openReset();else if(a==='next'){if(!complete())return;if(review){submitReview();return;}const pool=setup.active?bank.filter(q=>q.subject===(setup.course==='Language Usage'?'Language Usage':'Reading')):bank;const i=pool.indexOf(state.question);loadItem(()=>navigate(i===pool.length-1||i<0?'finished':pool[i+1].id));}else if(a==='zoom-in'||a==='zoom-out'||a==='zoom-reset'){state.zoom=a==='zoom-reset'?100:Math.min(200,Math.max(100,state.zoom+(a==='zoom-in'?25:-25)));updateZoom();if(review)publishSnapshot();}else {tool(a);if(review)publishSnapshot();}}));
 $('#login-form').addEventListener('input',()=>{$('.login-next').disabled=!$('#username').value.trim()||!$('#password').value.trim();});
 $('#login-form').addEventListener('submit',e=>{e.preventDefault();if($('.login-next').disabled)return;if(review){review.student=$('#username').value.trim();showBoot(()=>navigate('select-test'));return;}$('#username').value='';$('#password').value='';$('.login-next').disabled=true;setup.active=false;showBoot(()=>navigate('select-test'));});
 $('.paper-close').onclick=()=>review?requestReview('exit'):navigate('reading-1');
 const screens=[['login','登录页'],['waiting','等待监考确认'],['confirmed','已确认 · 开始考试'],['slow-down','作答过快 · 暂停 / PIN'],['finished','练习考试结束'],['test-ended','正式考试结束 · 无成绩示例'],['loading','方块加载动画'],['reading-1','Reading 1 · 词语拖拽表格'],['reading-2','Reading 2 · 诗歌双栏'],['reading-2-marked','Reading 2 · 标记 / 排除 / 选中'],['reading-3','Reading 3 · 单选阅读'],['reset','Reset Question · 确认弹窗'],['reading-5','Reading 5 · 长文滚动 / 多选'],['language-1','Language 1 · 代词填空'],['item-loading','Loading · 半透明转圈'],['language-6','Language 6 · 段落拖拽']];
 screens.splice(1,0,['select-test','选择练习测试'],['self-confirm','学生信息确认 · Yes / No']);
 $('#screen-links').innerHTML=screens.map(([id,t])=>`<button data-screen="${id}">${t}</button>`).join('');$$('[data-screen]').forEach(b=>b.onclick=()=>{if(location.hash==='#'+b.dataset.screen)route();else navigate(b.dataset.screen);});
 function picker(){$('#screen-picker').hidden=!$('#screen-picker').hidden;if(!$('#screen-picker').hidden)$('#close-picker').focus();}
 $('#question-number').onclick=picker;$('#close-picker').onclick=()=>{$('#screen-picker').hidden=true;$('#question-number').focus();};
 $('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen?.().catch(()=>announce('Use F11 for fullscreen.'));};
 $('#notepad header button').onclick=()=>tool('notepad');$('#notepad textarea').oninput=e=>{$('#note-count').textContent=e.target.value.length;if(review)publishSnapshot();};$('#clear-note').onclick=()=>{$('#notepad textarea').value='';$('#note-count').textContent='0';$('#notepad textarea').focus();if(review)publishSnapshot();};
 function movable(el,handle){handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0)return;const start=point(e),left=el.offsetLeft,top=el.offsetTop;handle.setPointerCapture(e.pointerId);function move(ev){const p=point(ev);el.style.left=Math.max(0,Math.min(stage.clientWidth-el.offsetWidth,left+p.x-start.x))+'px';el.style.top=Math.max(0,Math.min(stage.clientHeight-el.offsetHeight,top+p.y-start.y))+'px';}function end(){handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);}handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);});}
 movable($('#notepad'),$('#notepad header'));
 const guide=$('#reading-guide');
 function setGuideTop(y){guide.style.top=Math.max(question.offsetTop,Math.min(question.offsetTop+question.clientHeight-guide.offsetHeight,y))+'px';}
 guide.addEventListener('pointerdown',e=>{if(e.button!==0)return;const y=point(e).y,start=guide.offsetTop;guide.setPointerCapture(e.pointerId);guide.focus();const move=ev=>setGuideTop(start+point(ev).y-y);const end=()=>{guide.removeEventListener('pointermove',move);guide.removeEventListener('pointerup',end);guide.removeEventListener('pointercancel',end);};guide.addEventListener('pointermove',move);guide.addEventListener('pointerup',end);guide.addEventListener('pointercancel',end);});
 guide.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setGuideTop(guide.offsetTop+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?19:3));}});
 for(let i=0;i<30;i++){const bar=document.createElement('i');bar.style.transform=`rotate(${i*12}deg)`;bar.style.animationDelay=`${i/30-1}s`;$('.spinner').append(bar);}
 document.addEventListener('keydown',e=>{
  if(e.key==='F2'){e.preventDefault();picker();return;}
  if(e.key==='Escape'){if(!$('#screen-picker').hidden){$('#screen-picker').hidden=true;return;}if(!$('#modal-layer').hidden){closeReset();return;}if(!$('#notepad').hidden){tool('notepad');return;}if(!$('#reading-guide').hidden){tool('line-reader');return;}if(!review&&(!$('#boot-loader').hidden||!$('#item-loader').hidden)){clearTimeout(pendingTimer);clearTimeout(bootTimer);navigate('reading-1');route();return;}state.armed=null;$$('.word-chip').forEach(b=>b.classList.remove('armed'));}
  if(e.key==='Tab'){const dialog=!$('#screen-picker').hidden?$('#screen-picker'):!$('#modal-layer').hidden?$('.reset-dialog'):null;if(dialog){const f=$$('button,a,input,textarea',dialog).filter(x=>!x.disabled);if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}}}
  if(e.target.matches('input,textarea')||e.ctrlKey||e.altKey||e.metaKey||$('#player').hidden||!$('#modal-layer').hidden||!$('#screen-picker').hidden)return;
  const action={h:'highlighter',e:'eraser',l:'line-reader',n:'notepad',a:'elim'}[e.key.toLowerCase()];if(action){e.preventDefault();if(action!=='elim'||!$('.elim').hidden)tool(action);}
 });

 function snapshot(){return {answers:structuredClone(state.answers),gaps:structuredClone(state.gaps),pronoun:state.pronoun,text:state.text,zoom:state.zoom,note:$('#notepad textarea').value.slice(0,10000),eliminated:$$('.choice.eliminated').map(r=>`${r.dataset.group}:${r.dataset.index}`),marks:$$('mark',question).map(m=>m.textContent.slice(0,1500)).slice(0,100)};}
 function publishSnapshot(){if(review&&state.question&&!restoring)sendReview('snapshot',{questionId:state.question.id,state:snapshot()});}
 function restoreSnapshot(saved){
  if(!saved)return;state.answers=saved.answers;state.gaps=saved.gaps;state.pronoun=saved.pronoun;state.text=saved.text;state.zoom=saved.zoom;
  $('#notepad textarea').value=saved.note;$('#note-count').textContent=saved.note.length;
  const input=$('.pronoun-entry input',question);if(input)input.value=saved.text;
  $$('.pronoun-token',question).forEach(b=>{const yes=b.dataset.pronoun===saved.pronoun;b.classList.toggle('chosen',yes);b.setAttribute('aria-pressed',String(yes));});
  $$('.choice',question).forEach(r=>{if(saved.eliminated.includes(`${r.dataset.group}:${r.dataset.index}`)){r.classList.add('eliminated');$('.eliminate-button',r).setAttribute('aria-pressed','true');}});
  for(const value of [...new Set(saved.marks)]){
   if(!value)continue;const walker=document.createTreeWalker(question,NodeFilter.SHOW_TEXT);const nodes=[];let n;
   while(n=walker.nextNode())if(!n.parentElement.closest('button,input,textarea,mark'))nodes.push(n);
   for(const node of nodes){const i=node.textContent.indexOf(value);if(i<0)continue;const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+value.length);const mark=document.createElement('mark');range.surroundContents(mark);}
  }
  updateChoices();syncWords();updateZoom();updateNext();
 }
 function reviewRoutes(){return review.screen==='finished'||review.screen==='test-ended'?[review.screen]:review.screen==='question'||review.screen==='slow-down'?[bank[0].id,'slow-down']:['login','select-test','self-confirm','waiting','confirmed'];}
 function requestReview(type,payload={}){if(bridgeBusy)return;bridgeBusy=true;$('#item-loader').hidden=false;$('#player').inert=true;sendReview(type,payload);updateNext();}
 function submitReview(){
  if(!review.checked&&Date.now()-displayed<3000)quickCount++;else if(!review.checked)quickCount=0;
  if(quickCount>=3&&!review.checked){quickCount=0;publishSnapshot();review.screen='slow-down';navigate('slow-down');sendReview('pause');return;}
  requestReview('next',{questionId:state.question.id,state:snapshot()});
 }
 function wireReviewScreen(id){
  const host=$('#session-screen');
  $$('.setup-close,.self-close',host).forEach(b=>b.onclick=()=>requestReview('exit'));
  if(id==='select-test'){
   $('#test-grade').innerHTML=`<option selected>${review.grade}</option>`;$('#test-grade').disabled=true;
   $('#test-course').innerHTML=`<option selected>${escape(review.section)}</option>`;$('#test-course').disabled=true;
   $('#test-language').innerHTML='<option value="en" selected>English</option>';$('#test-language').disabled=true;
   setup.grade=String(review.grade);setup.course=review.section;setup.language='en';setup.active=true;
   $('#test-selection-form h1').textContent='Select a test';$('.selection-actions button').disabled=false;
   $('#test-selection-form').onsubmit=e=>{e.preventDefault();navigate('self-confirm');};
  }
  if(id==='self-confirm'){
   const small=$('.self-info-small',host);small.innerHTML=`<div><dt>Grade:</dt><dd>${review.grade}</dd></div><div><dt>Language:</dt><dd>English</dd></div><div><dt>Format:</dt><dd>Personal simulation</dd></div>`;
   $('.self-yes').onclick=()=>{navigate('waiting');requestReview('prepare',{student:review.student});};
  }
  if(id==='waiting')$('.confirmation-note h1',host).textContent='Please wait while your saved test is checked.';
  if(id==='confirmed')$('.confirmation-note h1',host).textContent='Your test is ready to begin.';
  if(id==='slow-down'){
   $('.raise-hand',host).textContent='Pause and take a moment before continuing.';
   $('#proctor-form h2',host).textContent='RESUME SIMULATION';
   $('#proctor-form p',host).textContent='Enter 0000 to resume your personal test.';
   $('.pin-help',host).textContent='Personal simulation PIN: 0000';
  }
  if(id==='finished'){
   $('.finish-done',host).innerHTML='VIEW REPORT <span class="icon">&#xe901;</span>';
   $('.finish-done',host).onclick=()=>requestReview('report');$('.take-another',host).onclick=()=>requestReview('exit');
  }
  if(id==='test-ended'){
   $('.test-ended-body h1',host).textContent=`${review.student}: Congratulations, you finished the test!`;
   const sec=Math.floor(review.totalMilliseconds/1000),time=[Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':');
   $('.ending-summary p',host).textContent=`Total test time: ${time}\nDate: ${new Date(review.completedAt||Date.now()).toLocaleDateString()}\nTest: MAP ${review.section}`;
   $('.ending-done',host).setAttribute('aria-label','View report');$('.ending-done',host).onclick=()=>requestReview('report');
  }
 }
 window.addEventListener('message',e=>{
  const m=e.data;if(e.source!==parent||!m||m.channel!=='review-map')return;
  if(m.type==='ping'){parent.postMessage({channel:'review-map',type:'ready'},'*');return;}
  if(m.type==='init'){
   if(review&&m.nonce!==review.nonce)return;
   const prior=review;review=m;bank.splice(0,bank.length,m.question);setup.grade=String(m.grade);setup.course=m.section;setup.language='en';setup.active=true;
   bridgeBusy=false;$('#player').inert=false;$('#item-loader').hidden=true;$('#boot-loader').hidden=true;
   $('#username').value=m.student;$('#password').value='Review';$('#password').readOnly=true;$('.login-next').disabled=false;
   $('#login-form .login-subtitle').textContent='Review · Personal MAP Simulation';
   $('label[for="username"]').innerHTML='Student name';$('label[for="password"]').innerHTML='Session';
   $$('.copyright').forEach(n=>n.textContent='Personal learning simulation · Not an official NWEA test');
   $('#screen-links').innerHTML='<button id="review-pause">Pause test</button><button id="review-exit">Save and return to CE</button>';
   $('#picker-title').textContent='Test controls';$('#screen-picker p').textContent='F2 / Esc · Your responses are saved locally.';
   $('#review-pause').onclick=()=>{if(review.screen==='question'){review.screen='slow-down';publishSnapshot();navigate('slow-down');sendReview('pause');}};
   $('#review-exit').onclick=()=>{publishSnapshot();requestReview('exit');};
   const view=()=>{
    restoring=true;const target=m.screen==='question'?m.question.id:m.screen;route(target);
    if(m.screen==='question'){
     restoreSnapshot(m.state);$('#test-name').textContent=testName();$('.next').setAttribute('aria-label',m.practice&&!m.checked?'Check answer':'Submit and continue');
     if(m.checked){$$('button,input',question).forEach(b=>b.disabled=true);const aside=document.createElement('aside');aside.className='review-feedback';const title=document.createElement('h2');title.textContent=m.feedback.correct?'Correct':'Review this answer';const answer=document.createElement('p');answer.textContent=m.feedback.answer;const explanation=document.createElement('p');explanation.textContent=m.feedback.explanation;aside.append(title,answer,explanation);$('.question-content').append(aside);aside.scrollIntoView({block:'nearest'});$('.reset').disabled=true;}else $('.reset').disabled=false;
     if(!prior||prior.question?.id!==m.question.id)displayed=Date.now();
    }
    restoring=false;updateNext();sendReview('initialized');
   };
   if(m.screen==='question'&&prior?.question?.id!==m.question.id)loadItem(view);else view();
  }else if(review&&m.nonce===review.nonce){
   if(m.type==='confirmed'){bridgeBusy=false;review.screen='login';$('#item-loader').hidden=true;navigate('confirmed');}
   if(m.type==='error'){bridgeBusy=false;$('#player').inert=false;$('#item-loader').hidden=true;announce(m.message);updateNext();}
  }
 });
 document.addEventListener('visibilitychange',()=>{sendReview('visible',{visible:!document.hidden&&!$('#player').hidden&&!review?.checked});if(document.hidden)publishSnapshot();});
 window.addEventListener('pagehide',publishSnapshot);
 $('#review-quick-exit').onclick=()=>{publishSnapshot();requestReview('exit');};
 parent.postMessage({channel:'review-map',type:'ready'},'*');

 route();
})();
