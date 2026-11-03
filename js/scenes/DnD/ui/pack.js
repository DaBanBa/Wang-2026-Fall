// Adventurer backpack.

import { itemSprite, makeItemIcon } from '../models.js';
import { label, addChrome, billboard, showIcon } from './draw.js';

export const makeBackpack = model => {
   const root = model.add();
   const chrome = addChrome(root);
   label(root, 'PACK', 0, .12, .006, .4, [.95, .82, .5], true);
   const cells = [];
   for (let i = 0; i < 6; i++) {
      const col = i % 3, row = (i / 3) | 0;
      const x = -0.055 + col * 0.055;
      const y = 0.05 - row * 0.055;
      const gold = root.add('cube').color(.78, .56, .2).dull();
      const tile = root.add('cube').color(.18, .1, .06).dull();
      const rim = root.add('cube').color(1.15, .88, .28);
      const token = makeItemIcon(root);
      cells.push({ id: 'slot' + i, type: 'slot', index: i, tile, gold, rim, token, x, y, hx: .024, hy: .024 });
   }
   [
      { id: 'act', label: 'ACT', color: [.22, .36, .5], x: -0.055 },
      { id: 'end', label: 'END', color: [.28, .5, .26], x: 0 },
      { id: 'god', label: 'GOD', color: [.55, .42, .16], x: 0.055 },
   ].forEach(act => {
      const y = -0.08;
      const gold = root.add('cube').color(.78, .56, .2).dull();
      const tile = root.add('cube').color(act.color).dull();
      const rim = root.add('cube').color(1.1, .9, .4);
      label(root, act.label, act.x, y, .006, .26, [.95, .85, .55], true);
      cells.push({ id: act.id, type: 'act', tile, gold, rim, x: act.x, y, hx: .024, hy: .016 });
   });

   const body = root.add('cube').color(.16, .08, .05).opacity(.001);
   let shown = false;
   return {
      root, cells, body,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      pose(pack, equipped, hover) {
         if (!shown) { root.identity().scale(0); return; }
         chrome.pose(.12, .16);
         body.identity().move(0, 0, -.014).scale(.13, .17, .008);
         cells.forEach(c => {
            const on = c.id === hover || (c.type === 'slot' && pack[c.index] && pack[c.index].uid === equipped);
            if (c.gold) c.gold.identity().move(c.x, c.y, 0).scale(c.hx + .004, c.hy + .004, .002);
            c.tile.identity().move(c.x, c.y, .002).scale(c.hx, c.hy, .003);
            if (on) c.rim.identity().move(c.x, c.y, -.001).scale(c.hx + .006, c.hy + .006, .002);
            else c.rim.identity().scale(0);
            if (c.token) showIcon(c.token, itemSprite(pack[c.index]), c.x, c.y, .016, true);
         });
      },
      place(pos, eye, face) {
         if (!shown) { root.identity().scale(0); return; }
         billboard(root, pos, eye, 1, face);
      },
   };
};
