// floating panel components

import * as cg from "../../render/core/cg.js";

export const BG = [.03, .04, .06];
const WHITE = [.92, .94, .96];

// Strip non-ASCII
export const ascii = s => String(s || '')
   .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
   .replace(/[^\x20-\x7E\n]/g, '');

// A right-handed basis at P that faces the camera
export const facing = (P, eye) => {
   const Z = cg.normalize(cg.subtract(eye, P));
   const X = cg.normalize(cg.cross([0, 1, 0], Z));
   return { P, X, Y: cg.cross(Z, X), Z };
};

// Set the node to face the camera using Facing()
export const billboard = (node, P, eye) => {
   const { X, Y, Z } = facing(P, eye);
   return node.setMatrix([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, P[0], P[1], P[2], 1]);
};

// Remove every child of a node
export const clear = node => { while (node.nChildren()) node.remove(0); };

// Add a text mesh as a child
export const addText = (parent, str, x, y, s, rgb) =>
   parent.add(clay.text(str)).move(x, y, .002).scale(s).color(rgb);

// Ray {o,d} × a billboarded plane. Returns {t,p,u,v} in local face coords
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

// Create a panel component
export const makePanel = (model, { cols = 44, ts = .58, grabbable = false, title = 1.35, titleField = '' } = {}) => {
   const root = model.add();
   const bg = root.add('square').color(BG).opacity(.85);
   const bar = root.add('cube');
   const hi = root.add('square').color(.12, .28, .18).opacity(.55);
   const text = root.add();
   const cw = .0254 / 2 * ts, lh = .0254 * ts * 1.15, m = .02;

   const p = { grabbable, pos: null, axes: null, w: 0, h: 0, scale: 1, state: 'idle',
               key: '', rgb: WHITE, fields: [], hoverField: '', editField: '', titleField };
   const layout = {};

   // Wrap one string into lines and record their index range
   const addLines = (lines, fields, str, c, marked, field) => {
      const i0 = lines.length;
      for (const l of cg.split(ascii(str), cols).split('\n')) lines.push([l, c, marked, field]);
      if (field) fields.push({ id: field, i0, i1: lines.length });
   };

   // Rebuild the text meshes on change
   p.set = (head, rgb, rows) => {
      const key = JSON.stringify([head, rgb, rows, p.editField, p.hoverField]);
      if (key === p.key) return;
      p.key = key;
      p.rgb = rgb;
      clear(text);

      const lines = [], fields = [];
      for (const r of rows) {
         if (r && r.field) {
            if (r.label) addLines(lines, fields, r.label, [.7, 1.3, .8], false, '');
            addLines(lines, fields, (r.value || '') + (p.editField === r.field ? '_' : ''),
                     r.rgb || WHITE, p.editField === r.field, r.field);
         } else {
            const [str, c = WHITE, marked = false] = typeof r === 'string' ? [r] : r;
            addLines(lines, fields, str, c, marked, '');
         }
      }
      head = ascii(head).substring(0, cols / title >> 0) + (p.editField === titleField ? '_' : '');
      const top = lh * title + lh * .5;
      const w = cols * cw, h = top + lines.length * lh;
      p.w = w / 2 + m;
      p.h = h / 2 + m;
      p.fields = fields;
      layout.top = top; layout.h = h; layout.lh = lh;

      bg.identity().scale(p.w, p.h, 1);
      bar.identity().move(-p.w, 0, .001).scale(.004, p.h, .002).color(rgb);
      addText(text, head, -w / 2, h / 2, ts * title, rgb);
      lines.forEach(([l, c, marked], i) => {
         const y = h / 2 - top - i * lh;
         if (l) addText(text, l, -w / 2, y, ts, c);
         if (marked) text.add('cube').move(-p.w + .009, y - lh / 2, .002).scale(.003, lh / 2, .002).color(c);
      });

      const lit = p.editField || p.hoverField;
      let block = null;
      if (lit === titleField) block = { y: h / 2 - top / 2, hh: top / 2 };
      else {
         const f = fields.find(x => x.id === lit);
         if (f) {
            const y0 = h / 2 - top - f.i0 * lh, y1 = h / 2 - top - f.i1 * lh;
            block = { y: (y0 + y1) / 2, hh: Math.max(.01, (y0 - y1) / 2) };
         }
      }
      if (block) hi.identity().move(0, block.y, -.001).scale(p.w - .004, block.hh, 1);
      else hi.identity().scale(0);
   };

   // Billboard the panel at P. Hover/drag tints the left accent bar
   p.place = (P, eye, s = 1) => {
      p.axes = facing(P, eye);
      p.scale = s;
      billboard(root, P, eye).scale(s);
      const lit = p.state !== 'idle';
      bar.color(p.state === 'drag' ? p.rgb : lit ? WHITE : p.rgb);
   };

   // Scale the panel to zero to hide it
   p.hide = () => { root.identity().scale(0); p.axes = null; p.state = 'idle'; };

   // Use planeHit() to check if the ray hits the panel
   p.hit = r => planeHit(p.axes, r, p.w, p.h, p.scale);

   // Use hitField() to check which editable field the ray is pointing at
   p.hitField = r => {
      const hit = p.hit(r);
      if (!hit || !layout.h) return null;
      const y = hit.v;
      const titleBottom = layout.h / 2 - layout.top;
      if (p.titleField && y <= layout.h / 2 && y >= titleBottom) return p.titleField;
      for (const f of p.fields) {
         const y0 = layout.h / 2 - layout.top - f.i0 * layout.lh;
         const y1 = layout.h / 2 - layout.top - f.i1 * layout.lh;
         if (y <= y0 && y >= y1) return f.id;
      }
      return null;
   };

   p.hide();
   return p;
};

const KEY_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM\'-'];

// Keyboard component
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
