// Adventurer steps, object use, and the enemy phase.

import { N, MP_MAX, KIND, abilityMod, profBonus } from './data.js';
import { joyStickState } from '../../render/core/controllerInput.js';
import { inb, headMat, tone, buzz } from './input.js';

export const installAdventure = g => {
   g.reachable = () => {
      const { S } = g;
      const dist = Array.from({ length: N }, () => Array(N).fill(99));
      const q = [[S.hero.c, S.hero.r]];
      dist[S.hero.r][S.hero.c] = 0;
      while (q.length) {
         const [c, r] = q.shift();
         const d = dist[r][c];
         if (d >= S.mp) continue;
         for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (!inb(nc, nr) || g.blocks(nc, nr) || dist[nr][nc] <= d + 1) continue;
            dist[nr][nc] = d + 1;
            q.push([nc, nr]);
         }
      }
      return dist;
   };

   g.canStep = (c, r) => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return false;
      if (!inb(c, r) || (Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r)) !== 1) return false;
      return !g.blocks(c, r);
   };

   g.stepTo = (c, r) => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return false;
      if (!inb(c, r) || (Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r)) !== 1) return false;
      if (g.blocks(c, r)) {
         const p = g.pieceAt(c, r);
         if (p && KIND[p.kind].interact) { g.inspectPiece(p); return true; }
         g.say(p ? 'The ' + KIND[p.kind].label.toLowerCase() + ' blocks this square.' : 'Blocked.');
         return false;
      }
      g.closeFocus();
      S.hero.face = Math.atan2(c - S.hero.c, r - S.hero.r);
      S.hero.c = c; S.hero.r = r;
      S.mp -= 1;
      tone(420, .06, .03);
      buzz('right', .2, 20);
      if (S.mp <= 0) g.say('No steps left.');
      else g.say('Steps: ' + S.mp);
      return true;
   };

   g.tryInteract = () => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll) return;
      const p = g.lookNeighbor();
      if (!p) return;
      g.inspectPiece(p);
   };

   g.interactPiece = p => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || !p) return;
      if (KIND[p.kind].interact === 'fight') { g.startFight(p); return; }
      if (p.kind !== 'chest') { g.say('Nothing to do here.'); return; }
      if (p.opened) {
         const found = p.found || [];
         g.say(found.length ? 'You found ' + found.join(', ') + '.' : 'Nothing inside.');
         g.showPieceCard(p);
         return;
      }
      const bonus = abilityMod(S.stats.str) + profBonus(S.hero.level);
      g.startRoll('chest', bonus, 15, die => {
         const total = die.face + bonus;
         if (total < 15) g.say('The lock holds. Athletics ' + total + ' vs DC 15.');
         else {
            p.opened = true;
            p.found = (p.loot && p.loot.length) ? p.loot.map(g.give) : [];
            g.say(p.found.length ? 'You found ' + p.found.join(', ') + '.' : 'The chest was empty.');
            p.loot = [];
            tone(720, .12);
         }
         g.showPieceCard(p);
         g.endPlayerTurn(true);
      });
   };

   g.monsterStep = p => {
      const { S } = g;
      const adx = S.hero.c - p.c, adz = S.hero.r - p.r;
      if (Math.abs(adx) + Math.abs(adz) <= 1) return 'adjacent';
      const tries = [];
      if (adx) tries.push([p.c + Math.sign(adx), p.r]);
      if (adz) tries.push([p.c, p.r + Math.sign(adz)]);
      tries.sort((a, b) =>
         (Math.abs(a[0] - S.hero.c) + Math.abs(a[1] - S.hero.r)) -
         (Math.abs(b[0] - S.hero.c) + Math.abs(b[1] - S.hero.r))
      );
      for (const [c, r] of tries) {
         if (!inb(c, r)) continue;
         if (c === S.hero.c && r === S.hero.r) return 'adjacent';
         if (g.occupy(c, r, p) || g.groundAt(c, r).block) continue;
         const other = g.pieceAt(c, r);
         if (other && other !== p) continue;
         p.c = c; p.r = r;
         return Math.abs(p.c - S.hero.c) + Math.abs(p.r - S.hero.r) <= 1 ? 'adjacent' : 'moved';
      }
      return 'stuck';
   };

   g.moveMonsters = () => {
      const { S } = g;
      const skip = S.justFled;
      S.justFled = 0;
      const foes = S.pieces.filter(p => KIND[p.kind] && KIND[p.kind].interact === 'fight');
      foes.sort((a, b) =>
         (Math.abs(a.c - S.hero.c) + Math.abs(a.r - S.hero.r)) -
         (Math.abs(b.c - S.hero.c) + Math.abs(b.r - S.hero.r))
      );
      let engaged = null;
      for (const p of foes) {
         const result = g.monsterStep(p);
         if (result === 'adjacent' && !engaged && p.id !== skip) engaged = p;
      }
      if (engaged && !S.combat) g.startFight(engaged);
   };

   g.endPlayerTurn = keep => {
      const { S } = g;
      if (S.mode !== 'adv' || g.endingTurn) return;
      g.endingTurn = true;
      if (!keep) g.closeFocus();
      S.roll = null;
      S.turn += 1;
      S.mp = MP_MAX;
      if (S.turn % 4 === 0) {
         const wasNight = S.night;
         S.night = !S.night;
         if (wasNight && !S.night) S.hero.insp = 1;
      }
      g.say((S.night ? 'Night' : 'Day') + '. Turn ' + S.turn + '.');
      tone(240, .1);
      if (!S.combat) g.moveMonsters();
      g.endingTurn = false;
   };

   g.endTurn = () => {
      const { S } = g;
      if (S.mode !== 'adv' || S.roll || S.combat) return;
      g.endPlayerTurn();
   };

   g.pollMove = () => {
      const { S, model } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return;
      if (model.time < S.joyAt) return;
      const j = joyStickState.left || { x: 0, y: 0 };
      const k = window.__dndKeys.down;
      let x = j.x || 0, y = j.y || 0;
      if (k.a || k.arrowleft) x = -1;
      if (k.d || k.arrowright) x = 1;
      if (k.w || k.arrowup) y = -1;
      if (k.s || k.arrowdown) y = 1;
      if (Math.hypot(x, y) < .6) return;
      const H = headMat();
      let fx = 0, fz = -1, rx = 1, rz = 0;
      if (H) {
         fx = -H[8]; fz = -H[10];
         const n = Math.hypot(fx, fz) || 1;
         fx /= n; fz /= n;
         rx = fz; rz = -fx;
      }
      const wx = fx * -y + rx * x;
      const wz = fz * -y + rz * x;
      const dc = Math.abs(wx) > Math.abs(wz) ? Math.sign(wx) : 0;
      const dr = Math.abs(wz) >= Math.abs(wx) ? Math.sign(wz) : 0;
      if (dc || dr) {
         g.stepTo(S.hero.c + dc, S.hero.r + dr);
         S.joyAt = model.time + .32;
      }
   };
};
