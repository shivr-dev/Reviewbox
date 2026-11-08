import { assetPath } from '@/lib/runtime';
export default function WorkspaceLoading() {
  return <div className="rb-system-loading" role="status" aria-live="polite"><div className="rb-loading-mark"><img src={assetPath('learning-penguin.png')} alt=""/><span/><span/><span/></div><strong>把学习空间准备好。</strong><p>正在读取你的计划与学习记录</p><div className="rb-loading-track"><i/></div><small>一步一步，继续向前。</small></div>;
}
