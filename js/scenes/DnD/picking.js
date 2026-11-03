// What a controller ray hits: cards first, then pawns, then tiles.

import * as cg from '../../render/core/cg.js';
import { KIND } from './data.js';
import { tokenSize } from './models.js';
import { rayBox, beamRay, headMat, tileX, tileZ } from './input.js';

export const installPicking = g => {
   g.lookRay = () => {
      const H = headMat();
      if (!H) return null;
      return { o: H.slice(12, 15), d: cg.normalize([-H[8], -H[9], -H[10]]) };
   };

   g.aimRay = hand => beamRay(hand) || g.lookRay();

   g.hoverTile = hand => {
      const ray = g.aimRay(hand);
      if (!ray) return null;
      const { stage } = g;
      const origin = cg.mTransform(stage.getMatrix(), [0, 0.004, 0]);
      const n4 = cg.mTransform(stage.getMatrix(), [0, 1, 0, 0]);
      const n = [n4[0], n4[1], n4[2]];
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-6) return null;
      n[0] /= nl; n[1] /= nl; n[2] /= nl;
      const den = cg.dot(ray.d, n);
      if (Math.abs(den) < 1e-5) return null;
      const t = cg.dot(cg.subtract(origin, ray.o), n) / den;
      if (t < 0.03 || t > 8) return null;
      const p = cg.add(ray.o, cg.scale(ray.d, t));
      const q = g.stageOf(p);
      if (!g.onBoard(q[0], q[2])) return null;
      return Object.assign(g.nearestTile(q[0], q[2]), { t });
   };

   g.hitCells = (ray, kit) => {
      if (!kit || !kit.visible()) return null;
      let best = null;
      for (const cell of kit.cells) {
         if (cell.off) continue;
         let M;
         try { M = cell.tile.getGlobalMatrix(); } catch (err) { continue; }
         const h = rayBox(ray, M);
         if (h && (!best || h.t < best.t)) best = { kind: 'ui', kit, cell, t: h.t };
      }
      return best;
   };

   g.hitCardBody = (ray, kit, id) => {
      if (!kit || !kit.body || (kit.visible && !kit.visible())) return null;
      let M;
      try { M = kit.body.getGlobalMatrix(); } catch (err) { return null; }
      const h = rayBox(ray, M);
      return h ? { kind: 'card', id, kit, t: h.t } : null;
   };

   g.pick = hand => {
      const { S, ui, stage } = g;
      const ray = g.aimRay(hand);
      if (!ray) return null;
      let best = null;
      const consider = hit => {
         if (hit && hit.t != null && (!best || hit.t < (best.t || 99))) best = hit;
      };
      consider(g.hitCells(ray, ui.god));
      consider(g.hitCells(ray, ui.tiles));
      consider(g.hitCells(ray, ui.chest));
      consider(g.hitCells(ray, ui.pack));
      consider(g.hitCells(ray, ui.inspect));
      consider(g.hitCells(ray, ui.fight));
      if (S.mode === 'adv') {
         consider(g.hitCardBody(ray, ui.hud, 'hud'));
         consider(g.hitCardBody(ray, ui.pack, 'pack'));
         consider(g.hitCardBody(ray, ui.inspect, 'inspect'));
         consider(g.hitCardBody(ray, ui.fight, 'fight'));
      }
      if (best && (best.kind === 'ui' || best.kind === 'card')) {
         const inspectHit = (best.kind === 'ui' && best.kit === ui.inspect) ||
            (best.kind === 'card' && best.id === 'inspect');
         const walkPast = S.mode === 'adv' && !S.combat && inspectHit;
         if (!walkPast) {
            best.hand = hand;
            return best;
         }
      }
      if (S.mode === 'god' || (S.mode === 'adv' && !S.combat)) {
         for (const piece of S.pieces) {
            const spr = KIND[piece.kind].sprite || piece.kind;
            const { sx, sy } = tokenSize(spr);
            const M = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(piece.c), sy, tileZ(piece.r)), cg.mScale(sx, sy, sx)));
            const h = rayBox(ray, M);
            if (h) consider({ kind: 'piece', piece, hand, t: h.t });
         }
         if (S.mode === 'god') {
            const { sx, sy } = tokenSize('hero');
            const AM = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(S.hero.c), sy, tileZ(S.hero.r)), cg.mScale(sx, sy, sx)));
            const ah = rayBox(ray, AM);
            if (ah) consider({ kind: 'avatar', hand, t: ah.t });
         }
      }
      const tile = g.hoverTile(hand);
      if (tile && (S.mode === 'god' || S.mode === 'tile' || (S.mode === 'adv' && !S.combat))) {
         const walk = S.mode === 'adv' && (Math.abs(tile.c - S.hero.c) + Math.abs(tile.r - S.hero.r)) === 1;
         const inspectHit = best && ((best.kind === 'ui' && best.kit === ui.inspect) ||
            (best.kind === 'card' && best.id === 'inspect'));
         if (walk && inspectHit)
            best = { kind: 'tile', c: tile.c, r: tile.r, hand, t: tile.t };
         else
            consider({ kind: 'tile', c: tile.c, r: tile.r, hand, t: tile.t });
      }
      if (best) best.hand = hand;
      return best;
   };

   g.advPointer = () => {
      const { S, stage } = g;
      if (S.mode !== 'adv' || S.combat) return {};
      const ray = g.aimRay('right') || g.aimRay('left');
      if (!ray) return {};
      let piece = null, pt = 99;
      for (const p of S.pieces) {
         if (!g.nearHero(p.c, p.r)) continue;
         const spr = p.kind === 'chest' && p.loot && p.loot.length && !p.opened ? 'chest_gold' : (KIND[p.kind].sprite || p.kind);
         const { sx, sy } = tokenSize(spr);
         const M = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(p.c), sy, tileZ(p.r)), cg.mScale(sx, sy, sx)));
         const h = rayBox(ray, M);
         if (h && h.t < pt) { pt = h.t; piece = p; }
      }
      const tile = g.hoverTile('right') || g.hoverTile('left');
      if (piece && (!tile || pt <= tile.t + 0.02)) return { piece };
      if (!tile) return {};
      const on = g.pieceAt(tile.c, tile.r);
      if (on && g.nearHero(on.c, on.r)) return { piece: on };
      if (g.canStep(tile.c, tile.r)) return { tile };
      return {};
   };
};
