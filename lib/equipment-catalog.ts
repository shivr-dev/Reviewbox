export const EQUIPMENT_SLOTS = [
  'penblade',
  'cloak',
  'charm',
  'artifact',
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type EquipmentRarity = 'common' | 'rare' | 'epic' | 'unique';
export type EquipmentMaterial = 'ore' | 'ink' | 'thread';
export type EquipmentMaterials = Record<EquipmentMaterial, number>;
export const SLOT_NAMES: Record<EquipmentSlot, string> = {
  penblade: '笔刃',
  cloak: '披风',
  charm: '护符',
  artifact: '遗物',
};
export const RARITY_NAMES: Record<EquipmentRarity, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  unique: '独特',
};
export const EQUIPMENT_AFFIXES = [
  {
    id: 'spark',
    name: '星火',
    description: '笔迹与完成反馈附带星火',
    slots: ['penblade', 'artifact'],
    effect: 'spark',
  },
  {
    id: 'ripple',
    name: '涟漪',
    description: '确认动作呈现水波',
    slots: ['penblade', 'charm'],
    effect: 'ripple',
  },
  {
    id: 'aurora',
    name: '极光',
    description: '柔和极光轨迹',
    slots: ['cloak', 'artifact'],
    effect: 'aurora',
  },
  {
    id: 'snow',
    name: '初雪',
    description: '完成时飘落雪花',
    slots: ['cloak', 'charm'],
    effect: 'snow',
  },
  {
    id: 'ribbon',
    name: '缎带',
    description: '企鹅动作带有缎带',
    slots: ['cloak', 'charm'],
    effect: 'ribbon',
  },
  {
    id: 'echo',
    name: '回响',
    description: '增加轻柔完成和弦',
    slots: ['charm', 'artifact'],
    effect: 'echo',
  },
  {
    id: 'firefly',
    name: '萤光',
    description: '小萤火围绕伙伴',
    slots: ['cloak', 'artifact'],
    effect: 'firefly',
  },
  {
    id: 'comet',
    name: '彗尾',
    description: '挥笔呈现彗星尾迹',
    slots: ['penblade', 'artifact'],
    effect: 'comet',
  },
  {
    id: 'paper',
    name: '纸羽',
    description: '收尾呈现纸片羽毛',
    slots: ['penblade', 'cloak'],
    effect: 'paper',
  },
  {
    id: 'crystal',
    name: '晶莹',
    description: '宝箱材料反馈带晶体光泽',
    slots: ['charm', 'artifact'],
    effect: 'crystal',
  },
  {
    id: 'artisan',
    name: '巧匠',
    description: '合格练习掉落少量额外矿晶（上限两枚）',
    slots: ['penblade', 'charm'],
    effect: 'ore',
  },
  {
    id: 'weaver',
    name: '织梦',
    description: '合格练习掉落少量额外丝线（上限两束）',
    slots: ['cloak', 'artifact'],
    effect: 'thread',
  },
] as const;
export type EquipmentAffixId = (typeof EQUIPMENT_AFFIXES)[number]['id'];
export type EquipmentAffix = { id: EquipmentAffixId; tier: 1 | 2 | 3 };
export type EquipmentTemplate = {
  id: string;
  name: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  description: string;
  affixes: EquipmentAffix[];
  set?: string;
};
export const EQUIPMENT_TEMPLATES: EquipmentTemplate[] = [
  {
    id: 'pencil-sword',
    name: '启程铅笔刃',
    slot: 'penblade',
    rarity: 'common',
    description: '握在小鳍里的第一支笔。',
    affixes: [{ id: 'paper', tier: 1 }],
    set: 'reader',
  },
  {
    id: 'ink-quill',
    name: '星羽笔刃',
    slot: 'penblade',
    rarity: 'rare',
    description: '轻盈的蓝色羽毛，写下新的冒险。',
    affixes: [
      { id: 'ripple', tier: 1 },
      { id: 'artisan', tier: 1 },
    ],
    set: 'ink',
  },
  {
    id: 'comet-nib',
    name: '流星笔尖',
    slot: 'penblade',
    rarity: 'epic',
    description: '银色笔尖拖着细小彗尾。',
    affixes: [
      { id: 'comet', tier: 2 },
      { id: 'spark', tier: 1 },
    ],
    set: 'star',
  },
  {
    id: 'north-star',
    name: '北极星之笔',
    slot: 'penblade',
    rarity: 'unique',
    description: '一颗永远记得归途的小星星。',
    affixes: [
      { id: 'comet', tier: 3 },
      { id: 'artisan', tier: 2 },
      { id: 'spark', tier: 2 },
    ],
    set: 'star',
  },
  {
    id: 'reader-cape',
    name: '读书企鹅披风',
    slot: 'cloak',
    rarity: 'common',
    description: '柔软蓝披风，准备出发。',
    affixes: [{ id: 'paper', tier: 1 }],
    set: 'reader',
  },
  {
    id: 'winter-mantle',
    name: '初雪斗篷',
    slot: 'cloak',
    rarity: 'rare',
    description: '圆滚滚的雪绒披风。',
    affixes: [
      { id: 'snow', tier: 1 },
      { id: 'ribbon', tier: 1 },
    ],
    set: 'snow',
  },
  {
    id: 'aurora-cape',
    name: '极光斗篷',
    slot: 'cloak',
    rarity: 'epic',
    description: '夜空化成了轻柔的布料。',
    affixes: [
      { id: 'aurora', tier: 2 },
      { id: 'weaver', tier: 1 },
    ],
    set: 'star',
  },
  {
    id: 'dawn-cape',
    name: '晨曦之翼',
    slot: 'cloak',
    rarity: 'unique',
    description: '展开后是清晨的第一束光。',
    affixes: [
      { id: 'aurora', tier: 3 },
      { id: 'firefly', tier: 2 },
      { id: 'weaver', tier: 2 },
    ],
    set: 'dawn',
  },
  {
    id: 'bookmark-charm',
    name: '书签护符',
    slot: 'charm',
    rarity: 'common',
    description: '一枚不让故事走丢的书签。',
    affixes: [{ id: 'ribbon', tier: 1 }],
    set: 'reader',
  },
  {
    id: 'snow-bell',
    name: '雪铃护符',
    slot: 'charm',
    rarity: 'rare',
    description: '轻轻摇晃，听见小雪铃。',
    affixes: [
      { id: 'snow', tier: 1 },
      { id: 'echo', tier: 1 },
    ],
    set: 'snow',
  },
  {
    id: 'crystal-heart',
    name: '晶心挂坠',
    slot: 'charm',
    rarity: 'epic',
    description: '把每次认真的尝试珍藏起来。',
    affixes: [
      { id: 'crystal', tier: 2 },
      { id: 'artisan', tier: 1 },
    ],
    set: 'dawn',
  },
  {
    id: 'ink-compass',
    name: '墨海罗盘',
    slot: 'artifact',
    rarity: 'rare',
    description: '指针始终指向下一段旅程。',
    affixes: [
      { id: 'ripple', tier: 1 },
      { id: 'echo', tier: 1 },
    ],
    set: 'ink',
  },
  {
    id: 'star-lantern',
    name: '星灯遗物',
    slot: 'artifact',
    rarity: 'epic',
    description: '企鹅随身的小小夜灯。',
    affixes: [
      { id: 'firefly', tier: 2 },
      { id: 'spark', tier: 1 },
    ],
    set: 'star',
  },
  {
    id: 'dream-globe',
    name: '梦境雪花球',
    slot: 'artifact',
    rarity: 'unique',
    description: '雪球里藏着一整个企鹅冬天。',
    affixes: [
      { id: 'snow', tier: 3 },
      { id: 'crystal', tier: 2 },
      { id: 'weaver', tier: 2 },
    ],
    set: 'snow',
  },
];
export const EQUIPMENT_BOOKS = [
  {
    id: 'book-spark',
    name: '星火附魔书',
    affix: 'spark',
    slots: ['penblade', 'artifact'],
  },
  {
    id: 'book-snow',
    name: '初雪附魔书',
    affix: 'snow',
    slots: ['cloak', 'charm'],
  },
  {
    id: 'book-ribbon',
    name: '缎带附魔书',
    affix: 'ribbon',
    slots: ['cloak', 'charm'],
  },
  {
    id: 'book-echo',
    name: '回响附魔书',
    affix: 'echo',
    slots: ['charm', 'artifact'],
  },
  {
    id: 'book-aurora',
    name: '极光附魔书',
    affix: 'aurora',
    slots: ['cloak', 'artifact'],
  },
  {
    id: 'book-comet',
    name: '彗尾附魔书',
    affix: 'comet',
    slots: ['penblade', 'artifact'],
  },
  {
    id: 'book-artisan',
    name: '巧匠附魔书',
    affix: 'artisan',
    slots: ['penblade', 'charm'],
  },
  {
    id: 'book-weaver',
    name: '织梦附魔书',
    affix: 'weaver',
    slots: ['cloak', 'artifact'],
  },
  {
    id: 'book-crystal',
    name: '晶莹附魔书',
    affix: 'crystal',
    slots: ['charm', 'artifact'],
  },
] as const;
export const EQUIPMENT_SYNERGIES = [
  {
    id: 'reader',
    name: '读书伙伴',
    pieces: 2,
    description: '翻页时出现纸羽书签；不改变学习结果。',
  },
  {
    id: 'ink',
    name: '墨海同航',
    pieces: 2,
    description: '水波与墨点组成完成仪式。',
  },
  {
    id: 'star',
    name: '星际漫游',
    pieces: 2,
    description: '企鹅的庆祝轨迹化为星环。',
  },
  {
    id: 'snow',
    name: '雪夜来信',
    pieces: 2,
    description: '雪花和铃声一起落下。',
  },
  {
    id: 'dawn',
    name: '晨曦同行',
    pieces: 2,
    description: '完成动画呈现温暖晨光。',
  },
];
export const EQUIPMENT_SUPPLIES = [
  {
    id: 'forge-ore-pack',
    name: '矿晶补给',
    cost: 80,
    type: 'material' as const,
    description: '用于强化、觉醒与重铸；内含矿晶 12 枚。',
    materials: { ore: 12, ink: 0, thread: 0 },
  },
  {
    id: 'forge-ink-pack',
    name: '星墨补给',
    cost: 100,
    type: 'material' as const,
    description: '用于附魔与重铸；内含星墨 10 滴。',
    materials: { ore: 0, ink: 10, thread: 0 },
  },
  {
    id: 'forge-thread-pack',
    name: '梦线补给',
    cost: 80,
    type: 'material' as const,
    description: '用于披风、护符强化；内含梦线 12 束。',
    materials: { ore: 0, ink: 0, thread: 12 },
  },
];
export const EQUIPMENT_DROP_RATES = {
  common: 0.6,
  rare: 0.28,
  epic: 0.1,
  unique: 0.02,
};
export const STARTER_EQUIPMENT = [
  'ink-quill',
  'reader-cape',
  'bookmark-charm',
  'ink-compass',
];
export const STARTER_BOOKS = ['book-spark', 'book-snow', 'book-ribbon'];
export const STARTER_MATERIALS: EquipmentMaterials = {
  ore: 24,
  ink: 18,
  thread: 24,
};
