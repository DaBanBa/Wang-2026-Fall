// Per-frame placement of the board, pawns, coin, and cards.

import * as cg from '../../render/core/cg.js';
import { controllerMatrix } from '../../render/core/controllerInput.js';
import { N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, KIND, KINDS } from './data.js';
import {
   paintTile, setGroundOpacity, tokenSize, poseToken, hideToken, setTokenKind, showItemIcon, itemSprite,
} from './models.js';
import { tileX, tileZ, eyeOf, headMat, beamRay, handPos } from './input.js';

export const installPose = g => {
   g.godMatrix = () => cg.mTranslate(0, TABLE_Y, BOARD_Z);

   g.poseStage = () => {
      const { S, stage } = g;
      if (S.mode === 'god' || S.mode === 'tile') {
         stage.setMatrix(g.godMatrix());
         return;
      }
      const tx = tileX(S.hero.c), tz = tileZ(S.hero.r);
      const M = cg.mMultiply(
         cg.mTranslate(g.advAnchor[0], 0, g.advAnchor[2]),
         cg.mMultiply(cg.mScale(ADV, ADV, ADV), cg.mTranslate(-tx, 0, -tz))
      );
      stage.setMatrix(M);
   };

   g.holdStage = (hand, sy) => {
      const hp = handPos(hand);
      if (!hp) return null;
      const ray = beamRay(hand);
      const world = ray
         ? cg.add(hp, cg.add(cg.scale(ray.d, 0.03), [0, 0.012, 0]))
         : cg.add(hp, [0, 0.02, 0]);
      const q = g.stageOf(world);
      return [q[0], q[1] + (sy || 0.02), q[2]];
   };

   g.poseHeld = (rec, hand, kind, eyeS) => {
      if (!rec) return false;
      const { sx, sy } = tokenSize(kind);
      const q = g.holdStage(hand, sy);
      if (!q) return false;
      poseToken(rec, q[0], q[1], q[2], eyeS, sx, sy, g.model.time * 13);
      return true;
   };

   g.poseBoard = () => {
      const { S, tiles, glows, hoverRing, stampTile } = g;
      const dist = S.mode === 'adv' ? g.reachable() : null;
      let aim = null;
      const pointed = S.mode === 'adv' ? g.advPointer() : {};
      S.aimPiece = pointed.piece ? pointed.piece.id : 0;
      S.aimStep = pointed.tile || null;
      if (S.mode === 'god' || S.mode === 'tile') {
         if (S.drag) aim = g.hoverTile(S.drag.hand);
         else aim = g.hoverTile('right') || g.hoverTile('left');
      }
      S.hover = aim;

      const night = S.mode === 'adv' && S.night;
      const lifting = S.drag && S.drag.kind === 'tile' ? S.drag : null;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
         const spec = g.groundAt(c, r);
         const thick = 0.0035 * (spec.h || 1);
         const held = lifting && lifting.c === c && lifting.r === r;
         if (held) {
            const q = g.holdStage(lifting.hand, 0.02) || [tileX(c), 0.06, tileZ(r)];
            tiles[r][c].root.identity().move(q[0], Math.max(0.03, q[1]), q[2])
               .scale(TILE / 2, TILE / 3, TILE / 2);
         } else {
            tiles[r][c].root.identity().move(tileX(c), thick, tileZ(r))
               .scale(TILE / 2, thick, TILE / 2);
         }
         const stepHere = S.aimStep && S.aimStep.c === c && S.aimStep.r === r;
         const foeHere = S.aimPiece && g.pieceAt(c, r) && g.pieceAt(c, r).id === S.aimPiece;
         paintTile(tiles[r][c], S.ground[r][c], night, stepHere || foeHere ? [1.35, .62, .58] : null);
         setGroundOpacity(tiles[r][c], spec.block ? .75 : 1);
         const walk = dist && dist[r][c] > 0 && dist[r][c] <= S.mp;
         const pointedTile = aim && aim.c === c && aim.r === r;
         if (stepHere || foeHere) {
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2).color(1.2, .35, .28);
         } else if (walk) {
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2).color(.3, .9, .45);
         } else if (pointedTile) {
            const taken = S.mode === 'god' && g.occupy(c, r, S.drag && S.drag.piece);
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2)
               .color(taken ? 1.1 : 1.2, taken ? .25 : .85, taken ? .2 : .25);
         } else glows[r][c].identity().scale(0);
      }
      if (aim) hoverRing.identity().move(tileX(aim.c), .01, tileZ(aim.r)).scale(TILE / 2, .0012, TILE / 2);
      else hoverRing.identity().scale(0);

      if (S.drag && S.drag.kind === 'stamp') {
         const q = g.holdStage(S.drag.hand, 0.02);
         const id = S.drag.type || S.groundSel;
         paintTile(stampTile, id, night);
         if (q) stampTile.root.identity().move(q[0], Math.max(0.03, q[1]), q[2]).scale(TILE / 2, TILE / 3, TILE / 2);
         else if (aim) stampTile.root.identity().move(tileX(aim.c), 0.04, tileZ(aim.r)).scale(TILE / 2, TILE / 3, TILE / 2);
         else stampTile.root.identity().scale(0);
      } else stampTile.root.identity().scale(0);
   };

   g.poseShelf = () => {
      const { S, icons, ui } = g;
      const show = S.mode === 'god';
      const eyeS = g.stageOf(eyeOf());
      KINDS.forEach(kind => {
         const rec = icons[kind];
         const cell = ui.god.cells.find(c => c.id === kind);
         const lifting = S.drag && S.drag.kind === 'ghost' && S.drag.palette === kind;
         if (!show || !cell || lifting) {
            hideToken(rec);
            return;
         }
         const { sx, sy } = tokenSize(kind);
         const k = 0.026 / Math.max(sx, sy);
         poseToken(rec, ui.god.ox + cell.x, ui.god.oy + sy * k + 0.006, ui.god.oz + cell.z, eyeS, sx * k, sy * k);
      });
   };

   g.posePieces = () => {
      const { S, icons, tokens } = g;
      const eyeS = g.stageOf(eyeOf());
      if (S.drag && S.drag.kind === 'ghost') {
         const rec = icons[S.drag.palette];
         if (!g.poseHeld(rec, S.drag.hand, S.drag.palette, eyeS)) {
            const aim = g.hoverTile(S.drag.hand);
            const { sx, sy } = tokenSize(S.drag.palette);
            if (rec && aim) poseToken(rec, tileX(aim.c), 0.03 + sy, tileZ(aim.r), eyeS, sx, sy, g.model.time * 13);
         }
      }
      for (const piece of S.pieces) {
         const rec = tokens.get(piece.id);
         if (!rec) continue;
         const dragging = S.drag && S.drag.kind === 'piece' && S.drag.piece === piece;
         const spr = piece.kind === 'chest' && piece.loot && piece.loot.length && !piece.opened ? 'chest_gold' : (KIND[piece.kind].sprite || piece.kind);
         setTokenKind(rec, spr);
         if (dragging && g.poseHeld(rec, S.drag.hand, spr, eyeS)) continue;
         const { sx, sy } = tokenSize(spr);
         poseToken(rec, tileX(piece.c), sy, tileZ(piece.r), eyeS, sx, sy);
         if (rec.art) rec.art.color(piece.id === S.aimPiece ? [1.45, .62, .55] : [1, 1, 1]);
      }
   };

   g.poseAvatar = () => {
      const { S, avatar } = g;
      if (S.mode === 'adv') {
         hideToken(avatar);
         return;
      }
      const eyeS = g.stageOf(eyeOf());
      if (S.drag && S.drag.kind === 'avatar' && g.poseHeld(avatar, S.drag.hand, 'hero', eyeS)) return;
      const { sx, sy } = tokenSize('hero');
      poseToken(avatar, tileX(S.hero.c), sy, tileZ(S.hero.r), eyeS, sx, sy);
   };

   g.poseCoin = () => {
      const { S, model, coinRoot, coinRim, coinHeads, coinTails } = g;
      const R = S.roll;
      if (!R) { coinRoot.identity().scale(0); return; }
      const d = R.dice[0];
      const e = eyeOf();
      const H = headMat() || cg.mIdentity();
      const fwd = cg.normalize([-H[8], 0, -H[10]]);
      const u = d.done ? 1 : Math.min(1, (model.time - R.started) / (d.t || .85));
      const ease = 1 - Math.pow(1 - u, 3);
      const ang = ease * ((d.ok ? 0 : Math.PI) + 4 * Math.PI);
      const lift = Math.sin(u * Math.PI) * .1;
      const pos = cg.add(e, cg.add(cg.scale(fwd, .38), [0, -.08 + lift, 0]));
      const Z = cg.normalize(cg.subtract(e, pos));
      let X = cg.cross([0, 1, 0], Z);
      if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = [1, 0, 0];
      X = cg.normalize(X);
      const Y = cg.normalize(cg.cross(Z, X));
      const c = Math.cos(ang), s = Math.sin(ang);
      const Yr = [Y[0] * c + Z[0] * s, Y[1] * c + Z[1] * s, Y[2] * c + Z[2] * s];
      const Zr = [Z[0] * c - Y[0] * s, Z[1] * c - Y[1] * s, Z[2] * c - Y[2] * s];
      const k = .034;
      coinRoot.setMatrix([
         X[0] * k, X[1] * k, X[2] * k, 0,
         Yr[0] * k, Yr[1] * k, Yr[2] * k, 0,
         Zr[0] * k, Zr[1] * k, Zr[2] * k, 0,
         pos[0], pos[1], pos[2], 1,
      ]);
      coinRim.identity().scale(1, 1, .1);
      coinHeads.identity().move(0, 0, .09).scale(.9, .9, .02);
      coinTails.identity().move(0, 0, -.09).scale(.9, .9, .02);
      if (d.done && d.face === 20) coinHeads.color(1, .92, .45);
      else coinHeads.color(.96, .78, .28);
   };

   g.poseUI = () => {
      const { S, ui, cards } = g;
      const e = eyeOf();
      const hoverHit = g.pick('right') || g.pick('left');
      S.uiHover = hoverHit && hoverHit.kind === 'ui' ? hoverHit.cell.id : null;
      const hover = S.uiHover;
      if (S.mode === 'god') {
         ui.god.show(); ui.tiles.hide();
         ui.god.pose(S.selected, hover);
         ui.hud.hide(); ui.pack.hide(); ui.fight.hide();
         if (S.chestId) {
            const piece = S.pieces.find(x => x.id === S.chestId);
            ui.chest.show();
            const pos = cg.mTransform(g.stage.getMatrix(), [0, 0.2, HALF + 0.22]);
            ui.chest.place(pos, e);
            ui.chest.pose((piece && piece.loot) || [], hover);
            ui.inspect.hide();
         } else {
            ui.chest.hide();
            if (S.focus) {
               ui.inspect.show();
               const pos = cg.mTransform(g.stage.getMatrix(), [HALF + 0.22, 0.2, 0.02]);
               ui.inspect.place(pos, e);
               ui.inspect.pose(g.inspectView(), hover);
            } else ui.inspect.hide();
         }
      } else if (S.mode === 'tile') {
         ui.tiles.show(); ui.god.hide(); ui.chest.hide();
         ui.tiles.pose(S.groundSel, hover);
         ui.hud.hide(); ui.pack.hide(); ui.inspect.hide(); ui.fight.hide();
      } else {
         ui.god.hide(); ui.tiles.hide(); ui.chest.hide();
         g.layoutDock();
         if (S.focus && S.focus.kind === 'piece') {
            const p = S.pieces.find(x => x.id === S.focus.id);
            if (!p || !g.nearHero(p.c, p.r)) g.closeFocus();
         }
         if (S.focus && S.focus.kind === 'item' && !S.pack[S.focus.index]) g.closeFocus();
         ui.hud.show();
         ui.hud.place(cards.hud.pos, e, .55, cards.hud.face);
         if (S.combat) {
            ui.pack.hide();
            ui.inspect.hide();
            ui.fight.show();
            ui.fight.place(cards.fight.pos, e, cards.fight.face);
            ui.fight.pose(g.battleView(), hover);
         } else {
            ui.fight.hide();
            if (S.packOpen) {
               ui.pack.show();
               ui.pack.place(cards.pack.pos, e, cards.pack.face);
               ui.pack.pose(S.pack, S.equipped, hover);
            } else ui.pack.hide();
            if (S.focus) {
               ui.inspect.show();
               ui.inspect.place(cards.inspect.pos, e, cards.inspect.face);
               ui.inspect.pose(g.inspectView(), hover);
            } else ui.inspect.hide();
         }
      }
      ui.hud.update();
      g.poseHandWeapon();
   };

   g.billboardAt = (node, pos, eye, s) => {
      const Z = cg.normalize(cg.subtract(eye, pos));
      let X = cg.cross([0, 1, 0], Z);
      if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = [1, 0, 0];
      X = cg.normalize(X);
      const Y = cg.normalize(cg.cross(Z, X));
      const k = s == null ? 1 : s;
      node.setMatrix([
         X[0] * k, X[1] * k, X[2] * k, 0,
         Y[0] * k, Y[1] * k, Y[2] * k, 0,
         Z[0] * k, Z[1] * k, Z[2] * k, 0,
         pos[0], pos[1], pos[2], 1,
      ]);
   };

   g.poseHandWeapon = () => {
      const { S, handWep } = g;
      if (S.mode !== 'adv') {
         handWep.root.identity().scale(0);
         return;
      }
      const it = S.pack.find(p => p.uid === S.equipped);
      const spr = it && it.type === 'weapon' ? itemSprite(it) : null;
      const m = controllerMatrix.right;
      if (!spr || !m || m.length < 16 || !isFinite(m[12]) || !clay.inverseRootMatrix) {
         handWep.root.identity().scale(0);
         return;
      }
      const M = cg.mMultiply(clay.inverseRootMatrix, m);
      const pos = cg.mTransform(M, [0, 0.03, -0.06]);
      showItemIcon(handWep, spr, 0, 0, 0.038, true);
      g.billboardAt(handWep.root, pos, eyeOf(), 1);
   };
};
