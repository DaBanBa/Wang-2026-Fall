// Controllers, rays, keys, and the little square-wave blips.

import * as cg from '../../render/core/cg.js';
import { buttonState, controllerMatrix } from '../../render/core/controllerInput.js';
import { lcb, rcb } from '../../handle_scenes.js';
import { N, TILE } from './data.js';

if (!window.__dndKeys) {
   window.__dndKeys = { down: {}, edge: {} };
   addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      window.__dndKeys.down[k] = true;
      window.__dndKeys.edge[k] = true;
   });
   addEventListener('keyup', e => { window.__dndKeys.down[e.key.toLowerCase()] = false; });
}

export const here = () => !window.currentName || /dnd/i.test(window.currentName);
export const now = () => Date.now() / 1000;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const inb = (c, r) => c >= 0 && r >= 0 && c < N && r < N;
export const tileX = c => (c - 3.5) * TILE;
export const tileZ = r => (r - 3.5) * TILE;

export const keyEdge = k => {
   if (!window.__dndKeys.edge[k]) return false;
   window.__dndKeys.edge[k] = false;
   return true;
};

export const rayBox = (ray, matrix) => {
   const inv = cg.mInverse(matrix);
   const o = cg.mTransform(inv, ray.o);
   const d4 = cg.mTransform(inv, [ray.d[0], ray.d[1], ray.d[2], 0]);
   const d = [d4[0], d4[1], d4[2]];
   let tNear = 0.02, tFar = 12, hit = false;
   for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
         if (o[a] < -1 || o[a] > 1) return null;
         continue;
      }
      let t1 = (-1 - o[a]) / d[a], t2 = (1 - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tNear) { tNear = t1; hit = true; }
      if (t2 < tFar) tFar = t2;
      if (tNear > tFar) return null;
   }
   return !hit || tNear > tFar ? null : { t: tNear };
};

export const beamRay = hand => {
   const cb = hand === 'left' ? lcb : rcb;
   if (!cb || !cb.beamMatrix || !clay.inverseRootMatrix) return null;
   let bm;
   try { bm = cb.beamMatrix(); } catch (err) { return null; }
   if (!bm || bm.length < 16) return null;
   const len = Math.hypot(bm[8], bm[9], bm[10]);
   if (len < 1e-4) return null;
   const o = cg.mTransform(clay.inverseRootMatrix, [bm[12], bm[13], bm[14]]);
   const d4 = cg.mTransform(clay.inverseRootMatrix, [-bm[8] / len, -bm[9] / len, -bm[10] / len, 0]);
   const dn = Math.hypot(d4[0], d4[1], d4[2]);
   if (dn < 1e-4) return null;
   return { o, d: [d4[0] / dn, d4[1] / dn, d4[2] / dn] };
};

export const headMat = () => {
   try {
      const a = clay.root().inverseViewMatrix(0);
      if (!a) return null;
      const b = clay.root().inverseViewMatrix(1);
      return cg.mMultiply(clay.inverseRootMatrix, b ? cg.mix(a, b, .5) : a);
   } catch (err) { return null; }
};

export const eyeOf = () => {
   const H = headMat();
   return H ? H.slice(12, 15) : [0, 1.55, .4];
};

export const handPos = hand => {
   const p = inputEvents.pos(hand);
   if (p && isFinite(p[0])) return p;
   const m = controllerMatrix[hand];
   if (!m || m.length < 16 || !clay.inverseRootMatrix) return null;
   return cg.mTransform(clay.inverseRootMatrix, [m[12], m[13], m[14]]);
};

export const pressed = (hand, i) => !!(buttonState[hand] && buttonState[hand][i] && buttonState[hand][i].pressed);

export const rise = (was, hand, i, key) => {
   const down = pressed(hand, i);
   const edge = down && !was[key];
   was[key] = down;
   return edge;
};

let actx = null;
export const tone = (freq, dur, vol) => {
   try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || .04, t0);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + .02);
   } catch (err) {}
};

export const buzz = (hand, power, ms) => {
   try { if (window.vibrate) vibrate(hand, clamp(power, 0, 1), ms || 40); } catch (err) {}
};
