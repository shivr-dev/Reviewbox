'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Gem,
  Hammer,
  Home,
  Layers3,
  LockKeyhole,
  Settings,
  Sparkles,
  Star,
  UnlockKeyhole,
  WandSparkles,
  X,
  PackageOpen,
} from 'lucide-react';
import { assetPath } from '@/lib/runtime';
import { currentNamespace } from '@/lib/store';
import { equipmentCommand } from '@/lib/equipment-client';
import {
  equipmentCost,
  equipmentEffects,
  equipmentState,
  eligibleEquipmentSessions,
  type EquipmentCommand,
  type EquipmentItem,
  type EquipmentState,
} from '@/lib/equipment';
import {
  EQUIPMENT_AFFIXES,
  EQUIPMENT_BOOKS,
  EQUIPMENT_TEMPLATES,
  RARITY_NAMES,
  SLOT_NAMES,
  type EquipmentAffix,
  type EquipmentMaterials,
} from '@/lib/equipment-catalog';
import { learningGame } from '@/lib/learning-game';
import { useReview } from './review-context';
import HomeView from './home-view';
import { Penguin } from './learning-game';

const pages = [
  { id: 'home', label: '现在学习', Icon: Home },
  { id: 'forge', label: '铁匠铺', Icon: Hammer },
  { id: 'enchant', label: '附魔师', Icon: WandSparkles },
  { id: 'equipment', label: '装备库', Icon: Layers3 },
];
const roman = ['', 'I', 'II', 'III'];
const GearContext = createContext<{
  state: EquipmentState;
  busy: boolean;
  run: (
    c: EquipmentCommand,
    message?: string,
  ) => Promise<EquipmentState | null>;
}>(null!);
const useGear = () => useContext(GearContext);
const template = (item: EquipmentItem) =>
  EQUIPMENT_TEMPLATES.find((t) => t.id === item.templateId)!;
const itemIndex = (item?: EquipmentItem) =>
  item
    ? { penblade: 0, cloak: 2, charm: 1, artifact: 3 }[template(item).slot]
    : 0;
const affixName = (id: string) =>
  EQUIPMENT_AFFIXES.find((a) => a.id === id)?.name ?? id;
const slots = (item: EquipmentItem) =>
  ({ common: 1, rare: 2, epic: 2, unique: 3 })[template(item).rarity];
