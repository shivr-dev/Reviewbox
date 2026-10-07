import { apiFetch } from './runtime';
import { currentNamespace, put, allRecords } from './store';
import { localDay } from './model';
import { GAME_SHOP } from './learning-game';
export type RewardContents = {
  coins?: number;
  freezes?: number;
  skin?: string | null;
  superDays?: number;
  superUntil?: string;
  refill?: boolean;
};
export type RewardsState = {
  redemptionId?: string;
  redeemedReward?: RewardContents;
  admin: boolean;
  superUntil: string | null;
  grants: { id: string; at: string; source: string; rewards: RewardContents }[];
  codes?: {
    code: string;
    rewards: RewardContents;
    max_uses: number;
    used: number;
    per_user_limit: number;
    active: boolean;
    expires_at: string | null;
  }[];
};
export async function rewardsRequest(
  action: string,
  payload: Record<string, unknown> = {},
  ns = currentNamespace(),
): Promise<RewardsState> {
  const response = await apiFetch('/api/game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const result: any = await response.json();
  if (!response.ok) throw new Error(result.error ?? '奖励服务暂时不可用');
  if (ns !== currentNamespace())
    throw new Error('账户已切换，请重新打开此页面');
  const existing = new Set(
    (await allRecords(ns))
      .filter((r) => r.kind === 'job' && !r.deleted)
      .map((r) => r.id),
  );
  for (const grant of result.grants ?? [])
    if (!existing.has(grant.id))
      await put(
        'job',
        {
          ...grant,
          kind: 'game-grant',
          day: localDay(new Date(grant.at)),
          version: 1,
        },
        grant.id,
        false,
        ns,
      );
  if (ns !== currentNamespace())
    throw new Error('账户已切换，请重新打开此页面');
  return result;
}
export function describeReward(r: RewardContents) {
  return [
    r.coins ? `${r.coins} 点数` : '',
    r.freezes ? `连胜冻结 × ${r.freezes}` : '',
    r.skin ? (GAME_SHOP.find((i) => i.id === r.skin)?.name ?? '专属皮肤') : '',
    r.superDays ? `SuperReview ${r.superDays} 天` : '',
    r.refill ? '生命值补给' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
