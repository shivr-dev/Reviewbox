import { companionMotion, type CompanionAction } from './companion-motion';

/** Every activity completes all frames before its quiet interval. */
export const HOME_COMPANION_MOTION = {
  read: {
    file: 'learning-penguin-home-read.png',
    label: '企鹅坐下读书、翻页',
    durations: [700, 450, 220, 250, 270, 300, 500, 500],
    pause: 1300,
  },
  water: {
    file: 'learning-penguin-home-water.png',
    label: '企鹅提壶浇水、收回水壶',
    durations: [500, 300, 280, 450, 500, 350, 450, 450],
    pause: 1600,
  },
} as const;
export type HomeSpritePose = keyof typeof HOME_COMPANION_MOTION;
export function homeSpritePose(
  pose: string,
  skin: string,
): HomeSpritePose | null {
  return skin === 'default' && (pose === 'read' || pose === 'water')
    ? pose
    : null;
}
export function homeFallbackAction(pose: string): CompanionAction | undefined {
  return pose === 'dance'
    ? 'combo'
    : pose === 'welcome'
      ? 'welcome'
      : ['read', 'paint', 'tea', 'water', 'lamp'].includes(pose)
        ? 'thinking'
        : undefined;
}
export function homeCompanionFrame(
  pose: HomeSpritePose,
  elapsed: number,
  reduced = false,
) {
  const m = HOME_COMPANION_MOTION[pose],
    duration = m.durations.reduce((n, v) => n + v, 0),
    period = duration + m.pause;
  const safeTime = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const phase = reduced ? 0 : safeTime % period;
  let frame = 0,
    end = 0;
  if (!reduced) {
    if (phase >= duration) frame = 7;
    else
      for (let i = 0; i < m.durations.length; i++) {
        end += m.durations[i];
        if (phase < end) {
          frame = i;
          break;
        }
      }
  }
  return {
    frame,
    cycle: Math.floor(safeTime / period),
    x: ((frame % 4) * 100) / 3,
    y: Math.floor(frame / 4) * 100,
    resting: phase >= duration,
    period,
  };
}
export function homeFallbackPeriod(pose: string, skin: string) {
  const action = homeFallbackAction(pose);
  return action
    ? companionMotion(action, skin).duration + (pose === 'dance' ? 650 : 2800)
    : 5000;
}
