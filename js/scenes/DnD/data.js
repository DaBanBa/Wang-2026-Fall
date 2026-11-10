const dnd_data_board = (() => {
   const N = 8;
   const TILE = 0.07;
   const HALF = N * TILE / 2;
   const TABLE_Y = 0.74;
   const BOARD_Z = -0.24;
   const ADV = 42;
   const MP_MAX = 3;

   const GROUNDS = ['stone', 'grass', 'floor', 'dirt', 'water', 'sand'];
   const GROUND = {
      stone: { label: 'Stone', color: [.55, .58, .62], night: [.28, .30, .36], block: false, h: 1 },
      grass: { label: 'Grass', color: [.34, .62, .28], night: [.14, .28, .14], block: false, h: 1 },
      floor: { label: 'Ledge', color: [.55, .36, .18], night: [.26, .16, .10], block: false, h: 1 },
      dirt:  { label: 'Dirt',  color: [.52, .34, .18], night: [.26, .16, .10], block: false, h: 1 },
      water: { label: 'Water', color: [.20, .48, .82], night: [.08, .18, .36], block: true,  h: 0.55 },
      sand:  { label: 'Sand',  color: [.86, .62, .28], night: [.42, .30, .14], block: false, h: 1 },
   };
   return { N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, GROUNDS, GROUND };
})();

const dnd_data_rules = (() => {
   const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
   const ABIL_NAME = {
      str: 'Strength', dex: 'Dexterity', con: 'Constitution',
      int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
   };
   const ABIL_SHORT = {
      str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
   };

   const abilityMod = score => Math.floor(((Number(score) || 10) - 10) / 2);
   const signed = n => (n < 0 ? '' : '+') + n;
   const profBonus = level => 2 + Math.floor((Math.max(1, level) - 1) / 4);

   const XP_AT = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
   const xpForLevel = level => XP_AT[Math.max(0, Math.min(19, level - 1))] || 0;

   const HERO_LEVEL = 5;

   const rollDie = sides => 1 + Math.floor(Math.random() * sides);
   const rollPool = (n, sides) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += rollDie(sides);
      return s;
   };

   const attackBonus = (scores, level, w) => {
      if (!w) return 0;
      const pb = w.prof ? profBonus(level) : 0;
      return abilityMod(scores[w.stat]) + pb + (w.magic || 0);
   };

   const damageBonus = (scores, w) => (w.flat || 0) + abilityMod(scores[w.stat]) + (w.magic || 0);

   const damageFormula = (scores, w) => {
      const b = damageBonus(scores, w);
      if (!w.die) return String(b);
      return w.n + 'd' + w.die + signed(b);
   };

   const rollWeaponDamage = (scores, w, crit) => {
      const n = (w.n || 0) * (crit ? 2 : 1);
      return Math.max(0, damageBonus(scores, w) + (n ? rollPool(n, w.die) : 0));
   };

   const rollMonsterDamage = (atk, crit) => {
      const n = (atk.n || 0) * (crit ? 2 : 1);
      return Math.max(0, (atk.mod || 0) + (n ? rollPool(n, atk.die) : 0));
   };
   return { ABILS, ABIL_NAME, ABIL_SHORT, abilityMod, signed, profBonus, xpForLevel, HERO_LEVEL, rollDie, rollPool, attackBonus, damageBonus, damageFormula, rollWeaponDamage, rollMonsterDamage };
})();

