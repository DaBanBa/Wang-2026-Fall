// the chef model

// key things to note
// body follows head's transform aka no ik for lowerhalf of the body

import * as cg from "../../render/core/cg.js";
import { defineInk } from "./ink.js";

const SKIN = [1, .62, .45];

export const buildChef = (parent, rgb, glove, name, isMe) => {
   let root = parent.add();

   let head = root.add();
   head.add('sphere').scale(.13, .13, .13).color(SKIN);
   for (let x of [-.045, .045]) {
      head.add('sphere').move(x, .02, -.11).scale(.032).color(1, 1, 1);
      head.add('sphere').move(x, .02, -.135).scale(.014).color(.08, .08, .1);
   }
   head.add('sphere').move(0, -.04, -.12).scale(.03, .012, .012).color(.25, .08, .08);
   let tag = 'ocChef' + (buildChef.n = (buildChef.n || 0) + 1);
   defineInk(tag, name);
   let tw = name.length * 0.019 * 2.2;
   head.add(tag).turnY(Math.PI).move(-tw / 2, .22, 0).scale(2.2).color(0, 0, 0).dull();

   let body = root.add();
   body.add('sphere').move(0, -.08, 0).scale(.05, .04, .05).color(SKIN);
   body.add('cube').move(0, -.22, 0).scale(.11, .14, .065).color(SKIN).dull();
   let legL = body.add('tubeY').color(SKIN), legR = body.add('tubeY').color(SKIN);
   let footL = body.add('cube').color(SKIN).dull(), footR = body.add('cube').color(SKIN).dull();
   let soleL = body.add('cube').color(SKIN).dull(), soleR = body.add('cube').color(SKIN).dull();

   let arms = {};
   for (let hand of ['left', 'right'])
      arms[hand] = {
         upper: root.add('tubeZ').color(SKIN),
         fore : root.add('tubeZ').color(SKIN),
         elbow: root.add('sphere').color(SKIN),
         glove: root.add('sphere').color(SKIN),
      };

   return { root, head, body, arms, legL, legR, footL, footR, soleL, soleR, isMe };
};

const hide = node => node.identity().scale(0);

const isMat = m => !!(m && m.length === 16 && isFinite(m[12]));

export const poseChef = (c, H, L, R) => {
   if (!isMat(H)) { hide(c.root); return; }
   c.root.identity();
   let hp = [H[12], H[13], H[14]];
   if (c.isMe) hide(c.head); else c.head.setMatrix(H);

   let yaw = Math.atan2(H[8], H[10]);
   c.body.identity().move(hp[0], hp[1] - .2, hp[2]).turnY(yaw);

   let bottom = .04 - (hp[1] - .2);
   let legTop = -.36;
   let len = Math.max(.04, legTop - bottom);
   for (let [leg, foot, sole, x] of [[c.legL, c.footL, c.soleL, -.07], [c.legR, c.footR, c.soleR, .07]]) {
      leg.identity().move(x, (legTop + bottom) / 2, 0).scale(.045, len / 2, .045);
      foot.identity().move(x, bottom + .02, -.02).scale(.055, .035, .09);
      sole.identity().move(x, bottom, -.02).scale(.06, .012, .1);
   }

   let bm = c.body.getMatrix();
   for (let hand of ['left', 'right']) {
      let a = c.arms[hand], M = hand === 'left' ? L : R;
      if (!isMat(M)) {
         hide(a.upper); hide(a.fore); hide(a.elbow); hide(a.glove);
         continue;
      }
      let sx = hand === 'left' ? -1 : 1;
      let shoulder = cg.mTransform(bm, [sx * .17, -.08, 0]);
      let hpos = [M[12], M[13], M[14]];
      let aimAt = cg.mTransform(bm, [sx * .45, -.7, .5]);
      let aim = cg.subtract(aimAt, shoulder);
      let elbow = cg.ik2(shoulder, hpos, .27, .27, aim);
      if (!elbow || isNaN(elbow[0]) || isNaN(elbow[1]) || isNaN(elbow[2]))
         elbow = cg.mix(shoulder, hpos, .5);
      a.upper.placeLimb(shoulder, elbow, .04);
      a.fore.placeLimb(elbow, hpos, .035);
      a.elbow.identity().move(elbow).scale(.04);
      a.glove.setMatrix(M).scale(.05, .04, .065);
   }
};
