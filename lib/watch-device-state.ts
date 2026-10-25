export type WatchPairing = {
  id: string;
  name: string;
  platform: string;
  expiresAt: string;
  approvedAt?: string;
  lastPoll?: string | null;
};
export type WatchDevice = {
  id: string;
  name: string;
  platform: string;
  lastSeen: string;
  revokedAt: string | null;
  notifications: boolean;
  history: { at: string; uploaded: number; downloaded: number }[];
};
export const awaitingWatch = (p: WatchPairing, now = Date.now()) => Date.parse(p.expiresAt) > now;
export function watchPairingMessage(p: WatchPairing, now = Date.now()) {
  if (!awaitingWatch(p, now)) return '配对已过期，尚未连接。请在手表重新生成配对码。';
  return p.lastPoll
    ? '网页已授权，等待手表完成连接。请保持手表应用在前台。'
    : '网页已授权，手表尚未检查授权。请返回手表应用，点击“检查连接”。';
}
