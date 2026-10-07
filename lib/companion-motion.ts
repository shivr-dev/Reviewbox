export type CompanionAction =
  | 'welcome'
  | 'correct'
  | 'thinking'
  | 'combo'
  | 'chest'
  | 'levelup';
export const COMPANION_MOTION = {
  chest: {
    file: 'learning-penguin-combo.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1500,
  },
  levelup: {
    file: 'learning-penguin-combo.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1600,
  },
  welcome: {
    file: 'learning-penguin-celebrate.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1100,
  },
  correct: {
    file: 'learning-penguin-celebrate.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1100,
  },
  thinking: {
    file: 'learning-penguin-thinking.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1500,
  },
  combo: {
    file: 'learning-penguin-combo.png',
    columns: 4,
    rows: 2,
    frames: 8,
    duration: 1400,
  },
} as const;
export const COMPANION_COSTUMES: Record<
  string,
  { file: string; label: string }
> = {
  'skin-super': {
    file: 'learning-penguin-super-combo.png',
    label: 'SuperReview 极光披风企鹅',
  },
  'skin-explorer': {
    file: 'learning-penguin-explorer-action.png',
    label: '探险家挥手跃起',
  },
  'skin-graduate': {
    file: 'learning-penguin-graduate-action.png',
    label: '毕业礼庆祝',
  },
  'skin-raincoat': {
    file: 'learning-penguin-raincoat-action.png',
    label: '雨衣企鹅转伞甩水',
  },
  'skin-astronaut': {
    file: 'learning-penguin-astronaut-action.png',
    label: '宇航员失重翻身',
  },
  'skin-scientist': {
    file: 'learning-penguin-scientist-action.png',
    label: '实验成功庆祝',
  },
};
export function companionMotion(action: CompanionAction, skin = 'default') {
  const base = COMPANION_MOTION[action],
    costume = COMPANION_COSTUMES[skin];
  if (skin === 'skin-super')
    return {
      ...base,
      file: `learning-penguin-super-${action}.png`,
      sequence: [0, 1, 2, 3, 4, 5, 6, 7],
      duration: action === 'combo' || action === 'levelup' ? 1600 : 1500,
    };
  const sequence = costume
    ? action === 'thinking'
      ? [0, 1, 1, 0, 1, 0]
      : action === 'welcome'
        ? [0, 1, 6, 7]
        : [0, 1, 2, 3, 4, 5, 6, 7]
    : [0, 1, 2, 3, 4, 5, 6, 7];
  return {
    ...base,
    file: costume?.file ?? base.file,
    sequence,
    duration: costume && action === 'combo' ? 1600 : base.duration,
  };
}
export function companionFrame(
  action: CompanionAction,
  elapsed: number,
  skin = 'default',
) {
  const motion = companionMotion(action, skin),
    index = Math.max(
      0,
      Math.min(
        motion.sequence.length - 1,
        Math.floor((elapsed / motion.duration) * motion.sequence.length),
      ),
    ),
    frame = motion.sequence[index];
  return {
    frame,
    x: ((frame % motion.columns) / (motion.columns - 1)) * 100,
    y: (Math.floor(frame / motion.columns) / (motion.rows - 1)) * 100,
    done: elapsed >= motion.duration,
  };
}
