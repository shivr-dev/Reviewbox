'use client';
import { iso, HOME_SHOP, furnitureCenter, type HomePlacement } from '@/lib/home-catalog';
import { FurnitureArt, VisitorCat } from './home-art';
import HomeCompanion from './home-companion';
export default function HomeScene({
  layout,
  levels,
  selected,
  editing,
  onSelect,
  onCell,
  penguin,
  pose,
  walking,
  active,
  lit,
  music,
  visitor,
  skin,
}: {
  layout: HomePlacement[];
  levels: Record<string, number>;
  selected: string | null;
  editing: boolean;
  onSelect: (id: string) => void;
  onCell: (x: number, y: number) => void;
  penguin: { x: number; y: number };
  pose: string;
  walking: boolean;
  active: string | null;
  lit: boolean;
  music: boolean;
  visitor: boolean;
  skin: string;
}) {
  const p = iso(penguin.x + 0.5, penguin.y + 0.5),
    depth = penguin.x + penguin.y + 1;
  const furniture = layout
    .filter((i) => i.item !== 'furniture-rug')
    .sort((a, b) => furnitureCenter(a).depth - furnitureCenter(b).depth);
  function drawItem(item: HomePlacement) {
    const centre = furnitureCenter(item), at = iso(centre.x, centre.y);
    return (
      <g
        key={item.id}
        transform={`translate(${at.x} ${at.y})`}
        className={'home-furniture ' + (selected === item.id ? 'selected' : '')}
        role="button"
        tabIndex={0}
        aria-label={`选择${HOME_SHOP.find((p) => p.id === item.item)?.name ?? '家具'}`}
        onClick={() => onSelect(item.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item.id);
          }
        }}
      >
        <ellipse
          className="furniture-selection"
          cy="15"
          rx="55"
          ry="26"
          fill="none"
          stroke="#e8b041"
          strokeWidth="3"
          strokeDasharray="5 4"
        />
        <g transform={item.rotation ? 'scale(-1 1)' : ''}>
          <FurnitureArt
            item={item.item}
            level={levels[item.item]}
            active={
              item.item === 'furniture-lamp'
                ? lit
                : item.item === 'furniture-turntable'
                  ? music
                  : item.id === active
            }
          />
        </g>
      </g>
    );
  }
  const partner = (
    <g
      key="penguin"
      className={'home-penguin-position ' + (walking ? 'walking' : '')}
      style={{ transform: `translate(${p.x}px,${p.y}px)` }}
    >
      <HomeCompanion pose={walking ? 'idle' : pose} skin={skin} activityKey={active??'welcome'} />
    </g>
  );
  let inserted = false;
  const figures = [];
  for (const item of furniture) {
    if (!inserted && furnitureCenter(item).depth > depth) {
      figures.push(partner);
      inserted = true;
    }
    figures.push(drawItem(item));
  }
  if (!inserted) figures.push(partner);
  return (
    <svg
      viewBox="0 0 920 640"
      className="home-scene"
      role="group"
      aria-label="可互动的企鹅等距小屋"
    >
      <defs>
        <linearGradient id="room-backdrop" x2="0" y2="1">
          <stop stopColor="#fff4d9" />
          <stop offset="1" stopColor="#f3e6cd" />
        </linearGradient>
        <linearGradient id="room-wall-left" x2="0" y2="1">
          <stop stopColor="#fff7e8" />
          <stop offset="1" stopColor="#ecdac1" />
        </linearGradient>
        <linearGradient id="room-wall-right" x2="1" y2="1">
          <stop stopColor="#fffcf2" />
          <stop offset="1" stopColor="#e7d7bd" />
        </linearGradient>
        <linearGradient id="window-sky" x2="0" y2="1">
          <stop stopColor="#b9dde3" />
          <stop offset="1" stopColor="#e8f2dc" />
        </linearGradient>
        <filter id="room-shadow" x="-.3" y="-.3" width="1.6" height="1.6">
          <feGaussianBlur stdDeviation="13" />
        </filter>
      </defs>
      <rect width="920" height="640" fill="url(#room-backdrop)" rx="28" />
      <ellipse
        cx="460"
        cy="512"
        rx="315"
        ry="42"
        fill="#a08555"
        opacity=".14"
        filter="url(#room-shadow)"
      />
      <path
        d="M124 343 460 175l336 168v29L460 540 124 372Z"
        fill="#b89163"
        stroke="#a88358"
        strokeWidth="2"
      />
      <path
        d="M124 343V179L460 11v164Z"
        fill="url(#room-wall-left)"
        stroke="#c9b596"
        strokeWidth="2"
      />
      <path
        d="M460 11 796 179v164L460 175Z"
        fill="url(#room-wall-right)"
        stroke="#c9b596"
        strokeWidth="2"
      />
      <path
        d="M124 328 460 160l336 168v15L460 175 124 343Z"
        fill="#fff4dc"
        stroke="#cfb994"
        strokeWidth="1.5"
      />
      <path
        d="M124 179 460 11l336 168"
        fill="none"
        stroke="#fffdf3"
        strokeWidth="9"
      />
      <path d="m459 23 2 137" stroke="#ddccb1" strokeWidth="4" />
      <g stroke="#ae9372" strokeWidth="3" strokeLinejoin="round">
        <path d="m234 160 141-71v113l-141 71Z" fill="#b7946b" />
        <path d="m243 161 122-61v95l-122 61Z" fill="url(#window-sky)" />
        <path d="m244 231 34-35 29 4 57-68v62Z" fill="#b4c8a2" stroke="none" />
        <path d="m244 249 46-37 36 9 37-35v9Z" fill="#91b29a" stroke="none" />
        <path d="M304 133v93m-61-18 122-61" stroke="#fff5df" strokeWidth="6" />
        <path
          d="m226 159 16-8v122l-16 8Zm140-70 17-8v120l-17 9Z"
          fill="#f7d99e"
          stroke="#d7b77c"
        />
        <path d="m234 273 142-71 12 6-140 73Z" fill="#fdf0d0" />
      </g>
      <g transform="translate(596 145) skewY(26.565)">
        <rect
          x="-27"
          y="-30"
          width="54"
          height="62"
          rx="3"
          fill="#c69965"
          stroke="#a17d56"
          strokeWidth="2"
        />
        <rect x="-21" y="-24" width="42" height="50" rx="1" fill="#fff9e7" />
        <path d="m-17 10 11-15 8 9 12-23 7 36h-38Z" fill="#96b6a3" />
        <circle cx="-8" cy="-13" r="7" fill="#f1cf75" />
      </g>
      <g transform="translate(701 247) skewY(26.565)">
        <circle r="21" fill="#f4dfb0" stroke="#bda37c" strokeWidth="3" />
        <circle r="16" fill="#fffbec" />
        <path d="M0-9v10l8 5" fill="none" stroke="#8c7760" strokeWidth="2.5" />
      </g>
      {Array.from({ length: 49 }, (_, i) => {
        const x = i % 7,
          y = Math.floor(i / 7),
          at = iso(x, y);
        return (
          <g
            key={i}
            className={editing ? 'floor-tile editable' : 'floor-tile'}
            onClick={() => editing && onCell(x, y)}
            role={editing ? 'button' : undefined}
            tabIndex={editing ? 0 : undefined}
            aria-label={editing ? `摆放到 ${x + 1} 行 ${y + 1} 列` : undefined}
            onKeyDown={(e) => {
              if (editing && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onCell(x, y);
              }
            }}
          >
            <path
              d={`M${at.x} ${at.y}l48 24-48 24-48-24Z`}
              fill={(x + y) % 3 === 0 ? '#e7bd8a' : '#edc797'}
              stroke="#d9ad7a"
              strokeWidth="1"
            />
            <path
              d={`M${at.x - 15} ${at.y + 10}l30 15m-40-7 23 11`}
              stroke="#d3a779"
              opacity=".35"
              strokeWidth="1"
            />
          </g>
        );
      })}
      {layout.filter((i) => i.item === 'furniture-rug').map(drawItem)}
      {figures}
      {visitor && (
        <g className="home-visitor-arrival" transform="translate(580 462)">
          <VisitorCat />
        </g>
      )}
      <path
        d="m398 512 62 31 62-31v14l-62 31-62-31Z"
        fill="#d3ac79"
        stroke="#ad8a5e"
        strokeWidth="2"
      />
      <path
        d="m398 512 62-31 62 31-62 31Z"
        fill="#f2d5ac"
        stroke="#c6a477"
        strokeWidth="2"
      />
      <text x="460" y="596" textAnchor="middle" fill="#9b856a" fontSize="13">
        {editing
          ? '选择一件家具，再点击地板格摆放'
          : '点击家具，与企鹅一起度过小屋时光'}
      </text>
    </svg>
  );
}
