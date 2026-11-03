// Starting fighter and level-up.

import { abilityMod, profBonus, xpForLevel } from './rules.js';
import { heroDefense } from './gear.js';

export const startScores = () => ({
   str: 18, dex: 14, con: 16, int: 10, wis: 13, cha: 10,
});

export const startHero = () => {
   const d = heroDefense(startScores());
   return {
      c: 4, r: 6,
      level: d.level, className: d.className, xp: xpForLevel(d.level),
      hp: d.hpMax, hpMax: d.hpMax, ac: d.ac, pb: d.pb,
      speed: d.speed, init: d.init, armor: d.armor,
      insp: 1, gold: 8, face: 0,
   };
};

export const grantXp = (hero, scores, amount) => {
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

export const startPack = () => ([
   { uid: 1, type: 'weapon', id: 'iron_sword' },
   { uid: 2, type: 'item', id: 'godsbeard' },
]);