const dnd_data_pawns = (() => {
   const pawn = (label, sprite, interact, title) => ({
      label, block: interact !== 'chest', stand: interact !== 'fight',
      sprite, interact, title: title || '',
   });

   const KINDS = [
      'chest', 'dragon', 'boar', 'tree',
      'moss', 'pillar', 'idol', 'white', 'rubble', 'black', 'gray', 'knight', 'healer',
      'pine', 'dead', 'tiefling', 'drow', 'elf',
      'goblin', 'shroom', 'skeleton', 'slime', 'fire',
   ];

   const KIND = {
      chest:  pawn('Chest',  'chest',  'chest', 'Locked'),
      dragon: pawn('Dragon', 'dragon', 'fight', 'Smaug'),
      boar:   pawn('Boar',   'boar',   'fight', 'Pumbaa'),
      tree:   pawn('Tree',   'tree',   null,    'Ancient oak'),
      moss:   pawn('Moss',   'moss',   null,    'Mossy boulder'),
      pillar: pawn('Pillar', 'pillar', null,    'Stone spire'),
      idol:   pawn('Idol',   'idol',   null,    'Wolf statue'),
      white:  pawn('White',  'white',  'fight', 'Grey Wind'),
      rubble: pawn('Rubble', 'rubble', null,    'Loose stone'),
      black:  pawn('Black',  'black',  'fight', 'Night Hound'),
      gray:   pawn('Gray',   'gray',   'fight', 'ShaggyDog'),
      knight: pawn('Knight', 'knight', null,    'Stone knight'),
      healer: pawn('Healer', 'healer', null,    'Stone healer'),
      pine:     pawn('Pine',     'pine',     null, 'Pine'),
      dead:     pawn('Dead',     'dead',     null, 'Dead tree'),
      tiefling: pawn('Tiefling', 'tiefling', null, 'Tiefling'),
      drow:     pawn('Drow',     'drow',     null, 'Drow'),
      elf:      pawn('Elf',      'elf',      null, 'Elf'),
      goblin:   pawn('Goblin',   'goblin',   'fight', 'Goblin'),
      shroom:   pawn('Shroom',   'shroom',   'fight', 'Mushroom'),
      skeleton: pawn('Skeleton', 'skeleton', 'fight', 'Skeleton'),
      slime:    pawn('Slime',    'slime',    'fight', 'Slime'),
      fire:     pawn('Fire',     'fire',     null,    'Campfire'),
   };
   return { KINDS, KIND };
})();

