// Coin flips stand in for the d20. The face still follows the 2024 roll.

import {
   KIND, WEAPONS, weaponOf, abilityMod, signed, attackBonus,
   rollWeaponDamage, rollMonsterDamage, rollDie, rollPool, rollPotion, grantXp, monsterSheet,
} from './data.js';
import { tone, buzz } from './input.js';

export const installCombat = g => {
   g.settleCoin = R => {
      const d = R.dice[0];
      let face = rollDie(20);
      if (R.advantage) face = Math.max(face, rollDie(20));
      d.face = face;
      d.total = face + R.bonus;
      d.ok = R.attack ? (face === 20 || (face !== 1 && d.total >= R.dc)) : d.total >= R.dc;
      d.done = false;
      d.t = .85;
   };

   g.startRoll = (why, bonus, dc, after, attack, advantage) => {
      const { S, model } = g;
      S.roll = {
         why, bonus, dc, after, attack: !!attack, advantage: !!advantage,
         dice: [{}],
         started: model.time,
         waiting: false,
         inspired: false,
         hold: 0,
      };
      g.settleCoin(S.roll);
      const vs = (attack ? ' vs AC ' : ' vs DC ') + dc;
      g.say((advantage ? 'Pack Tactics. ' : '') + 'Flipping. ' + signed(bonus) + vs);
      tone(300, .05);
   };

   g.finishRoll = () => {
      const { S } = g;
      const R = S.roll;
      if (!R) return;
      R.waiting = false;
      const die = R.dice[0];
      const after = R.after;
      S.roll = null;
      if (after) after(die);
   };

   g.confirmRoll = () => {
      const { S } = g;
      if (!S.roll || S.roll.dice.some(d => !d.done)) return;
      g.finishRoll();
   };

   g.rerollFail = () => {
      const { S, model } = g;
      const R = S.roll;
      if (!R || !R.waiting) return;
      if (R.inspired) { g.say('That coin was already flipped again.'); return; }
      if (S.hero.insp <= 0) { g.say('No Heroic Inspiration.'); return; }
      S.hero.insp -= 1;
      R.inspired = true;
      R.waiting = false;
      R.hold = 0;
      R.started = model.time;
      g.settleCoin(R);
      g.say('Heroic Inspiration. Flipping again.');
      tone(640, .08);
   };

   g.startFight = piece => {
      const { S } = g;
      g.closeFocus();
      g.placeFightCard(piece);
      const sheet = piece.sheet || monsterSheet();
      S.combat = { piece, sheet, turn: 'player' };
      const heroInit = rollDie(20) + abilityMod(S.stats.dex);
      const foeInit = rollDie(20) + abilityMod(sheet.dex);
      const name = sheet.title || sheet.name;
      const heroFirst = heroInit > foeInit || (heroInit === foeInit && abilityMod(S.stats.dex) >= abilityMod(sheet.dex));
      g.say('Initiative ' + heroInit + ' vs ' + foeInit + '. ' + (heroFirst ? 'You go first.' : name + ' goes first.'));
      tone(200, .15);
      if (!heroFirst) g.monsterSwing();
   };

   g.combatAttack = () => {
      const { S } = g;
      if (!S.combat || S.roll || S.combat.turn !== 'player') return;
      const w = weaponOf(S.pack, S.equipped);
      const bonus = attackBonus(S.stats, S.hero.level, w);
      const ac = S.combat.sheet.ac;
      g.startRoll('attack', bonus, ac, die => {
         if (!g.S.combat) return;
         const total = die.face + bonus;
         const crit = die.face === 20;
         const miss = die.face === 1 || (!crit && total < ac);
         if (miss) g.say('Miss. ' + die.face + signed(bonus) + ' = ' + total + ' vs AC ' + ac + '.');
         else {
            const dmg = rollWeaponDamage(g.S.stats, w, crit);
            g.S.combat.sheet.hp = Math.max(0, g.S.combat.sheet.hp - dmg);
            g.say((crit ? 'Critical hit! ' : 'Hit! ') + total + ' vs AC ' + ac + '. ' + dmg + ' ' + w.type + '.');
            tone(180, .1);
         }
         if (g.S.combat.sheet.hp <= 0) g.winFight();
         else { g.S.combat.turn = 'monster'; g.monsterSwing(); }
      }, true);
   };

   g.combatFlee = () => {
      const { S, ui } = g;
      if (!S.combat || S.roll) return;
      g.say('You Disengage.');
      S.justFled = S.combat.piece.id;
      ui.fight.hide();
      S.combat = null;
      S.packOpen = true;
      g.endPlayerTurn();
   };

   g.heroFalls = () => {
      const { S, ui } = g;
      g.say('You fall. The dungeon fades back to the table.');
      S.hero.hp = 1;
      ui.fight.hide();
      S.combat = null;
      g.enterGod();
   };

   g.monsterSwing = () => {
      const { S } = g;
      if (!S.combat) return;
      const sheet = S.combat.sheet;
      const name = sheet.title || sheet.name;
      if (sheet.breath && rollDie(6) >= sheet.breath.recharge) {
         const breath = sheet.breath;
         const saveBonus = abilityMod(S.stats.dex);
         const face = rollDie(20);
         const total = face + saveBonus;
         const saved = total >= breath.dc;
         let dmg = rollPool(breath.n, breath.die);
         if (saved) dmg = Math.floor(dmg / 2);
         S.hero.hp = Math.max(0, S.hero.hp - dmg);
         g.say(breath.name + '. Dexterity ' + total + ' vs DC ' + breath.dc + '. ' + dmg + ' ' + breath.type + '.');
         buzz('left', .7, 80);
         if (S.hero.hp <= 0) g.heroFalls();
         else S.combat.turn = 'player';
         return;
      }
      const allies = S.pieces.filter(p => p !== S.combat.piece && KIND[p.kind] && KIND[p.kind].interact === 'fight'
         && Math.abs(p.c - S.hero.c) + Math.abs(p.r - S.hero.r) <= 1).length;
      const advantage = !!(sheet.pack && allies);
      g.startRoll('monster', sheet.attack.bonus, S.hero.ac, die => {
         if (!g.S.combat) return;
         const bonus = sheet.attack.bonus;
         const total = die.face + bonus;
         const crit = die.face === 20;
         const miss = die.face === 1 || (!crit && total < g.S.hero.ac);
         if (miss) g.say(name + ' misses. ' + total + ' vs AC ' + g.S.hero.ac + '.');
         else {
            const dmg = rollMonsterDamage(sheet.attack, crit);
            g.S.hero.hp = Math.max(0, g.S.hero.hp - dmg);
            g.say(name + (crit ? ' critical hits' : ' hits') + ' for ' + dmg + ' ' + sheet.attack.type + '.');
            buzz('left', .5, 50);
         }
         if (g.S.hero.hp <= 0) g.heroFalls();
         else g.S.combat.turn = 'player';
      }, true, advantage);
   };

   g.winFight = () => {
      const { S, ui } = g;
      const piece = S.combat.piece;
      const sheet = S.combat.sheet;
      S.hero.gold += sheet.gold || 0;
      const note = grantXp(S.hero, S.stats, sheet.xp || 0);
      g.say((sheet.title || sheet.name) + ' falls. +' + (sheet.gold || 0) + ' gp, +' + (sheet.xp || 0) + ' XP.' + note);
      g.removePiece(piece);
      ui.fight.hide();
      S.combat = null;
      S.packOpen = true;
      tone(660, .16);
      g.endPlayerTurn();
   };

   g.useHerb = () => {
      const { S } = g;
      const i = S.pack.findIndex(p => p.type === 'item' && p.id === 'godsbeard');
      if (i < 0) { g.say('No Potion of Healing left.'); return; }
      S.pack.splice(i, 1);
      const heal = rollPotion();
      S.hero.hp = Math.min(S.hero.hpMax, S.hero.hp + heal);
      g.say('Potion of Healing restores ' + heal + ' HP.');
      tone(500, .1);
      if (S.combat && !S.roll) { S.combat.turn = 'monster'; g.monsterSwing(); }
   };

   g.useSlot = i => {
      const { S } = g;
      const it = S.pack[i];
      if (!it) return;
      if (it.type === 'weapon') {
         S.equipped = it.uid;
         g.say('Equipped ' + WEAPONS[it.id].name + '.');
         tone(480, .07);
      } else if (it.type === 'item' && it.id === 'godsbeard') {
         if (S.combat && S.roll) return;
         g.useHerb();
      }
   };

   g.updateRoll = () => {
      const { S, model } = g;
      const R = S.roll;
      if (!R) return;
      const d = R.dice[0];
      if (!d.done && model.time - R.started >= d.t) {
         d.done = true;
         tone(d.face === 20 ? 880 : d.ok ? 700 : 220, .06);
      }
      if (d.done && !R.waiting) {
         R.waiting = true;
         const side = d.ok ? (d.face === 20 ? 'Heads. Critical. ' : 'Heads. ') : 'Tails. ';
         const vs = (R.attack ? ' vs AC ' : ' vs DC ') + R.dc;
         if (R.why === 'attack') g.say(side + d.total + vs + '.');
         else R.hold = model.time + .6;
      }
      if (R.hold && model.time >= R.hold) g.finishRoll();
   };
};
