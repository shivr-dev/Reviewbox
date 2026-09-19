'use client';
import { useState } from 'react';
import { ELEMENTS } from '@/lib/elements';
export default function PeriodicTable() {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState(ELEMENTS[0]);
  const categories = [...new Set(ELEMENTS.map((e) => e.category))];
  return (
    <section className="panel periodic-panel">
      <p className="eyebrow">PERIODIC TABLE</p>
      <div className="section-head">
        <div>
          <h2>元素周期表</h2>
          <p className="muted">118 种元素 · 点击查看名称、原子序数及周期与族</p>
        </div>
        <input
          aria-label="搜索元素"
          placeholder="名称、符号或原子序数"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="periodic-scroll">
        <div className="periodic-grid">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              className="periodic-group"
              key={'g' + i}
              style={{ gridColumn: i + 1, gridRow: 1 }}
            >
              {i + 1}
            </span>
          ))}
          {ELEMENTS.map((e) => {
            const match =
              !search ||
              [e.name, e.symbol, e.english, String(e.number)].some((v) =>
                v.toLowerCase().includes(search.toLowerCase()),
              );
            return (
              <button
                key={e.number}
                onClick={() => setSelected(e)}
                title={e.english}
                aria-label={`${e.number} ${e.symbol} ${e.name}`}
                aria-pressed={selected.number === e.number}
                className={
                  'element-cell category-' +
                  categories.indexOf(e.category) +
                  (match ? '' : ' dimmed') +
                  (selected.number === e.number ? ' selected' : '')
                }
                style={{ gridRow: e.row + 1, gridColumn: e.column }}
              >
                <small>{e.number}</small>
                <b>{e.symbol}</b>
                <span>{e.name}</span>
              </button>
            );
          })}
          <span
            className="element-placeholder"
            style={{ gridRow: 7, gridColumn: 3 }}
          >
            57–71
            <br />
            镧系
          </span>
          <span
            className="element-placeholder"
            style={{ gridRow: 8, gridColumn: 3 }}
          >
            89–103
            <br />
            锕系
          </span>
        </div>
      </div>
      <div className="element-detail" aria-live="polite">
        <strong>{selected.symbol}</strong>
        <div>
          <h3>
            {selected.name} · {selected.english}
          </h3>
          <p>
            原子序数 {selected.number} · 第 {selected.period} 周期
            {selected.group ? ' · 第 ' + selected.group + ' 族' : ''} ·{' '}
            {selected.category}
          </p>
          <p className="muted">
            原子序数等于原子核中的质子数；中性原子的电子数为 {selected.number}。
          </p>
        </div>
      </div>
      <div className="periodic-legend">
        {categories.map((c, i) => (
          <span key={c}>
            <i className={'category-' + i} />
            {c}
          </span>
        ))}
      </div>
      <p className="muted">
        按 18
        族排列，镧系与锕系单独展示。分类用于学习参考；部分超重元素的化学性质仍在研究中。
        <a
          href="https://iupac.org/what-we-do/periodic-table-of-elements/"
          target="_blank"
          rel="noreferrer"
        >
          IUPAC 元素资料
        </a>
      </p>
    </section>
  );
}
