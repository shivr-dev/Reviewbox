'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Flame,
  Gem,
  Hammer,
  Home,
  Layers3,
  LockKeyhole,
  Sparkles,
  Star,
  UnlockKeyhole,
  WandSparkles,
  X,
} from 'lucide-react';
import { assetPath } from '@/lib/runtime';
import { useReview } from './review-context';
import HomeView from './home-view';
import { Penguin } from './learning-game';

type Screen = 'home' | 'smith' | 'enchant' | 'inventory';
const screens: {
  id: Screen;
  name: string;
  Icon: typeof Home;
  subtitle: string;
}[] = [
  {
    id: 'home',
    name: '学习首页',
    Icon: Home,
    subtitle: '留白与一个明确的下一步',
  },
  {
    id: 'smith',
    name: '铁匠铺',
    Icon: Hammer,
    subtitle: '温暖木色 · 锻造与取舍',
  },
  {
    id: 'enchant',
    name: '附魔师',
    Icon: WandSparkles,
    subtitle: '淡紫星光 · 发现与组合',
  },
  {
    id: 'inventory',
    name: '装备库',
    Icon: Layers3,
    subtitle: '清晰陈列 · 收藏与搭配',
  },
];
const names = ['星羽笔刃', '回响之书', '远行披风', '晨星罗盘'];
const qualities = ['稀有', '史诗', '普通', '独特'];
const initialAffixes = [
  { name: '星光尾迹', value: 34, unit: '尾迹长度', min: 20, max: 60 },
  { name: '纸页回响', value: 42, unit: '粒子密度', min: 25, max: 70 },
  { name: '余晖绽放', value: 28, unit: '光晕强度', min: 15, max: 55 },
];
type Affix = (typeof initialAffixes)[number];

