// Floating cards. They are placed once, then stay in world space.

import * as cg from '../../render/core/cg.js';
import { eyeOf, headMat, now, clamp, buzz, tileX, tileZ } from './input.js';

const CARD_IDS = ['hud', 'pack', 'inspect', 'fight'];
const defaultCardLocal = {
   hud:     [-0.42,  0.14, 0.42],
   pack:    [-0.48, -0.08, 0.34],
   inspect: [ 0.48,  0.04, 0.34],
   fight:   [ 0.00,  0.03, 0.46],
};

export const installDock = g => {
   g.headBasis = () => {
      const e = eyeOf();
      const H = headMat() || cg.mIdentity();
      let fwd = [-H[8], 0, -H[10]];
      if (Math.hypot(fwd[0], fwd[2]) < 1e-4) fwd = [0, 0, -1];
      fwd = cg.normalize(fwd);
      let right = cg.cross(fwd, [0, 1, 0]);
      if (Math.hypot(right[0], right[1], right[2]) < 1e-4) right = [1, 0, 0];
      right = cg.normalize(right);
      return { e, fwd, right, up: [0, 1, 0] };
   };

   g.worldToLocal = p => {
      const { e, fwd, right, up } = g.headBasis();
      const d = cg.subtract(p, e);
      return [cg.dot(d, right), cg.dot(d, up), cg.dot(d, fwd)];
   };

   g.localToWorld = loc => {
      const { e, fwd, right, up } = g.headBasis();
      return cg.add(e, cg.add(cg.scale(right, loc[0]), cg.add(cg.scale(up, loc[1]), cg.scale(fwd, loc[2]))));
   };

   g.pinCard = (id, pos) => {
      const e = eyeOf();
      const f = cg.subtract(e, pos);
      const n = Math.hypot(f[0], f[1], f[2]) || 1;
      g.cards[id] = { pos: pos.slice(), face: [f[0] / n, f[1] / n, f[2] / n] };
   };

   g.pieceWorld = p => cg.mTransform(g.stage.getMatrix(), [tileX(p.c), 0.08, tileZ(p.r)]);

   g.placeToward = (id, target) => {
      const e = eyeOf();
      const delta = cg.subtract(target, e);
      const n = Math.hypot(delta[0], delta[1], delta[2]) || 1;
      const dir = delta.map(v => v / n);
      const dist = Math.max(0.36, Math.min(0.52, n * 0.55));
      g.pinCard(id, cg.add(e, cg.scale(dir, dist)));
   };

   g.resetCardOrbit = () => {
      CARD_IDS.forEach(id => g.pinCard(id, g.localToWorld(defaultCardLocal[id])));
   };

   g.placeFightCard = piece => {
      if (piece) g.placeToward('fight', g.pieceWorld(piece));
      else g.pinCard('fight', g.localToWorld(defaultCardLocal.fight));
   };

   g.layoutDock = () => {
      if (!g.cards.hud) g.resetCardOrbit();
      g.dock = {
         hud: g.cards.hud.pos,
         pack: g.cards.pack.pos,
         side: g.cards.inspect.pos,
         battle: g.cards.fight.pos,
      };
   };

   g.projectSphere = (ray, center, r) => {
      const oc = cg.subtract(ray.o, center);
      const b = 2 * cg.dot(oc, ray.d);
      const c0 = cg.dot(oc, oc) - r * r;
      const disc = b * b - 4 * c0;
      const along = t => cg.add(ray.o, cg.scale(ray.d, t));
      const onto = p => {
         const d = cg.subtract(p, center);
         const n = Math.hypot(d[0], d[1], d[2]) || 1;
         return cg.add(center, cg.scale(d, r / n));
      };
      if (disc < 0) {
         const t = Math.max(0, -cg.dot(oc, ray.d));
         return onto(along(t));
      }
      const s = Math.sqrt(disc);
      let t0 = (-b - s) / 2, t1 = (-b + s) / 2;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t1 < 0.02) return onto(along(Math.max(0, t1)));
      return along(t0 >= 0.02 ? t0 : t1);
   };

   g.grabCard = (id, hand) => {
      g.layoutDock();
      const pos = { hud: g.dock.hud, pack: g.dock.pack, inspect: g.dock.side, fight: g.dock.battle }[id];
      if (!pos) return;
      const r = Math.max(0.25, cg.distance(eyeOf(), pos));
      g.S.drag = { hand, kind: 'card', id, r, t0: now() };
      buzz(hand, .22, 18);
   };

   g.moveCard = hand => {
      const { S } = g;
      if (!S.drag || S.drag.kind !== 'card' || S.drag.hand !== hand) return;
      const ray = g.aimRay(hand);
      if (!ray) return;
      const e = eyeOf();
      const p = g.projectSphere(ray, e, S.drag.r);
      let loc = g.worldToLocal(p);
      loc[1] = clamp(loc[1], -0.45, 0.5);
      if (loc[2] < 0.1) loc[2] = 0.1;
      const n = Math.hypot(loc[0], loc[1], loc[2]) || 1;
      const placed = loc.map(v => v / n * S.drag.r);
      g.pinCard(S.drag.id, g.localToWorld(placed));
   };
};
