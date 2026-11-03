import * as cg from "../render/core/cg.js";
import { controllerMatrix } from "../render/core/controllerInput.js";

export const init = async model => {
   const miniature = model.add().move(.65, .75, 0).scale(.2);
   for (const scene of [model, miniature]) {
      scene.add('cube').move(0, -.05, 0).scale(2, .05, 2).color(.3, .35, .4);
      scene.add('cube').move(0, 1, 0).scale(.1);
   }

   const head = miniature.add().scale(0);
   head.add('sphere').scale(.1, .12, .1).color(.85, .65, .45);
   head.add('sphere').move(-.035, .025, -.105).scale(.025).color(0, 0, 0);
   head.add('sphere').move(.035, .025, -.105).scale(.025).color(0, 0, 0);

   const hands = {
      left: miniature.add().scale(0),
      right: miniature.add().scale(0),
   };

   for (const hand in hands)
      hands[hand].add('sphere').scale(.045, .035, .07).color(.85, .65, .45);

   const validMatrix = matrix =>
      matrix && matrix.length === 16 && Array.from(matrix).every(Number.isFinite);

   model.animate(() => {
      const sceneInverse = cg.mInverse(model.getGlobalMatrix());
      const headPose = clay.pose?.transform?.matrix;
      if (validMatrix(headPose))
         head.setMatrix(cg.mMultiply(sceneInverse, headPose));
      else
         head.identity().scale(0);

      for (const hand in hands) {
         const pose = controllerMatrix[hand];
         if (validMatrix(pose))
            hands[hand].setMatrix(cg.mMultiply(sceneInverse, pose));
         else
            hands[hand].identity().scale(0);
      }
   });
}