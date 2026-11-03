// Inspect card for the hero, a pack item, or a board piece.

import { G2 } from '../../../util/g2.js';
import { spriteForm, PIECE_CH, makeItemIcon, showItemIcon, tokenSize } from '../models.js';
import { label, addChrome, billboard, g2Frame, hpStripe, drawAbils, factRow } from './draw.js';

const PORTRAITS = ['hero', 'chest', 'chest_gold', 'dragon', 'boar', 'tree', 'moss', 'pillar', 'idol', 'white', 'rubble', 'black', 'gray', 'knight', 'healer', 'pine', 'dead', 'tiefling', 'drow', 'elf', 'goblin', 'shroom', 'skeleton', 'slime', 'fire'];

export const makeInspect = model => {
   const g2 = new G2();
   model.txtrSrc(2, g2.getCanvas());
   const root = model.add();
   const chrome = addChrome(root);
   const plate = root.add('square').txtr(2).dull();
   const portraits = {};
   PORTRAITS.forEach(id => {
      portraits[id] = root.add(spriteForm(id)).txtr(PIECE_CH).dull().color(1, 1, 1);
   });
   const itemPic = makeItemIcon(root);
   const body = root.add('cube').color(.16, .08, .05).opacity(.001);
   const cells = [];
   const acts = [
      { id: 'equip', label: 'EQUIP', color: [.28, .5, .26] },
      { id: 'unequip', label: 'UNEQUIP', color: [.55, .32, .14] },
      { id: 'use', label: 'USE', color: [.22, .48, .24] },
      { id: 'open', label: 'OPEN', color: [.55, .42, .16] },
      { id: 'fight', label: 'FIGHT', color: [.62, .2, .16] },
      { id: 'close', label: 'CLOSE', color: [.32, .22, .14] },
   ];
   acts.forEach(act => {
      const g = root.add();
      const gold = g.add('cube').color(.78, .56, .2).dull();
      const tile = g.add('cube').color(act.color).dull();
      const rim = g.add('cube').color(1.15, .9, .4);
      label(g, act.label, 0, 0, .005, .22, [.95, .85, .55], true);
      cells.push({ id: act.id, type: 'act', tile, gold, rim, g, hx: .1, hy: .016, off: true });
   });
   let shown = false;
   let view = { title: '', sub: '', lines: [], actions: [] };
   g2.render = function() {
      g2Frame(this, view.title || '');
      this.setColor('#d7c09a');
      this.textHeight(.05);
      this.text(view.sub || '', 0, .5, 'center');
      let y = .32;
      if (view.bar && view.bar.m) {
         hpStripe(this, -.84, y, 1.68, view.bar.v, view.bar.m, view.bar.label || 'HP');
         y -= .2;
      }
      if (view.stats && view.stats.length) {
         drawAbils(this, view.stats, y - .34);
         y -= .42;
      }
      if (view.facts && view.facts.length) {
         factRow(this, view.facts, y - .16);
         y -= .26;
      }
      this.setColor('#f3e6cc');
      this.textHeight(.046);
      if (view.foot) this.text(view.foot, 0, y, 'center');
      this.setColor('#b89a6a');
      this.textHeight(.038);
      if (view.note) this.text(view.note, 0, y - .12, 'center');
   };
   return {
      root, cells, body,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      pose(next, hover) {
         if (!shown) { root.identity().scale(0); return; }
         view = next || view;
         g2.update();
         const actions = view.actions ? view.actions.slice() : [];
         if (actions.indexOf('close') < 0) actions.push('close');
         chrome.pose(.155, .30);
         body.identity().move(0, 0, -.014).scale(.165, .31, .008);
         plate.identity().move(0, -.02, .003).scale(.14, .20, 1);
         Object.keys(portraits).forEach(id => {
            const n = portraits[id];
            if (view.portrait !== id) { n.identity().scale(0); return; }
            const { sx, sy } = tokenSize(id);
            const k = 0.06 / Math.max(sx, sy);
            n.identity().move(0, .2, .014).scale(sx * k, sy * k, sx * k);
         });
         if (view.item) showItemIcon(itemPic, view.item, 0, .2, .034, true);
         else showItemIcon(itemPic, null, 0, 0, .034, true);
         const seen = {};
         cells.forEach(c => {
            const i = actions.indexOf(c.id);
            c.off = i < 0 || seen[c.id];
            if (!c.off) seen[c.id] = true;
            if (c.off) { c.g.identity().scale(0); return; }
            const y = -0.25 - i * .038;
            c.g.identity().move(0, y, .004);
            if (c.gold) c.gold.identity().move(0, 0, -.001).scale(c.hx + .004, c.hy + .004, .002);
            c.tile.identity().move(0, 0, 0).scale(c.hx, c.hy, .003);
            if (c.id === hover) c.rim.identity().move(0, 0, -.002).scale(c.hx + .006, c.hy + .006, .002);
            else c.rim.identity().scale(0);
         });
      },
      place(pos, eye, face) {
         if (!shown) { root.identity().scale(0); return; }
         billboard(root, pos, eye, 1, face);
      },
   };
};
