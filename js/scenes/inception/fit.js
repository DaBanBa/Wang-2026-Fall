import * as global from "../../global.js";
import { Gltf2Node } from "../../render/nodes/gltf2.js";

function held() {
   return (window.__inceptionModels = window.__inceptionModels || []);
}

export function releaseModels() {
   const legacy = window.__inception && window.__inception.nodes;
   const list = legacy ? held().concat(legacy) : held().slice();
   for (const node of list)
      global.gltfRoot.removeNode(node);
   held().length = 0;
   if (legacy) legacy.length = 0;
}

export function dropModel(cube) {
   if (!cube.gltf) return;
   global.gltfRoot.removeNode(cube.gltf);
   const list = held();
   const i = list.indexOf(cube.gltf);
   if (i >= 0) list.splice(i, 1);
   cube.gltf = null;
   cube.gltfUrl = "";
}

function rotateY(v, yaw) {
   const c = Math.cos(yaw), s = Math.sin(yaw);
   return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
}

function applyFit(node, cube) {
   const b = cube.bounds;
   if (!b) return;
   const ext = [0, 1, 2].map(i => Math.max(1e-4, b.max[i] - b.min[i]));
   const center = [0, 1, 2].map(i => (b.min[i] + b.max[i]) / 2);
   const align = (ext[0] >= ext[2]) === (cube.size[0] >= cube.size[2]) ? 0 : Math.PI / 2;
   const yaw = align + (cube.turn || 0);
   const swap = align !== 0;
   const sx = (swap ? cube.size[2] : cube.size[0]) / ext[0];
   const sy = cube.size[1] / ext[1];
   const sz = (swap ? cube.size[0] : cube.size[2]) / ext[2];
   const shifted = rotateY([sx * center[0], sy * center[1], sz * center[2]], yaw);
   node.translation = new Float32Array([
      cube.pos[0] - shifted[0],
      cube.pos[1] - shifted[1],
      cube.pos[2] - shifted[2]
   ]);
   node.rotation = new Float32Array([0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]);
   node.scale = new Float32Array([sx, sy, sz]);
}

export function syncModel(cube) {
   if (cube.url && cube.gltfUrl !== cube.url) {
      dropModel(cube);
      const node = new Gltf2Node({ url: cube.url });
      global.gltfRoot.addNode(node);
      held().push(node);
      cube.gltf = node;
      cube.gltfUrl = cube.url;
      node.waitForComplete().catch(err => {
         cube.status = "error";
         cube.error = "Could not draw the model";
         console.error("[inception] gltf", err);
      });
   }
   if (cube.gltf) applyFit(cube.gltf, cube);
}
