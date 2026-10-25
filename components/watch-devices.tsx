'use client';
import { Watch, ArrowLeft } from 'lucide-react';
import { useReview } from './review-context';
import WatchDeviceManager from './watch-device-manager';
export default function WatchDevices() {
  const {cloudUser,navigate}=useReview();
  return <div className="watch-devices-page">
    <button className="text-button" onClick={()=>navigate('you')}><ArrowLeft/>个人中心</button>
    <header><div><h1>手表与设备</h1><p>连接你的账户，把学习带到手腕上。</p></div><Watch size={32}/></header>
    {cloudUser ? <WatchDeviceManager key={cloudUser.id}/> : <section className="panel"><h2>先登录学习账户</h2><p>连接手表并同步个人资料，需要你登录后明确批准设备。</p><button className="primary" onClick={()=>navigate('you')}>前往登录</button></section>}
  </div>;
}
