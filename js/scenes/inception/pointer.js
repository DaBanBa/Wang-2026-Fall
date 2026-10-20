import * as cg from "../../render/core/cg.js";
import { lcb, rcb } from "../../handle_scenes.js";
import { controllerMatrix } from "../../render/core/controllerInput.js";

function headMatrix() {
   try {
      if (!window.clay || !clay.inverseRootMatrix || !clay.root()) return null;
      const a = clay.root().inverseViewMatrix(0);
      if (!a) return null;
      const b = clay.root().inverseViewMatrix(1);
      return cg.mMultiply(clay.inverseRootMatrix, b ? cg.mix(a, b, 0.5) : a);
   } catch (err) {
      return null;
   }
}

function flatForward(H) {
   if (!H) return [0, 0, -1];
   const forward = [-H[8], 0, -H[10]];
   const n = Math.hypot(forward[0], forward[2]);
   return n < 1e-4 ? [0, 0, -1] : [forward[0] / n, 0, forward[2] / n];
}

export function gaze() {
   const H = headMatrix();
   return {
      eye: H ? H.slice(12, 15) : [0, 1.6, 0],
      forward: flatForward(H),
      ready: !!H
   };
}

export function basis(P, eye) {
   let Z = cg.subtract(eye, P);
   const zn = cg.norm(Z);
   Z = zn < 1e-4 ? [0, 0, 1] : cg.scale(Z, 1 / zn);
   let X = cg.cross([0, 1, 0], Z);
   const xn = cg.norm(X);
   X = xn < 1e-4 ? [1, 0, 0] : cg.scale(X, 1 / xn);
   const Y = cg.cross(Z, X);
   return [X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, P[0], P[1], P[2], 1];
}

// Ray against a cube matrix whose local box is [-1, 1]. The hit face is the entry slab.
export function rayBox(ray, matrix) {
   const inv = cg.mInverse(matrix);
   const o = cg.mTransform(inv, ray.o);
   const d4 = cg.mTransform(inv, [ray.d[0], ray.d[1], ray.d[2], 0]);
   const d = [d4[0], d4[1], d4[2]];
   let tNear = 0.04, tFar = 8, axis = 0, sign = 1, hit = false;
   for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
         if (o[a] < -1 || o[a] > 1) return null;
         continue;
      }
      let t1 = (-1 - o[a]) / d[a];
      let t2 = (1 - o[a]) / d[a];
      let s = -1;
      if (t1 > t2) {
         const tmp = t1;
         t1 = t2;
         t2 = tmp;
         s = 1;
      }
      if (t1 > tNear) {
         tNear = t1;
         axis = a;
         sign = s;
         hit = true;
      }
      if (t2 < tFar) tFar = t2;
      if (tNear > tFar) return null;
   }
   if (!hit || tNear > tFar) return null;
   return { t: tNear, axis, sign };
}

export function beamRay(hand) {
   const cb = hand === "left" ? lcb : rcb;
   if (!cb || !cb.m || !cb.beamMatrix || !window.clay || !clay.inverseRootMatrix) return null;
   let bm = null;
   try { bm = cb.beamMatrix(); } catch (err) { return null; }
   if (!bm || bm.length < 16) return null;
   const len = Math.hypot(bm[8], bm[9], bm[10]);
   if (len < 1e-4) return null;
   const o = cg.mTransform(clay.inverseRootMatrix, [bm[12], bm[13], bm[14]]);
   const d4 = cg.mTransform(clay.inverseRootMatrix, [-bm[8] / len, -bm[9] / len, -bm[10] / len, 0]);
   const dn = Math.hypot(d4[0], d4[1], d4[2]);
   if (dn < 1e-4) return null;
   return { o, d: [d4[0] / dn, d4[1] / dn, d4[2] / dn] };
}

export function viewRay() {
   const H = headMatrix();
   if (!H) return null;
   const d = [-H[8], -H[9], -H[10]];
   const n = Math.hypot(d[0], d[1], d[2]);
   if (n < 1e-4) return null;
   return { o: H.slice(12, 15), d: [d[0] / n, d[1] / n, d[2] / n] };
}

export function handPoint(hand) {
   let m = null;
   if (window.handtracking && window.clay && clay.handsWidget)
      m = clay.handsWidget.getMatrix(hand, 1, 0);
   if ((!m || m.length < 16) && controllerMatrix[hand])
      m = controllerMatrix[hand];
   if (!m || m.length < 16 || !clay.inverseRootMatrix) return null;
   return cg.mTransform(clay.inverseRootMatrix, [m[12], m[13], m[14]]);
}