function ItemSprite({
  index = 0,
  className = '',
}: {
  index?: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={names[index]}
      className={'rb-item-sprite ' + className}
      style={
        {
          backgroundImage: `url("${assetPath('workshop/equipment-friendly-v1.webp')}")`,
          backgroundPosition: `${(index % 2) * 100}% ${Math.floor(index / 2) * 100}%`,
        } as CSSProperties
      }
    />
  );
}
function MiniShell({
  screen,
  children,
}: {
  screen: Screen;
  children: React.ReactNode;
}) {
  return (
    <div className={'rb-screen rb-screen-' + screen}>
      <aside className="rb-shell-rail" aria-label="产品导航示意">
        <span className="rb-mini-brand">
          <Layers3 size={20} />
        </span>
        {screens.map(({ id, Icon, name }) => (
          <span
            key={id}
            title={name}
            className={screen === id ? 'current' : ''}
          >
            <Icon size={20} />
          </span>
        ))}
        <img src={assetPath('learning-penguin.png')} alt="" />
      </aside>
      <div className="rb-screen-main">
        <div className="rb-screen-top">
          <b>
            review<span>.</span>
          </b>
          <span>学习 · 收集 · 成长</span>
          <span className="rb-demo-tag">视觉试作</span>
        </div>
        {children}
      </div>
    </div>
  );
}
function Affixes({
  values,
  locks,
  onLock,
  disabled = false,
}: {
  values: Affix[];
  locks: number[];
  onLock?: (i: number) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="rb-affixes">
      {values.map((a, i) => (
        <li key={a.name}>
          <span className="rb-affix-star">
            <Sparkles size={16} />
          </span>
          <div>
            <b>{a.name}</b>
            <small>
              {a.unit} <strong>{a.value}%</strong>
            </small>
            <span className="rb-stat-track">
              <i
                style={{
                  width: ((a.value - a.min) / (a.max - a.min)) * 100 + '%',
                }}
              />
            </span>
          </div>
          {onLock && (
            <button
              type="button"
              className={'rb-lock ' + (locks.includes(i) ? 'is-locked' : '')}
              aria-label={(locks.includes(i) ? '解锁' : '锁定') + a.name}
              aria-pressed={locks.includes(i)}
              onClick={() => onLock(i)}
              disabled={disabled || (!locks.includes(i) && locks.length >= 2)}
            >
              {locks.includes(i) ? (
                <LockKeyhole size={17} />
              ) : (
                <UnlockKeyhole size={17} />
              )}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
function Workshop({
  kind,
  compact = false,
}: {
  kind: 'smith' | 'enchant';
  compact?: boolean;
}) {
  const [affixes, setAffixes] = useState(initialAffixes),
    [locks, setLocks] = useState<number[]>([]),
    [working, setWorking] = useState(false),
    [candidate, setCandidate] = useState<Affix[] | null>(null),
    [ore, setOre] = useState(120),
    [message, setMessage] = useState(''),
    [book, setBook] = useState(0),
    [attached, setAttached] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    busy = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const cost = 8 + locks.length * 4;
  function reforge() {
    if (busy.current || candidate || ore < cost) return;
    busy.current = true;
    setWorking(true);
    setMessage('');
    setOre((x) => x - cost);
    const rolled = affixes.map((a, i) =>
      locks.includes(i)
        ? a
        : {
            ...a,
            value:
              a.min +
              Math.floor(
                (crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) *
                  (a.max - a.min + 1),
              ),
          },
    );
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    timer.current = setTimeout(
      () => {
        setCandidate(rolled);
        setWorking(false);
        busy.current = false;
      },
      reduced ? 100 : 2100,
    );
  }
  return (
    <MiniShell screen={kind}>
      <div className="rb-workshop-heading">
        <div>
          <span className="rb-eyebrow">企鹅的冒险工坊</span>
          <h2>
            {kind === 'smith'
              ? '把喜欢的装备，再打磨一下。'
              : '让你的装备，有一点魔法。'}
          </h2>
        </div>
        <span className={'rb-pill ' + (kind === 'smith' ? 'warm' : 'violet')}>
          {kind === 'smith' ? <Hammer size={14} /> : <WandSparkles size={14} />}{' '}
          {kind === 'smith' ? '铁匠铺' : '附魔师'}
        </span>
      </div>
      <div className={'rb-workshop-content ' + (working ? 'is-working' : '')}>
        <div className="rb-scene-area">
          <div className="rb-scene-halo" />
          <img
            className="rb-scene-art"
            src={assetPath(
              `workshop/${kind === 'smith' ? 'smith' : 'enchant'}-friendly-v1.webp`,
            )}
            alt={
              kind === 'smith'
                ? '明亮的蓝顶铁匠铺，木制工作台与奶油色炉窑'
                : '蓝顶附魔小屋，悬浮的书本与淡紫窗帘'
            }
          />
          <div
            className={'rb-scene-companion ' + (working ? 'is-excited' : '')}
          >
            <Penguin
              action={working ? 'combo' : 'welcome'}
              actionKey={String(working)}
            />
          </div>
          {kind === 'smith' && (
            <div className="rb-workpiece">
              <ItemSprite />
            </div>
          )}
          {working && (
            <div className="rb-forge-burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ '--i': i } as CSSProperties} />
              ))}
            </div>
          )}
          <div className="rb-scene-caption">
            <span>
              {working
                ? '叮！叮！好东西值得慢慢打磨。'
                : kind === 'smith'
                  ? '每一件装备，都有自己的可能。'
                  : '第一次发现，就能永久收藏。'}
            </span>
          </div>
        </div>
        <section
          className="rb-details"
          aria-label={kind === 'smith' ? '装备重铸演示' : '附魔装配演示'}
        >
          {kind === 'smith' ? (
            <>
              <div className="rb-item-heading">
                <ItemSprite />
                <div>
                  <span className="rb-rarity rare">稀有 · 笔刃</span>
                  <h3>星羽笔刃</h3>
                  <small>一笔一画，写下新的冒险。</small>
                </div>
              </div>
              <div className="rb-detail-title">
                <b>随机词条</b>
                <small>最多锁定 2 条</small>
              </div>
              <Affixes
                values={affixes}
                locks={locks}
                onLock={(i) =>
                  setLocks((x) =>
                    x.includes(i) ? x.filter((v) => v !== i) : [...x, i],
                  )
                }
                disabled={working || !!candidate}
              />
              <p className="rb-integrity-note">
                本次试作词条只改变结算特效，不影响学习判断。
              </p>
              <div className="rb-forge-cost">
                <span>
                  <Gem size={15} /> {ore} 演示矿石
                </span>
                <b>消耗 {cost}</b>
              </div>
              <button
                className="primary rb-action"
                disabled={working || !!candidate || ore < cost}
                onClick={reforge}
              >
                <Hammer size={18} />
                {working ? '正在重铸…' : '重铸词条'}
              </button>
              {ore < cost && !candidate && (
                <button
                  className="rb-text-button"
                  onClick={() => {
                    setOre(120);
                    setMessage('演示矿石已补充');
                  }}
                >
                  补充演示矿石
                </button>
              )}
            </>
          ) : (
            <>
              <div className="rb-item-heading">
                <ItemSprite index={1} />
                <div>
                  <span className="rb-rarity epic">永久附魔书</span>
                  <h3>
                    {book === 0 ? '星光回响' : '远行序曲'}{' '}
                    <span className="rb-level">I</span>
                  </h3>
                  <small>发现一次，就一直属于你。</small>
                </div>
              </div>
              <div className="rb-books" aria-label="选择演示附魔书">
                {['星光回响', '远行序曲'].map((n, i) => (
                  <button
                    aria-pressed={book === i}
                    className={book === i ? 'selected' : ''}
                    key={n}
                    onClick={() => {
                      setBook(i);
                      setAttached(false);
                    }}
                  >
                    <ItemSprite index={i === 0 ? 1 : 3} />
                    <span>{n}</span>
                    {book === i && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="rb-enchant-effect">
                <Sparkles size={22} />
                <b>
                  {book === 0
                    ? '把每次成长，变成一束星光。'
                    : '让下一段旅程，带着明亮的尾迹。'}
                </b>
                <p>
                  {book === 0
                    ? '学习结算出现轻盈的纸页与星光。'
                    : '切换装备时，展现蓝金色的环绕光效。'}
                </p>
              </div>
              <div className="rb-slot-preview">
                <ItemSprite />
                <span>
                  星羽笔刃 <small>附魔槽 01 / 02</small>
                </span>
                <Star size={20} />
              </div>
              <button
                className="primary rb-action"
                onClick={() => setAttached((x) => !x)}
              >
                <WandSparkles size={18} />
                {attached ? '卸下演示附魔' : '装配演示附魔'}
              </button>
              <p className="rb-integrity-note">
                自由装卸，图鉴中的附魔书不会消失。
              </p>
            </>
          )}
          <div className="rb-live-message" role="status">
            {attached ? '已装配 · 星光会在结算时亮起' : message}
          </div>
        </section>
      </div>
      {candidate && (
        <div className="rb-result-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="重铸结果比较"
            className="rb-result"
          >
            <span className="rb-eyebrow">新的可能，已经出炉</span>
            <h3>你想留下哪一种？</h3>
            <p>锁定词条保留。接受前，可以逐条比较。</p>
            <div className="rb-compare">
              <div>
                <b>原有词条</b>
                <Affixes values={affixes} locks={[]} />
              </div>
              <div className="new">
                <b>
                  <Sparkles size={15} /> 本次重铸
                </b>
                <Affixes values={candidate} locks={[]} />
              </div>
            </div>
            <div className="rb-result-actions">
              <button
                className="secondary"
                autoFocus
                onClick={() => {
                  setCandidate(null);
                  setMessage('已保留原有词条');
                }}
              >
                保留原有
              </button>
              <button
                className="primary"
                onClick={() => {
                  setAffixes(candidate);
                  setCandidate(null);
                  setMessage('新词条已应用到演示装备');
                }}
              >
                接受新词条 <Check size={16} />
              </button>
            </div>
            <small>重铸消耗已扣除，保留原有词条也不会返还。</small>
          </section>
        </div>
      )}
    </MiniShell>
  );
}
function Inventory() {
  const [selected, setSelected] = useState(0),
    [equipped, setEquipped] = useState(0),
    [filter, setFilter] = useState('全部');
  return (
    <MiniShell screen="inventory">
      <div className="rb-workshop-heading">
        <div>
          <span className="rb-eyebrow">企鹅的冒险工坊</span>
          <h2>每一件，都是成长的纪念。</h2>
        </div>
        <span className="rb-pill">
          <Layers3 size={14} /> 装备库
        </span>
      </div>
      <div className="rb-inventory-layout">
        <section className="rb-collection">
          <div className="rb-filter" aria-label="筛选演示装备">
            {['全部', '稀有以上'].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="rb-item-grid">
            {names.map(
              (name, i) =>
                (filter === '全部' || i !== 2) && (
                  <button
                    key={name}
                    className={
                      'rb-collectible quality-' +
                      i +
                      (selected === i ? ' selected' : '')
                    }
                    aria-pressed={selected === i}
                    onClick={() => setSelected(i)}
                  >
                    <span className="rb-rarity">{qualities[i]}</span>
                    <ItemSprite index={i} />
                    <b>{name}</b>
                    <small>{['笔刃', '附魔书', '护甲', '护符'][i]}</small>
                    {equipped === i && (
                      <span className="rb-equipped">
                        <Check size={13} /> 已装配
                      </span>
                    )}
                  </button>
                ),
            )}
          </div>
        </section>
        <section className="rb-inventory-detail">
          <div className="rb-gear-podium">
            <ItemSprite index={selected} />
          </div>
          <span
            className={'rb-rarity ' + ['rare', 'epic', '', 'unique'][selected]}
          >
            {qualities[selected]} · 收藏品
          </span>
          <h3>{names[selected]}</h3>
          <p>
            {
              [
                '轻巧的羽刃，陪你书写新的篇章。',
                '把每一次新发现，收藏成一束星光。',
                '柔软的披风，留给每一次勇敢出发。',
                '不必走得很快，只要知道下一步。',
              ][selected]
            }
          </p>
          <div className="rb-memory">
            <BookOpen size={18} />
            <div>
              <b>装备也有自己的故事</b>
              <small>正式接入后，这里会记录真实的学习里程碑。</small>
            </div>
          </div>
          <button
            className="primary rb-action"
            onClick={() => setEquipped(selected)}
            disabled={equipped === selected}
          >
            {equipped === selected ? (
              <>
                <Check size={17} /> 已装配
              </>
            ) : (
              <>
                试穿这件装备 <ArrowRight size={17} />
              </>
            )}
          </button>
        </section>
      </div>
    </MiniShell>
  );
}
function ScreenView({
  id,
  compact = false,
}: {
  id: Screen;
  compact?: boolean;
}) {
  if (id === 'home')
    return (
      <MiniShell screen="home">
        <HomeView />
      </MiniShell>
    );
  if (id === 'inventory') return <Inventory />;
  return <Workshop kind={id} compact={compact} />;
}
export default function BrandStudio() {
  const { navigate } = useReview();
  const [view, setView] = useState<Screen | 'overview' | 'system'>('overview');
  return (
    <main
      className={
        'rb-brand-studio ' + (view === 'overview' ? 'overview' : 'single')
      }
    >
      <header className="rb-studio-header">
        <button className="rb-back" onClick={() => navigate('home')}>
          <ArrowLeft size={18} /> 返回学习
        </button>
        <div>
          <b>Reviewbox · 同一个冒险世界</b>
          <small>品牌视觉对照 / 01</small>
        </div>
        <span className="rb-prototype-label">
          视觉与交互试作 · 游戏数据为演示
        </span>
      </header>
      <div className="rb-studio-intro">
        <div>
          <span className="rb-eyebrow">从学习的轻松感出发</span>
          <h1>成长很认真，冒险可以很轻盈。</h1>
          <p>
            同一只企鹅，同一套蓝白色与按压按钮。用场景讲故事，让界面保持清晰。
          </p>
        </div>
        <div className="rb-palette" aria-label="品牌颜色">
          <i style={{ background: '#51aff0' }} />
          <i style={{ background: '#e1f3ff' }} />
          <i style={{ background: '#ffc800' }} />
          <i style={{ background: '#c6b4f0' }} />
          <i style={{ background: '#3c3c3c' }} />
        </div>
      </div>
      <nav className="rb-studio-tabs" aria-label="视觉对照页面">
        <button
          onClick={() => setView('overview')}
          aria-current={view === 'overview' ? 'page' : undefined}
        >
          四页对照
        </button>
        {screens.map(({ id, name, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            aria-current={view === id ? 'page' : undefined}
          >
            <Icon size={17} />
            {name}
          </button>
        ))}
        <button
          onClick={() => setView('system')}
          aria-current={view === 'system' ? 'page' : undefined}
        >
          设计规范
        </button>
      </nav>
      {view === 'system' ? (
        <section className="rb-system-sheet">
          <h2>一套规则，四种场景</h2>
          <div className="rb-system-grid">
            <article>
              <span>01 / 色彩</span>
              <h3>蓝白是品牌，彩色是点缀。</h3>
              <p>
                主色 #51AFF0，按压底色 #4095CA，浅蓝 #E1F3FF，正文 #3C3C3C，边框
                #E5E5E5。黄色用于奖励，淡紫用于附魔；场景不能把整个页面染黑。
              </p>
            </article>
            <article>
              <span>02 / 形状与材质</span>
              <h3>圆润轮廓，真实层次。</h3>
              <p>
                界面沿用白色、2px 边框与 12–18px 圆角。场景采用原创 2.5D
                插画：奶油石材、暖木、蓝色涂装金属。减少碎纹理，保留接触阴影和清楚的轮廓。
              </p>
            </article>
            <article>
              <span>03 / 字体与图标</span>
              <h3>读起来，依然是 Reviewbox。</h3>
              <p>
                沿用 Review Duo 与 Noto Sans SC；正文 15–16px，标题
                28–32px。导航沿用 Lucide
                线性图标；装备独立绘制，稀有度同时用文字与颜色标识。
              </p>
            </article>
            <article>
              <span>04 / 动效</span>
              <h3>按下有重量，奖励有节奏。</h3>
              <p>
                按钮按压 80ms，下移
                3–4px。重铸分为蓄力、敲击、星光揭晓、结果比较。企鹅保留既有动作。减少动态模式跳过运动，仅保留状态变化。
              </p>
            </article>
            <article>
              <span>05 / 页面层级</span>
              <h3>学习安静，工坊丰富。</h3>
              <p>
                学习首页仍然只有一个最强
                CTA。工坊统一为左侧场景、右侧清晰操作面板。装备库以陈列为主，附魔以发现为主，避免给学习增加负担。
              </p>
            </article>
            <article>
              <span>06 / 实现边界</span>
              <h3>美术、操作、特效分层。</h3>
              <p>
                背景和装备使用原创透明素材；词条、按钮与比较均为真实 React
                界面。当前试作不消耗真实材料，也不改动掌握度、GPA 或已有存档。
              </p>
            </article>
          </div>
        </section>
      ) : view === 'overview' ? (
        <div className="rb-comparison-grid">
          {screens.map(({ id, name, subtitle }, i) => (
            <article className="rb-comparison-card" key={id}>
              <div className="rb-comparison-label">
                <span>
                  0{i + 1} / {name}
                </span>
                <small>{subtitle}</small>
                <button onClick={() => setView(id)} aria-label={'展开' + name}>
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="rb-miniature">
                <ScreenView id={id} compact />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="rb-full-preview" aria-label="完整页面预览">
          <ScreenView id={view} />
        </section>
      )}
      <footer className="rb-studio-footer">
        <span>品牌基线：现有学习首页与企鹅角色</span>
        <span>场景插画 / 可操作 UI / 动画效果 · 三层独立</span>
      </footer>
    </main>
  );
}
