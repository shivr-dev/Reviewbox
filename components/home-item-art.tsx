import { assetPath } from '@/lib/runtime';

/** Measured alpha bounds of the original RGBA atlas; keep the source unmodified. */
export const HOME_ITEM_ATLAS = {
  src: 'home-item-atlas-v1.png',
  width: 1774,
  height: 887,
  cells: [
    { x: 89, y: 81, width: 296, height: 341, name: '连胜冻结' },
    { x: 524, y: 73, width: 301, height: 349, name: '霜晶附魔' },
    { x: 952, y: 71, width: 305, height: 363, name: '永冬附魔' },
    { x: 1372, y: 115, width: 356, height: 283, name: '宝箱升级券' },
    { x: 52, y: 509, width: 380, height: 295, name: '星辉附魔券' },
    { x: 489, y: 505, width: 377, height: 297, name: '极光附魔券' },
    { x: 923, y: 491, width: 391, height: 325, name: '星星包装纸' },
    { x: 1369, y: 477, width: 343, height: 335, name: '访客邀请函' },
  ],
} as const;

export function homeItemAtlasIndex(kind: string, tier = 0) {
  const level = Math.min(2, Math.max(0, Math.trunc(tier) || 0));
  if (kind === 'freeze') return level;
  if (kind === 'ticket') return [3, 4, 5][level];
  if (kind === 'paper') return 6;
  if (kind === 'invitation') return 7;
  return null;
}

function RecordArt({ kind }: { kind: string }) {
  const color = kind === 'record-night' ? '#b5a2d9' : kind === 'record-rain' ? '#9bced2' : '#f4d27b';
  return (
    <svg className="home-item-illustration" viewBox="0 0 140 140" aria-hidden="true">
      <defs>
        <radialGradient id={`record-vinyl-${kind}`}>
          <stop stopColor="#45434c" />
          <stop offset=".72" stopColor="#292a31" />
          <stop offset="1" stopColor="#17191f" />
        </radialGradient>
      </defs>
      <g transform="rotate(-12 70 70)" strokeLinecap="round">
        <rect x="13" y="22" width="97" height="97" rx="10" fill="#f3e7ca" stroke="#8a7151" strokeWidth="2.4" />
        <rect x="19" y="29" width="84" height="83" rx="6" fill={color} />
        <path d="M25 89q22-23 43-12t30-18v45H25Z" fill="#fff9e5" opacity=".55" />
        <circle cx="87" cy="49" r="12" fill="#fff8db" opacity=".8" />
        <path d="m29 45 5-8 5 8-5 8Z" fill="#fff7d1" />
      </g>
      <g transform="translate(15 4)">
        <circle cx="72" cy="70" r="48" fill={`url(#record-vinyl-${kind})`} stroke="#414047" strokeWidth="2.5" />
        {[42, 37, 31, 25].map((radius) => <circle key={radius} cx="72" cy="70" r={radius} stroke="#73727a" strokeWidth=".75" fill="none" opacity=".52" />)}
        <path d="M44 40q11-9 26-10m31 71q-10 10-25 11" fill="none" stroke="#f8f0d8" strokeWidth="3" opacity=".45" />
        <circle cx="72" cy="70" r="18" fill={color} stroke="#d4b982" strokeWidth="1.5" />
        <path d="m72 56 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#fff4c5" />
        <circle cx="72" cy="70" r="3.5" fill="#2a2a32" />
      </g>
    </svg>
  );
}

/** Same public props as the previous ItemArt, usable inside inventory and rewards. */
export function ItemArt({ kind, tier = 0 }: { kind: string; tier?: number }) {
  const index = homeItemAtlasIndex(kind, tier);
  const cell = index === null ? null : HOME_ITEM_ATLAS.cells[index];
  const margin = 16;
  return (
    <span className={`adventure-item-art home-item-art ${tier > 0 ? 'is-enchanted' : ''} tier-${tier}`} aria-hidden="true">
      {cell ? (
        <svg
          className="home-item-illustration"
          viewBox={`${cell.x - margin} ${cell.y - margin} ${cell.width + margin * 2} ${cell.height + margin * 2}`}
          preserveAspectRatio="xMidYMid meet"
          focusable="false"
          data-atlas-cell={index}
        >
          <image href={assetPath(HOME_ITEM_ATLAS.src)} width={HOME_ITEM_ATLAS.width} height={HOME_ITEM_ATLAS.height} />
        </svg>
      ) : <RecordArt kind={kind} />}
      {tier > 0 && <span className="home-item-spark home-item-spark-one" />}
      {tier > 1 && <span className="home-item-spark home-item-spark-two" />}
    </span>
  );
}
