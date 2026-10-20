import * as cg from "../../render/core/cg.js";
import { buttonState, joyStickState } from "../../render/core/controllerInput.js";
import { makeKeyboard } from "./keyboard.js";
import { basis, beamRay, gaze, handPoint, rayBox, viewRay } from "./pointer.js";
import { dropModel, releaseModels, syncModel } from "./fit.js";
import { submit } from "./generate.js";

const MIN_M = 0.1;
const STEP_M = 0.1;
const MAX_M = 30;
const START_M = 0.4;
const GLYPH = 0.019;

const FACES = [
   { axis: 0, sign:  1, at: [ 1.02, 0, 0], size: [0.02, 0.92, 0.92] },
   { axis: 0, sign: -1, at: [-1.02, 0, 0], size: [0.02, 0.92, 0.92] },
   { axis: 1, sign:  1, at: [0,  1.02, 0], size: [0.92, 0.02, 0.92] },
   { axis: 1, sign: -1, at: [0, -1.02, 0], size: [0.92, 0.02, 0.92] },
   { axis: 2, sign:  1, at: [0, 0,  1.02], size: [0.92, 0.92, 0.02] },
   { axis: 2, sign: -1, at: [0, 0, -1.02], size: [0.92, 0.92, 0.02] }
];

releaseModels();
if (window.__inceptionKey) {
   window.removeEventListener("keydown", window.__inceptionKey);
   window.__inceptionKey = null;
}

const here = () => window.currentName === "inception";
const clampSize = n => {
   const places = Math.round(1 / STEP_M);
   return Math.max(MIN_M, Math.min(MAX_M, Math.round(n * places) / places));
};
const meters = n => (Math.round(n * 10) / 10).toFixed(1);
const ascii = s => String(s || "").replace(/[^\x20-\x7E\n]/g, "");
const busy = cube => cube.status === "reading" || cube.status === "sculpting" || cube.status === "saving";
const finished = cube => cube.status === "ready" && cube.url;
const typing = cube => cube.phase === "prompt" && !busy(cube) && !finished(cube);

function cubeMatrix(cube) {
   const scale = cg.mScale(cube.size[0] / 2, cube.size[1] / 2, cube.size[2] / 2);
   const spun = cube.turn ? cg.mMultiply(cg.mRotateY(cube.turn), scale) : scale;
   return cg.mMultiply(cg.mTranslate(cube.pos), spun);
}

function placeLine(node, name, text, y, z, scale) {
   const line = ascii(text);
   if (!line.trim()) {
      node.identity().scale(0);
      return;
   }
   clay.defineTextMesh(name, line);
   node.identity().move(-line.length * GLYPH * scale / 2, y, z).scale(scale);
}

function behindLine(cube) {
   if (cube.status === "error") return cube.error || cube.note;
   if (busy(cube)) {
      const words = cube.prompt || cube.label;
      return words ? words + "  " + (cube.progress || 0) + "%" : "sculpting " + (cube.progress || 0) + "%";
   }
   if (cube.note) return cube.note;
   if (cube.phase === "prompt") return (cube.prompt || "") + "_";
   if (cube.label) return cube.label;
   return "";
}

