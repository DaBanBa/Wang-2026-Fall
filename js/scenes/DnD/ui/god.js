// God Mode pawn palette and the PLAY / TILES / CLEAR buttons.

import { KINDS, KIND, HALF } from '../data.js';
import { label, addTableChrome } from './draw.js';

export const makeGodSheet = stage => {
   const root = stage.add();
   const palette = root.add();
   const acts = root.add();
   const palChrome = addTableChrome(palette);
   const actChrome = addTableChrome(acts);
   const cols = 3;
   const rows = Math.ceil(KINDS.length / cols);
   const pitch = 0.056;
   const z0 = ((rows - 1) * pitch) / 2;
   label(palette, 'PAWNS', 0, .012, z0 + 0.048, .36, [.95, .82, .5], false);

   const cells = [];
   KINDS.forEach((kind, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const x = (col - (cols - 1) / 2) * pitch;
      const z = z0 - row * pitch;
      const tile = palette.add('cube').color(.18, .1, .06).dull();
      const gold = palette.add('cube').color(.78, .56, .2).dull();
      const rim = palette.add('cube').color(1.15, .9, .4);
      label(palette, KIND[kind].label.toUpperCase(), x, .014, z - .022, .16, [.95, .82, .5], false);
      cells.push({ id: kind, type: 'kind', tile, gold, rim, x, z, hx: .024, hz: .022 });
   });

   [
      { id: 'enter', label: 'PLAY',  color: [.28, .5, .26] },
      { id: 'tiles', label: 'TILES', color: [.22, .36, .5] },
      { id: 'clear', label: 'CLEAR', color: [.55, .22, .18] },
   ].forEach((act, i) => {
      const x = -0.056 + i * 0.056;
      const z = 0;
      const tile = acts.add('cube').color(act.color).dull();
      const gold = acts.add('cube').color(.78, .56, .2).dull();
      const rim = acts.add('cube').color(1.1, .9, .4);
      label(acts, act.label, x, .014, z, .28, [.95, .85, .55], false);
      cells.push({ id: act.id, type: 'act', tile, gold, rim, x, z, hx: .026, hz: .02 });
   });

   let shown = true;
   return {
      root, cells,
      ox: HALF + 0.20, oy: 0.003, oz: 0,
      ax: -HALF - 0.20, ay: 0.003, az: 0,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      pose(sel, hover) {
         if (!shown) { root.identity().scale(0); return; }
         root.identity();
         palette.identity().move(this.ox, this.oy, this.oz);
         acts.identity().move(this.ax, this.ay, this.az);
         palChrome.pose(.10, z0 + 0.07);
         actChrome.pose(.11, .045);
         cells.forEach(c => {
            const on = c.id === sel || c.id === hover;
            c.tile.identity().move(c.x, .005, c.z).scale(c.hx, .0025, c.hz);
            if (c.gold) c.gold.identity().move(c.x, .003, c.z).scale(c.hx + .003, .0015, c.hz + .003);
            if (c.rim) {
               if (on) c.rim.identity().move(c.x, .006, c.z).scale(c.hx + .005, .0012, c.hz + .005);
               else c.rim.identity().scale(0);
            }
         });
      },
   };
};
