'use client';
import { useReview } from './review-context';
import { GameProfile } from './learning-game';
import { ArrowRight } from 'lucide-react';
import { learningGame } from '@/lib/learning-game';
import { useState } from 'react';
import { AdventureShop } from './adventure-panels';
export default function ShopView() {
  const { navigate, data } = useReview(),
    game = learningGame(data);
  const [section, setSection] = useState('adventure');
  return (
    <div className="shop-page">
      <div className="learning-home-title">
        <div>
          <h1>企鹅补给站</h1>
          <p>伙伴造型、小屋好物和冒险补给，都从认真学习中获得。</p>
        </div>
        <button className="quiet" onClick={() => navigate('you')}>
          成就与目标 <ArrowRight size={16} />
        </button>
      </div>
      <div className="shop-special-links">
        <button className="secondary" onClick={() => navigate('habitat')}>
          企鹅家园
        </button>
        <button className="secondary" onClick={() => navigate('redeem')}>
          使用兑换码
        </button>
        <button className="secondary" onClick={() => navigate('super')}>
          {game.superPlan.active ? 'SuperReview · 已激活' : 'SuperReview 计划'}
        </button>
      </div>
      <div
        className="home-tabs shop-category-tabs"
        role="tablist"
        aria-label="商店分区"
      >
        <button
          role="tab"
          aria-selected={section === 'adventure'}
          className={section === 'adventure' ? 'active' : ''}
          onClick={() => setSection('adventure')}
        >
          家园与道具
        </button>
        <button
          role="tab"
          aria-selected={section === 'partner'}
          className={section === 'partner' ? 'active' : ''}
          onClick={() => setSection('partner')}
        >
          伙伴与补给
        </button>
      </div>
      {section === 'adventure' ? <AdventureShop /> : <GameProfile shopOnly />}
    </div>
  );
}
