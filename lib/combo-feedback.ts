export const comboMilestone = (count: number) =>
  Number.isInteger(count) && (count === 3 || (count >= 5 && count % 5 === 0));
export const nextComboMilestone = (count: number) =>
  count < 3 ? 3 : count < 5 ? 5 : (Math.floor(count / 5) + 1) * 5;
export const COMBO_MOTION = { enter: 420, hold: 2100, exit: 320 };
