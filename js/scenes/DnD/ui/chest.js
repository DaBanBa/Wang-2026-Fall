// God Mode chest loot tray.

import { LOOT } from '../data.js';
import { spriteForm, PIECE_CH, itemSprite, makeItemIcon, tokenSize } from '../models.js';
import { label, addChrome, billboard, showIcon } from './draw.js';

export const makeChestTray = model => {
   const root = model.add();
   const chrome = addChrome(root);
   const portraits = {
      chest: root.add(spriteForm('chest')).txtr(PIECE_CH).dull().color(1, 1, 1),
      gold: root.add(spriteForm('chest_gold')).txtr(PIECE_CH).dull().color(1, 1, 1),
   };
   label(root, 'CHEST', 0, .2, .006, .4, [.95, .82, .5], true);
   const cells = [];
   const lootTint = [
      [.55, .4, .12],
      [.62, .5, .14],
      [.16, .38, .18],
      [.28, .3, .38],
      [.42, .18, .48],
   ];
   LOOT.forEach((loot, i) => {
      const col = i % 3, row = (i / 3) | 0;
      const x = -0.07 + col * 0.07;
      const y = 0.04 - row * 0.07;
      const gold = root.add('cube').color(.78, .56, .2).dull();
      const tile = root.add('cube').color(lootTint[i] || [.32, .2, .38]).dull();
      const rim = root.add('cube').color(1.15, .9, .4);
      const icon = makeItemIcon(root);
      label(root, loot.tag || loot.label, x, y - .028, .006, .16, [.95, .82, .5], true);
      cells.push({ id: 'add' + i, type: 'add', index: i, tile, gold, rim, icon, spr: itemSprite(loot.make()), x, y, hx: .03, hy: .028 });
   });
   [0, 1, 2, 3, 4, 5].forEach(i => {
      const col = i % 3, row = (i / 3) | 0;
      const x = -0.07 + col * 0.07;
      const y = -0.12 - row * 0.055;
      const gold = root.add('cube').color(.5, .34, .12).dull();
      const tile = root.add('cube').color(.12, .07, .04).dull();
      const rim = root.add('cube').color(.95, .4, .3);
      const token = makeItemIcon(root);
      cells.push({ id: 'drop' + i, type: 'drop', index: i, tile, gold, rim, token, x, y, hx: .03, hy: .022 });
   });
   const closeGold = root.add('cube').color(.78, .56, .2).dull();
   const close = root.add('cube').color(.35, .22, .12).dull();
   const closeRim = root.add('cube').color(1.1, .9, .4);
   label(root, 'CLOSE', 0, -.24, .006, .24, [.95, .85, .55], true);
   cells.push({ id: 'close', type: 'act', tile: close, gold: closeGold, rim: closeRim, x: 0, y: -.24, hx: .05, hy: .016 });

   let shown = false;
   return {
      root, cells,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      pose(loot, hover) {
         if (!shown) { root.identity().scale(0); return; }
         chrome.pose(.14, .28);
         const filled = !!(loot && loot.length);
         const fitChest = (node, show) => {
            if (!show) { node.identity().scale(0); return; }
            const { sx, sy } = tokenSize('chest');
            const k = 0.05 / Math.max(sx, sy);
            node.identity().move(0, .145, .012).scale(sx * k, sy * k, sx * k);
         };
         fitChest(portraits.chest, !filled);
         fitChest(portraits.gold, filled);
         cells.forEach(c => {
            const on = c.id === hover;
            if (c.gold) c.gold.identity().move(c.x, c.y, 0).scale(c.hx + .004, c.hy + .004, .002);
            c.tile.identity().move(c.x, c.y, .002).scale(c.hx, c.hy, .003);
            if (on) c.rim.identity().move(c.x, c.y, -.001).scale(c.hx + .006, c.hy + .006, .002);
            else c.rim.identity().scale(0);
            if (c.icon) showIcon(c.icon, c.spr, c.x, c.y, .016, true);
            if (c.token) showIcon(c.token, itemSprite(loot && loot[c.index]), c.x, c.y, .016, true);
         });
      },
      place(pos, eye, face) {
         if (!shown) { root.identity().scale(0); return; }
         billboard(root, pos, eye, 1, face);
      },
   };
};
