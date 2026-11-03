// Adventurer turn card.

import { G2 } from '../../../util/g2.js';
import { signed, attackBonus, damageFormula } from '../data.js';
import { addChrome, billboard, g2Frame, hpStripe, factRow } from './draw.js';

export const makeHud = (model, hooks) => {
   const g2 = new G2();
   model.txtrSrc(5, g2.getCanvas());
   const root = model.add();
   const chrome = addChrome(root);
   const obj = root.add('square').txtr(5).dull();
   const body = root.add('cube').color(.16, .08, .05).opacity(.001);
   let shown = false;
   g2.render = function() {
      const H = hooks.hero();
      const scores = hooks.scores ? hooks.scores() : null;
      const w = hooks.weapon();
      g2Frame(this, (hooks.night() ? 'Night' : 'Day') + '  ' + hooks.turn());
      this.setColor('#e7d3a4');
      this.textHeight(.052);
      this.text((H.className || 'Fighter') + '  ' + (H.level || 1) + '   ' + (H.gold || 0) + ' gp', 0, .5, 'center');
      hpStripe(this, -.78, .26, 1.56, H.hp, H.hpMax, 'HP  ' + H.hp + '/' + H.hpMax);
      factRow(this, [
         { k: 'AC', v: H.ac },
         { k: 'Init', v: signed(H.init || 0) },
         { k: 'Insp', v: H.insp || 0 },
      ], .02);
      this.setColor('#9dcea6');
      this.textHeight(.055);
      this.text('Move  ' + '●'.repeat(hooks.mp()) + '○'.repeat(Math.max(0, 3 - hooks.mp())), 0, -.28, 'center');
      this.setColor('#f0e2c4');
      this.textHeight(.046);
      const line = w && scores
         ? w.name + '  ' + signed(attackBonus(scores, H.level, w)) + '  ' + damageFormula(scores, w)
         : (w ? w.name : '');
      this.text(line, 0, -.48, 'center');
      this.setColor('#cbb48a');
      this.textHeight(.04);
      this.text(hooks.log() || '', 0, -.72, 'center');
   };
   return {
      obj: root,
      show() { shown = true; },
      hide() { shown = false; root.identity().scale(0); },
      visible() { return shown; },
      active() { return false; },
      matrix(m) {
         if (!shown) { root.identity().scale(0); return; }
         root.setMatrix(m);
      },
      place(pos, eye, s, face) {
         if (!shown) { root.identity().scale(0); return; }
         chrome.pose(.16, .21);
         body.identity().move(0, 0, -.014).scale(.17, .22, .008);
         obj.identity().move(0, 0, .004).scale(.152, .202, 1);
         billboard(root, pos, eye, s || .55, face);
      },
      update() { g2.update(); },
      body,
   };
};