function Sprite({
  index = 0,
  label = '装备',
  className = '',
}: {
  index?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
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
function ItemArt({ item }: { item: EquipmentItem }) {
  return (
    <div
      className={
        'rb-owned-item level-' +
        item.level +
        (Object.keys(item.enchantments).length ? ' enchanted' : '')
      }
    >
      <Sprite index={itemIndex(item)} label={template(item).name} />
      {item.level > 0 && <span className="rb-level-chip">+{item.level}</span>}
    </div>
  );
}
function Cost({ value }: { value: EquipmentMaterials }) {
  return (
    <span className="rb-cost-parts">
      {Object.entries(value)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => (
          <span key={k}>
            {{ ore: '矿晶', ink: '星墨', thread: '梦线' }[k]} {n}
          </span>
        ))}
      {Object.values(value).every((n) => n === 0) && <span>免费装卸</span>}
    </span>
  );
}
function enough(state: EquipmentState, cost: EquipmentMaterials) {
  return Object.entries(cost).every(
    ([k, n]) => state.materials[k as keyof EquipmentMaterials] >= n,
  );
}
function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    return () => {
      if (el?.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="rb-result rb-native-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      {onClose && (
        <button
          className="rb-modal-close"
          aria-label="稍后处理"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      )}
      {children}
    </dialog>
  );
}
function Affixes({
  values,
  locked = [],
  onLock,
  disabled = false,
}: {
  values: EquipmentAffix[];
  locked?: string[];
  onLock?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="rb-affixes">
      {values.map((a) => (
        <li key={a.id}>
          <span className="rb-affix-star">
            <Sparkles size={17} />
          </span>
          <div>
            <b>
              {affixName(a.id)} <em>{roman[a.tier]}</em>
            </b>
            <small>
              {EQUIPMENT_AFFIXES.find((f) => f.id === a.id)?.description}
            </small>
            <span className="rb-stat-track">
              <i style={{ width: (a.tier / 3) * 100 + '%' }} />
            </span>
          </div>
          {onLock && (
            <button
              className={
                'rb-lock ' + (locked.includes(a.id) ? 'is-locked' : '')
              }
              aria-label={
                (locked.includes(a.id) ? '解锁' : '锁定') + affixName(a.id)
              }
              aria-pressed={locked.includes(a.id)}
              disabled={
                disabled ||
                (!locked.includes(a.id) &&
                  locked.length >= Math.min(2, values.length - 1))
              }
              onClick={() => onLock(a.id)}
            >
              {locked.includes(a.id) ? (
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
function ChooseItem({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (id: string) => void;
}) {
  const { state } = useGear();
  return (
    <label className="rb-select-label">
      选择装备
      <select
        aria-label="选择装备"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
      >
        {state.items.map((i) => (
          <option key={i.id} value={i.id}>
            {template(i).name} +{i.level}
            {Object.values(state.equipped).includes(i.id) ? ' · 已装配' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
function Starter() {
  const { busy, run } = useGear();
  return (
    <section className="rb-starter">
      <Penguin action="welcome" />
      <span className="rb-eyebrow">冒险从这里启程</span>
      <h2>给认真学习的你，一套新装备。</h2>
      <p>
        四件启程装备、三本永久附魔书，以及第一份锻造材料。每个账号只能领取一次。
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() => void run({ action: 'starter' }, '启程装备已加入装备库')}
      >
        领取启程装备 <PackageOpen size={18} />
      </button>
      <small>装备不改变掌握度、考试分数或 GPA。</small>
    </section>
  );
}
function Workshop({
  kind,
  initialItem = '',
}: {
  kind: 'forge' | 'enchant';
  initialItem?: string;
}) {
  const { state, busy, run } = useGear();
  const [selected, setSelected] = useState(initialItem),
    [locked, setLocked] = useState<string[]>([]),
    [mode, setMode] = useState<'reforge' | 'upgrade'>('reforge'),
    [bookId, setBookId] = useState('book-spark'),
    [working, setWorking] = useState(false),
    [showResult, setShowResult] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!state.items.some((i) => i.id === selected))
      setSelected(
        state.pendingReforges[0]?.itemId ??
          state.equipped.penblade ??
          state.items[0]?.id ??
          '',
      );
  }, [state, selected]);
  useEffect(() => {
    setLocked([]);
    setShowResult(true);
  }, [selected]);
  const item = state.items.find((i) => i.id === selected) ?? state.items[0];
  if (!state.started) return <Starter />;
  if (!item)
    return (
      <section className="rb-starter">
        <h2>装备库暂时是空的</h2>
        <p>完成学习后，可以从装备库领取新的战利品。</p>
      </section>
    );
  const t = template(item),
    pending = state.pendingReforges.find((p) => p.itemId === item.id),
    book = EQUIPMENT_BOOKS.find((b) => b.id === bookId)!,
    level = state.bookLevels[bookId] ?? 0,
    attached = item.enchantments[bookId],
    compatible = (book.slots as readonly string[]).includes(t.slot),
    affix = EQUIPMENT_AFFIXES.find((a) => a.id === book.affix)!,
    maxed = item.level >= 5;
  const command: EquipmentCommand =
    mode === 'reforge'
      ? {
          action: 'reforge',
          itemId: item.id,
          expectedVersion: item.version,
          lockedAffixes: locked,
        }
      : { action: 'upgrade', itemId: item.id, expectedVersion: item.version };
  const cost = equipmentCost(command, item),
    upgradeBook: EquipmentCommand = {
      action: 'upgrade-book',
      bookId,
      tier: Math.min(3, level + 1) as 2 | 3,
    },
    bookCost = equipmentCost(upgradeBook);
  async function forge() {
    setWorking(true);
    const result = await run(
      command,
      mode === 'upgrade' ? '装备强化成功' : '重铸结果已保存',
    );
    if (!result) {
      setWorking(false);
      return;
    }
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    timer.current = setTimeout(
      () => {
        setWorking(false);
        setShowResult(true);
      },
      reduced ? 100 : 1800,
    );
  }
  async function resolve(accept: boolean) {
    if (!pending) return;
    const next = await run(
      {
        action: 'resolve-reforge',
        itemId: item.id,
        expectedVersion: item.version,
        previewId: pending.actionId,
        accept,
      },
      accept ? '新词条已应用' : '已保留原有词条',
    );
    if (next) {
      setShowResult(false);
      setLocked([]);
    }
  }
  return (
    <>
      <div className="rb-workshop-heading">
        <div>
          <span className="rb-eyebrow">企鹅的冒险工坊</span>
          <h1>
            {kind === 'forge'
              ? '把喜欢的装备，再打磨一下。'
              : '让你的装备，有一点魔法。'}
          </h1>
        </div>
        <span className={'rb-pill ' + (kind === 'forge' ? 'warm' : 'violet')}>
          {kind === 'forge' ? <Hammer size={14} /> : <WandSparkles size={14} />}{' '}
          {kind === 'forge' ? '铁匠铺' : '附魔师'}
        </span>
      </div>
      <div className={'rb-workshop-content ' + (working ? 'is-working' : '')}>
        <div className="rb-scene-area">
          <div className="rb-scene-halo" />
          <img
            className="rb-scene-art"
            src={assetPath(
              `workshop/${kind === 'forge' ? 'smith' : 'enchant'}-friendly-v1.webp`,
            )}
            alt={
              kind === 'forge'
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
          {kind === 'forge' && (
            <div className="rb-workpiece">
              <ItemArt item={item} />
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
            {working
              ? '叮！叮！好东西值得慢慢打磨。'
              : kind === 'forge'
                ? '每一件装备，都有自己的可能。'
                : '第一次发现，就能永久收藏。'}
          </div>
        </div>
        <section
          className="rb-details"
          aria-label={kind === 'forge' ? '装备锻造' : '永久附魔图鉴'}
        >
          <ChooseItem selected={item.id} onChange={setSelected} />
          <div className="rb-item-heading">
            <ItemArt item={item} />
            <div>
              <span className={'rb-rarity ' + t.rarity}>
                {RARITY_NAMES[t.rarity]} · {SLOT_NAMES[t.slot]}
              </span>
              <h2>
                {t.name} <small>+{item.level}</small>
              </h2>
              <small>{t.description}</small>
            </div>
          </div>
          {kind === 'forge' ? (
            <>
              <div className="rb-forge-tabs">
                <button
                  aria-pressed={mode === 'reforge'}
                  onClick={() => setMode('reforge')}
                >
                  重铸词条
                </button>
                <button
                  aria-pressed={mode === 'upgrade'}
                  onClick={() => setMode('upgrade')}
                >
                  装备强化
                </button>
              </div>
              {mode === 'reforge' ? (
                <>
                  <div className="rb-detail-title">
                    <b>随机词条</b>
                    <small>最多锁定 2 条</small>
                  </div>
                  <Affixes
                    values={item.affixes}
                    locked={locked}
                    disabled={busy || working || !!pending}
                    onLock={(id) =>
                      setLocked((x) =>
                        x.includes(id) ? x.filter((k) => k !== id) : [...x, id],
                      )
                    }
                  />
                  <p className="rb-integrity-note">
                    重铸可接受新结果，也可保留原有词条。锁定会增加消耗。
                  </p>
                </>
              ) : (
                <div className="rb-upgrade-preview">
                  <Star size={28} />
                  <h3>
                    锻造等级 +{item.level} → +{Math.min(5, item.level + 1)}
                  </h3>
                  <p>强化外观刻印与装备光泽，喜欢的装备可以继续陪伴你。</p>
                  <small>最高 +5，不增加真实成绩或掌握度。</small>
                </div>
              )}
              <div className="rb-forge-cost">
                <span>本次消耗</span>
                <Cost value={cost} />
              </div>
              {pending ? (
                <button
                  className="primary rb-action"
                  disabled={busy || working}
                  onClick={() => setShowResult(true)}
                >
                  查看待处理重铸结果
                </button>
              ) : (
                <button
                  className="primary rb-action"
                  disabled={
                    busy ||
                    working ||
                    !enough(state, cost) ||
                    (mode === 'upgrade' && maxed)
                  }
                  onClick={() => void forge()}
                >
                  <Hammer size={18} />
                  {working
                    ? '正在打磨…'
                    : mode === 'reforge'
                      ? '重铸词条'
                      : maxed
                        ? '已达强化上限'
                        : '强化装备'}
                </button>
              )}
              {!enough(state, cost) && !pending && (
                <p className="rb-inline-hint">
                  材料不足。完成学习领取战利品，或到商店补给。
                </p>
              )}
            </>
          ) : (
            <>
              <div className="rb-books rb-real-books" aria-label="选择附魔书">
                {EQUIPMENT_BOOKS.map((b) => (
                  <button
                    key={b.id}
                    aria-label={
                      b.name +
                      (state.books.includes(b.id) ? ' 已发现' : ' 未发现')
                    }
                    aria-pressed={bookId === b.id}
                    className={
                      (bookId === b.id ? 'selected ' : '') +
                      (!state.books.includes(b.id) ? 'undiscovered' : '')
                    }
                    onClick={() => setBookId(b.id)}
                  >
                    <Sprite index={1} label={b.name} />
                    <span>{b.name.replace('附魔书', '')}</span>
                    <small>
                      {state.books.includes(b.id)
                        ? roman[state.bookLevels[b.id]]
                        : '未发现'}
                    </small>
                  </button>
                ))}
              </div>
              <div className="rb-enchant-effect">
                <Sparkles size={22} />
                <b>
                  {book.name} {roman[level]}
                </b>
                <p>
                  {affix.description}。
                  {level > 0
                    ? '等级越高，工坊展示的光效越明亮。'
                    : '从有效学习战利品中发现这本书。'}
                </p>
                <small>
                  适用：{book.slots.map((s) => SLOT_NAMES[s]).join('、')} · 槽位{' '}
                  {Object.keys(item.enchantments).length}/{slots(item)}
                </small>
              </div>
              <button
                className="primary rb-action"
                disabled={
                  busy ||
                  !!pending ||
                  !level ||
                  !compatible ||
                  (!attached &&
                    Object.keys(item.enchantments).length >= slots(item))
                }
                onClick={() =>
                  void run(
                    attached
                      ? {
                          action: 'remove-enchant',
                          itemId: item.id,
                          expectedVersion: item.version,
                          bookId,
                        }
                      : {
                          action: 'enchant',
                          itemId: item.id,
                          expectedVersion: item.version,
                          bookId,
                          tier: level as 1 | 2 | 3,
                        },
                    attached ? '附魔已卸下，图鉴保留' : '附魔已装配',
                  )
                }
              >
                {attached ? (
                  <>
                    <X size={17} /> 卸下附魔
                  </>
                ) : (
                  <>
                    <WandSparkles size={17} /> 免费装配附魔
                  </>
                )}
              </button>
              {!compatible && (
                <p className="rb-inline-hint">
                  这本书不适用于当前装备，可切换上方装备。
                </p>
              )}
              {pending && (
                <p className="rb-inline-hint">
                  请先在铁匠铺处理这件装备的重铸结果。
                </p>
              )}
              <div className="rb-book-upgrade">
                <span>图鉴等级 {roman[level] || '未解锁'}</span>
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    level === 0 ||
                    level >= 3 ||
                    !enough(state, bookCost)
                  }
                  onClick={() => void run(upgradeBook, '附魔书等级已永久提升')}
                >
                  {level >= 3 ? '已达 III 级' : '升级图鉴'}{' '}
                  <Cost value={bookCost} />
                </button>
              </div>
              <p className="rb-integrity-note">
                装卸不消耗书。升级等级永久保留，并应用到已装配的同名附魔。
              </p>
            </>
          )}
        </section>
      </div>
      {pending && showResult && !working && (
        <Modal title="重铸结果比较" onClose={() => setShowResult(false)}>
          <span className="rb-eyebrow">新的可能，已经出炉</span>
          <h3>你想留下哪一种？</h3>
          <p>待处理结果已经保存，刷新不会重新随机。</p>
          <div className="rb-compare">
            <div>
              <b>原有词条</b>
              <Affixes values={item.affixes} />
            </div>
            <div className="new">
              <b>
                <Sparkles size={15} /> 本次重铸
              </b>
              <Affixes values={pending.affixes} />
            </div>
          </div>
          <div className="rb-result-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void resolve(false)}
            >
              保留原有
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void resolve(true)}
            >
              接受新词条 <Check size={16} />
            </button>
          </div>
          <small>
            消耗已扣除；保留原有结果不会返还材料。稍后也可继续处理。
          </small>
        </Modal>
      )}
    </>
  );
}

function Inventory() {
  const { data, navigate } = useReview(),
    { state, busy, run } = useGear();
  const [selected, setSelected] = useState(''),
    [filter, setFilter] = useState('全部'),
    [confirm, setConfirm] = useState(false),
    [buildId, setBuildId] = useState<1 | 2 | 3>(1),
    [buildName, setBuildName] = useState('我的搭配'),
    [reward, setReward] = useState<EquipmentState['loot'][number] | null>(null);
  const item = state.items.find((i) => i.id === selected) ?? state.items[0],
    pending = eligibleEquipmentSessions(data).filter(
      (s) => !state.loot.some((l) => l.sessionId === s.sessionId),
    );
  if (!state.started) return <Starter />;
  const equipped = !!item && Object.values(state.equipped).includes(item.id),
    reforging =
      !!item && state.pendingReforges.some((p) => p.itemId === item.id),
    t = item ? template(item) : null;
  async function claim() {
    const next = pending[0];
    if (!next) return;
    const result = await run({ action: 'loot', sessionId: next.sessionId });
    if (result)
      setReward(
        result.loot.find((l) => l.sessionId === next.sessionId) ?? null,
      );
  }
  return (
    <>
      <div className="rb-workshop-heading">
        <div>
          <span className="rb-eyebrow">企鹅的冒险工坊</span>
          <h1>每一件，都是成长的纪念。</h1>
        </div>
        <span className="rb-pill">
          <Layers3 size={14} /> {state.items.length} 件收藏
        </span>
      </div>
      <div className="rb-inventory-layout">
        <section className="rb-collection">
          <div className="rb-filter" aria-label="筛选装备">
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
            {state.items
              .filter(
                (i) => filter === '全部' || template(i).rarity !== 'common',
              )
              .map((i) => (
                <button
                  key={i.id}
                  className={
                    'rb-collectible rarity-' +
                    template(i).rarity +
                    (item?.id === i.id ? ' selected' : '')
                  }
                  aria-pressed={item?.id === i.id}
                  onClick={() => {
                    setSelected(i.id);
                    setConfirm(false);
                  }}
                >
                  <span className={'rb-rarity ' + template(i).rarity}>
                    {RARITY_NAMES[template(i).rarity]}
                  </span>
                  <ItemArt item={i} />
                  <b>{template(i).name}</b>
                  <small>{SLOT_NAMES[template(i).slot]}</small>
                  {Object.values(state.equipped).includes(i.id) && (
                    <span className="rb-equipped">
                      <Check size={13} /> 已装配
                    </span>
                  )}
                </button>
              ))}
          </div>
          {!state.items.length && (
            <p className="rb-inline-hint">
              完成学习后，领取下面的战利品获得装备。
            </p>
          )}
          <section className="rb-loot-inbox">
            <div>
              <PackageOpen size={22} />
              <h2>学习战利品</h2>
            </div>
            <p>
              {pending.length
                ? `${pending.length} 份已完成学习的奖励等待领取`
                : '认真完成一段学习，就有新的期待。'}
            </p>
            <button
              className={pending.length ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => (pending.length ? void claim() : navigate('plan'))}
            >
              {pending.length ? '领取一份战利品' : '去学习'}{' '}
              <ArrowRight size={16} />
            </button>
            <details>
              <summary>掉落规则与概率</summary>
              <p>
                每个学习日最多 3 份；每份至少有 3
                道有效作答，同一题每天只计一次。答错和不确定的认真尝试同样有价值，恢复生命练习不计入。
              </p>
              <p>
                普通 60% · 稀有 28% · 史诗 10% · 独特
                2%。重复装备转换为星墨，附魔书首次获得永久加入图鉴。
              </p>
            </details>
          </section>
          <section className="rb-builds">
            <h2>保存你的装备搭配</h2>
            <div className="rb-build-tabs">
              {([1, 2, 3] as const).map((id) => (
                <button
                  key={id}
                  aria-pressed={buildId === id}
                  onClick={() => {
                    setBuildId(id);
                    setBuildName(
                      state.builds.find((b) => b.id === id)?.name ?? '我的搭配',
                    );
                  }}
                >
                  {state.builds.find((b) => b.id === id)?.name ?? '搭配 ' + id}
                </button>
              ))}
            </div>
            <input
              aria-label="搭配名称"
              maxLength={30}
              value={buildName}
              onChange={(e) => setBuildName(e.target.value)}
            />
            <div>
              <button
                className="secondary"
                disabled={busy || !buildName.trim()}
                onClick={() =>
                  void run(
                    { action: 'save-build', buildId, name: buildName },
                    '当前搭配已保存',
                  )
                }
              >
                保存当前搭配
              </button>
              <button
                className="secondary"
                disabled={busy || !state.builds.some((b) => b.id === buildId)}
                onClick={() =>
                  void run({ action: 'load-build', buildId }, '装备搭配已切换')
                }
              >
                切换到此搭配
              </button>
            </div>
            <small>只切换装备，不改变学习计划或测评要求。</small>
          </section>
        </section>
        {item && t ? (
          <section className="rb-inventory-detail">
            <div className="rb-gear-podium">
              <ItemArt item={item} />
            </div>
            <span className={'rb-rarity ' + t.rarity}>
              {RARITY_NAMES[t.rarity]} · {SLOT_NAMES[t.slot]}
            </span>
            <h2>
              {t.name} +{item.level}
            </h2>
            <p>{t.description}</p>
            <Affixes values={item.affixes} />
            <div className="rb-equipped-books">
              {Object.entries(item.enchantments).map(([id, tier]) => (
                <span key={id}>
                  <Star size={13} />
                  {EQUIPMENT_BOOKS.find((b) => b.id === id)?.name} {roman[tier]}
                </span>
              ))}
            </div>
            <button
              className="primary rb-action"
              disabled={busy}
              onClick={() =>
                void run(
                  equipped
                    ? { action: 'unequip', slot: t.slot }
                    : { action: 'equip', itemId: item.id },
                  equipped ? '装备已卸下' : '装备已装配',
                )
              }
            >
              {equipped ? '卸下装备' : '装配这件装备'} <Check size={17} />
            </button>
            <div className="rb-item-services">
              <button
                className="secondary"
                onClick={() => navigate('forge', item.id)}
              >
                到铁匠铺
              </button>
              <button
                className="secondary"
                onClick={() => navigate('enchant', item.id)}
              >
                去附魔
              </button>
            </div>
            <div className="rb-memory">
              <BookOpen size={18} />
              <div>
                <b>
                  {item.memories.length
                    ? '一起走过的学习旅程'
                    : '故事，从下一次学习开始'}
                </b>
                <small>
                  {item.memories.at(-1)?.summary ??
                    '装备后完成有效学习，领取战利品时记录同行记忆。'}
                </small>
              </div>
            </div>
            {confirm ? (
              <div className="rb-dismantle-confirm">
                <p>分解后无法恢复这件装备，永久附魔图鉴会保留。</p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      {
                        action: 'dismantle',
                        itemId: item.id,
                        expectedVersion: item.version,
                      },
                      '装备已分解为材料',
                    ).then((r) => {
                      if (r) setConfirm(false);
                    })
                  }
                >
                  确认分解
                </button>
                <button
                  className="rb-text-button"
                  onClick={() => setConfirm(false)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="rb-text-button"
                disabled={busy || equipped || reforging}
                onClick={() => setConfirm(true)}
              >
                {equipped
                  ? '卸下后可分解'
                  : reforging
                    ? '请先处理重铸结果'
                    : '分解为锻造材料'}
              </button>
            )}
          </section>
        ) : (
          <section className="rb-inventory-detail">
            <Penguin action="thinking" />
            <p>下一件装备，正在你的学习旅程里。</p>
          </section>
        )}
      </div>
      {reward && (
        <Modal title="学习战利品" onClose={() => setReward(null)}>
          <span className="rb-eyebrow">认真学习，值得期待</span>
          <div className="rb-reward-art">
            <Sprite
              index={itemIndex(state.items.find((i) => i.id === reward.itemId))}
              label={
                EQUIPMENT_TEMPLATES.find((t) => t.id === reward.templateId)
                  ?.name
              }
            />
          </div>
          <h3>
            {EQUIPMENT_TEMPLATES.find((t) => t.id === reward.templateId)?.name}
          </h3>
          <p>{reward.itemId ? '新装备已加入装备库' : '重复装备已转换为星墨'}</p>
          <div className="rb-reward-materials">
            <Cost value={reward.materials} />
          </div>
          <p>
            {EQUIPMENT_BOOKS.find((b) => b.id === reward.bookId)?.name} ·
            图鉴已更新
          </p>
          <button
            className="primary"
            onClick={() => {
              if (reward.itemId) setSelected(reward.itemId);
              setReward(null);
            }}
          >
            收下奖励 <Check size={17} />
          </button>
        </Modal>
      )}
    </>
  );
}

export default function AlphaExperience({
  page,
  selection = 'all',
}: {
  page: string;
  selection?: string;
}) {
  const { data, navigate, refresh, notify } = useReview();
  const projected = useMemo(
    () => equipmentState(data, learningGame(data).accepted),
    [data],
  );
  const [state, setState] = useState(projected),
    [busy, setBusy] = useState(false);
  const lock = useRef(false),
    origin = useRef(currentNamespace());
  useEffect(() => setState(projected), [projected]);
  async function run(command: EquipmentCommand, message?: string) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    try {
      const result = await equipmentCommand(command, origin.current);
      if (currentNamespace() !== origin.current) return null;
      setState(result.state);
      await refresh();
      if (message) notify(message);
      return result.state;
    } catch (e) {
      notify(e instanceof Error ? e.message : '装备操作未能保存，请重试');
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const active =
    page === 'enchant'
      ? 'enchant'
      : page === 'equipment'
        ? 'equipment'
        : 'forge';
  return (
    <GearContext.Provider value={{ state, busy, run }}>
      <section className={'rb-alpha-workshop rb-screen-' + active}>
        <nav
          className="alpha-secondary alpha-workshop-tabs"
          aria-label="工坊功能"
        >
          {[
            ['forge', '铁匠铺'],
            ['enchant', '附魔师与图鉴'],
            ['equipment', '装备与搭配'],
            ['shop', '材料与商店'],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-current={active === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              {label}
            </button>
          ))}
          <div className="rb-material-wallet" aria-label="锻造材料">
            <span>
              <Gem size={15} /> {state.materials.ore} <small>矿晶</small>
            </span>
            <span>
              {state.materials.ink} <small>星墨</small>
            </span>
            <span>
              {state.materials.thread} <small>梦线</small>
            </span>
          </div>
        </nav>
        {active === 'equipment' ? (
          <Inventory />
        ) : (
          <Workshop
            key={active + selection}
            kind={active === 'enchant' ? 'enchant' : 'forge'}
            initialItem={selection}
          />
        )}
      </section>
    </GearContext.Provider>
  );
}
