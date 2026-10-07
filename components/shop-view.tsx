'use client';
import { useReview } from './review-context';
import { GameProfile } from './learning-game';
import { ArrowRight } from 'lucide-react';
import { learningGame } from '@/lib/learning-game';
export default function ShopView() {
  const { navigate, data } = useReview(),
    game = learningGame(data);
  return (
    <div className="shop-page">
      <div className="learning-home-title">
        <div>
          <h1>企鹅补给站</h1>
          <p>把每次认真学习，兑换成属于你的伙伴造型。</p>
        </div>
        <button className="quiet" onClick={() => navigate('you')}>
          成就与目标 <ArrowRight size={16} />
        </button>
      </div>
      <div className="shop-special-links">
        <button className="secondary" onClick={() => navigate('redeem')}>
          使用兑换码
        </button>
        <button className="secondary" onClick={() => navigate('super')}>
          {game.superPlan.active ? 'SuperReview · 已激活' : 'SuperReview 计划'}
        </button>
      </div>
      <GameProfile shopOnly />
    </div>
  );
}
