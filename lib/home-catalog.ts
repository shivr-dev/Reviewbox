export const HOME_SHOP = [
  {
    id: 'chest-ticket',
    name: '宝箱升级券',
    cost: 35,
    type: 'ticket',
    description:
      '下一次练习宝箱升级：100–150 点数（90%），连胜冻结 ×1（10%）。',
  },
  {
    id: 'gift-paper',
    name: '星星包装纸',
    cost: 15,
    type: 'paper',
    description: '把自己的点数或消耗道具封成礼物，在指定日期开启。',
  },
  {
    id: 'visitor-ticket',
    name: '惊喜访客邀请函',
    cost: 60,
    type: 'invitation',
    description: '邀请小猫来家园做客，双人互动后留下小猫纪念摆件。',
  },
  {
    id: 'record-rain',
    name: '雨天爵士',
    cost: 100,
    type: 'record',
    description: '原创轻柔爵士旋律，放进唱片机播放。',
  },
  {
    id: 'record-night',
    name: '星光夜航',
    cost: 100,
    type: 'record',
    description: '原创夜间轻音乐，陪伴安静的小屋。',
  },
  {
    id: 'furniture-desk',
    name: '橡木阅读桌',
    cost: 120,
    type: 'furniture',
    description: '企鹅坐下翻书；升级后增加书架和金色阅读灯。',
  },
  {
    id: 'furniture-chair',
    name: '云朵小椅',
    cost: 70,
    type: 'furniture',
    description: '圆润的靠背椅，企鹅可以坐下休息。',
  },
  {
    id: 'furniture-sofa',
    name: '海盐沙发',
    cost: 180,
    type: 'furniture',
    description: '柔软双人沙发，企鹅窝在靠垫里小憩。',
  },
  {
    id: 'furniture-lamp',
    name: '奶油落地灯',
    cost: 90,
    type: 'furniture',
    description: '点击亮起暖光；企鹅走过去拉动灯绳。',
  },
  {
    id: 'furniture-turntable',
    name: '胡桃木唱片机',
    cost: 160,
    type: 'furniture',
    description: '放入唱片，唱针落下，企鹅跟着音乐摇摆。',
  },
  {
    id: 'furniture-shelf',
    name: '故事书架',
    cost: 140,
    type: 'furniture',
    description: '收藏小屋的故事，企鹅取下一本书阅读。',
  },
  {
    id: 'furniture-plant',
    name: '圆叶盆栽',
    cost: 60,
    type: 'furniture',
    description: '企鹅提着小水壶照顾绿叶，升级后开花。',
  },
  {
    id: 'furniture-rug',
    name: '太阳小地毯',
    cost: 80,
    type: 'furniture',
    description: '柔软的圆形地毯，升级后增加刺绣和流苏。',
  },
  {
    id: 'furniture-coffee',
    name: '暖心茶几',
    cost: 100,
    type: 'furniture',
    description: '企鹅捧起杯子喝茶，休息片刻。',
  },
  {
    id: 'furniture-bed',
    name: '晚安小床',
    cost: 190,
    type: 'furniture',
    description: '星星被子与柔软枕头，企鹅钻进被窝。',
  },
  {
    id: 'furniture-art',
    name: '冒险画架',
    cost: 130,
    type: 'furniture',
    description: '企鹅拿起画笔，画下今天的小冒险。',
  },
  {
    id: 'furniture-cat',
    name: '小猫纪念摆件',
    cost: 0,
    type: 'souvenir',
    description: '访客留下的礼物，只能通过邀请小猫获得。',
  },
] as const;
export type HomeItemId = (typeof HOME_SHOP)[number]['id'];
export const FURNITURE: Record<
  string,
  { w: number; d: number; activity: string; verb: string }
> = {
  'furniture-desk': { w: 2, d: 1, activity: 'read', verb: '坐下阅读' },
  'furniture-chair': { w: 1, d: 1, activity: 'rest', verb: '坐下休息' },
  'furniture-sofa': { w: 2, d: 1, activity: 'sleep', verb: '窝进沙发' },
  'furniture-lamp': { w: 1, d: 1, activity: 'lamp', verb: '点亮暖灯' },
  'furniture-turntable': { w: 1, d: 1, activity: 'dance', verb: '播放唱片' },
  'furniture-shelf': { w: 2, d: 1, activity: 'read', verb: '取书阅读' },
  'furniture-plant': { w: 1, d: 1, activity: 'water', verb: '给盆栽浇水' },
  'furniture-rug': { w: 2, d: 2, activity: 'rest', verb: '坐在地毯上' },
  'furniture-coffee': { w: 1, d: 1, activity: 'tea', verb: '喝一杯热茶' },
  'furniture-bed': { w: 2, d: 1, activity: 'sleep', verb: '进入梦乡' },
  'furniture-art': { w: 1, d: 1, activity: 'paint', verb: '画一幅小画' },
  'furniture-cat': { w: 1, d: 1, activity: 'welcome', verb: '欣赏纪念摆件' },
};
export const CHEST_TIERS = [
  { name: '升级券', min: 100, max: 150, cost: 0 },
  { name: '星辉附魔券', min: 150, max: 200, cost: 45 },
  { name: '极光附魔券', min: 200, max: 300, cost: 65 },
] as const;
export const FREEZE_TIERS = [
  { name: '连胜冻结', days: 1, cost: 0 },
  { name: '霜晶附魔', days: 2, cost: 60 },
  { name: '永冬附魔', days: 3, cost: 100 },
] as const;
export type HomePlacement = {
  id: string;
  item: string;
  x: number;
  y: number;
  rotation: 0 | 1;
};
export const STARTER_LAYOUT: HomePlacement[] = [
  { id: 'starter-desk', item: 'furniture-desk', x: 1, y: 1, rotation: 0 },
  { id: 'starter-chair', item: 'furniture-chair', x: 2, y: 3, rotation: 0 },
  { id: 'starter-plant', item: 'furniture-plant', x: 5, y: 1, rotation: 0 },
];
export const iso = (x: number, y: number) => ({
  x: 460 + (x - y) * 48,
  y: 175 + (x + y) * 24,
});
/** Position furniture at the centre of its full footprint, including rotation. */
export function furnitureCenter(p: HomePlacement) {
  const shape = FURNITURE[p.item] ?? {w:1,d:1};
  const w = p.rotation ? shape.d : shape.w, d = p.rotation ? shape.w : shape.d;
  return {x:p.x+w/2,y:p.y+d/2,depth:p.x+p.y+(w+d)/2};
}
