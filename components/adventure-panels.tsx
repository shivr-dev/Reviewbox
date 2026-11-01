'use client';
import {tr} from '@/lib/i18n';
import { useEffect, useState } from 'react';
import {
  Gem,
  Check,
  ArrowUp,
  Sparkles,
  Gift,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useReview } from './review-context';
import { learningGame, type GameItem } from '@/lib/learning-game';
import { HOME_SHOP, CHEST_TIERS, FREEZE_TIERS } from '@/lib/home-catalog';
import { homeCommand } from '@/lib/home-client';
import { buyGameItem } from '@/lib/game-client';
import { currentNamespace } from '@/lib/store';
import type { GiftContent } from '@/lib/adventure';
import { ItemArt } from './home-item-art';

export function AdventureShop() {
  const { data, refresh, notify, navigate } = useReview(),
    game = learningGame(data),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState('');
  async function buy(id: GameItem) {
    if (busy) return;
    const ns = currentNamespace();
    setBusy(id);
    try {
      await buyGameItem(id, ns);
      if (ns === currentNamespace()) {
        await refresh();
        notify(tr("workshop:已放入道具库存"));
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '兑换未完成');
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="adventure-shop">
      <div className="home-section-heading">
        <div>
          <span className="home-eyebrow">LITTLE THINGS, BIG JOY</span>
          <h2>{tr("workshop:冒险道具")}</h2>
        </div>

      </div>
      <div className="home-tabs" role="tablist" aria-label={tr("workshop:道具分类")}>
        {[
          ['all', tr("workshop:全部")],

          ['tools', tr("workshop:消耗道具")],

        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="home-product-grid">
        {HOME_SHOP.filter(
          (p) =>
            ['ticket','paper'].includes(p.type) &&
            (filter === 'all' ||
              p.type === filter ||
              (filter === 'tools' &&
                ['ticket', 'paper', 'invitation'].includes(p.type))),
        ).map((item) => {
          const owned =
            item.type === 'furniture'
              ? !!game.adventure.levels[item.id]
              : item.type === 'record'
                ? game.adventure.records.has(item.id)
                : false;
          const count =
            item.type === 'ticket'
              ? game.adventure.tickets.reduce((a, b) => a + b, 0)
              : item.type === 'paper'
                ? game.adventure.papers
                : item.type === 'invitation'
                  ? game.adventure.invitations
                  : null;
          return (
            <article className="home-product" key={item.id}>
              <div className={'home-product-art ' + item.type}>
                {(
                  <ItemArt
                    kind={item.type === 'record' ? item.id : item.type}
                  />
                )}
              </div>
              <div className="home-product-copy">
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                {count !== null && <small>{tr("workshop:库存")}{count}</small>}
              </div>
              <button
                className={owned ? 'secondary' : 'primary'}
                disabled={owned || !!busy || game.coins < item.cost}
                onClick={() => void buy(item.id)}
              >
                {owned ? (
                  <>
                    <Check size={16} />{tr("workshop:已拥有")}</>
                ) : (
                  <>
                    <Gem size={15} />
                    {busy === item.id ? tr("workshop:兑换中") : item.cost}
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function WorkshopPanel() {
  const { data, refresh, notify } = useReview(),
    game = learningGame(data),
    [busy, setBusy] = useState('');
  async function enchant(
    action: 'enchant-freeze' | 'enchant-ticket',
    tier: number,
  ) {
    if (busy) return;
    const ns = currentNamespace();
    setBusy(action + tier);
    try {
      await homeCommand({ action, tier }, ns);
      if (ns === currentNamespace()) {
        await refresh();
        notify(tr("workshop:附魔成功，升级后的道具已进入库存"));
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '附魔未完成');
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="workshop-panel">
      <div className="home-section-heading">
        <div>
          <span className="home-eyebrow">ENCHANTMENT WORKSHOP</span>
          <h2>{tr("workshop:实质升级，每次都成功")}</h2>
          <p>{tr("workshop:附魔消耗原道具和点数，保留在本账户库存。")}</p>
        </div>
        <Sparkles size={30} />
      </div>
      {[
        {
          title: tr("common:连胜冻结"),
          tiers: FREEZE_TIERS,
          pool: game.adventure.freezeTiers,
          kind: 'freeze',
          action: 'enchant-freeze' as const,
        },
        {
          title: tr("common:宝箱升级券"),
          tiers: CHEST_TIERS,
          pool: game.adventure.tickets,
          kind: 'ticket',
          action: 'enchant-ticket' as const,
        },
      ].map((group) => (
        <section className="enchantment-track" key={group.kind}>
          <h3>{group.title}</h3>
          <div className="enchantment-grid">
            {group.tiers.map((tier, i) => (
              <article className={'enchantment-card tier-' + i} key={i}>
                <ItemArt kind={group.kind} tier={i} />
                <span className="item-tier">
                  {i === 0 ? tr("workshop:基础") : tr("common:附魔 {{v0}} 级",{v0:(i)})}
                </span>
                <h4>{tier.name}</h4>
                <p>
                  {'days' in tier
                    ? tr("common:保护连续漏学 {{v0}} 天",{v0:(tier.days)})
                    : tr("common:点数 {{v0}}–{{v1}}（90%）",{v0:(tier.min),v1:(tier.max)})}
                  <br />
                  {group.kind === 'ticket'
                    ? tr("workshop:连胜冻结 ×1（10%）")
                    : tr("workshop:恢复学习后，本次保护结束")}
                </p>
                <strong>{tr("workshop:拥有")}{group.pool[i]}{tr("workshop:枚")}</strong>
                {i < 2 && (
                  <button
                    className="primary"
                    disabled={
                      !!busy ||
                      !group.pool[i] ||
                      game.coins < group.tiers[i + 1].cost
                    }
                    onClick={() => void enchant(group.action, i)}
                  >
                    <ArrowUp size={16} />{tr("workshop:附魔 ·")}{group.tiers[i + 1].cost}{tr("workshop:点数")}</button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="home-rule-note">{tr("workshop:冻结优先使用普通库存，再使用附魔库存。宝箱优先使用最高等级升级券，首次点击消耗；概率不因附魔改变。包装中的道具暂时不能使用。")}</p>
    </div>
  );
}

export function GiftsPanel({ now = Date.now() }: { now?: number }) {
  const { data, refresh, notify } = useReview(),
    game = learningGame(data, now),
    [busy, setBusy] = useState(false),
    [resource, setResource] = useState('coins'),
    [amount, setAmount] = useState(50),
    [title, setTitle] = useState('给未来的自己');
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const choices = [
    { id: 'coins', name: '自己的点数', count: game.coins },
    ...game.adventure.freezeTiers.map((count, tier) => ({
      id: 'freeze:' + tier,
      name: FREEZE_TIERS[tier].name,
      count,
    })),
    ...game.adventure.tickets.map((count, tier) => ({
      id: 'ticket:' + tier,
      name: CHEST_TIERS[tier].name,
      count,
    })),
  ].filter((c) => c.id === 'coins' || c.count > 0);
  const availableResource=choices.some(c=>c.id===resource);
  useEffect(()=>{if(!availableResource)setResource('coins');},[availableResource]);
  async function submit(target?: string) {
    if (busy) return;
    const ns = currentNamespace();
    setBusy(true);
    try {
      if (target) await homeCommand({ action: 'open-gift', target }, ns);
      else {
        const [kind, tier] = resource.split(':');
        const gift: GiftContent = {
          resource: kind as GiftContent['resource'],
          tier: Number(tier ?? 0),
          amount: kind === 'coins' ? amount : 1,
        };
        await homeCommand(
          {
            action: 'wrap',
            gift,
            unlockAt: new Date(date).toISOString(),
            title,
          },
          ns,
        );
      }
      if (ns === currentNamespace()) {
        await refresh();
        notify(
          target
            ? '礼物已打开，奖励已回到库存'
            : '礼物已包装好，等待约定的日期',
        );
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : '礼物未能保存');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gifts-panel">
      <div className="home-section-heading">
        <div>
          <span className="home-eyebrow">A PRESENT FOR FUTURE YOU</span>
          <h2>{tr("workshop:给未来的自己，一份期待")}</h2>
          <p>{tr("workshop:封存的是你已经拥有的奖励，不额外生成点数。")}</p>
        </div>
        <Gift size={32} />
      </div>
      <form
        className="gift-wrap-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="gift-wrap-art">
          <ItemArt kind="paper" />
        </div>
        <div className="gift-wrap-fields">
          <label>{tr("workshop:礼物名称")}<input
              maxLength={40}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <div className="gift-form-row">
            <label>{tr("workshop:封存奖励")}<select
                value={resource}
                onChange={(e) => setResource(e.target.value)}
              >
                {choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.count}
                  </option>
                ))}
              </select>
            </label>
            {resource === 'coins' && (
              <label>{tr("workshop:点数")}<select
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                >
                  {[50, 100, 200].map((n) => (
                    <option key={n} value={n}>
                      {n}{tr("workshop:点数")}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <label>{tr("workshop:可以拆开的时间（本地时间）")}<input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <button className="primary" disabled={busy || !game.adventure.papers || !availableResource || (resource==='coins'&&game.coins<amount)}>{tr("workshop:包装礼物 · 消耗包装纸 ×1")}</button>
          <small>{tr("workshop:包装纸库存")}{game.adventure.papers}{tr("workshop:· 最长可封存 90 天")}</small>
        </div>
      </form>
      <div className="gift-shelf">
        {game.adventure.gifts.length === 0 ? (
          <div className="home-gift-empty">
            <Gift />
            <p>{tr("workshop:第一份礼物，留给未来某个值得期待的日子。")}</p>
          </div>
        ) : (
          game.adventure.gifts.map((g) => {
            const ready = Date.parse(g.unlockAt) <= now;
            return (
              <article
                key={g.id}
                className={'wrapped-present ' + (g.opened ? 'opened' : '')}
              >
                <ItemArt kind="paper" />
                <div>
                  <h3>{g.title}</h3>
                  <p>
                    {g.gift.resource === 'coins'
                      ? tr("common:{{v0}} 点数",{v0:(g.gift.amount)})
                      : g.gift.resource === 'freeze'
                        ? FREEZE_TIERS[g.gift.tier].name
                        : CHEST_TIERS[g.gift.tier].name}
                  </p>
                  <small>
                    <Clock size={13} />
                    {new Date(g.unlockAt).toLocaleString('zh-CN')}
                  </small>
                </div>
                <button
                  className={ready ? 'primary' : 'secondary'}
                  disabled={busy || !ready || g.opened}
                  onClick={() => void submit(g.id)}
                >
                  {g.opened ? tr("workshop:已取回") : ready ? tr("common:拆开礼物") : tr("common:等待开启")}
                </button>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
