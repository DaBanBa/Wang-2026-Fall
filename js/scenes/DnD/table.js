// God Mode: paint tiles, place pawns, and switch modes.

import { N, KIND, GROUND, LOOT, WEAPONS, MP_MAX, startHero } from './data.js';
import { eyeOf, now, inb, handPos, pressed, tone, buzz } from './input.js';

export const installTable = g => {
   g.openChestWidget = piece => {
      g.S.chestId = piece.id;
      g.ui.chest.show();
      g.say('Chest.');
   };

   g.addLoot = i => {
      const p = g.S.pieces.find(x => x.id === g.S.chestId);
      if (!p || !p.loot || p.loot.length >= 6) return;
      p.loot.push(LOOT[i].make());
      g.say(LOOT[i].label + ' dropped in the chest.');
   };

   g.removeLoot = i => {
      const p = g.S.pieces.find(x => x.id === g.S.chestId);
      if (!p || !p.loot || !p.loot[i]) return;
      p.loot.splice(i, 1);
   };

   g.paintCell = (c, r, id, quiet) => {
      const { S } = g;
      if (!inb(c, r)) return false;
      const next = id || S.groundSel;
      if (S.ground[r][c] === next) return false;
      S.ground[r][c] = next;
      if (!quiet) {
         g.say(GROUND[next].label + ' on ' + g.tileName(c, r) + '.');
         tone(480, .05);
      }
      return true;
   };

   g.strokePaint = hand => {
      const { S } = g;
      if (S.mode !== 'tile') return;
      if (S.drag && S.drag.kind !== 'paint') return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'ui') return;
      const aim = g.hoverTile(hand);
      if (!aim) return;
      if (g.paintCell(aim.c, aim.r, S.groundSel, true)) {
         if (S.paintNote !== S.groundSel) {
            S.paintNote = S.groundSel;
            g.say(GROUND[S.groundSel].label + '.');
         }
         buzz(hand, .12, 12);
      }
   };

   g.liftTile = (hand, c, r) => {
      const { S } = g;
      const type = S.ground[r][c];
      S.groundSel = type;
      S.paintNote = '';
      S.drag = { hand, kind: 'tile', c, r, type, t0: now(), start: { c, r }, from: handPos(hand), moved: false };
      g.say(GROUND[type].label + '.');
      buzz(hand, .22, 18);
   };

   g.grabStamp = (hand, id) => {
      const { S } = g;
      S.groundSel = id;
      S.paintNote = '';
      S.drag = { hand, kind: 'stamp', type: id, t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
      g.say(GROUND[id].label + '.');
      buzz(hand, .25, 20);
   };

   g.useUI = (hit, hand) => {
      const { S, ui } = g;
      const c = hit.cell;
      if (c.type === 'kind') {
         S.selected = c.id;
         S.drag = { hand, kind: 'ghost', palette: c.id, t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
         g.say(KIND[c.id].label + '.');
         buzz(hand, .3, 30);
         return;
      }
      if (c.type === 'ground') {
         g.grabStamp(hand, c.id);
         return;
      }
      if (c.type === 'add') { g.addLoot(c.index); return; }
      if (c.type === 'drop') { g.removeLoot(c.index); return; }
      if (c.type === 'slot') { g.inspectSlot(c.index); return; }
      if (c.id === 'tiles') g.enterTiles();
      else if (c.id === 'enter') g.enterAdv();
      else if (c.id === 'clear') g.clearBoard();
      else if (c.id === 'build') g.enterGod();
      else if (c.id === 'fill') g.fillGround();
      else if (c.id === 'close' && hit.kit === ui.chest) { S.chestId = 0; ui.chest.hide(); }
      else if (c.id === 'close' && hit.kit === ui.pack) { S.packOpen = false; ui.pack.hide(); }
      else if (c.id === 'close' && hit.kit === ui.inspect) g.closeFocus();
      else if (c.id === 'act') g.tryInteract();
      else if (c.id === 'end') g.endTurn();
      else if (c.id === 'god') g.enterGod();
      else if (c.id === 'equip') {
         const it = S.focus && S.pack[S.focus.index];
         if (it && it.type === 'weapon') { S.equipped = it.uid; g.say('Equipped ' + WEAPONS[it.id].name + '.'); tone(480, .07); }
      }
      else if (c.id === 'unequip') {
         S.equipped = 0;
         g.say('Unequipped. Fists ready.');
         tone(260, .07);
      }
      else if (c.id === 'use') {
         if (S.focus && S.focus.kind === 'item') g.useSlot(S.focus.index);
         g.closeFocus();
      }
      else if (c.id === 'open') {
         const p = S.focus && S.pieces.find(x => x.id === S.focus.id);
         g.closeFocus();
         if (p) g.interactPiece(p);
      }
      else if (c.id === 'fight') {
         const p = S.focus && S.pieces.find(x => x.id === S.focus.id);
         g.closeFocus();
         if (p) g.startFight(p);
      }
      else if (c.id === 'attack') g.combatAttack();
      else if (c.id === 'flee') g.combatFlee();
      else if (c.id === 'herb') g.useHerb();
      else if (c.id === 'reroll') g.rerollFail();
      else if (c.id === 'confirm') g.confirmRoll();
   };

   g.grab = hand => {
      const { S } = g;
      const hit = g.pick(hand);
      if (!hit) return;
      if (hit.kind === 'ui') { g.useUI(hit, hand); return; }
      if (S.mode === 'tile') {
         if (hit.kind === 'tile') g.liftTile(hand, hit.c, hit.r);
         return;
      }
      if (S.mode !== 'god') return;
      if (hit.kind === 'piece') {
         S.drag = { hand, kind: 'piece', piece: hit.piece, t0: now(), start: { c: hit.piece.c, r: hit.piece.r }, from: handPos(hand), moved: false };
         buzz(hand, .25, 25);
      } else if (hit.kind === 'avatar') {
         S.drag = { hand, kind: 'avatar', t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
         buzz(hand, .25, 25);
      } else if (hit.kind === 'tile') {
         g.liftTile(hand, hit.c, hit.r);
      }
   };

   g.drop = hand => {
      const { S } = g;
      if (!S.drag || S.drag.hand !== hand) return;
      const drag = S.drag;
      S.drag = null;
      if (drag.kind === 'card') return;
      const aim = g.hoverTile(hand);
      const dt = now() - drag.t0;

      if (drag.kind === 'ghost') {
         if (!aim) return;
         const p = g.spawnPiece(drag.palette, aim.c, aim.r);
         g.say(p ? KIND[drag.palette].label + ' on ' + g.tileName(aim.c, aim.r) + '.' : 'That tile is taken.');
         tone(p ? 520 : 180, .08);
         return;
      }
      if (drag.kind === 'avatar') {
         if (aim && inb(aim.c, aim.r) && !g.blocks(aim.c, aim.r)) {
            S.hero.c = aim.c; S.hero.r = aim.r;
            g.say('Avatar starts on ' + g.tileName(aim.c, aim.r) + '.');
         }
         return;
      }
      if (drag.kind === 'paint') return;
      if (drag.kind === 'stamp') {
         if (aim && inb(aim.c, aim.r)) {
            g.paintCell(aim.c, aim.r, drag.type);
            tone(420, .06);
         }
         return;
      }
      if (drag.kind === 'tile') {
         if (aim && inb(aim.c, aim.r) && (aim.c !== drag.c || aim.r !== drag.r)) {
            const a = S.ground[drag.r][drag.c];
            const b = S.ground[aim.r][aim.c];
            S.ground[drag.r][drag.c] = b;
            S.ground[aim.r][aim.c] = a;
            g.say(GROUND[a].label + ' swapped with ' + GROUND[b].label + ' on ' + g.tileName(aim.c, aim.r) + '.');
         } else g.say('Tile set down.');
         return;
      }
      if (drag.kind === 'piece') {
         if (pressed(hand, 1)) {
            g.removePiece(drag.piece);
            g.say(KIND[drag.piece.kind].label + ' removed.');
            tone(160, .1);
            return;
         }
         if (dt < .35 && !drag.moved && drag.piece.kind === 'chest') {
            g.openChestWidget(drag.piece);
            return;
         }
         if (aim && inb(aim.c, aim.r) && !g.occupy(aim.c, aim.r, drag.piece)) {
            drag.piece.c = aim.c; drag.piece.r = aim.r;
            g.say(KIND[drag.piece.kind].label + ' moved to ' + g.tileName(aim.c, aim.r) + '.');
            return;
         }
         if (!aim) {
            g.removePiece(drag.piece);
            g.say(KIND[drag.piece.kind].label + ' thrown away.');
            tone(160, .1);
         }
      }
   };

   g.enterAdv = () => {
      const { S, ui } = g;
      if (g.blocks(S.hero.c, S.hero.r)) {
         g.say('Move the avatar off a blocked tile first.');
         return;
      }
      const e = eyeOf();
      g.advAnchor = [e[0], 0, e[2]];
      g.resetCardOrbit();
      g.layoutDock();
      S.mode = 'adv';
      S.mp = MP_MAX;
      S.packOpen = true;
      S.chestId = 0;
      g.closeFocus();
      ui.god.hide();
      ui.tiles.hide();
      ui.chest.hide();
      ui.pack.show();
      ui.hud.show();
      g.say('The dungeon waits.');
      tone(360, .12);
   };

   g.enterGod = () => {
      const { S, ui } = g;
      S.mode = 'god';
      S.combat = null;
      S.roll = null;
      S.drag = null;
      S.packOpen = false;
      g.closeFocus();
      ui.hud.hide();
      ui.pack.hide();
      ui.inspect.hide();
      ui.fight.hide();
      ui.tiles.hide();
      ui.god.show();
      g.say('God Mode.');
   };

   g.enterTiles = () => {
      const { S, ui } = g;
      S.mode = 'tile';
      S.drag = null;
      S.chestId = 0;
      g.closeFocus();
      ui.god.hide();
      ui.chest.hide();
      ui.inspect.hide();
      ui.hud.hide();
      ui.pack.hide();
      ui.fight.hide();
      ui.tiles.show();
      g.say('Terrain.');
      tone(320, .08);
   };

   g.fillGround = () => {
      const { S } = g;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) S.ground[r][c] = S.groundSel;
      g.say('Filled the grid with ' + GROUND[S.groundSel].label + '.');
   };

   g.clearBoard = () => {
      const { S } = g;
      [...S.pieces].forEach(g.removePiece);
      S.hero = startHero();
      g.say('The board is cleared.');
   };
};
