// Board queries, pawn spawn, and the pack.

import * as cg from '../../render/core/cg.js';
import { N, TILE, HALF, KIND, GROUND, foeSheet, itemLabel } from './data.js';
import { makeToken, dropToken } from './models.js';
import { clamp, inb, tileX, tileZ } from './input.js';

export const installWorld = g => {
   g.say = msg => { g.S.log = msg; };

   g.tileName = (c, r) => '(' + (c + 1) + ',' + (r + 1) + ')';

   g.groundAt = (c, r) => GROUND[g.S.ground[r][c]] || GROUND.stone;

   g.pieceAt = (c, r) => g.S.pieces.find(p => p.c === c && p.r === r);

   g.blocks = (c, r) => {
      if (g.groundAt(c, r).block) return true;
      const p = g.pieceAt(c, r);
      return !!(p && KIND[p.kind].block);
   };

   g.occupy = (c, r, except) => {
      const { S } = g;
      if (S.hero.c === c && S.hero.r === r) return true;
      const p = g.pieceAt(c, r);
      return !!(p && p !== except);
   };

   g.nearHero = (c, r) => {
      const { S } = g;
      return Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r) <= 1;
   };

   g.nearestTile = (x, z) => {
      const c = clamp(Math.round(x / TILE + 3.5), 0, N - 1);
      const r = clamp(Math.round(z / TILE + 3.5), 0, N - 1);
      return { c, r, d: Math.hypot(x - tileX(c), z - tileZ(r)) };
   };

   g.onBoard = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;

   g.stageOf = p => cg.mTransform(cg.mInverse(g.stage.getMatrix()), p);

   g.give = item => {
      const { S } = g;
      if (item.type === 'gold') {
         S.hero.gold += item.amount || 0;
         return item.amount + ' gold';
      }
      S.pack.push({ uid: S.nextUid++, type: item.type, id: item.id });
      return itemLabel(item);
   };

   g.spawnPiece = (kind, c, r) => {
      const { S, stage, tokens } = g;
      if (!inb(c, r) || g.occupy(c, r)) return null;
      const spec = KIND[kind];
      const piece = {
         id: S.nextPid++, kind, c, r, yaw: 0,
         loot: spec.interact === 'chest' ? [] : null,
         opened: false, used: false,
         sheet: spec.interact === 'fight' ? foeSheet(kind) : null,
      };
      tokens.set(piece.id, makeToken(stage, spec.sprite || kind));
      S.pieces.push(piece);
      return piece;
   };

   g.removePiece = piece => {
      if (!piece) return;
      const { S, stage, tokens, ui } = g;
      const rec = tokens.get(piece.id);
      if (rec) {
         dropToken(stage, rec);
         tokens.delete(piece.id);
      }
      S.pieces = S.pieces.filter(p => p.id !== piece.id);
      if (S.chestId === piece.id) { S.chestId = 0; ui.chest.hide(); }
      if (S.focus && S.focus.kind === 'piece' && S.focus.id === piece.id) g.closeFocus();
   };

   g.lookNeighbor = () => {
      const { S } = g;
      const face = S.hero.face || 0;
      const dc = Math.abs(Math.sin(face)) > .5 ? Math.sign(Math.sin(face)) : 0;
      const dr = Math.abs(Math.cos(face)) > .5 ? Math.sign(Math.cos(face)) : 0;
      const n = [
         g.pieceAt(S.hero.c, S.hero.r),
         g.pieceAt(S.hero.c + dc, S.hero.r + dr),
         g.pieceAt(S.hero.c + 1, S.hero.r),
         g.pieceAt(S.hero.c - 1, S.hero.r),
         g.pieceAt(S.hero.c, S.hero.r + 1),
         g.pieceAt(S.hero.c, S.hero.r - 1),
      ];
      return n.find(p => p);
   };
};