const dnd_data_gear = (() => {
   const { HERO_LEVEL, abilityMod, profBonus, rollPool } = dnd_data_rules;

   const WEAPONS = {
      fists:       { name: 'Unarmed Strike', stat: 'str', prof: true, n: 0, die: 0, flat: 1, magic: 0, type: 'bludgeoning' },
      iron_sword:  { name: 'Longsword',      stat: 'str', prof: true, n: 1, die: 8, flat: 0, magic: 0, type: 'slashing' },
      relic_sword: { name: 'Relic Sword',    stat: 'str', prof: true, n: 1, die: 8, flat: 0, magic: 2, type: 'slashing' },
      battleaxe:   { name: 'Battleaxe',      stat: 'str', prof: true, n: 1, die: 10, flat: 0, magic: 0, type: 'slashing' },
      longbow:     { name: 'Longbow',        stat: 'dex', prof: true, n: 1, die: 8, flat: 0, magic: 0, type: 'piercing' },
   };

   const ITEMS = {
      godsbeard: { name: 'Potion of Healing', n: 2, die: 4, mod: 2 },
      spellbook: { name: 'Spellbook' },
      gold:      { name: 'Gold' },
   };

   const LOOT = [
      { label: '+10 Gold',     tag: '10 GOLD', make: () => ({ type: 'gold', amount: 10 }) },
      { label: 'HP Pot',       tag: 'HP POT',  make: () => ({ type: 'item', id: 'godsbeard' }) },
      { label: 'Iron Sword',   tag: 'IRON',    make: () => ({ type: 'weapon', id: 'iron_sword' }) },
      { label: 'Relic Sword',  tag: 'RELIC',   make: () => ({ type: 'weapon', id: 'relic_sword' }) },
      { label: 'Battleaxe',    tag: 'AXE',     make: () => ({ type: 'weapon', id: 'battleaxe' }) },
      { label: 'Longbow',      tag: 'BOW',     make: () => ({ type: 'weapon', id: 'longbow' }) },
      { label: 'Spellbook',    tag: 'BOOK',    make: () => ({ type: 'item', id: 'spellbook' }) },
   ];

   const rollPotion = () => rollPool(ITEMS.godsbeard.n, ITEMS.godsbeard.die) + ITEMS.godsbeard.mod;

   const itemLabel = item => {
      if (!item) return '';
      if (item.type === 'gold') return item.amount + ' Gold';
      if (item.type === 'weapon') return WEAPONS[item.id].name;
      if (item.type === 'item') return ITEMS[item.id].name;
      return 'Unknown';
   };

   const weaponOf = (pack, equipped) => {
      const it = pack.find(p => p.uid === equipped);
      return (it && it.type === 'weapon' && WEAPONS[it.id]) || WEAPONS.fists;
   };

   const heroDefense = scores => {
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
   return { WEAPONS, ITEMS, LOOT, rollPotion, itemLabel, weaponOf, heroDefense };
})();

const dnd_data_foes = (() => {
   const { signed } = dnd_data_rules;

   const bite = (name, bonus, n, die, mod, type) => ({ name, bonus, n, die, mod, type });

   const FOES = {
      dragon: {
         name: 'Red Dragon Wyrmling', title: 'Smaug', cr: '4', xp: 1100, gold: 50,
         ac: 17, hp: 75, speed: 30,
         str: 19, dex: 10, con: 17, int: 12, wis: 11, cha: 15,
         attack: bite('Bite', 6, 1, 10, 4, 'piercing'),
         breath: { name: 'Fire Breath', recharge: 5, dc: 13, n: 7, die: 6, type: 'fire' },
      },
      boar: {
         name: 'Boar', title: 'Pumbaa', cr: '1/4', xp: 50, gold: 5,
         ac: 11, hp: 11, speed: 40,
         str: 13, dex: 11, con: 12, int: 2, wis: 9, cha: 5,
         attack: bite('Tusk', 3, 1, 6, 1, 'slashing'),
      },
      white: {
         name: 'Dire Wolf', title: 'Grey Wind', cr: '1', xp: 200, gold: 15,
         ac: 14, hp: 37, speed: 50,
         str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7,
         attack: bite('Bite', 5, 2, 6, 3, 'piercing'),
      },
      black: {
         name: 'Dire Wolf', title: 'Night Hound', cr: '1', xp: 200, gold: 15,
         ac: 14, hp: 37, speed: 50,
         str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7,
         attack: bite('Bite', 5, 2, 6, 3, 'piercing'),
      },
      gray: {
         name: 'Wolf', title: 'ShaggyDog', cr: '1/4', xp: 50, gold: 7,
         ac: 13, hp: 11, speed: 40,
         str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
         attack: bite('Bite', 4, 2, 4, 2, 'piercing'),
         pack: true,
      },
      goblin: {
         name: 'Goblin', title: 'Goblin', cr: '1/4', xp: 50, gold: 5,
         ac: 15, hp: 7, speed: 30,
         str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
         attack: bite('Scimitar', 4, 1, 6, 2, 'slashing'),
      },
      shroom: {
         name: 'Violet Fungus', title: 'Mushroom', cr: '1/4', xp: 50, gold: 2,
         ac: 5, hp: 18, speed: 5,
         str: 3, dex: 1, con: 10, int: 1, wis: 3, cha: 1,
         attack: bite('Rotting Touch', 2, 1, 4, 0, 'necrotic'),
      },
      skeleton: {
         name: 'Skeleton', title: 'Skeleton', cr: '1/4', xp: 50, gold: 5,
         ac: 13, hp: 13, speed: 30,
         str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
         attack: bite('Shortsword', 4, 1, 6, 2, 'piercing'),
      },
      slime: {
         name: 'Gray Ooze', title: 'Slime', cr: '1/2', xp: 100, gold: 8,
         ac: 8, hp: 22, speed: 10,
         str: 12, dex: 6, con: 16, int: 1, wis: 6, cha: 2,
         attack: bite('Pseudopod', 3, 3, 6, 1, 'acid'),
      },
   };

   const attackText = atk => {
      if (!atk) return '';
      return atk.name + ' ' + signed(atk.bonus) + ' (' + atk.n + 'd' + atk.die + signed(atk.mod) + ')';
   };

   const foeSheet = kind => {
      const src = FOES[kind] || {
         name: 'Wolf', title: 'Wild Thing', cr: '1/4', xp: 50, gold: 5,
         ac: 13, hp: 11, speed: 40,
         str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
         attack: bite('Bite', 4, 2, 4, 2, 'piercing'),
      };
      return Object.assign({ hpMax: src.hp, portrait: FOES[kind] ? kind : 'boar' }, src);
   };

   const monsterSheet = () => foeSheet('monster');
   return { attackText, foeSheet, monsterSheet };
})();

const dnd_data_hero = (() => {
   const { abilityMod, profBonus, xpForLevel } = dnd_data_rules;
   const { heroDefense } = dnd_data_gear;

   const startScores = () => ({
      str: 18, dex: 14, con: 16, int: 10, wis: 13, cha: 10,
   });

   const startHero = () => {
      const d = heroDefense(startScores());
      return {
         c: 4, r: 6,
         level: d.level, className: d.className, xp: xpForLevel(d.level),
         hp: d.hpMax, hpMax: d.hpMax, ac: d.ac, pb: d.pb,
         speed: d.speed, init: d.init, armor: d.armor,
         insp: 1, gold: 8, face: 0,
      };
   };

   const grantXp = (hero, scores, amount) => {
      hero.xp = (hero.xp || 0) + (amount || 0);
      let note = '';
      while (hero.level < 20 && hero.xp >= xpForLevel(hero.level + 1)) {
         hero.level += 1;
         const gain = 6 + abilityMod(scores.con);
         hero.hpMax += gain;
         hero.hp += gain;
         hero.pb = profBonus(hero.level);
         note = ' Reached level ' + hero.level + '.';
      }
      return note;
   };

   const startPack = () => ([
      { uid: 1, type: 'weapon', id: 'iron_sword' },
      { uid: 2, type: 'item', id: 'godsbeard' },
   ]);
   return { startScores, startHero, grantXp, startPack };
})();

const dnd_data = (() => {
   const { N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, GROUNDS, GROUND } = dnd_data_board;
   const { ABILS, ABIL_NAME, ABIL_SHORT, abilityMod, signed, profBonus, xpForLevel, HERO_LEVEL, rollDie, rollPool, attackBonus, damageBonus, damageFormula, rollWeaponDamage, rollMonsterDamage } = dnd_data_rules;
   const { KINDS, KIND } = dnd_data_pawns;
   const { WEAPONS, ITEMS, LOOT, rollPotion, itemLabel, weaponOf, heroDefense } = dnd_data_gear;
   const { attackText, foeSheet, monsterSheet } = dnd_data_foes;
   const { startScores, startHero, grantXp, startPack } = dnd_data_hero;
   return { N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, GROUNDS, GROUND, ABILS, ABIL_NAME, ABIL_SHORT, abilityMod, signed, profBonus, xpForLevel, HERO_LEVEL, rollDie, rollPool, attackBonus, damageBonus, damageFormula, rollWeaponDamage, rollMonsterDamage, KINDS, KIND, WEAPONS, ITEMS, LOOT, rollPotion, itemLabel, weaponOf, heroDefense, attackText, foeSheet, monsterSheet, startScores, startHero, grantXp, startPack };
})();

export const { N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, GROUNDS, GROUND, ABILS, ABIL_NAME, ABIL_SHORT, abilityMod, signed, profBonus, xpForLevel, HERO_LEVEL, rollDie, rollPool, attackBonus, damageBonus, damageFormula, rollWeaponDamage, rollMonsterDamage, KINDS, KIND, WEAPONS, ITEMS, LOOT, rollPotion, itemLabel, weaponOf, heroDefense, attackText, foeSheet, monsterSheet, startScores, startHero, grantXp, startPack } = dnd_data;
