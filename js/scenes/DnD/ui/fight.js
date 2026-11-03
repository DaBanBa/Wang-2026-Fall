// Duel card.

import { G2 } from '../../../util/g2.js';
import { spriteForm, PIECE_CH, tokenSize } from '../models.js';
import { label, addChrome, billboard, g2Frame, hpStripe } from './draw.js';

const PORTRAITS = ['hero', 'dragon', 'boar', 'white', 'black', 'gray', 'tree', 'chest', 'goblin', 'shroom', 'skeleton', 'slime'];

export const makeFightTray = model => {
   const g2 = new G2();
   model.txtrSrc(4, g2.getCanvas());
   const root = model.add();
   const chrome = addChrome(root);
   const plate = root.add('square').txtr(4).dull();
   const portraits = {};
   PORTRAITS.forEach(id => {
      portraits[id] = root.add(spriteForm(id)).txtr(PIECE_CH).dull().color(1, 1, 1);
   });
   const body = root.add('cube').color(.16, .08, .05).opacity(.001);
   const cells = [];
   [
      { id: 'attack', label: 'FIGHT', color: [.62, .18, .14] },
      { id: 'herb', label: 'POT', color: [.22, .48, .24] },
      { id: 'flee', label: 'RUN', color: [.22, .34, .55] },
      { id: 'reroll', label: 'INSP', color: [.55, .42, .14] },
      { id: 'confirm', label: 'GO', color: [.5, .5, .48] },
   ].forEach(act => {
      const g = root.add();
      const gold = g.add('cube').color(.78, .56, .2).dull();
      const tile = g.add('cube').color(act.color).dull();
      const rim = g.add('cube').color(1.15, .9, .4);
      label(g, act.label, 0, 0, .005, .2, [.95, .85, .55], true);
      cells.push({ id: act.id, type: 'act', tile, gold, rim, g, hx: .042, hy: .016, off: true });
   });
   let shown = false;
   let view = {};
   g2.render = function() {
      g2Frame(this, view.foeName || 'Foe');
      this.setColor('#e7c56a');
      this.textHeight(.04);
      this.text(view.foeAc != null ? 'AC  ' + view.foeAc : '', -.82, .58, 'left');
      hpStripe(this, -.86, .4, 1.2, view.foeHp, view.foeMax, 'HP  ' + (view.foeHp || 0) + '/' + (view.foeMax || 0));
      this.setColor('#f6e2b0');
      this.textHeight(.046);
      this.text('You   AC  ' + (view.heroAc != null ? view.heroAc : ''), -.05, -.38, 'left');
      hpStripe(this, -.1, -.54, 1.0, view.heroHp, view.heroMax, 'HP  ' + (view.heroHp || 0) + '/' + (view.heroMax || 0));
      this.setColor('#140e0a');
      this.fillRect(-.86, -.86, 1.72, .18, .03);
      this.setColor('#f0e2c0');
      this.textHeight(.04);
      this.text(view.message || '', 0, -.78, 'center');
   };
   const poseSprite = (id, x, y, k) => {
      const n = portraits[id];
      if (!n) return;
      const { sx, sy } = tokenSize(id);
      const s = (k || 0.05) / Math.max(sx, sy);
      n.identity().move(x, y, .014).scale(sx * s, sy * s, sx * s);
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
         chrome.pose(.17, .24);
         body.identity().move(0, 0, -.014).scale(.18, .25, .008);
         plate.identity().move(0, .02, .003).scale(.16, .215, 1);
         Object.keys(portraits).forEach(id => portraits[id].identity().scale(0));
         poseSprite(view.foePortrait || 'dragon', .07, .12, 0.055);
         poseSprite('hero', -.08, -.02, 0.04);
         const actions = (view.actions || []).slice();
         const seen = {};
         const live = actions.filter(id => {
            if (seen[id]) return false;
            seen[id] = true;
            return cells.some(c => c.id === id);
         });
         cells.forEach(c => {
            const i = live.indexOf(c.id);
            c.off = i < 0;
            if (c.off) { c.g.identity().scale(0); return; }
            const x = (i - (live.length - 1) / 2) * .09;
            c.g.identity().move(x, -.2, .006);
            c.gold.identity().move(0, 0, -.001).scale(c.hx + .004, c.hy + .004, .002);
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
