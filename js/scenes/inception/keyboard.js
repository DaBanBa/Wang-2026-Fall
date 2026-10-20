import * as cg from "../../render/core/cg.js";

const BG = [.03, .04, .06];
const WHITE = [.92, .94, .96];

const facing = (P, eye) => {
   const Z = cg.normalize(cg.subtract(eye, P));
   const X = cg.normalize(cg.cross([0, 1, 0], Z));
   return { P, X, Y: cg.cross(Z, X), Z };
};

const billboard = (node, P, eye) => {
   const { X, Y, Z } = facing(P, eye);
   return node.setMatrix([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, P[0], P[1], P[2], 1]);
};

const addText = (parent, str, x, y, s, rgb) =>
   parent.add(clay.text(str)).move(x, y, .002).scale(s).color(rgb);

const planeHit = (A, r, w, h, scale) => {
   if (!r || !A) return null;
   const den = cg.dot(r.d, A.Z);
   if (Math.abs(den) < 1e-4) return null;
   const t = cg.dot(cg.subtract(A.P, r.o), A.Z) / den;
   if (t < .05 || t > 5) return null;
   const q = cg.add(r.o, cg.scale(r.d, t)), v = cg.subtract(q, A.P);
   const u = cg.dot(v, A.X) / scale, vv = cg.dot(v, A.Y) / scale;
   if (Math.abs(u) > w || Math.abs(vv) > h) return null;
   return { t, p: q, u, v: vv };
};

const KEY_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM\'-'];

export const makeKeyboard = model => {
   const root = model.add();
   const bg = root.add('square').color(BG).opacity(.88);
   const keys = [];
   const kw = .028, kh = .032, gap = .005, ts = .38;
   const addKey = (ch, label, x, y, hw) => {
      const node = root.add();
      node.add('square').scale(hw, kh / 2, 1).color(.14, .16, .18);
      addText(node, label, -label.length * .0254 / 4 * ts, kh * .15, ts, WHITE);
      keys.push({ ch, node, x, y, hw, hh: kh / 2 });
   };

   KEY_ROWS.forEach((row, ri) => {
      const rowW = row.length * (kw + gap) - gap;
      [...row].forEach((ch, ci) => {
         addKey(ch, ch, -rowW / 2 + ci * (kw + gap) + kw / 2, .07 - ri * (kh + gap), kw / 2);
      });
   });
   let ex = -.18;
   [[' ', 'space', .14], ['del', '<', .045]].forEach(([ch, label, hw]) => {
      addKey(ch, label, ex + hw, .07 - 4 * (kh + gap), hw);
      ex += hw * 2 + gap;
   });

   const W = .18, H = .12;
   bg.identity().scale(W, H, 1);
   const k = { pos: null, axes: null, w: W, h: H, scale: 1, hover: '', state: 'idle' };
   k.place = (P, eye, s = 1) => {
      k.axes = facing(P, eye);
      k.scale = s;
      billboard(root, P, eye).scale(s);
      for (const key of keys) {
         const on = k.hover === key.ch;
         key.node.identity().move(key.x, key.y, on ? .004 : .002);
         key.node.child(0).color(on ? .25 : .14, on ? .55 : .16, on ? .28 : .18);
      }
   };

   k.hide = () => { root.identity().scale(0); k.axes = null; k.hover = ''; };

   k.hit = r => {
      const hit = planeHit(k.axes, r, k.w, k.h, k.scale);
      if (!hit) return null;
      for (const key of keys)
         if (Math.abs(hit.u - key.x) <= key.hw && Math.abs(hit.v - key.y) <= key.hh)
            return { t: hit.t, p: hit.p, ch: key.ch };
      return { t: hit.t, p: hit.p, ch: '' };
   };

   k.hide();
   return k;
};
