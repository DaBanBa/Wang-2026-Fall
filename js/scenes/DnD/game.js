/*
   D&D
*/

import * as cg from '../../render/core/cg.js';
import {
   N, KIND, GROUND, KINDS, weaponOf, startHero, startScores, startPack, MP_MAX,
} from './data.js';
import {
   bindArt, makeToken, makeGround, makeItemIcon,
} from './models.js';
import { createUI } from './ui.js';
import { here, keyEdge, pressed, rise, handPos } from './input.js';
import { installWorld } from './world.js';
import { installSheets } from './sheets.js';
import { installPicking } from './picking.js';
import { installDock } from './dock.js';
import { installTable } from './table.js';
import { installAdventure } from './adventure.js';
import { installCombat } from './combat.js';
import { installPose } from './pose.js';

export const init = async model => {
   bindArt(model);
   const S = {
      mode: 'god',
      turn: 1,
      mp: MP_MAX,
      night: false,
      hero: startHero(),
      stats: startScores(),
      pack: startPack(),
      equipped: 1,
      nextUid: 3,
      pieces: [],
      nextPid: 1,
      drag: null,
      chestId: 0,
      packOpen: false,
      focus: null,
      combat: null,
      roll: null,
      log: '',
      selected: 'chest',
      groundSel: 'grass',
      paintNote: '',
      ground: Array.from({ length: N }, () => Array(N).fill('stone')),
      hover: null,
      joyAt: 0,
      moveLock: 0,
      uiHover: null,
      justFled: 0,
   };

   const stage = model.add();
   const tiles = [];
   const glows = [];
   for (let r = 0; r < N; r++) {
      tiles[r] = [];
      glows[r] = [];
      for (let c = 0; c < N; c++) {
         tiles[r][c] = makeGround(stage, 'stone');
         glows[r][c] = stage.add('cube').color(1, .82, .25).opacity(.5);
      }
   }
   const hoverRing = stage.add('cube').color(1.2, .9, .25).opacity(.55);
   const stampTile = makeGround(stage, 'grass');

   const icons = {};
   KINDS.forEach(kind => {
      icons[kind] = makeToken(stage, kind);
   });
   const avatar = makeToken(stage, 'hero');
   const handWep = makeItemIcon(model);

   const tokens = new Map();
   const coinRoot = model.add();
   const coinRim = coinRoot.add('tubeZ').color(.62, .46, .16).dull();
   const coinHeads = coinRoot.add('tubeZ').color(.96, .78, .28).dull();
   const coinTails = coinRoot.add('tubeZ').color(.38, .28, .16).dull();

   const g = {
      model, S, stage, tiles, glows, hoverRing, stampTile,
      icons, avatar, handWep, tokens,
      coinRoot, coinRim, coinHeads, coinTails,
      was: { left0: false, right0: false, left1: false, right1: false, left4: false, right4: false },
      endingTurn: false,
      advAnchor: [0, 0, 0],
      dock: null,
      cards: { hud: null, pack: null, inspect: null, fight: null },
      ui: null,
   };

   installWorld(g);
   installSheets(g);
   installDock(g);
   installPicking(g);
   installTable(g);
   installAdventure(g);
   installCombat(g);
   installPose(g);

   const hooks = {
      selectKind: kind => { S.selected = kind; S.log = KIND[kind].label + '.'; },
      selectedKind: () => S.selected,
      selectGround: id => { S.groundSel = id; S.paintNote = ''; S.log = GROUND[id].label + '.'; },
      selectedGround: () => S.groundSel,
      enterAdv: () => g.enterAdv(),
      enterGod: () => g.enterGod(),
      enterTiles: () => g.enterTiles(),
      fillGround: () => g.fillGround(),
      clear: () => g.clearBoard(),
      addLoot: i => g.addLoot(i),
      removeLoot: i => g.removeLoot(i),
      closeChest: () => { S.chestId = 0; g.ui.chest.hide(); },
      chestLoot: () => {
         const p = S.pieces.find(x => x.id === S.chestId);
         return (p && p.loot) || [];
      },
      togglePack: () => {
         S.packOpen = !S.packOpen;
         if (S.packOpen) { g.layoutDock(); g.ui.pack.show(); }
         else g.ui.pack.hide();
      },
      endTurn: () => g.endTurn(),
      interact: () => g.tryInteract(),
      hero: () => S.hero,
      scores: () => S.stats,
      weapon: () => weaponOf(S.pack, S.equipped),
      night: () => S.night,
      turn: () => S.turn,
      mp: () => S.mp,
      log: () => S.log,
      packItems: () => S.pack,
      equipped: () => S.equipped,
      useSlot: i => g.useSlot(i),
      combat: () => S.combat,
      roll: () => S.roll,
      attack: () => g.combatAttack(),
      flee: () => g.combatFlee(),
      useHerb: () => g.useHerb(),
      reroll: () => g.rerollFail(),
      confirmRoll: () => g.confirmRoll(),
   };
   g.ui = createUI(model, stage, hooks);

   inputEvents.onPress = hand => {
      if (!here()) return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'ui') { g.grab(hand); return; }
      if (hit && hit.kind === 'card' && S.mode === 'adv') { g.grabCard(hit.id, hand); return; }
      if (S.mode === 'god' || S.mode === 'tile') g.grab(hand);
      else if (S.mode === 'adv' && !S.combat) {
         if (hit && hit.kind === 'piece') g.inspectPiece(hit.piece);
         else if (hit && hit.kind === 'tile') {
            const p = g.pieceAt(hit.c, hit.r);
            if (p && KIND[p.kind] && KIND[p.kind].interact) g.inspectPiece(p);
            else g.stepTo(hit.c, hit.r);
         }
      }
   };
   inputEvents.onDrag = hand => {
      if (!here()) return;
      if (S.drag && S.drag.kind === 'card' && S.drag.hand === hand) {
         g.moveCard(hand);
         return;
      }
      if (S.mode === 'tile' && S.drag && S.drag.hand === hand && S.drag.kind === 'paint') {
         g.strokePaint(hand);
         return;
      }
      if (!S.drag || S.drag.hand !== hand) return;
      const aim = g.hoverTile(hand);
      if (aim && S.drag.start && S.drag.start.c != null && (aim.c !== S.drag.start.c || aim.r !== S.drag.start.r)) S.drag.moved = true;
      const hp = handPos(hand);
      if (hp && S.drag.from && cg.distance(hp, S.drag.from) > 0.02) S.drag.moved = true;
   };
   inputEvents.onRelease = hand => {
      if (!here()) return;
      g.drop(hand);
   };
   inputEvents.onClick = hand => {
      if (!here() || S.mode !== 'god') return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'piece' && hit.piece.kind === 'chest') g.openChestWidget(hit.piece);
   };

   g.ui.god.show();

   model.animate(() => {
      if (!here()) return;
      if (keyEdge('tab') || keyEdge('g')) {
         if (S.mode === 'god') g.enterAdv();
         else if (S.mode === 'tile') g.enterGod();
         else g.enterGod();
      }
      if (keyEdge('t')) {
         if (S.mode === 'tile') g.enterGod(); else if (S.mode !== 'adv') g.enterTiles();
      }
      if (keyEdge('b')) hooks.togglePack();
      if (keyEdge('n') || keyEdge('enter')) g.endTurn();
      if (keyEdge('e') || keyEdge(' ')) g.tryInteract();
      if (keyEdge('a') && S.mode === 'god') g.godInspect();
      KINDS.forEach((kind, i) => { if (keyEdge(String(i + 1))) S.selected = kind; });
      if (rise(g.was, 'left', 4, 'left4') || rise(g.was, 'right', 4, 'right4')) {
         if (S.mode === 'adv') g.tryInteract();
         else if (S.mode === 'god') g.godInspect();
      }
      if (rise(g.was, 'left', 1, 'left1')) {
         if (S.mode === 'adv') hooks.togglePack();
      }
      if (rise(g.was, 'right', 1, 'right1') && S.mode === 'god') {
         const hit = g.pick('right');
         if (hit && hit.kind === 'piece') { g.removePiece(hit.piece); g.say('Removed.'); }
      }
      if (S.mode === 'tile') {
         if (pressed('left', 1)) g.strokePaint('left');
         if (pressed('right', 1)) g.strokePaint('right');
      }
      g.pollMove();
      g.updateRoll();
      g.poseStage();
      g.poseBoard();
      g.poseShelf();
      g.posePieces();
      g.poseAvatar();
      g.poseCoin();
      g.poseUI();
   });
};
