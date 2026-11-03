// Terrain painter.

import { GROUNDS, GROUND, HALF } from '../data.js';
import { tileForm, TILE_CH } from '../models.js';
import { label, addTableChrome } from './draw.js';

export const makeTileSheet = stage => {
   const root = stage.add();
   const chrome = addTableChrome(root);
   label(root, 'TERRAIN', 0, .012, .155, .42, [.95, .82, .5], false);

   const cells = [];
   GROUNDS.forEach((id, i) => {
      const col = i % 2, row = (i / 2) | 0;
      const x = -0.034 + col * 0.068;
      const z = 0.078 - row * 0.052;
      const gold = root.add('cube').color(.78, .56, .2).dull();
      const tile = root.add(tileForm(id)).txtr(TILE_CH).dull().color(1, 1, 1);
      const rim = root.add('cube').color(1.1, .9, .35);
      label(root, GROUND[id].label.toUpperCase(), x, .018, z - .024, .22, [.95, .82, .5], false);
      cells.push({ id, type: 'ground', tile, gold, rim, x, z, hx: .03, hz: .024 });
   });
   [
      { id: 'build', label: 'BUILD', color: [.28, .5, .26] },
      { id: 'fill', label: 'FILL', color: [.55, .42, .16] },
   ].forEach((act, i) => {
      const x = -0.034 + i * 0.068;
      const z = -0.12;
      const tile = root.add('cube').color(act.color).dull();
      const gold = root.add('cube').color(.78, .56, .2).dull();
      const rim = root.add('cube').color(1.1, .9, .4);
      label(root, act.label, x, .014, z, .26, [.95, .85, .55], false);
      cells.push({ id: act.id, type: 'act', tile, gold, rim, x, z, hx: .028, hz: .018 });
   });

   let shown = false;
   return {
      root, cells,
      ox: HALF + 0.20, oy: 0.003, oz: 0,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      pose(sel, hover) {
         if (!shown) { root.identity().scale(0); return; }
         root.identity().move(this.ox, this.oy, this.oz);
         chrome.pose(.12, .175);
         cells.forEach(c => {
            const on = c.id === sel || c.id === hover;
            if (c.gold) c.gold.identity().move(c.x, .004, c.z).scale(c.hx + .004, .002, c.hz + .004);
            c.tile.identity().move(c.x, .008, c.z).scale(c.hx, .006, c.hz);
            if (c.type === 'ground') c.tile.txtr(TILE_CH).dull().color(1, 1, 1);
            if (on) c.rim.identity().move(c.x, .01, c.z).scale(c.hx + .006, .0015, c.hz + .006);
            else c.rim.identity().scale(0);
         });
      },
   };
};
