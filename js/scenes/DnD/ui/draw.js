// Shared card chrome, labels, and the parchment frame drawn on G2.

import * as cg from '../../../render/core/cg.js';
import { showItemIcon } from '../models.js';

const CHAR_W = 0.0127;
const CHAR_H = 0.0254;

export const showIcon = (rec, spr, x, y, s, face) => showItemIcon(rec, spr, x, y, s, face);

export const label = (parent, str, x, y, z, s, rgb, face) => {
   try {
      const n = parent.add(clay.text(String(str)));
      const w = String(str).length * CHAR_W * s;
      const h = CHAR_H * s;
      if (face) n.move(x - w / 2, y + h / 2, z);
      else n.move(x - w / 2, y, z - h / 2).turnX(-Math.PI / 2);
      n.scale(s).color(rgb || [.12, .08, .04]);
      return n;
   } catch (err) { return parent.add(); }
};

export const billboard = (node, pos, eye, s, face) => {
   const Z = cg.normalize(face || cg.subtract(eye, pos));
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

export const addChrome = parent => {
   const back = parent.add('cube').color(.07, .04, .03).dull();
   const gold = parent.add('cube').color(.78, .56, .18).dull();
   const face = parent.add('cube').color(.16, .08, .05).dull();
   return {
      pose(hx, hy) {
         back.identity().move(0, 0, -.006).scale(hx + .01, hy + .01, .004);
         gold.identity().move(0, 0, -.004).scale(hx + .006, hy + .006, .003);
         face.identity().move(0, 0, -.002).scale(hx, hy, .002);
      },
   };
};

export const addTableChrome = parent => {
   const back = parent.add('cube').color(.07, .04, .03).dull();
   const gold = parent.add('cube').color(.78, .56, .18).dull();
   const face = parent.add('cube').color(.16, .08, .05).dull();
   return {
      pose(hx, hz) {
         back.identity().move(0, .0005, 0).scale(hx + .01, .0014, hz + .01);
         gold.identity().move(0, .0011, 0).scale(hx + .006, .0012, hz + .006);
         face.identity().move(0, .0016, 0).scale(hx, .0008, hz);
      },
   };
};

export const g2Frame = (g, title) => {
   g.setColor('#1c140e');
   g.fillRect(-1, -1, 2, 2);
   g.setColor('#2e2116');
   g.fillRect(-.96, -.96, 1.92, 1.92, .06);
   g.setColor('#c6a15a');
   g.fillRect(-.96, .9, 1.92, .065, .02);
   g.fillRect(-.96, -1, 1.92, .04, .02);
   g.setColor('#6d5230');
   g.fillRect(-.88, .84, 1.76, .012);
   if (title) {
      const s = String(title);
      g.setColor('#f6e2b0');
      g.textHeight(s.length > 18 ? .068 : s.length > 13 ? .082 : .098);
      g.text(s.toUpperCase(), 0, .68, 'center');
   }
};

export const hpStripe = (g, x, y, w, v, m, name) => {
   const t = Math.max(0, Math.min(1, m ? v / m : 0));
   g.setColor('#ead8b4');
   g.textHeight(.048);
   g.text(name || 'HP', x, y + .09, 'left');
   g.setColor('#140e0a');
   g.fillRect(x, y, w, .075, .02);
   const col = t > .55 ? '#3eae58' : t > .25 ? '#d2a43a' : '#c4473a';
   g.setColor(col);
   g.fillRect(x + .012, y + .014, Math.max(.02, (w - .024) * t), .047, .014);
};

export const drawAbils = (g, stats, y) => {
   if (!stats || !stats.length) return;
   const n = stats.length;
   const w = n > 4 ? .28 : .42;
   const gap = n > 4 ? .03 : .08;
   const total = n * w + (n - 1) * gap;
   let x = -total / 2;
   stats.forEach(st => {
      g.setColor('#3a2818');
      g.fillRect(x, y, w, .32, .04);
      g.setColor('#e2c27a');
      g.textHeight(.042);
      g.text(st.name, x + w / 2, y + .24, 'center');
      g.setColor('#f7f1e4');
      g.textHeight(.086);
      g.text(String(st.v), x + w / 2, y + .11, 'center');
      g.setColor('#f0d48a');
      g.textHeight(.046);
      g.text(st.mod || '', x + w / 2, y + .02, 'center');
      x += w + gap;
   });
};

export const factRow = (g, facts, y) => {
   if (!facts || !facts.length) return;
   const w = facts.length > 4 ? .3 : .36;
   const gap = .035;
   const total = facts.length * w + (facts.length - 1) * gap;
   let x = -total / 2;
   facts.forEach(f => {
      g.setColor('#2a1e14');
      g.fillRect(x, y, w, .15, .03);
      g.setColor('#c6a15a');
      g.textHeight(.038);
      g.text(String(f.k).toUpperCase(), x + w / 2, y + .09, 'center');
      g.setColor('#f4ead4');
      g.textHeight(.05);
      g.text(String(f.v), x + w / 2, y + .02, 'center');
      x += w + gap;
   });
};
