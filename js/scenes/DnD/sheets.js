// What the inspect card and the duel card display.

import {
   KIND, ABILS, ABIL_SHORT, WEAPONS, ITEMS,
   abilityMod, signed, profBonus, attackBonus, damageFormula,
   weaponOf, itemLabel, foeSheet, attackText,
} from './data.js';
import { itemSprite as spriteFor } from './models.js';
import { tone } from './input.js';

export const installSheets = g => {
   g.sameFocus = (a, b) => !!(a && b && a.kind === b.kind && a.index === b.index && a.id === b.id);

   g.closeFocus = () => {
      g.S.focus = null;
      if (g.ui.inspect) g.ui.inspect.hide();
   };

   g.openFocus = focus => {
      const { S, ui } = g;
      if (!focus || S.roll) return;
      if (S.mode === 'adv' && S.combat) return;
      if (g.sameFocus(S.focus, focus)) { g.closeFocus(); return; }
      S.focus = focus;
      ui.inspect.show();
      if (S.mode === 'adv' && focus.kind === 'piece') {
         const p = S.pieces.find(x => x.id === focus.id);
         if (p) g.placeToward('inspect', g.pieceWorld(p));
      }
      tone(440, .05);
   };

   g.abilRow = src => ABILS.map(k => ({
      id: k, name: ABIL_SHORT[k], v: src[k] != null ? src[k] : 10, mod: signed(abilityMod(src[k])),
   }));

   g.inspectView = () => {
      const { S } = g;
      const f = S.focus;
      if (!f) return { title: '', sub: '', lines: [], actions: [] };
      if (f.kind === 'hero') {
         const H = S.hero;
         const w = weaponOf(S.pack, S.equipped);
         return {
            title: H.className || 'Fighter',
            sub: 'Level ' + H.level + '  ·  ' + (H.armor || 'Scale Mail'),
            portrait: 'hero',
            bar: { v: H.hp, m: H.hpMax, label: 'HP  ' + H.hp + '/' + H.hpMax },
            stats: g.abilRow(S.stats),
            facts: [
               { k: 'AC', v: H.ac },
               { k: 'PB', v: signed(H.pb) },
               { k: 'Init', v: signed(H.init) },
               { k: 'Spd', v: H.speed },
               { k: 'Insp', v: H.insp },
            ],
            foot: (w ? w.name : 'Unarmed') + '  ' + signed(attackBonus(S.stats, H.level, w)) + '  ' + damageFormula(S.stats, w),
            note: 'XP ' + H.xp + '  ·  Saves STR, CON',
            actions: [],
         };
      }
      if (f.kind === 'item') {
         const it = S.pack[f.index];
         if (!it) return { title: 'Empty', sub: '', lines: [], actions: [] };
         if (it.type === 'weapon') {
            const w = WEAPONS[it.id];
            const on = S.equipped === it.uid;
            return {
               title: w.name,
               sub: (on ? 'Equipped' : 'In your pack') + (w.magic ? '  ·  +' + w.magic : ''),
               item: spriteFor({ type: 'weapon', id: it.id }),
               facts: [
                  { k: 'Hit', v: signed(attackBonus(S.stats, S.hero.level, w)) },
                  { k: 'Dmg', v: damageFormula(S.stats, w) },
                  { k: 'Uses', v: ABIL_SHORT[w.stat] },
               ],
               foot: w.type,
               actions: on ? ['unequip'] : ['equip'],
            };
         }
         if (it.type === 'item' && it.id === 'godsbeard')
            return {
               title: ITEMS.godsbeard.name,
               sub: '2d4+2 hit points',
               item: 'herb',
               actions: ['use'],
            };
         if (it.type === 'item' && it.id === 'spellbook')
            return {
               title: 'Spellbook',
               sub: 'Arcane notes',
               item: 'book',
               actions: [],
            };
         return { title: itemLabel(it), sub: '', lines: [], actions: [] };
      }
      const p = S.pieces.find(x => x.id === f.id);
      if (!p) return { title: '', sub: '', lines: [], actions: [] };
      if (!KIND[p.kind] || !KIND[p.kind].interact) {
         return {
            title: KIND[p.kind] ? KIND[p.kind].label : 'Object',
            sub: (KIND[p.kind] && KIND[p.kind].title) || '',
            portrait: p.kind,
            actions: [],
         };
      }
      if (p.kind === 'chest') {
         const loot = p.loot || [];
         const found = p.found || [];
         return {
            title: p.opened && found.length ? 'You found' : 'Chest',
            sub: p.opened ? (found.length ? found.join('\n') : 'Nothing inside') : 'DC 15 Strength (Athletics)',
            portrait: loot.length && !p.opened ? 'chest_gold' : 'chest',
            foot: p.opened ? (found.length ? 'Added to your pack' : '') : 'Your bonus ' + signed(abilityMod(S.stats.str) + profBonus(S.hero.level)),
            actions: S.mode === 'adv' && !p.opened ? ['open'] : [],
         };
      }
      const sheet = p.sheet || foeSheet(p.kind);
      return {
         title: sheet.title || sheet.name,
         sub: sheet.name + '  ·  CR ' + sheet.cr,
         portrait: sheet.portrait || p.kind,
         bar: { v: sheet.hp, m: sheet.hpMax, label: 'HP  ' + sheet.hp + '/' + sheet.hpMax },
         stats: g.abilRow(sheet),
         facts: [
            { k: 'AC', v: sheet.ac },
            { k: 'Spd', v: sheet.speed },
            { k: 'CR', v: sheet.cr },
         ],
         foot: attackText(sheet.attack),
         note: sheet.breath ? sheet.breath.name + '  DC ' + sheet.breath.dc : '',
         actions: S.mode === 'adv' ? ['fight'] : [],
      };
   };

   g.battleView = () => {
      const { S } = g;
      const sheet = S.combat && S.combat.sheet;
      if (!sheet) return {};
      const actions = ['attack', 'herb', 'flee'];
      if (S.roll && S.roll.waiting && S.roll.why === 'attack') actions.push('reroll', 'confirm');
      return {
         foeName: sheet.title || sheet.name,
         foeAc: sheet.ac,
         foeHp: sheet.hp,
         foeMax: sheet.hpMax,
         foePortrait: sheet.portrait || 'dragon',
         heroName: 'You',
         heroAc: S.hero.ac,
         heroHp: S.hero.hp,
         heroMax: S.hero.hpMax,
         message: S.log || '',
         actions: S.combat.turn === 'player' && !S.roll ? actions
            : (S.roll && S.roll.waiting ? ['reroll', 'confirm'] : []),
      };
   };

   g.inspectPiece = p => {
      const { S, ui } = g;
      if (!p || S.combat || S.roll) return;
      if (S.mode === 'god') {
         if (p.kind === 'chest') {
            g.closeFocus();
            g.openChestWidget(p);
            return;
         }
         S.chestId = 0;
         ui.chest.hide();
         g.openFocus({ kind: 'piece', id: p.id });
         return;
      }
      if (S.mode !== 'adv') return;
      if (!g.nearHero(p.c, p.r)) { g.say('Get next to it first.'); return; }
      if (!KIND[p.kind] || !KIND[p.kind].interact) {
         g.say(KIND[p.kind] && KIND[p.kind].block ? 'The ' + KIND[p.kind].label.toLowerCase() + ' blocks this square.' : 'Nothing to do here.');
         return;
      }
      g.openFocus({ kind: 'piece', id: p.id });
      g.say(KIND[p.kind].label + '.');
   };

   g.inspectHero = () => {
      const { S, ui } = g;
      if (S.combat || S.roll) return;
      S.chestId = 0;
      if (ui.chest) ui.chest.hide();
      g.openFocus({ kind: 'hero' });
      g.say('Adventurer.');
   };

   g.godInspect = () => {
      const { S } = g;
      if (S.mode !== 'god') return;
      const hit = g.pick('right') || g.pick('left');
      if (hit && hit.kind === 'avatar') { g.inspectHero(); return; }
      if (hit && hit.kind === 'piece') { g.inspectPiece(hit.piece); return; }
      if (hit && hit.kind === 'tile') {
         if (hit.c === S.hero.c && hit.r === S.hero.r) { g.inspectHero(); return; }
         const p = g.pieceAt(hit.c, hit.r);
         if (p) { g.inspectPiece(p); return; }
      }
   };

   g.inspectSlot = i => {
      const { S } = g;
      const it = S.pack[i];
      if (!it) return;
      g.openFocus({ kind: 'item', index: i });
      g.say(itemLabel(it) + '.');
   };

   g.showPieceCard = p => {
      if (!p) return;
      g.S.focus = { kind: 'piece', id: p.id };
      g.ui.inspect.show();
      g.placeToward('inspect', g.pieceWorld(p));
   };
};
