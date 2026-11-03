// 2024 ability checks, attack math, and experience.

export const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABIL_NAME = {
   str: 'Strength', dex: 'Dexterity', con: 'Constitution',
   int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
export const ABIL_SHORT = {
   str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

export const abilityMod = score => Math.floor(((Number(score) || 10) - 10) / 2);
export const signed = n => (n < 0 ? '' : '+') + n;
export const profBonus = level => 2 + Math.floor((Math.max(1, level) - 1) / 4);

const XP_AT = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
export const xpForLevel = level => XP_AT[Math.max(0, Math.min(19, level - 1))] || 0;

export const HERO_LEVEL = 5;

export const rollDie = sides => 1 + Math.floor(Math.random() * sides);
export const rollPool = (n, sides) => {
   let s = 0;
   for (let i = 0; i < n; i++) s += rollDie(sides);
   return s;
};

export const attackBonus = (scores, level, w) => {
   if (!w) return 0;
   const pb = w.prof ? profBonus(level) : 0;
   return abilityMod(scores[w.stat]) + pb + (w.magic || 0);
};

export const damageBonus = (scores, w) => (w.flat || 0) + abilityMod(scores[w.stat]) + (w.magic || 0);

export const damageFormula = (scores, w) => {
   const b = damageBonus(scores, w);
   if (!w.die) return String(b);
   return w.n + 'd' + w.die + signed(b);
};

export const rollWeaponDamage = (scores, w, crit) => {
   const n = (w.n || 0) * (crit ? 2 : 1);
   return Math.max(0, damageBonus(scores, w) + (n ? rollPool(n, w.die) : 0));
};

export const rollMonsterDamage = (atk, crit) => {
   const n = (atk.n || 0) * (crit ? 2 : 1);
   return Math.max(0, (atk.mod || 0) + (n ? rollPool(n, atk.die) : 0));
};
