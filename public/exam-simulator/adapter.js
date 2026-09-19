/* Host integration for the user-supplied Exam Simulator v0.11.0 web runtime. */
(() => {
  const channel = new URLSearchParams(location.search).get('channel');
  let closed=false;
  let ready = false, screen = {name:'', args:[]}, last = performance.now();
  const pending = new Map();
  const send = (type, payload = {}) => parent.postMessage({type, channel, ...payload}, location.origin);
  const snapshot = () => {
    if (!session) return null;
    const copy = {};
    for (const [key,value] of Object.entries(session)) {
      if (key === 'base' || value instanceof Element || value instanceof Audio || typeof value === 'function') continue;
      try { copy[key] = JSON.parse(JSON.stringify(value)); } catch {}
    }
    copy.screen = screen;
    return copy;
  };
  const save = () => { if (ready && session) send('exam-save', {snapshot:snapshot()}); };
  for (const name of ['bbWelcome','bbRoomCode','bbStartCode','bbPreparing','bbDirections','renderQuestion','bbReviewPage','bbModuleOver','renderBreak','actWelcome','actDashboard','actSectionIntro','tfHardwareCheck','tfAudioCheck','tfMicrophoneCheck','tfSectionIntro','tfWritingTaskIntro','tfSpeakingTaskIntro','tfEndSection','tfEndModule']) {
    const original = window[name];
    if (typeof original !== 'function') continue;
    window[name] = function(...args) { screen = {name,args}; const result = original.apply(this,args); save(); return result; };
  }
  const originalError=tfErrorScreen;tfErrorScreen=code=>{send('exam-error',{message:'麦克风或录音未就绪，请检查浏览器权限后返回并继续考试。'+code});originalError(code);};
  const originalFinish = finishExam;
  finishExam = () => { session.finished = true; screen = {name:'finishExam',args:[]}; originalFinish(); save(); };
  home = () => { send('exam-exit', {snapshot:snapshot()}); ready=false;closed=true; stopTimer(); tfStopPromptAudio(); };
  questionsFor = step => {
    const section = session.base.package.sections[resolvedSectionId(step)];
    if (!section?.questions?.length) throw new Error('试卷题目缺失，请返回 CE 重新检查导入内容。');
    return section.questions;
  };
  assetURL = path => session?.base.package.media?.[path] || (/^assets\/toefl\/[\w/-]+\.png$/.test(path || '') ? path : '');
  packageInput.disabled = true;
  libraryModal = () => send('exam-error', {message:'请返回 CE 的试卷导入入口管理试卷。'});
  startTimer = () => {
    stopTimer();
    const key = session.stepIndex + ':' + (session.tfWritingTimerMode || 'section');
    if (session.clockKey !== key || !session.clockEnd) { session.clockKey = key; session.clockEnd = Date.now() + session.seconds * 1000; }
    session.clockActive = true;
    timerHandle = setInterval(() => {
      session.seconds = Math.max(0, Math.ceil((session.clockEnd-Date.now())/1000));
      const t=$('#timerText'); if(t&&!hiddenTimer)t.textContent=t.closest('.tfReference')?formatTime(session.seconds,true):formatTime(session.seconds);
      const a=$('#actTimer'); if(a&&!hiddenTimer)a.textContent='TOTAL TIME LEFT  '+formatTime(session.seconds,true);
      if(session.seconds<=0){stopTimer(); const step=session.base.steps[session.stepIndex]; if(session.exam==='TOEFL'){if(step?.type==='toefl-writing')tfExpireWritingTask();else tfEndCurrentStep();}else if(session.exam==='SAT'){bbModuleOver();}else nextStep();}
    },250);
  };
  stopTimer = () => { clearInterval(timerHandle); timerHandle=null; if(session) session.clockActive=false; };
  const originalBegin = beginStep;
  beginStep = idx => { if(idx !== session.stepIndex) session.clockEnd=null; originalBegin(idx); };
  window.reviewSaveRecording = (key,blob) => new Promise((resolve,reject) => {
    const id=crypto.randomUUID(); pending.set(id,{resolve,reject}); send('exam-recording',{id,key,blob});
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error('保存录音超时'));}},20000);
  });
  addEventListener('message',e=>{
    if(e.source!==parent||e.origin!==location.origin||e.data?.channel!==channel)return;
    if(e.data.type==='exam-request-exit'){home();return;}
    if(e.data.type==='exam-recording-saved'){const task=pending.get(e.data.id);pending.delete(e.data.id);e.data.error?task?.reject(Error(e.data.error)):task?.resolve();return;}
    if(e.data.type!=='exam-init'||ready||closed)return;
    try {
      startShell(e.data.pack.manifest.exam,e.data.pack);
      const restored=e.data.snapshot;
      if(restored&&!restored.fresh){
        stopTimer(); tfStopPromptAudio(); const base=session.base;
        session={...session,...restored,base};
        screen=restored.screen||{name:'renderQuestion',args:[]};
        if(session.finished)finishExam();
        else if(session.stepIndex>=0||restored.screen){
          if(session.clockActive&&session.clockEnd)session.seconds=Math.max(0,Math.ceil((session.clockEnd-Date.now())/1000));
          const fn=window[screen.name];
          if(typeof fn==='function'&&['bbWelcome','bbRoomCode','bbStartCode','bbPreparing','actWelcome','actDashboard','tfHardwareCheck','tfAudioCheck','tfMicrophoneCheck','renderQuestion','bbReviewPage','bbModuleOver','renderBreak','bbDirections','actSectionIntro','tfSectionIntro','tfEndSection','tfEndModule','tfWritingTaskIntro','tfSpeakingTaskIntro'].includes(screen.name))fn(...screen.args);
          else renderQuestion();
          if(restored.clockActive)startTimer();
        }
      }
      ready=true;save();
    }catch(error){send('exam-error',{message:error.message});}
  });
  setInterval(()=>{
    const now=performance.now(), elapsed=Math.min(2000,now-last);last=now;
    if(session&&document.visibilityState==='visible'&&screen.name==='renderQuestion'){
      const step=session.base.steps[session.stepIndex];if(step){session.times??={};const key=step.id+':'+session.qIndex;session.times[key]=(session.times[key]||0)+elapsed;}
    }
    if(!ready&&!closed)send('exam-ready');else if(!closed)save();
  },1000);
  document.addEventListener('input',()=>queueMicrotask(save));
  document.addEventListener('click',()=>queueMicrotask(save));
  addEventListener('pagehide',save);
  addEventListener('error',e=>send('exam-error',{message:e.message}));
  addEventListener('unhandledrejection',e=>send('exam-error',{message:e.reason?.message||'考试页面出现错误，请返回后继续考试。'}));
  send('exam-ready');
})();
