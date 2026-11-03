// Tabletop dungeon. Character numbers follow the 2024 Player's Handbook.
// Split across data/: board, rules, pawns, gear, foes, hero.

export {
   N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, GROUNDS, GROUND,
} from './data/board.js';
export {
   ABILS, ABIL_NAME, ABIL_SHORT, abilityMod, signed, profBonus, xpForLevel, HERO_LEVEL,
   rollDie, rollPool, attackBonus, damageBonus, damageFormula, rollWeaponDamage, rollMonsterDamage,
} from './data/rules.js';
export { KINDS, KIND } from './data/pawns.js';
export {
   WEAPONS, ITEMS, LOOT, rollPotion, itemLabel, weaponOf, heroDefense,
} from './data/gear.js';
export { attackText, foeSheet, monsterSheet } from './data/foes.js';
export { startScores, startHero, grantXp, startPack } from './data/hero.js';
