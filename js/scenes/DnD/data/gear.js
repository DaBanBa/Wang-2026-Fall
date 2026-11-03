// Weapons, pack items, and the chest menu.

import { HERO_LEVEL, abilityMod, profBonus, rollPool } from './rules.js';

export const WEAPONS = {
   fists:       { name: 'Unarmed Strike', stat: 'str', prof: true, n: 0, die: 0, flat: 1, magic: 0, type: 'bludgeoning' },
   iron_sword:  { name: 'Longsword',      stat: 'str', prof: true, n: 1, die: 8, flat: 0, magic: 0, type: 'slashing' },
   relic_sword: { name: 'Relic Sword',    stat: 'str', prof: true, n: 1, die: 8, flat: 0, magic: 2, type: 'slashing' },
   battleaxe:   { name: 'Battleaxe',      stat: 'str', prof: true, n: 1, die: 10, flat: 0, magic: 0, type: 'slashing' },
   longbow:     { name: 'Longbow',        stat: 'dex', prof: true, n: 1, die: 8, flat: 0, magic: 0, type: 'piercing' },
};

export const ITEMS = {
   godsbeard: { name: 'Potion of Healing', n: 2, die: 4, mod: 2 },
   spellbook: { name: 'Spellbook' },
   gold:      { name: 'Gold' },
};

export const LOOT = [
   { label: '+10 Gold',     tag: '10 GOLD', make: () => ({ type: 'gold', amount: 10 }) },
   { label: 'HP Pot',       tag: 'HP POT',  make: () => ({ type: 'item', id: 'godsbeard' }) },
   { label: 'Iron Sword',   tag: 'IRON',    make: () => ({ type: 'weapon', id: 'iron_sword' }) },
   { label: 'Relic Sword',  tag: 'RELIC',   make: () => ({ type: 'weapon', id: 'relic_sword' }) },
   { label: 'Battleaxe',    tag: 'AXE',     make: () => ({ type: 'weapon', id: 'battleaxe' }) },
   { label: 'Longbow',      tag: 'BOW',     make: () => ({ type: 'weapon', id: 'longbow' }) },
   { label: 'Spellbook',    tag: 'BOOK',    make: () => ({ type: 'item', id: 'spellbook' }) },
];

export const rollPotion = () => rollPool(ITEMS.godsbeard.n, ITEMS.godsbeard.die) + ITEMS.godsbeard.mod;

export const itemLabel = item => {
   if (!item) return '';
   if (item.type === 'gold') return item.amount + ' Gold';
   if (item.type === 'weapon') return WEAPONS[item.id].name;
   if (item.type === 'item') return ITEMS[item.id].name;
   return 'Unknown';
};

export const weaponOf = (pack, equipped) => {
   const it = pack.find(p => p.uid === equipped);
   return (it && it.type === 'weapon' && WEAPONS[it.id]) || WEAPONS.fists;
};

export const heroDefense = scores => {
   const level = HERO_LEVEL;
   const dex = abilityMod(scores.dex);
   const con = abilityMod(scores.con);
   return {
      level,
      className: 'Fighter',
      pb: profBonus(level),
      ac: 14 + Math.min(2, dex),
      armor: 'Scale Mail',
      speed: 30,
      init: dex,
      hpMax: (10 + con) + (level - 1) * (6 + con),
   };
};
