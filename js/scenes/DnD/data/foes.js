// Monster stat blocks. Titles are the names shown on the card.

import { signed } from './rules.js';

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

export const attackText = atk => {
   if (!atk) return '';
   return atk.name + ' ' + signed(atk.bonus) + ' (' + atk.n + 'd' + atk.die + signed(atk.mod) + ')';
};

export const foeSheet = kind => {
   const src = FOES[kind] || {
      name: 'Wolf', title: 'Wild Thing', cr: '1/4', xp: 50, gold: 5,
      ac: 13, hp: 11, speed: 40,
      str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
      attack: bite('Bite', 4, 2, 4, 2, 'piercing'),
   };
   return Object.assign({ hpMax: src.hp, portrait: FOES[kind] ? kind : 'boar' }, src);
};

export const monsterSheet = () => foeSheet('monster');
