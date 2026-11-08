'use client';
import { useEffect, useRef, useState } from 'react';
import WebsiteJourney, {WebsitePenguin} from './website-journey';
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, FileText, GraduationCap, Layers3, ShieldCheck, Sparkles, WandSparkles, Watch, Zap } from 'lucide-react';
import { assetPath } from '@/lib/runtime';

const copy = {
  zh: {
    nav: ['如何学习', '不止刷题', '常见问题'], login: '登录', start: '开启我的学习旅程',
    eyebrow: '你的知识，值得被认真记住。', title: ['少一点盲目复习，', '多一点', '真正掌握。'],
    intro: '把资料、练习和考试，连成一条适合你的学习路径。Reviewbox 帮你决定现在该学什么，企鹅陪你走好每一步。',
    secondary: '看看它如何工作', note: '从自己的资料开始 · 支持本地学习',
    tabs: ['今日计划', '学习资料', '考试准备'], demo: '功能示意 · 不代表个人学习数据', today: '现在，先做这一件事',
    demoTitle: ['让知识在记忆里扎根', '你的资料，成为你的题库', '让准备，对准考试目标'],
    demoBody: ['先复习容易遗忘的内容，再用变式检查理解。', '导入笔记和学习包，核验后再加入练习。', '结合考试范围与日期，安排复习与阶段测评。'],
    tasks: [['回忆旧知识', '换个语境试一试', '隔天再验证'], ['整理学习资料', '检查题目与答案', '加入学习计划'], ['确定考试范围', '查漏补缺', '测评后调整计划']],
    demoCta: '开始这一小步', companion: '每一小步，都算数。', strip: ['自适应计划', '间隔复习', '真实成绩与 GPA', '企鹅与装备', '手表伴学'],
    howLabel: 'A LITTLE EVERY DAY', how: '学习不用一口气。\n下一步，要刚刚好。', howBody: '从“我有很多要学”，到“我知道现在该做什么”。',
    steps: [['带上你的知识', '导入笔记、文档或学习包。已有的资料，就是学习的起点。'], ['找到合适的下一步', '结合学习证据、记忆状态与考试目标，安排练习、课程或测评。'], ['理解，然后记住', '作答、反馈、巩固、延迟验证。让一次理解，变成长期的能力。']],
    depth: '严谨学习，也可以令人期待。', depthBody: '成绩是真实的，进步是自己的，快乐也不必缺席。',
    cards: [['把考试放进计划里', '真实成绩、GPA 与模拟考试各有位置。复习围绕你的目标展开。'], ['让抽象知识看得见', '公式输入、科学插图与可编辑题库，让自己的资料更好用。'], ['和企鹅一起收集成长', '学习后收获奖励，打造装备与附魔搭配。游戏效果不会改变真实成绩和掌握判断。']],
    rewardLabel: '认真学，也好好玩', rewardTitle: '你的搭档，\n不只会说加油。', rewardBody: '一只读书的企鹅，一场学习后的开箱，一件慢慢打磨的装备。把成长留下来，也把下一次学习变成值得期待的事。',
    faqTitle: '开始之前，你可能想问', faq: [['需要先注册吗？', '不需要。可以先在当前设备本地学习。登录并配置云服务后，可使用账户同步及设备连接。'], ['AI 生成的题目可靠吗？', 'AI 内容需要核验。Reviewbox 提供审核和人工确认流程，不能把自动生成或自动评分视为永远正确。'], ['我的学习记录会被保留吗？', '已有学习记录会继续留在原来的学习空间。再次进入网站时，会直接打开学习首页。跨设备使用需要登录并同步。'], ['装备会影响成绩吗？', '不会。装备用于奖励、外观和体验偏好，不直接提高掌握度、考试成绩或 GPA，也不能跳过必要验证。']],
    final: '今天，给未来的自己\n留下一点进步。', finalBody: '带上好奇心，剩下的一步一步来。', terms: '使用条款与隐私', feedback: '反馈', workspace: '进入学习空间', footer: '认真学习，快乐成长。',
  },
  en: {
    nav: ['How it works', 'Beyond practice', 'Questions'], login: 'Log in', start: 'Start my learning journey',
    eyebrow: 'Your knowledge deserves to stay.', title: ['Less aimless revision.', 'More ', 'understanding.'],
    intro: 'Bring your materials, practice and exams into one personal learning path. Reviewbox finds your next step. Your penguin keeps you company.',
    secondary: 'See how it works', note: 'Start with your own materials · Learn locally',
    tabs: ['Daily plan', 'Your materials', 'Exam preparation'], demo: 'Feature illustration · Not personal learning data', today: 'ONE GOOD NEXT STEP',
    demoTitle: ['Give knowledge time to take root', 'Turn your materials into practice', 'Make preparation purposeful'], demoBody: ['Recall what may fade, then check understanding in a new context.', 'Import notes and learning packs. Review questions before practising.', 'Plan revision and assessments around your exam scope and date.'],
    tasks: [['Recall earlier learning', 'Try a different context', 'Verify another day'], ['Organise your materials', 'Review questions and answers', 'Add to your study plan'], ['Define your exam scope', 'Work on the gaps', 'Assess and adjust']], demoCta: 'Take the next step', companion: 'Every little step counts.', strip: ['Adaptive planning', 'Spaced review', 'Real grades & GPA', 'Penguin & equipment', 'Watch companion'],
    howLabel: 'A LITTLE EVERY DAY', how: 'You do not need to do it all.\nJust the right next thing.', howBody: 'From so much to learn, to knowing where to begin.',
    steps: [['Bring your knowledge', 'Import notes, documents or learning packs. Start with materials you already have.'], ['Find a worthwhile next step', 'Learning evidence, memory and exam goals guide practice, courses and assessments.'], ['Understand. Then remember.', 'Answer, reflect, consolidate and verify later. Build understanding that lasts.']],
    depth: 'Serious learning. Something to look forward to.', depthBody: 'Real grades, personal progress, and room for a little joy.', cards: [['Put exams in the plan', 'Real grades, GPA and mock exams have distinct roles. Prepare around your own goals.'], ['Make ideas visible', 'Math input, scientific illustrations and editable questions bring your materials to life.'], ['Collect your progress', 'Earn rewards after learning, forge equipment and explore enchantments. Game effects never inflate grades or mastery.']],
    rewardLabel: 'LEARN WELL. PLAY A LITTLE.', rewardTitle: 'A companion with\nmore than a cheer.', rewardBody: 'A reading penguin, a chest after learning, a piece of equipment to make your own. Keep a little reminder of your progress, and a reason to look forward to tomorrow.',
    faqTitle: 'A few things before you begin', faq: [['Do I need an account?', 'No. You can learn locally first. Log in and configure cloud services for account sync and device connections.'], ['Can I trust AI-generated questions?', 'AI content needs checking. Reviewbox supports review and manual confirmation. Generation and automated grading can make mistakes.'], ['What happens to my existing work?', 'Your learning records stay in your learning space. Returning learners go straight to their original home. Cross-device access requires login and sync.'], ['Does equipment change my grades?', 'No. Equipment affects rewards, appearance and experience preferences. It cannot raise mastery, exam scores or GPA, or skip required verification.']],
    final: 'A little progress today.\nA gift to your future self.', finalBody: 'Bring your curiosity. Take it one step at a time.', terms: 'Terms & privacy', feedback: 'Feedback', workspace: 'Open learning space', footer: 'Learn with purpose. Grow with joy.',
  },
};
export default function WebsiteView({navigate, locale}: {navigate: (page:string, subject?:string, section?:string) => void; locale?:string}) {
  const [language, setLanguage] = useState<'zh' | 'en'>(locale && !locale.startsWith('zh') ? 'en' : 'zh');
  const [tab, setTab] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const [paused,setPaused] = useState(false), [reduced,setReduced] = useState(true), [visible,setVisible] = useState(true), [hovered,setHovered] = useState(false);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReduced(media.matches), visibility=()=>setVisible(!document.hidden);
    update();visibility();media.addEventListener('change',update);document.addEventListener('visibilitychange',visibility);
    const font=new FontFace('Review Website',`url("${assetPath('det-player/assets/fonts/DuolingoSansVF.woff2')}")`);
    void font.load().then(f=>document.fonts.add(f)).catch(()=>{});
    return()=>{media.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(()=>{
    if(paused||reduced||!visible||hovered)return;
    const timer=setTimeout(()=>setTab(t=>(t+1)%3),6500);return()=>clearTimeout(timer);
  },[tab,paused,reduced,visible,hovered]);
  useEffect(()=>{
    if(!root.current||reduced||paused||!('IntersectionObserver' in window))return;
    const items=root.current.querySelectorAll('.web-section-heading,.web-steps article,.web-feature-grid article,.web-companion,.web-devices-story,.web-trust-note');
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-revealed');observer.unobserve(e.target);}}),{threshold:.12});
    items.forEach(el=>{el.classList.add('web-reveal');observer.observe(el);});
    return()=>{observer.disconnect();items.forEach(el=>el.classList.remove('web-reveal'));};
  },[reduced,paused]);
  const c = copy[language];
  const go = () => navigate('onboarding');
  const scroll = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  return <div ref={root} className={'rb-website '+(paused||reduced?'web-motion-paused':'web-motion-on')} lang={language === 'zh' ? 'zh-CN' : 'en'}>
    <a className="web-skip" href="#web-main" onClick={e => { e.preventDefault(); document.getElementById('web-main')?.focus(); }}>{language === 'zh' ? '跳到正文' : 'Skip to content'}</a>
    <header className="web-header"><button className="web-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Reviewbox"><span><Layers3 size={24}/></span>reviewbox<span className="web-brand-dot">.</span></button>
      <nav aria-label={language === 'zh' ? '官网导航' : 'Website navigation'}>{c.nav.map((label, i) => <button key={label} onClick={() => scroll(['web-how', 'web-features', 'web-faq'][i])}>{label}</button>)}</nav>
      <div className="web-header-actions"><select aria-label="Language / 语言" value={language} onChange={e => setLanguage(e.target.value as 'zh' | 'en')}><option value="zh">中文</option><option value="en">EN</option></select><button className="web-login" onClick={() => navigate('you', 'all', 'account')}>{c.login}</button><button className="web-button web-small" onClick={go}>{language === 'zh' ? '开始学习' : 'Get started'}<ArrowRight size={17}/></button></div>
    </header>
    <main id="web-main" tabIndex={-1}>
      <section className="web-hero"><div className="web-hero-copy"><p className="web-eyebrow"><span/>{c.eyebrow}</p><h1>{c.title[0]}<br/>{c.title[1]}<em>{c.title[2]}</em></h1><p className="web-intro">{c.intro}</p><div className="web-hero-actions"><button className="web-button" onClick={go}>{c.start}<ArrowRight size={20}/></button><button className="web-text-link" onClick={() => scroll('web-how')}>{c.secondary}<ChevronDown size={17}/></button></div><p className="web-note"><ShieldCheck size={15}/>{c.note}</p></div>
      <div className="web-stage" onPointerEnter={()=>setHovered(true)} onPointerLeave={()=>setHovered(false)} onFocusCapture={()=>setHovered(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHovered(false);}}><span className="web-orbit web-orbit-one"/><span className="web-orbit web-orbit-two"/><span className="web-star web-star-one">✦</span><span className="web-star web-star-two">✧</span>
        <div className="web-preview"><div className="web-window"><i/><i/><i/><span>reviewbox / {['today', 'materials', 'exams'][tab]}</span><Layers3 size={14}/></div><div role="tablist" aria-label={language === 'zh' ? '功能预览' : 'Feature preview'} className="web-preview-tabs">{c.tabs.map((title, i) => <button role="tab" id={'web-tab-'+i} aria-selected={tab === i} aria-controls="web-preview-panel" tabIndex={tab === i ? 0 : -1} key={title} onClick={() => setTab(i)} onKeyDown={e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {e.preventDefault(); const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;setTab(next);document.getElementById('web-tab-'+next)?.focus();} }}>{title}</button>)}</div>
          <div key={tab} className="web-demo-content" id="web-preview-panel" role="tabpanel" aria-labelledby={'web-tab-'+tab}><p className="web-demo-eyebrow"><Sparkles size={14}/>{c.today}</p><h2>{c.demoTitle[tab]}</h2><p>{c.demoBody[tab]}</p><div className="web-demo-tasks">{c.tasks[tab].map((title, i) => <div key={title}><span className={i ? '' : 'done'}>{i ? i+1 : <Check size={13}/>}</span><span>{title}</span>{i === 0 && <span className="web-demo-progress"/>}</div>)}</div><button className="web-button web-demo-button" onClick={go}>{c.demoCta}<ArrowRight size={16}/></button></div><small className="web-demo-caption">{c.demo}</small>
        </div><div className="web-penguin-hero"><WebsitePenguin paused={paused||reduced}/></div><div className="web-speech">{c.companion}<span>✦</span></div><button className="web-motion-control" aria-pressed={paused} onClick={()=>setPaused(v=>!v)}>{language==='zh'?(paused?'播放动画':'暂停动画'):(paused?'Play motion':'Pause motion')}</button>
      </div></section>
      <div className="web-feature-strip">{[BookOpen, Clock3, GraduationCap, WandSparkles, Watch].map((Icon, i) => <span key={i}><Icon size={19}/>{c.strip[i]}</span>)}</div>
      <WebsiteJourney language={language} paused={paused||reduced} navigate={navigate}/><section className="web-depth web-section" id="web-features"><div className="web-section-heading"><p className="web-kicker">THE REVIEWBOX WAY</p><h2>{c.depth}</h2><p>{c.depthBody}</p></div><div className="web-feature-grid">{[GraduationCap, FileText, WandSparkles].map((Icon,i) => <article key={i}><div className={'web-feature-art art-'+i}>{i===0?<><span className="web-mini-label">EXAM → REVIEW → REFLECT</span><GraduationCap size={72} strokeWidth={1.3}/><div className="web-chart-bars"><i/><i/><i/><i/></div></>:i===1?<><span className="web-paper-formula">ƒ(x) = x²</span><div className="web-paper-lines"><i/><i/><i/></div><span className="web-paper-tag"><Check size={15}/> SVG · PDF · JSON</span></>:<><Sparkles className="web-item-spark" size={23}/><img src={assetPath('learning-penguin.png')} alt=""/><span className="web-item-badge"><Zap size={15}/> LEARN & GROW</span></>}</div><h3>{c.cards[i][0]}</h3><p>{c.cards[i][1]}</p></article>)}</div></section>
      <section className="web-companion web-section"><div className="web-companion-art"><span className="web-companion-circle"/><img src={assetPath('learning-penguin.png')} alt=""/><div className="web-companion-stamp"><BookOpen size={23}/><span>ONE MORE<br/>GOOD DAY</span></div></div><div><p className="web-kicker">{c.rewardLabel}</p><h2>{c.rewardTitle}</h2><p>{c.rewardBody}</p><button className="web-text-link" onClick={go}>{c.start}<ArrowRight size={19}/></button></div></section>
      <section className="web-faq web-section" id="web-faq"><h2>{c.faqTitle}</h2><div>{c.faq.map(([q,a]) => <details key={q}><summary>{q}<ChevronDown size={19}/></summary><p>{a}</p></details>)}</div></section>
      <section className="web-final"><span className="web-kicker">READY WHEN YOU ARE</span><h2>{c.final}</h2><p>{c.finalBody}</p><button className="web-button" onClick={go}>{c.start}<ArrowRight size={20}/></button></section>
    </main><footer className="web-footer"><div><span className="web-footer-brand">reviewbox.</span><p>{c.footer}</p></div><nav aria-label={language === 'zh' ? '页脚' : 'Footer'}><button onClick={() => navigate('you','all','agreement')}>{c.terms}</button><button onClick={() => navigate('you','all','feedback')}>{c.feedback}</button><button onClick={() => navigate('plan')}>{c.workspace}<ArrowRight size={14}/></button></nav><small>© {new Date().getFullYear()} Reviewbox</small></footer>
  </div>;
}
