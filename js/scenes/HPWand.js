import * as cg from "../render/core/cg.js";
import { controllerMatrix } from "../render/core/controllerInput.js";

export const init = async model => {
   const maxMana = 200;
   let mana = maxMana;
   const regen = 10;

   const spells = {
      disarm:  { cost: 25, drain: 0,  rgb: [1.4, .35, .85] },
      protego: { cost: 10, drain: 5,  rgb: [1.3, 1.15, .45] },
      avada:   { cost: 35, drain: 20, rgb: [.2, 1.5, .25]  },
   };

   let wand = model.add();
   wand.add('tubeY').move(0, .18, 0).scale(.008, .18, .008).color(.45, .28, .12).dull();
   let wandHand = 'right';

   let dummy = model.add('tubeY').color(.55, .4, .3).dull();
   let dummyPos = [0, .7, -2.5];
   let dummyR = .1, dummyH = .7;
   let dummyHit = 0;

   let shield = model.add('diskZ').color(1.3, 1.15, .45).opacity(.28).scale(0);
   let laser = model.add('tubeZ').color(.15, 1.6, .2).scale(0);
   let zap = model.add('tubeZ').color(1.5, .4, 1).scale(0);

   let mode = 'idle';
   let curSpell = null;
   let zapPos = null;
   let zapVel = null;
   let zapDir = null;
   let zapLife = 0;

   const nSparks = 80;
   let sparks = [];
   for (let i = 0; i < nSparks; i++)
      sparks.push(model.add('sphere').scale(0));
   let startDot = model.add('sphere').scale(0).color(.2, 1.2, .35);

   let stroke = [];
   let sealed = false;
   let nextSpell = null;
   let castAt = 0;
   let lastPt = null;
   let sparkTil = 0;

   let nextBeat = 0;
   let beatPhase = 0;

   let buzz = (hand, power, ms) => {
      try {
         if (window.vibrate)
            vibrate(hand, Math.max(0, Math.min(1, power)), ms);
      } catch (e) {}
   };

   let manaBeat = hand => {
      if (model.time < nextBeat) return;

      let empty = 1 - mana / maxMana;
      let cycle = 1.4 - 1.12 * empty;
      let power = .06 + .9 * empty;
      let dur = 18 + 40 * empty;

      if (beatPhase === 0) {
         buzz(hand, power, dur);
         nextBeat = model.time + .08 + .04 * (1 - empty);
         beatPhase = 1;
      } else if (beatPhase === 1) {
         buzz(hand, power * .7, dur * .85);
         nextBeat = model.time + Math.max(.12, cycle - .12);
         beatPhase = 0;
      }
   };

   let clearZap = () => {
      zapLife = 0;
      zapPos = null;
      zapVel = null;
      zapDir = null;
      zap.scale(0);
   };

   let clearStroke = () => {
      stroke = [];
      lastPt = null;
      sealed = false;
      nextSpell = null;
      castAt = 0;
   };

   let stopSpell = () => {
      curSpell = null;
      shield.scale(0);
      laser.scale(0);
   };

   let ctrlMat = hand => {
      let m = controllerMatrix[hand];
      if (!m || !m.length) return null;
      return cg.mMultiply(clay.inverseRootMatrix, m);
   };

   let gripMat = hand => {
      let m = ctrlMat(hand);
      if (!m) return cg.mTranslate(0, 1, 0);
      return cg.mMultiply(m, cg.mRotateX(-Math.PI / 2));
   };

   let tip = hand => {
      let m = ctrlMat(hand);
      if (m) return cg.mTransform(m, [0, 0, -.36]);
      let p = inputEvents.pos(hand);
      return p ? p.slice() : [0, 1, 0];
   };

   let strokeLen = pts => {
      let L = 0;
      for (let i = 1; i < pts.length; i++)
         L += cg.distance(pts[i - 1], pts[i]);
      return L;
   };

   let flatten = pts => {
      let c = [0, 0, 0];
      for (let p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
      c = cg.scale(c, 1 / pts.length);

      let n = [0, 0, 0];
      for (let i = 1; i < pts.length; i++) {
         let a = cg.subtract(pts[i - 1], c);
         let b = cg.subtract(pts[i], c);
         n = cg.add(n, cg.cross(a, b));
      }
      if (cg.norm(n) < 1e-8) n = [0, 0, 1];
      n = cg.normalize(n);
      let ref = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
      let xA = cg.normalize(cg.cross(ref, n));
      let yA = cg.cross(n, xA);
      return pts.map(p => {
         let d = cg.subtract(p, c);
         return [cg.dot(d, xA), cg.dot(d, yA)];
      });
   };

   let howClosed = pts => {
      if (pts.length < 12) return 0;
      let L = strokeLen(pts);
      if (L < .18) return 0;
      let gap = cg.distance(pts[0], pts[pts.length - 1]);
      let thresh = Math.max(.08, .18 * Math.min(1, L));
      return Math.max(0, 1 - gap / thresh);
   };

   let isSealed = pts => howClosed(pts) > .55;

   let readSpell = pts => {
      if (pts.length < 15) return null;
      let L = strokeLen(pts);
      if (L < .2) return null;
      if (!isSealed(pts)) return null;

      let flat = flatten(pts);
      let cx = 0, cy = 0;
      for (let p of flat) { cx += p[0]; cy += p[1]; }
      cx /= flat.length; cy /= flat.length;

      let radii = flat.map(p => Math.hypot(p[0] - cx, p[1] - cy));
      let meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
      if (meanR < .02) return null;
      let varR = 0;
      for (let r of radii) varR += (r - meanR) * (r - meanR);
      varR = Math.sqrt(varR / radii.length) / meanR;

      let N = 32;
      let rs = [];
      for (let i = 0; i < N; i++) {
         let t = i / N * (flat.length - 1);
         let i0 = t >> 0, f = t - i0;
         let a = flat[i0], b = flat[Math.min(i0 + 1, flat.length - 1)];
         rs.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]);
      }
      let turns = [];
      for (let i = 0; i < N; i++) {
         let p0 = rs[(i - 1 + N) % N], p1 = rs[i], p2 = rs[(i + 1) % N];
         let v1 = [p1[0] - p0[0], p1[1] - p0[1]];
         let v2 = [p2[0] - p1[0], p2[1] - p1[1]];
         let n1 = Math.hypot(v1[0], v1[1]) || 1e-6;
         let n2 = Math.hypot(v2[0], v2[1]) || 1e-6;
         let cross = (v1[0] * v2[1] - v1[1] * v2[0]) / (n1 * n2);
         let dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2);
         turns.push(Math.atan2(cross, dot));
      }
      let corners = [];
      for (let i = 0; i < N; i++) {
         let a = Math.abs(turns[i]);
         if (a < .45) continue;
         let prev = turns[(i - 1 + N) % N], next = turns[(i + 1) % N];
         if (a >= Math.abs(prev) && a >= Math.abs(next))
            corners.push(i);
      }
      let merged = [];
      for (let i = 0; i < corners.length; i++) {
         let c = corners[i];
         if (!merged.length || Math.min((c - merged[merged.length - 1] + N) % N,
                                        (merged[merged.length - 1] - c + N) % N) > 4)
            merged.push(c);
      }
      if (merged.length > 1 &&
          Math.min((merged[0] - merged[merged.length - 1] + N) % N,
                   (merged[merged.length - 1] - merged[0] + N) % N) <= 4)
         merged.pop();

      let nCorners = merged.length;
      if (varR < .22 && nCorners <= 2) return 'disarm';
      if (nCorners === 3 || (nCorners === 2 && varR > .18)) return 'avada';
      if (nCorners >= 4) return 'protego';
      if (varR < .28) return 'disarm';
      if (nCorners <= 3) return 'avada';
      return 'protego';
   };

   let burnMana = amt => {
      mana = Math.max(0, mana - amt);
      return mana;
   };

   let castSpell = (spell, hand) => {
      if (mana < spells[spell].cost * .5) {
         nextSpell = null;
         mode = 'idle';
         return false;
      }

      nextSpell = null;
      sparkTil = model.time + .45;
      burnMana(spells[spell].cost);

      if (spell === 'disarm') {
         clearZap();
         let tipPt = tip(hand);
         let m = ctrlMat(hand);
         let dir = [0, 0, -1];
         if (m) {
            let ahead = cg.mTransform(m, [0, 0, -1]);
            let d = cg.subtract(ahead, tipPt);
            if (cg.norm(d) > 1e-6) dir = cg.normalize(d);
         }
         zapPos = tipPt.slice();
         zapDir = dir.slice();
         zapVel = cg.scale(dir, 6);
         zapLife = 1.2;
         curSpell = null;
         mode = 'idle';
      }
      else if (spell === 'protego') {
         curSpell = 'protego';
         mode = 'holding';
      }
      else if (spell === 'avada') {
         curSpell = 'avada';
         mode = 'holding';
      }
      return true;
   };

   let hitDummy = p => {
      let dx = p[0] - dummyPos[0];
      let dy = p[1] - dummyPos[1];
      let dz = p[2] - dummyPos[2];
      if (Math.abs(dy) <= dummyH && dx * dx + dz * dz <= dummyR * dummyR) {
         dummyHit = model.time;
         return true;
      }
      return false;
   };

   let sampleStroke = hand => {
      let tipPt = tip(hand);
      if (!lastPt || cg.distance(lastPt, tipPt) > .01) {
         stroke.push(tipPt);
         lastPt = tipPt;
         if (stroke.length > 400) stroke.shift();
      }
   };

   inputEvents.onPress = hand => {
      wandHand = hand;
      mode = 'drawing';
      curSpell = null;
      shield.scale(0);
      laser.scale(0);
      clearStroke();
      sampleStroke(hand);
   };

   inputEvents.onDrag = hand => {
      if (hand !== wandHand || mode !== 'drawing') return;
      sampleStroke(hand);
   };

   inputEvents.onRelease = hand => {
      if (hand !== wandHand) return;

      if (mode === 'drawing') {
         if (nextSpell)
            castSpell(nextSpell, hand);
         else if (isSealed(stroke)) {
            let spell = readSpell(stroke);
            if (spell) castSpell(spell, hand);
         }
         if (mode === 'holding')
            stopSpell();
         mode = 'idle';
      }
      else if (mode === 'holding') {
         stopSpell();
         mode = 'idle';
      }

      clearStroke();
   };

   model.animate(() => {
      let dt = Math.min(.05, model.deltaTime || .016);
      let hand = wandHand;
      let busy = mode === 'drawing' || mode === 'holding' || zapLife > 0 || nextSpell;

      if (!busy)
         mana = Math.min(maxMana, mana + regen * dt);

      wand.setMatrix(gripMat(hand));

      if (mode === 'drawing')
         sampleStroke(hand);

      if (mode === 'drawing' && stroke.length > 15) {
         let close = howClosed(stroke);
         sealed = close > .55;

         if (sealed && !nextSpell) {
            let spell = readSpell(stroke);
            if (spell) {
               nextSpell = spell;
               castAt = model.time + .18;
            }
         }
      }

      if (mode === 'drawing' && nextSpell && model.time >= castAt)
         castSpell(nextSpell, hand);

      manaBeat(hand);

      let done = sealed || !!nextSpell || model.time < sparkTil;
      let sparkRgb = done ? [.25, 1.35, .35] : [.95, .55, .2];
      let sparkSize = done ? .01 : .011;
      let showSparks = stroke.length > 1 && (mode === 'drawing' || model.time < sparkTil);

      if (showSparks && stroke.length > 0) {
         startDot.identity().move(stroke[0])
                 .scale(done ? .024 : .016)
                 .color(done ? .15 : 1.1, done ? 1.4 : .8, done ? .3 : .15);
      } else {
         startDot.scale(0);
      }

      for (let i = 0; i < nSparks; i++) {
         if (showSparks) {
            let t = i / (nSparks - 1);
            let idx = t * (stroke.length - 1);
            let i0 = idx >> 0, f = idx - i0;
            let a = stroke[i0], b = stroke[Math.min(i0 + 1, stroke.length - 1)];
            let p = cg.mix(a, b, f);
            sparks[i].identity().move(p).scale(sparkSize * (.5 + .5 * t))
                     .color(sparkRgb[0], sparkRgb[1], sparkRgb[2]);
         } else {
            sparks[i].scale(0);
         }
      }

      if (mode === 'holding' && curSpell === 'protego') {
         if (mana <= 0) {
            stopSpell();
            mode = 'idle';
         } else {
            burnMana(spells.protego.drain * dt);
            let tipPt = tip(hand);
            let m = ctrlMat(hand);
            if (m) {
               let sm = cg.mMultiply(m, cg.mTranslate(0, 0, -.42));
               shield.setMatrix(sm).scale(.2).opacity(.22 + .12 * (1 - mana / maxMana))
                     .color(spells.protego.rgb);
            } else {
               shield.identity().move(tipPt).scale(.2).color(spells.protego.rgb);
            }
         }
      }
      else if (mode === 'holding' && curSpell === 'avada') {
         if (mana <= 0) {
            stopSpell();
            mode = 'idle';
         } else {
            burnMana(spells.avada.drain * dt);
            let m = ctrlMat(hand);
            let tipPt = tip(hand);
            if (m) {
               let empty = 1 - mana / maxMana;
               let halfLen = 1.5;
               let tipZ = .36;
               let bm = cg.mMultiply(m, cg.mTranslate(0, 0, -(tipZ + halfLen)));
               let thick = .012 + .014 * empty;
               laser.setMatrix(bm).scale(thick, thick, halfLen)
                    .color(.1 + empty, 1.5, .15);
               let dir = cg.normalize(cg.subtract(cg.mTransform(m, [0, 0, -1]), tipPt));
               for (let t = 0; t < halfLen * 2; t += .15) {
                  if (hitDummy(cg.add(tipPt, cg.scale(dir, t))))
                     break;
               }
            }
         }
      }
      else {
         if (curSpell !== 'protego') shield.scale(0);
         if (curSpell !== 'avada') laser.scale(0);
      }

      if (zapLife > 0 && zapVel && zapPos && zapDir) {
         zapLife -= dt;
         zapPos = cg.add(zapPos, cg.scale(zapVel, dt));
         let halfLen = .2;
         let mid = cg.subtract(zapPos, cg.scale(zapDir, halfLen));
         zap.identity().move(mid).aimZ(zapDir).scale(.012, .012, halfLen)
            .color(spells.disarm.rgb);
         hitDummy(zapPos);
         if (zapLife <= 0)
            clearZap();
      } else if (zapLife <= 0) {
         clearZap();
      }

      let hit = dummyHit && model.time - dummyHit < .45;
      dummy.identity().move(dummyPos).scale(dummyR, dummyH, dummyR)
           .color(hit ? 1 : .55, hit ? .35 : .4, hit ? .25 : .3);
   });
}
