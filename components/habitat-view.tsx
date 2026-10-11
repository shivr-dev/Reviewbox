'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Gem,
  Armchair,
  Music2,
  Gift,
  Sparkles,
  ShoppingBag,
  RotateCw,
  ArrowUp,
  Package,
  Check,
  Pause,
  Play,
  Mail,
  X,
} from 'lucide-react';
import { useReview } from './review-context';
import { learningGame } from '@/lib/learning-game';
import {
  FURNITURE,
  HOME_SHOP,
  STARTER_LAYOUT,
  type HomePlacement,
} from '@/lib/home-catalog';
import { homePath, validLayout, upgradeCost } from '@/lib/adventure';
import { currentNamespace } from '@/lib/store';
import { homeCommand, saveHome, playRecord, RECORDS } from '@/lib/home-client';
import HomeScene from './home-scene';
import { FurniturePreview, ItemArt } from './home-art';
import { WorkshopPanel, GiftsPanel } from './adventure-panels';

export default function HabitatView() {
  const { data, navigate, refresh, notify } = useReview(),
    game = learningGame(data);
  const [layout, setLayout] = useState<HomePlacement[]>(() => {
    const saved = data.jobs?.find(
      (j) => j.kind === 'home-layout' && j.version === 1,
    )?.placements;
    return Array.isArray(saved) && validLayout(saved, game.adventure.levels)
      ? saved
      : STARTER_LAYOUT.map((p) => ({ ...p }));
  });
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [pendingItem, setPendingItem] = useState<string | null>(null),
    [tab, setTab] = useState('furniture'),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [penguin, setPenguin] = useState({ x: 6, y: 5 }),
    [pose, setPose] = useState('idle'),
    [walking, setWalking] = useState(false),
    [active, setActive] = useState<string | null>(null),
    [lit, setLit] = useState(false),
    [record, setRecord] = useState('record-meadow'),
    [music, setMusic] = useState(false),
    [visitor, setVisitor] = useState(false),
    [now, setNow] = useState(Date.now());
  const steps = useRef<ReturnType<typeof setTimeout>[]>([]),
    moveToken = useRef(0),
    visitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const item = layout.find((p) => p.id === selected),
    catalog = HOME_SHOP.find((i) => i.id === item?.item),
    level = item ? game.adventure.levels[item.item] : 0;
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearInterval(clock);
      steps.current.forEach(clearTimeout);
      clearTimeout(visitTimer.current);
      moveToken.current++;
    };
  }, []);
  useEffect(() => {
    const saved = data.jobs?.find((j) => j.kind === 'home-layout')?.placements;
    if (
      !dirty &&
      !editing &&
      Array.isArray(saved) &&
      validLayout(saved, game.adventure.levels)
    )
      setLayout(saved);
  }, [data.jobs, dirty, editing]);
  useEffect(() => {
    if (!music) return;
    let stop: () => void;
    try {
      stop = playRecord(record);
    } catch {
      setMusic(false);
      notify('浏览器暂不支持音频播放');
      return;
    }
    const hide = () => {
      if (document.hidden) setMusic(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', hide);
    };
  }, [music, record]);
  function stopWalking() {
    moveToken.current++;
    steps.current.forEach(clearTimeout);
    steps.current = [];
    setWalking(false);
  }
  function interact(id: string) {
    setSelected(id);
    if (editing) return;
    const target = layout.find((p) => p.id === id);
    if (!target) return;
    stopWalking();
    const path = homePath(penguin, target, layout);
    if (!path.length) {
      notify('企鹅暂时走不过去，请在布置模式留出通道');
      return;
    }
    setPose('idle');
    setWalking(true);
    setActive(null);
    const token = moveToken.current;
    path.forEach((point, i) =>
      steps.current.push(
        setTimeout(() => {
          if (token !== moveToken.current) return;
          setPenguin(point);
          if (i === path.length - 1) {
            setWalking(false);
            setPose(FURNITURE[target.item].activity);
            setActive(id);
            if (target.item === 'furniture-lamp') setLit((v) => !v);
            if (target.item === 'furniture-turntable') setMusic((v) => !v);
          }
        }, i * 260),
      ),
    );
  }
  function change(next: HomePlacement[]) {
    if (!validLayout(next, game.adventure.levels)) {
      notify('这个位置放不下，请避免家具重叠并保留门口通道');
      return false;
    }
    stopWalking();
    setPenguin({ x: 6, y: 5 });
    setPose('idle');
    setLayout(next);
    setDirty(true);
    return true;
  }
  function place(x: number, y: number) {
    if (!editing) return;
    const target = pendingItem ?? item?.item;
    if (!target) {
      notify('先从下方选择一件家具');
      return;
    }
    const nextItem: HomePlacement =
      item && !pendingItem
        ? { ...item, x, y }
        : { id: 'placed:' + target, item: target, x, y, rotation: 0 };
    const next = [...layout.filter((p) => p.item !== target), nextItem];
    if (change(next)) {
      setSelected(nextItem.id);
      setPendingItem(null);
    }
  }
  async function save() {
    if (busy) return;
    const ns = currentNamespace();
    setBusy(true);
    try {
      await saveHome(layout, ns);
      if (ns === currentNamespace()) {
        setDirty(false);
        setEditing(false);
        setPendingItem(null);
        await refresh();
        notify('小屋布置已保存');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '布置未能保存');
    } finally {
      setBusy(false);
    }
  }
  async function upgrade() {
    if (!item || busy) return;
    const ns = currentNamespace();
    setBusy(true);
    try {
      await homeCommand({ action: 'upgrade', item: item.item }, ns);
      if (ns === currentNamespace()) {
        await refresh();
        notify('家具升级完成，外观与细节已焕新');
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '升级未完成');
    } finally {
      setBusy(false);
    }
  }
  async function invite() {
    if (busy || visitor) return;
    const ns = currentNamespace();
    setBusy(true);
    try {
      await homeCommand({ action: 'visit' }, ns);
      if (ns === currentNamespace()) {
        await refresh();
        setVisitor(true);
        setPose('dance');
        setTab('furniture');
        visitTimer.current = setTimeout(() => {
          setVisitor(false);
          setPose('welcome');
          notify('小猫留下了纪念摆件，可以在家具库存中摆放');
        }, 14000);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '邀请未完成');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="habitat-page">
      <header className="habitat-heading">
        <div>
          <span className="home-eyebrow">A LITTLE HOME, ALL YOUR OWN</span>
          <h1>企鹅的小小家园</h1>
          <p>把认真学习积攒的点滴，布置成喜欢的生活。</p>
        </div>
        <div className="home-wallet">
          <Gem size={20} />
          <strong>{game.coins.toLocaleString()}</strong>
          <span>点数</span>
        </div>
      </header>
      <div className="habitat-stage-grid">
        <section className="habitat-room">
          <div className="room-toolbar">
            <span>
              <i />{' '}
              {visitor
                ? '小猫来做客了'
                : walking
                  ? '企鹅正在走过去'
                  : pose === 'idle'
                    ? '欢迎回家'
                    : item
                      ? FURNITURE[item.item].verb
                      : '小屋时光'}
            </span>
            <button
              className={editing ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={() => {
                if (editing) void save();
                else {
                  stopWalking();
                  setEditing(true);
                  setTab('furniture');
                }
              }}
            >
              {editing ? (
                <>
                  <Check size={16} />
                  保存布置
                </>
              ) : (
                <>
                  <Armchair size={16} />
                  布置小屋
                </>
              )}
            </button>
          </div>
          <HomeScene
            layout={layout}
            levels={game.adventure.levels}
            selected={selected}
            editing={editing}
            onSelect={interact}
            onCell={place}
            penguin={penguin}
            pose={pose}
            walking={walking}
            active={active}
            lit={lit}
            music={music}
            visitor={visitor}
            skin={game.skin}
          />
          {editing && (
            <div className="room-edit-hint">
              {pendingItem
                ? `已选择 ${HOME_SHOP.find((p) => p.id === pendingItem)?.name}，点击地板摆放`
                : item
                  ? '点击地板移动所选家具，或使用右侧旋转与收回'
                  : '选择下方家具，再点击地板格'}
              {dirty && <b>尚未保存</b>}
            </div>
          )}
        </section>
        <aside className="habitat-sidebar">
          <section className="home-selection-card">
            {item ? (
              <>
                <FurniturePreview item={item.item} level={level} />
                <span className="item-tier">家具等级 {level} / 3</span>
                <h2>{catalog?.name}</h2>
                <p>{catalog?.description}</p>
                {editing ? (
                  <div className="home-edit-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        change(
                          layout.map((p) =>
                            p.id === item.id
                              ? { ...p, rotation: p.rotation ? 0 : 1 }
                              : p,
                          ),
                        )
                      }
                    >
                      <RotateCw size={16} />
                      旋转
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        if (change(layout.filter((p) => p.id !== item.id)))
                          setSelected(null);
                      }}
                    >
                      <Package size={16} />
                      收回
                    </button>
                  </div>
                ) : (
                  <button
                    className="primary"
                    onClick={() => interact(item.id)}
                    disabled={walking}
                  >
                    {FURNITURE[item.item].verb}
                  </button>
                )}
                {item.item !== 'furniture-cat' && (
                  <button
                    className="secondary home-upgrade-button"
                    disabled={
                      busy ||
                      level >= 3 ||
                      game.coins < upgradeCost(item.item, level)
                    }
                    onClick={() => void upgrade()}
                  >
                    <ArrowUp size={16} />
                    {level >= 3
                      ? '已达最高等级'
                      : `升级 · ${upgradeCost(item.item, level)} 点数`}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="welcome-home-drawing">
                  <FurniturePreview item="furniture-lamp" level={2} />
                </div>
                <h2>属于你的温暖角落</h2>
                <p>
                  阅读桌、小椅和盆栽已免费入住。点击家具，让企鹅开始自己的小屋生活。
                </p>
                <button className="secondary" onClick={() => navigate('shop')}>
                  <ShoppingBag size={16} />
                  挑选新家具
                </button>
              </>
            )}
          </section>
          <section className="home-visitor-card">
            <ItemArt kind="invitation" />
            <div>
              <h3>今天，邀请一位朋友</h3>
              <p>小猫会来做客，并留下纪念摆件。</p>
              <small>邀请函库存 {game.adventure.invitations}</small>
            </div>
            <button
              className="secondary"
              disabled={busy || visitor || !game.adventure.invitations}
              onClick={() => void invite()}
            >
              <Mail size={16} />
              {visitor ? '访客正在做客' : '邀请小猫'}
            </button>
          </section>
        </aside>
      </div>
      <section className="home-living-panel">
        <div className="home-tabs" role="tablist" aria-label="家园功能">
          {[
            ['furniture', '家具收藏', Armchair],
            ['workshop', '附魔工坊', Sparkles],
            ['gifts', '礼物架', Gift],
            ['records', '唱片角', Music2],
          ].map(([id, label, Icon]) => (
            <button
              key={String(id)}
              className={tab === id ? 'active' : ''}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(String(id))}
            >
              {typeof Icon !== 'string' && <Icon size={17} />} {String(label)}
            </button>
          ))}
          <button className="home-shop-link" onClick={() => navigate('shop')}>
            去商店 <ShoppingBag size={16} />
          </button>
        </div>
        {tab === 'furniture' && (
          <>
            <div className="home-section-heading">
              <div>
                <h2>把喜欢的好物，摆进家里</h2>
                <p>
                  {editing
                    ? '选择家具后点击地板格；家具不会重叠，旋转后也会检查空间。'
                    : '开启布置模式，可以移动、旋转或收回家具。'}
                </p>
              </div>
              {editing && (
                <button
                  className="quiet"
                  onClick={() => {
                    const saved = data.jobs?.find(
                      (j) => j.kind === 'home-layout',
                    )?.placements;
                    setLayout(saved ?? STARTER_LAYOUT.map((p) => ({ ...p })));
                    setDirty(false);
                    setEditing(false);
                    setPendingItem(null);
                    setSelected(null);
                  }}
                >
                  取消修改 <X size={15} />
                </button>
              )}
            </div>
            <div className="home-furniture-collection">
              {Object.entries(game.adventure.levels).map(([id, l]) => {
                const placed = layout.find((p) => p.item === id),
                  product = HOME_SHOP.find((p) => p.id === id);
                return (
                  <button
                    className={
                      'furniture-collection-card ' +
                      (pendingItem === id || item?.item === id
                        ? 'selected'
                        : '')
                    }
                    key={id}
                    onClick={() => {
                      if (!editing) {
                        if (placed) interact(placed.id);
                        else {
                          setEditing(true);
                          setPendingItem(id);
                          setSelected(null);
                        }
                      } else if (placed) {
                        setSelected(placed.id);
                        setPendingItem(null);
                      } else {
                        setPendingItem(id);
                        setSelected(null);
                      }
                    }}
                  >
                    <FurniturePreview item={id} level={l} />
                    <strong>{product?.name}</strong>
                    <small>
                      Lv. {l} · {placed ? '已摆放' : '待摆放'}
                    </small>
                  </button>
                );
              })}
              <button
                className="furniture-collection-card add-furniture"
                onClick={() => navigate('shop')}
              >
                <ShoppingBag size={28} />
                <strong>添置新家具</strong>
                <small>用学习点数兑换</small>
              </button>
            </div>
          </>
        )}
        {tab === 'workshop' && <WorkshopPanel />}
        {tab === 'gifts' && <GiftsPanel now={now} />}
        {tab === 'records' && (
          <div className="record-corner">
            <div className="home-section-heading">
              <div>
                <h2>唱针落下，生活慢一点</h2>
                <p>原创本地轻音乐，无需联网。需要将唱片机摆进小屋。</p>
              </div>
              {music && (
                <button className="secondary" onClick={() => setMusic(false)}>
                  <Pause size={16} />
                  暂停播放
                </button>
              )}
            </div>
            <div className="record-grid">
              {RECORDS.map((r) => {
                const owned = game.adventure.records.has(r.id);
                return (
                  <article
                    className={
                      'record-card ' +
                      (music && record === r.id ? 'playing' : '')
                    }
                    key={r.id}
                  >
                    <ItemArt kind={r.id} />
                    <h3>{r.name}</h3>
                    <small>{owned ? '已收藏' : '商店可兑换'}</small>
                    <button
                      className="secondary"
                      disabled={
                        owned &&
                        !layout.some((p) => p.item === 'furniture-turntable')
                      }
                      onClick={() => {
                        if (!owned) {
                          navigate('shop');
                          return;
                        }
                        setRecord(r.id);
                        const table = layout.find(
                          (p) => p.item === 'furniture-turntable',
                        );
                        if (table) {
                          setActive(table.id);
                          setPose('dance');
                          setMusic(true);
                        }
                      }}
                    >
                      {owned ? (
                        <>
                          <Play size={16} />
                          播放
                        </>
                      ) : (
                        '前往商店'
                      )}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
