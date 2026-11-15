import NaviAvatar from './navi-avatar';
export default function WorkspaceLoading() {
  return <div className="rb-system-loading" role="status" aria-live="polite"><NaviAvatar size={104} label={null} state="idle" paused/><strong>正在打开学习空间</strong><div className="rb-loading-track" aria-hidden="true"><i/></div></div>;
}