export const init = async model => {
   const cubes = [];
   let nextId = 1;
   let selected = 0;
   let drag = null;
   let chosen = null;
   let moveDrag = null;
   let hover = null;
   const was = {};
   const gripWas = { left: false, right: false };
   const visuals = new Map();
   const keyboard = makeKeyboard(model);

   const find = id => cubes.find(c => c.id === id);

   const rising = (hand, button) => {
      const b = buttonState[hand] && buttonState[hand][button];
      const down = !!(b && b.pressed);
      const edge = down && !was[hand + button];
      was[hand + button] = down;
      return edge;
   };

   const spawnPos = () => {
      const { eye, forward, ready } = gaze();
      if (!ready) return [0, 1.2, -0.8];
      const pos = cg.add(eye, cg.add(cg.scale(forward, 0.85), [0, -0.15, 0]));
      pos[1] = Math.max(0.5, pos[1]);
      return pos;
   };

   const createCube = () => {
      const cube = {
         id: nextId++,
         pos: spawnPos(),
         size: [START_M, START_M, START_M],
         phase: "place",
         prompt: "",
         label: "",
         status: "idle",
         progress: 0,
         error: "",
         note: "",
         url: "",
         bounds: null,
         gltf: null,
         gltfUrl: "",
         job: 0,
         turn: 0,
         fall: false,
         vel: 0
      };
      cubes.push(cube);
      selected = cube.id;
      if (window.vibrate) vibrate("right", 0.25, 30);
      return cube;
   };

   const deleteCube = id => {
      const i = cubes.findIndex(c => c.id === id);
      if (i < 0) return;
      const cube = cubes[i];
      cube.job++;
      dropModel(cube);
      const vis = visuals.get(cube.id);
      if (vis) {
         model.remove(vis.root);
         model.remove(vis.label);
         visuals.delete(cube.id);
      }
      cubes.splice(i, 1);
      if (selected === id) selected = cubes.length ? cubes[cubes.length - 1].id : 0;
      if (chosen && chosen.id === id) chosen = null;
      if (drag && drag.id === id) drag = null;
      if (moveDrag && moveDrag.id === id) moveDrag = null;
   };

   function pick(ray) {
      if (!ray) return null;
      let best = null;
      const key = keyboard.hit(ray);
      if (key) best = { kind: "key", t: key.t, ch: key.ch };
      for (const cube of cubes) {
         const hit = rayBox(ray, cubeMatrix(cube));
         if (!hit) continue;
         if (!best || hit.t < best.t)
            best = { kind: "cube", t: hit.t, id: cube.id, axis: hit.axis, sign: hit.sign };
      }
      return best;
   }

   function confirm(cube) {
      if (!cube || busy(cube)) return;
      if (cube.phase === "place") cube.phase = "size";
      else if (cube.phase === "size") {
         cube.phase = "prompt";
         if (chosen && chosen.id === cube.id) chosen = null;
      }
      else if (cube.phase === "prompt" && !finished(cube)) submit(cube);
   }

   function typeKey(ch) {
      const cube = find(selected);
      if (!cube || !typing(cube) || !ch) return;
      if (ch === "del") cube.prompt = cube.prompt.slice(0, -1);
      else if (cube.prompt.length < 180) cube.prompt += ch === " " ? " " : ch.toLowerCase();
      cube.note = "";
      if (cube.status === "error") cube.status = "idle";
   }

   function ensureVisual(cube) {
      let vis = visuals.get(cube.id);
      if (vis) return vis;
      const root = model.add();
      const body = root.add("cube").dull(0.6);
      const faces = FACES.map(() => root.add("cube"));
      const label = model.add();
      const dimName = "inceptionD" + cube.id;
      const backName = "inceptionP" + cube.id;
      clay.defineTextMesh(dimName, ".");
      clay.defineTextMesh(backName, ".");
      vis = {
         root, body, faces, label, key: "",
         dim: label.add(dimName).color(1, 1, 1),
         back: label.add(backName).color(0.75, 0.84, 1),
         dimName, backName
      };
      visuals.set(cube.id, vis);
      return vis;
   }

   function drawCube(cube) {
      const vis = ensureVisual(cube);
      const hx = cube.size[0] / 2, hy = cube.size[1] / 2, hz = cube.size[2] / 2;
      const hot = hover && hover.kind === "cube" && hover.id === cube.id && cube.phase === "size";
      const held = chosen && chosen.id === cube.id && cube.phase === "size";
      const ready = cube.status === "ready" && cube.url;
      let rgb = [0.62, 0.62, 0.64];
      let opacity = 0.6;
      if (cube.phase === "size") {
         rgb = [0.9, 0.9, 0.92];
         opacity = 1;
      } else if (cube.phase === "prompt" || busy(cube) || ready) {
         rgb = [0.35, 0.55, 1.15];
         opacity = busy(cube) ? 0.5 : ready ? 0.04 : 1;
      }
      if (cube.status === "error") {
         rgb = [1.1, 0.35, 0.28];
         opacity = 0.85;
      }
      vis.root.identity().move(cube.pos);
      if (cube.turn) vis.root.turnY(cube.turn);
      vis.root.scale(hx, hy, hz);
      vis.body.identity().color(rgb[0], rgb[1], rgb[2]).opacity(opacity);

      FACES.forEach((face, i) => {
         const lit = (hot && hover.axis === face.axis && hover.sign === face.sign)
            || (held && chosen.axis === face.axis && chosen.sign === face.sign);
         const show = cube.phase === "size" && !ready;
         vis.faces[i].identity().move(face.at[0], face.at[1], face.at[2]).scale(face.size[0], face.size[1], face.size[2])
            .color(lit ? 1.4 : 0.75, lit ? 0.95 : 0.85, lit ? 0.35 : 1)
            .opacity(show ? (lit ? 0.95 : 0.35) : 0);
      });

      if (ready) {
         vis.label.identity().scale(0);
      } else {
         const dim = meters(cube.size[0]) + " x " + meters(cube.size[1]) + " x " + meters(cube.size[2]) + " m";
         const back = behindLine(cube);
         const key = dim + "\n" + back;
         if (key !== vis.key) {
            vis.key = key;
            placeLine(vis.dim, vis.dimName, dim, 0, 0.014, 0.7);
            placeLine(vis.back, vis.backName, back, -0.032, 0.002, 0.62);
         }
         const { eye, ready: hasHead } = gaze();
         const look = hasHead ? eye : cg.add(cube.pos, [0, 0, 1]);
         vis.label.setMatrix(basis([cube.pos[0], cube.pos[1] + hy + 0.06, cube.pos[2]], look));
      }
      syncModel(cube);
   }

   function placeKeyboard(cube, eye, forward) {
      if (!cube || !typing(cube)) {
         keyboard.hide();
         return;
      }
      keyboard.place(cg.add(eye, cg.add(cg.scale(forward, 0.5), [0, -0.32, 0])), eye);
   }

   function beginFace(hit, origin, pointer) {
      const cube = find(hit.id);
      if (!cube || cube.phase !== "size" || busy(cube)) {
         if (cube) selected = cube.id;
         return;
      }
      selected = cube.id;
      chosen = { id: cube.id, axis: hit.axis, sign: hit.sign };
      drag = {
         pointer,
         id: cube.id,
         axis: hit.axis,
         sign: hit.sign,
         size0: cube.size[hit.axis],
         origin,
         moved: 0
      };
      if (window.vibrate && pointer !== "mouse") vibrate(pointer, 0.2, 24);
   }

   function shiftFace(cube, axis, sign, next) {
      const prev = cube.size[axis];
      if (next === prev) return;
      cube.size[axis] = next;
      const shift = sign * (next - prev) / 2;
      cube.pos[axis] += shift;
      if (moveDrag && moveDrag.id === cube.id) moveDrag.pos0[axis] += shift;
      if (drag && drag.id === cube.id && drag.axis === axis)
         drag.size0 += next - prev;
   }

   function applyFace(travel) {
      if (!drag) return;
      const cube = find(drag.id);
      if (!cube) return;
      drag.moved = Math.max(drag.moved, Math.abs(travel));
      const next = clampSize(drag.size0 + drag.sign * travel);
      const prev = cube.size[drag.axis];
      if (next === prev) return;
      cube.size[drag.axis] = next;
      const shift = drag.sign * (next - prev) / 2;
      cube.pos[drag.axis] += shift;
      if (moveDrag && moveDrag.id === cube.id) moveDrag.pos0[drag.axis] += shift;
   }

   function endFace(selectIfTap) {
      if (!drag) return;
      if (selectIfTap && drag.moved < (drag.pointer === "mouse" ? 0.06 : 0.03)) selected = drag.id;
      drag = null;
   }

   inputEvents.onPress = hand => {
      if (!here() || drag) return;
      const hit = pick(beamRay(hand));
      if (!hit) return;
      if (hit.kind === "key") {
         typeKey(hit.ch);
         return;
      }
      const origin = handPoint(hand);
      if (!origin) return;
      beginFace(hit, origin, hand);
   };

   inputEvents.onDrag = hand => {
      if (!here() || !drag || drag.pointer !== hand) return;
      const p = handPoint(hand);
      if (!p) return;
      applyFace(p[drag.axis] - drag.origin[drag.axis]);
   };

   inputEvents.onRelease = hand => {
      if (!here() || !drag || drag.pointer !== hand) return;
      endFace(true);
   };

   const canvas = document.querySelector("canvas");
   if (canvas) {
      if (!window.__inceptionPointer) {
         window.__inceptionPointer = {
            press: canvas.onPress,
            drag: canvas.onDrag,
            release: canvas.onRelease
         };
      }
      const prevPress = window.__inceptionPointer.press;
      const prevDrag = window.__inceptionPointer.drag;
      const prevRelease = window.__inceptionPointer.release;
      canvas.onPress = (x, y) => {
         if (!here()) return prevPress && prevPress(x, y);
         const hit = pick(viewRay());
         if (hit && hit.kind === "key") {
            typeKey(hit.ch);
            return;
         }
         if (hit && hit.kind === "cube") beginFace(hit, y, "mouse");
      };
      canvas.onDrag = (x, y) => {
         if (!here()) return prevDrag && prevDrag(x, y);
         if (drag && drag.pointer === "mouse") applyFace((y - drag.origin) * 0.85);
      };
      canvas.onRelease = (x, y) => {
         if (!here()) return prevRelease && prevRelease(x, y);
         endFace(true);
      };
   }

   window.__inceptionKey = e => {
      if (!here() || e.metaKey || e.ctrlKey || e.altKey) return;
      const cube = find(selected);
      if ((!cube || !typing(cube)) && (e.key === "a" || e.key === "A")) {
         if (e.repeat) return;
         createCube();
         e.preventDefault();
         return;
      }
      if (!cube) return;
      if (e.key === "Escape") {
         selected = 0;
         return;
      }
      if (e.key === "Enter") {
         if (!e.repeat) confirm(cube);
         e.preventDefault();
         return;
      }
      if (e.key === "Backspace") {
         typeKey("del");
         e.preventDefault();
         return;
      }
      if (e.key === " ") {
         typeKey(" ");
         e.preventDefault();
         return;
      }
      if (e.key.length === 1) {
         typeKey(e.key);
         e.preventDefault();
      }
   };
   window.addEventListener("keydown", window.__inceptionKey);

   let prevTime = 0;

   const loose = cube => cube && (cube.phase === "place" || cube.phase === "size");
   const movable = cube => loose(cube) || finished(cube);

   model.animate(() => {
      const now = model.time || 0;
      const dt = prevTime ? Math.min(0.05, Math.max(0, now - prevTime)) : 0;
      prevTime = now;

      if (rising("right", 4)) createCube();
      if (rising("left", 4)) {
         const aimed = pick(beamRay("left")) || pick(beamRay("right"));
         deleteCube(aimed && aimed.kind === "cube" ? aimed.id : selected);
      }

      for (const hand of ["left", "right"]) {
         const grip = !!(buttonState[hand] && buttonState[hand][1] && buttonState[hand][1].pressed);
         if (grip && !gripWas[hand] && !drag && !moveDrag) {
            const hit = pick(beamRay(hand));
            const aimed = hit && hit.kind === "cube" ? find(hit.id) : null;
            const current = find(selected);
            const cube = aimed && movable(aimed) ? aimed
               : current && loose(current) ? current
               : null;
            const p = handPoint(hand);
            if (cube && p) {
               moveDrag = { hand, id: cube.id, origin: p, pos0: cube.pos.slice() };
               cube.vel = 0;
               selected = cube.id;
            }
         }
         if (moveDrag && moveDrag.hand === hand) {
            const cube = find(moveDrag.id);
            const p = handPoint(hand);
            if (cube && p && grip) {
               cube.pos = cg.add(moveDrag.pos0, cg.subtract(p, moveDrag.origin));
               if (cube.status === "ready" && cube.url) {
                  const stick = joyStickState[hand] || { x: 0, y: 0 };
                  const x = Math.abs(stick.x) > 0.2 ? stick.x : 0;
                  cube.turn -= x * 1.7 * dt;
               }
            }
            if (!grip) moveDrag = null;
         }
         gripWas[hand] = grip;
      }

      const sizing = find(selected);
      if (sizing && sizing.phase === "size" && dt) {
         let push = 0;
         for (const hand of ["left", "right"]) {
            const stick = joyStickState[hand] || { x: 0, y: 0 };
            if (Math.abs(stick.y) > 0.2) push += -stick.y;
         }
         push = Math.max(-1, Math.min(1, push));
         if (push) {
            const delta = push * 0.5 * dt;
            if (chosen && chosen.id === sizing.id)
               shiftFace(sizing, chosen.axis, chosen.sign, clampSize(sizing.size[chosen.axis] + delta));
            else {
               for (let axis = 0; axis < 3; axis++)
                  sizing.size[axis] = clampSize(sizing.size[axis] + delta);
            }
         }
      }

      if (rising("right", 5)) {
         const held = moveDrag ? find(moveDrag.id) : null;
         if (held && held.status === "ready" && held.url) held.fall = true;
         else {
            const cube = find(selected);
            if (cube) confirm(cube);
         }
      }

      for (const cube of cubes) {
         if (!cube.fall || (moveDrag && moveDrag.id === cube.id)) continue;
         const rest = cube.size[1] / 2;
         if (cube.pos[1] <= rest && cube.vel <= 0) {
            cube.pos[1] = rest;
            cube.vel = 0;
            continue;
         }
         cube.vel -= 9.8 * dt;
         cube.pos[1] += cube.vel * dt;
         if (cube.pos[1] <= rest) {
            cube.pos[1] = rest;
            cube.vel = 0;
         }
      }

      hover = drag
         ? { kind: "cube", id: drag.id, axis: drag.axis, sign: drag.sign }
         : (pick(beamRay("right")) || pick(beamRay("left")) || pick(viewRay()));

      keyboard.hover = hover && hover.kind === "key" ? hover.ch : "";

      for (const cube of cubes) drawCube(cube);

      const { eye, forward } = gaze();
      placeKeyboard(find(selected), eye, forward);
   });
};
