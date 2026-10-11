'use client';
import { useEffect, useState } from 'react';
import { Penguin } from './learning-game';
import { assetPath } from '@/lib/runtime';
import {
  HOME_COMPANION_MOTION,
  homeSpritePose,
  homeFallbackAction,
  homeFallbackPeriod,
  homeCompanionFrame,
} from '@/lib/home-companion-motion';

/** One activity owns one clock; unrelated renders never restart a page-turn. */
function useHomeMotion(pose: string, skin: string, activityKey: string) {
  const [tick, setTick] = useState({
    frame: 0,
    cycle: 0,
    reduced: false,
    ready: false,
  });
  useEffect(() => {
    let disposed = false,
      raf = 0,
      elapsed = 0,
      lastTime = 0,
      lastFrame = -1,
      lastCycle = -1;
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = preference?.matches ?? false;
    const sprite = homeSpritePose(pose, skin),
      period = homeFallbackPeriod(pose, skin);
    let ready = !sprite;
    const update = () => {
      const p = sprite
        ? homeCompanionFrame(sprite, elapsed, reduced)
        : { frame: 0, cycle: reduced ? 0 : Math.floor(elapsed / period) };
      if (disposed) return;
      if (p.frame !== lastFrame || p.cycle !== lastCycle) {
        lastFrame = p.frame;
        lastCycle = p.cycle;
        setTick({ frame: p.frame, cycle: p.cycle, reduced, ready });
      }
    };
    const run = (time: number) => {
      if (disposed) return;
      if (lastTime && !document.hidden && !reduced)
        elapsed += Math.min(time - lastTime, 100);
      lastTime = time;
      update();
      raf = requestAnimationFrame(run);
    };
    const visibility = () => {
      lastTime = 0;
    };
    const changed = () => {
      reduced = preference?.matches ?? false;
      lastFrame = -1;
      lastTime = 0;
      update();
    };
    setTick({ frame: 0, cycle: 0, reduced, ready });
    let image: HTMLImageElement | undefined;
    if (sprite) {
      image = new Image();
      image.onload = () => {
        if (disposed) return;
        ready = true;
        elapsed = 0;
        lastFrame = -1;
        lastTime = 0;
        update();
      };
      image.onerror = () => {
        if (!disposed) setTick({ frame: 0, cycle: 0, reduced, ready: false });
      };
      image.src = assetPath(HOME_COMPANION_MOTION[sprite].file);
    }
    document.addEventListener('visibilitychange', visibility);
    preference?.addEventListener?.('change', changed);
    raf = requestAnimationFrame(run);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      preference?.removeEventListener?.('change', changed);
      if (image) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [pose, skin, activityKey]);
  return tick;
}

/** Use the original illustrated companion and its real outfit atlases in the room. */
export default function HomeCompanion({
  pose,
  skin,
  activityKey,
}: {
  pose: string;
  skin: string;
  activityKey: string;
}) {
  const tick = useHomeMotion(pose, skin, activityKey),
    sprite = homeSpritePose(pose, skin),
    illustrated = !!sprite && tick.ready,
    action = homeFallbackAction(pose);
  return (
    <g
      className={
        'home-character pose-' +
        pose +
        (tick.reduced ? ' home-motion-reduced' : '')
      }
    >
      <ellipse cy="12" rx="31" ry="10" fill="#7c7764" opacity=".16" />
      <foreignObject
        x="-74"
        y="-115"
        width="148"
        height="148"
        className="character-body home-illustrated-body"
      >
        <div className="home-companion-cutout">
          {illustrated && sprite ? (
            <span
              className="home-companion-sprite"
              role="img"
              aria-label={HOME_COMPANION_MOTION[sprite].label}
              style={{
                backgroundImage: `url("${assetPath(HOME_COMPANION_MOTION[sprite].file)}")`,
                backgroundPosition: `${((tick.frame % 4) * 100) / 3}% ${Math.floor(tick.frame / 4) * 100}%`,
              }}
            />
          ) : (
            <Penguin
              skin={skin}
              action={tick.reduced ? undefined : action}
              actionKey={activityKey + ':' + tick.cycle}
            />
          )}
        </div>
      </foreignObject>
      <g
        className="home-activity-props"
        stroke="#51473c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {pose === 'tea' && (
          <g className="home-tea-cup" transform="translate(20 -18)">
            <path d="M-10-13v18q10 10 20 0v-18Z" fill="#ffe0a1" />
            <ellipse cy="-13" rx="10" ry="4" fill="#a1754a" />
            <path d="M11-10q15-2 9 10l-9 3" fill="none" />
            <path
              className="tea-steam"
              d="M-3-20q-6-5 0-13m8 15q6-5 0-12"
              stroke="#aaa08e"
              fill="none"
            />
          </g>
        )}
        {pose === 'water' && !illustrated && (
          <g className="home-watering-can" transform="translate(22 -18)">
            <path d="M-8-9h23V9H-8Z" fill="#94cad4" />
            <ellipse cx="3" cy="-9" rx="11" ry="4" fill="#cce9e7" />
            <path d="m15-4 18-10 2 6-20 12Z" fill="#8bc3cb" />
            <path d="M-6-11q7-14 14 0" fill="none" />
            <path
              className="water-drops"
              d="m35-7 5 8m1-11 7 8"
              stroke="#6aafd2"
            />
          </g>
        )}
        {pose === 'paint' && (
          <g className="home-paint-tools">
            <ellipse cx="-33" cy="-12" rx="16" ry="10" fill="#f2d0a0" />
            <circle cx="-36" cy="-14" r="3" fill="#e5a292" stroke="none" />
            <circle cx="-26" cy="-10" r="3" fill="#82b8ad" stroke="none" />
            <g className="paint-brush">
              <path d="m31-22 16-34" stroke="#d7aa5d" strokeWidth="5" />
              <path d="m43-51 8-13 2 13-6 4Z" fill="#88bfb7" />
            </g>
          </g>
        )}
        {pose === 'lamp' && (
          <g className="home-lamp-cord">
            <path d="M38-76v43" stroke="#d9bc77" />
            <circle cx="38" cy="-29" r="5" fill="#f4cd71" />
          </g>
        )}
      </g>
      {pose === 'sleep' && (
        <>
          <path
            d="M-45 7q45 20 90 0v12q-45 21-90 0Z"
            fill="#98c6d4"
            stroke="#5c8f9d"
            strokeWidth="2"
          />
          <text
            className="sleep-z"
            x="35"
            y="-74"
            fill="#8e9db6"
            fontSize="17"
            fontWeight="800"
          >
            z z
          </text>
        </>
      )}
    </g>
  );
}
