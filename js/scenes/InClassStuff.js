/*
   Use defineTextMesh() to create displayable text.
*/

import * as cg from "../render/core/cg.js";
import * as global from "../global.js";
import { Structure } from "../render/core/structure.js";
import { quat } from "../render/math/gl-matrix.js";
import { Gltf2Node } from "../render/nodes/gltf2.js";

let katana = new Gltf2Node({ url: "./media/gltf/Katana/katana.gltf" });

export const init = async (model) => {
  katana.translation = [0, 2, 0];
  katana.scale = [.002, .002, .002];
  global.gltfRoot.addNode(katana);

  let textObj = clay.defineTextMesh(
    "myText",
    `\
    "Wait a minute, Juanita. Make up your mind. 
    This Snow Crash thing—is it a virus, a drug, or a religion?"

    Juanita shrugs. 
    "What's the difference?"`,
  );
  model.add("myText").color(1, 1, 1);
  model.animate(() => {
    model.identity().move(-0.1, 1.5, 0);
  });
};
