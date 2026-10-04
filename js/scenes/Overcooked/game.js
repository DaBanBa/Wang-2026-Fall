// game logic
// 2 player coop cooking simulator game

import * as cg from "../../render/core/cg.js";
import * as global from "../../global.js";
import { buttonState, controllerMatrix, joyStickState } from "../../render/core/controllerInput.js";
import { Gltf2Node } from "../../render/nodes/gltf2.js";
import * as S from "./shared.js";
import { buildChef, poseChef } from "./chef.js";
import { defineInk } from "./ink.js";

// multiplayer stuff

// mainly 3 things, osState, ocMsg, and ocPose

// osState sends the entire state to the other client about 10 times every second 
// (i mean the game is small af this is like a few bytes)

// ocMsg is the message thing that updates stuff individually. 

// ocPose is the pose thing that updates the head and hands. 

// since players are seperated by a divider, they wont be able to interact with the same item at the same time
// so the ownership issue is kinda solved by game design

server.neverLoadOrSave();
server.init('ocState', {});   
server.init('ocMsg',   {});   
server.init('ocPose',  {});   

const HOLD = [0, -.02, -.1];                 
const POINT = [0, -.01, -.06]; 

const now = () => Date.now();
const isXR = () => !!(window.isXR && window.isXR());
const isMaster = () => !!(window.clients && window.clients.length && window.clientID == window.clients[0]);

const buzz = (hand, power, ms) => {
   try { if (window.vibrate) vibrate(hand, Math.max(0, Math.min(1, power)), ms || 40); } catch (e) {}
};

let actx = null;
const tone = (freq, dur, when, type, vol) => {
   try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t0 = actx.currentTime + (when || 0);
      let o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(Math.max(.0001, vol || .04), t0);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start(t0);
      o.stop(t0 + dur + .02);
   } catch (e) {}
};

const setWorld = W => {
   window.worldCoords = W;
   global.gltfRoot.matrix = W;
   if (window.clay) {
      clay.root().setMatrix(W);
      clay.inverseRootMatrix = cg.mInverse(W);
   }
};

const flat = (x, z, fallback) => {
   let n = Math.hypot(x, z);
   return n < 1e-4 ? fallback : [x / n, 0, z / n];
};

const handMat = hand => {
   if (!isXR()) return null;
   let m = controllerMatrix[hand];
   if (!m || m.length < 16 || !clay.inverseRootMatrix) return null;
   return cg.mMultiply(clay.inverseRootMatrix, m);
};

const headMat = () => {
   if (!isXR() || !window.views || views.length < 1) return null;
   let a = clay.root().inverseViewMatrix(0);
   let b = views.length > 1 ? clay.root().inverseViewMatrix(1) : a;
   let m = cg.mMultiply(clay.inverseRootMatrix, cg.mix(a, b, .5));
   return isFinite(m[12]) && m[13] > .2 ? m : null;
};

const gripDown = hand => !!(buttonState[hand] && buttonState[hand][0] && buttonState[hand][0].pressed);

// visuals

const COL = {
   steel: [.55, .57, .62], steelTop: [.86, .86, .9], wood: [.62, .44, .26], woodDark: [.45, .3, .17],
   wall: [.92, .88, .8], dark: [.2, .2, .23], bun: [.87, .62, .33], bunTop: [.9, .66, .36],
   patty: [.42, .24, .12], cheese: [1, .8, .2], tomato: [.9, .2, .15], lettuce: [.35, .7, .25],
   lettuceLight: [.5, .85, .35], beef: [.8, .25, .3], white: [.97, .97, .95], water: [.4, .7, 1],
   ink: [.1, .08, .07], gold: [1, .82, .28],
};

const FOOD_URL = './js/scenes/Overcooked/models/food/';
const KIT_URL  = './js/scenes/Overcooked/models/kitchen/';
const FOOD_TX  = 3;
const FOOD = {
   flour:     { file: 'bag.glb',          sx: .22, sy: .22, sz: .22, h: .845 },
   water:     { file: 'glass.glb',        sx: .50, sy: .50, sz: .50, h: .285 },
   dough:     { file: 'loaf-round.glb',   sx: .28, sy: .32, sz: .28, h: .293 },
   bun:       { file: 'bread.glb',        sx: .40, sy: 2.2, sz: .40, h: .040 },
   cheese:    { file: 'cheese-cut.glb',   sx: .45, sy: 4.0, sz: .45, h: .020 },
   cheese_s:  { file: 'cheese-cut.glb',   sx: .55, sy: 1.1, sz: .55, h: .020 },
   beef:      { file: 'meat-raw.glb',     sx: .32, sy: 1.4, sz: .32, h: .064 },
   patty:     { file: 'meat-patty.glb',   sx: .55, sy: .50, sz: .55, h: .062 },
   tomato:    { file: 'tomato.glb',       sx: 1,   sy: 1,   sz: 1,   h: .143 },
   tomato_s:  { file: 'tomato-slice.glb', sx: .90, sy: .70, sz: .90, h: .030 },
   lettuce:   { file: 'cabbage.glb',      sx: .48, sy: .48, sz: .48, h: .307 },
   lettuce_s: { file: 'cabbage.glb',      sx: .55, sy: .16, sz: .55, h: .307 },
   plate:     { file: 'plate.glb',        sx: .30, sy: .30, sz: .30, h: .090, tint: [.38, .48, .62] },
};
const fitMatrix = spec => cg.mMultiply(cg.mTranslate(0, -spec.h * spec.sy / 2, 0), cg.mScale(spec.sx, spec.sy, spec.sz));
const spawnFood = spec => {
   let n = new Gltf2Node({ url: FOOD_URL + spec.file, txtr: FOOD_TX, matte: true, tint: spec.tint });
   global.gltfRoot.addNode(n);
   return n;
};
const dropFood = (file, sx, sy, sz, x, y, z, yaw, ox, oy, oz, tint) => {
   let n = new Gltf2Node({ url: FOOD_URL + file, txtr: FOOD_TX, matte: true, tint });
   let M = cg.mMultiply(cg.mTranslate(x, y, z), cg.mRotateY(yaw || 0));
   n.matrix = cg.mMultiply(M, cg.mMultiply(cg.mTranslate(ox || 0, oy || 0, oz || 0), cg.mScale(sx, sy, sz)));
   global.gltfRoot.addNode(n);
   return n;
};
const dropKit = (file, s, x, y, z, yaw, ax, ay, az) => {
   let n = new Gltf2Node({ url: KIT_URL + file, txtr: 0, matte: true });
   let M = cg.mMultiply(cg.mTranslate(x, y, z), cg.mRotateY(yaw || 0));
   let local = cg.mMultiply(cg.mTranslate(-ax * s, -(ay || 0) * s, -az * s), cg.mScale(s, s, s));
   n.matrix = cg.mMultiply(M, local);
   global.gltfRoot.addNode(n);
   return { node: n, M, local };
};
const placeModule = (file, x, y, z, yaw, sx, sy, sz) => {
   let n = new Gltf2Node({ url: KIT_URL + file, txtr: 0, matte: true });
   let M = cg.mMultiply(cg.mTranslate(x, y, z), cg.mRotateY(yaw || 0));
   n.matrix = cg.mMultiply(M, cg.mScale(sx, sy, sz));
   global.gltfRoot.addNode(n);
};
const runModules = (file, x, z, yaw, n, stepX, stepZ, sx, sy, sz, skip, turn) => {
   const W = 0.43 * sx, D = 0.45 * sz;
   for (let i = 0; i < n; i++) {
      if (skip && skip(i)) continue;
      let name = Array.isArray(file) ? file[i % file.length] : file;
      let px = x + stepX * i, pz = z + stepZ * i, pyaw = yaw;
      if (turn) {
         let c = Math.cos(yaw), s = Math.sin(yaw);
         px += c * W - s * D;
         pz += -s * W - c * D;
         pyaw += Math.PI;
      }
      placeModule(name, px, 0, pz, pyaw, sx, sy, sz);
   }
};

const buildStack = (parent, sc) => ({
   sc,
   bunB   : parent.add('sphere').color(COL.bun),
   patty  : parent.add('tubeY').color(COL.patty),
   cheese : parent.add('cube').color(COL.cheese),
   tomato : parent.add('tubeY').color(COL.tomato),
   lettuce: parent.add('sphere').color(COL.lettuceLight),
   bunT   : parent.add('sphere').color(COL.bunTop),
});

const showStack = (L, kinds, y0) => {
   let sc = L.sc, y = y0, has = k => kinds && kinds.indexOf(k) >= 0;
   const put = (node, on, h, w, extra) => {
      if (!on) { node.identity().scale(0); return; }
      node.identity().move(0, y + h * sc, 0);
      if (extra) extra(node);
      node.scale(w * sc, h * sc, w * sc);
      y += 2 * h * sc;
   };
   put(L.bunB, has('bun'), .022, .085);
   put(L.patty, has('patty'), .015, .08);
   put(L.cheese, has('cheese_s'), .006, .08, n => n.turnY(.4));
   put(L.tomato, has('tomato_s'), .008, .07);
   put(L.lettuce, has('lettuce_s'), .016, .09);
   if (has('bun')) L.bunT.identity().move(0, y + .02 * sc, 0).scale(.085 * sc, .048 * sc, .085 * sc);
   else L.bunT.identity().scale(0);
};

const buildItem = (node, k) => {
   let spec = FOOD[k];
   let rec = { node, k, layers: null, gltf: null, fit: null };
   if (spec) {
      rec.gltf = spawnFood(spec);
      rec.fit = fitMatrix(spec);
   } else node.add('sphere').scale(.06).color(1, 0, 1);
   if (k === 'plate') rec.layers = buildStack(node, 1);
   return rec;
};

const makeBar = (g, y, w) => {
   w = w || .16;
   let back = g.add('cube').move(0, y, 0).scale(w, .018, .01).color(.16, .12, .1);
   let fill = g.add('cube').scale(0);
   return { back, fill, y, w };
};

const showBar = (bar, f) => {
   if (!(f > 0)) { bar.fill.identity().scale(0); bar.back.identity().scale(0); return; }
   let w = bar.w;
   bar.back.identity().move(0, bar.y, 0).scale(w, .018, .01);
   bar.fill.identity().move(-w + w * f, bar.y, .006).scale(w * f, .012, .01).color(1 - f * .65, .32 + f * .62, .18);
};

export const init = async model => {

   // room
   const CAB = ['kitchenCabinet.glb', 'kitchenCabinetDrawer.glb'];
   const cabW = 0.43, cabH = 0.45, cabD = 0.48;
   const barW = 0.43, barH = 0.42, barD = 0.21;
   let span = S.ROOM.x * 2, nCab = 12, piece = span / nCab;
   let sy = S.TOP / cabH, sz = 0.6 / cabD, sx = piece / cabW;
   let waterSlot = 3;
   runModules(CAB, -S.ROOM.x,  S.ROOM.z, 0,        nCab,  piece, 0, sx, sy, sz, i => i === waterSlot, true);
   let sinkX = -S.ROOM.x + waterSlot * piece, sinkZ = S.ROOM.z;
   placeModule('kitchenSink.glb', sinkX + 0.43 * sx, 0, sinkZ - 0.45 * sz, Math.PI, sx, sy, sz);
   runModules(CAB,  S.ROOM.x, -S.ROOM.z, Math.PI,  nCab, -piece, 0, sx, sy, sz, null, true);
   const ironRack = (x, z, len, depth, yaw) => {
      let g = model.add().move(x, 0, z).turnY(yaw);
      let iron = [.34, .36, .38];
      let hx = len / 2, hz = depth / 2;
      for (let px of [-hx, hx])
         for (let pz of [-hz, hz])
            g.add('cube').move(px, .45, pz).scale(.02, .45, .02).color(iron).dull();
      for (let y of [.44, .885])
         g.add('cube').move(0, y, 0).scale(hx, .012, hz).color([.42, .44, .46]).dull();
   };
   ironRack( 2.2,  1.35, 1.05, .48, -Math.PI / 2);
   ironRack(-2.2, -1.45, 1.45, .48,  Math.PI / 2);

   let barSy = S.COUNTER_TOP / barH, barSz = 0.4 / barD, barSx = piece / barW;
   runModules('kitchenBar.glb', -S.ROOM.x,  0.01, 0,       nCab,  piece, 0, barSx, barSy, barSz);
   runModules('kitchenBar.glb',  S.ROOM.x, -0.01, Math.PI, nCab, -piece, 0, barSx, barSy, barSz);

   for (let ix = 0; ix < 5; ix++)
      for (let iz = 0; iz < 6; iz++)
         placeModule('floorFull.glb', -S.ROOM.x + ix, -0.05, S.ROOM.z - iz, 0, 1, 1, 1);

   const wallpaper = () => {
      const tilesX = 16, tilesY = 8, cell = 32;
      const c = document.createElement('canvas');
      c.width = tilesX * cell;
      c.height = tilesY * cell;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      for (let y = 0; y < tilesY; y++) {
         for (let x = 0; x < tilesX; x++) {
            const px = x * cell, py = y * cell;
            g.strokeStyle = '#8a8a8a';
            g.lineWidth = 3;
            g.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
            g.fillStyle = (x + y) % 2 ? '#d0d0d0' : '#b4b4b4';
            g.beginPath();
            g.moveTo(px + cell * .5, py + 9);
            g.lineTo(px + cell - 9, py + cell * .5);
            g.lineTo(px + cell * .5, py + cell - 9);
            g.lineTo(px + 9, py + cell * .5);
            g.closePath();
            g.fill();
         }
      }
      return c;
   };
   model.txtrSrc(4, wallpaper());

   const paint = (x, y, z, sx, sy, sz, col, tx) => {
      let n = model.add('cube').move(x, y, z).scale(sx, sy, sz).color(col).dull();
      if (tx) n.txtr(tx);
      return n;
   };
   let hy = S.ROOM.h / 2;
   paint(0, hy,  S.ROOM.z + .04, S.ROOM.x + .1, hy, .04, [.58, .1, .12], 4);
   paint(0, hy, -S.ROOM.z - .04, S.ROOM.x + .1, hy, .04, [.58, .1, .12], 4);
   paint( S.ROOM.x + .04, hy, 0, .04, hy, S.ROOM.z, [.78, .36, .1], 4);
   paint(-S.ROOM.x - .04, hy, 0, .04, hy, S.ROOM.z, [.08, .4, .4], 4);
   paint(0, S.ROOM.h + .02, 0, S.ROOM.x + .1, .02, S.ROOM.z + .1, [.26, .07, .09]);
   paint(0, 1.95,  S.ROOM.z - .006, S.ROOM.x, .72, .012, [.95, .76, .24]);
   paint(0, 1.95, -S.ROOM.z + .006, S.ROOM.x, .72, .012, [.95, .76, .24]);
   paint( S.ROOM.x - .006, 1.95, 0, .012, .72, S.ROOM.z, [.95, .58, .16]);
   paint(-S.ROOM.x + .006, 1.95, 0, .012, .72, S.ROOM.z, [.18, .7, .58]);
   paint(0, .006,  1.45, 1.5, .005, 1.05, [.82, .22, .12]);
   paint(0, .006, -1.45, 1.5, .005, 1.05, [.08, .4, .46]);

   let lampFaces = [];
   for (let [x, z] of [[-1.5, 1.15], [1.5, 1.15], [-1.5, -1.15], [1.5, -1.15]]) {
      let lamp = model.add().move(x, S.ROOM.h, z);
      lamp.add('cube').move(0, -.04, 0).scale(.03, .08, .03).color(.35, .14, .12).dull();
      lamp.add('cube').move(0, -.14, 0).scale(.28, .035, .28).color(.42, .16, .14).dull();
      lampFaces.push(lamp.add('cube').move(0, -.18, 0).scale(.22, .015, .22).color(.9, .65, .28));
   }

   let textN = 0;
   const layoutText = (n, y) => {
      let o = n._oc;
      let w = o.text.length * 0.019 * o.sc;
      n.identity().move(o.x, y == null ? o.y : y, o.z).turnY(o.yaw).move(-w / 2, 0, 0).scale(o.sc);
      return n;
   };
   const say = (parent, text, x, y, z, yaw, sc) => {
      let name = 'ocTxt' + (textN++);
      text = text == null || text === '' ? ' ' : String(text);
      defineInk(name, text);
      let n = parent.add(name).color(0, 0, 0).dull();
      n._oc = { name, text, sc: sc || 1, x: x || 0, y: y || 0, z: z || 0, yaw: yaw || 0 };
      return layoutText(n);
   };
   const retitle = (n, text) => {
      text = text == null || text === '' ? ' ' : String(text);
      if (n._oc.text === text) return n;
      n._oc.text = text;
      defineInk(n._oc.name, text);
      return layoutText(n);
   };

   let aNotes = ['WATER IS AT THE SINK.',
                 'CHEESE AND LETTUCE ARE ON THE RACK.',
                 'PUT FLOUR AND WATER IN THE MIXER.',
                 'PUT BEEF IN THE PAN.'];
   let bNotes = ['FLOUR, BEEF, AND TOMATO ARE ON THE RACK.',
                 'PUT DOUGH IN THE OVEN.',
                 'HOLD THE TRIGGER ON THE BOARD TO CHOP.',
                 'TAKE A PLATE, STACK IT, DROP AT ORDER UP.'];
   aNotes.forEach((t, i) => say(model, t, 0, 2.22 - i * .18,  S.ROOM.z - .03, Math.PI, 2.4));
   bNotes.forEach((t, i) => say(model, t, 0, 2.22 - i * .18, -S.ROOM.z + .03, 0, 2.4));

   // stations

   let st = {};
   for (let sid in S.STATIONS) {
      let d = S.STATIONS[sid];
      let g = model.add().move(d.p).turnY(d.yaw || 0);
      let rec = { g, d };
      let tagY = d.type === 'trash' ? .7 : d.type === 'board' ? .42 : .7;
      if (d.label && d.type !== 'serve')
         say(g, d.label, 0, tagY, .22, 0, 3);

      if (d.type === 'dispenser' && d.spawn !== 'water') {
         if (d.spawn === 'plate') {
            for (let i = 0; i < 4; i++)
               dropFood('plate.glb', .3, .3, .3, d.p[0], d.p[1] + i * .02, d.p[2], d.yaw, 0, 0, 0, FOOD.plate.tint);
         } else {
            dropKit('cardboardBoxOpen.glb', 1.45, d.p[0], d.p[1], d.p[2], d.yaw, .106, 0, -.106);
            let spec = FOOD[d.spawn];
            if (spec) dropFood(spec.file, spec.sx * 1.15, spec.sy * 1.15, spec.sz * 1.15, d.p[0], d.p[1] + .22, d.p[2], d.yaw);
         }
      } else if (d.type === 'mixer') {
         rec.machine = dropKit('kitchenBlender.glb', 2.6, d.p[0], d.p[1], d.p[2], d.yaw, .066, 0, -.066);
         rec.bar = makeBar(g, .58);
      } else if (d.type === 'cook' && sid === 'oven') {
         dropKit('kitchenMicrowave.glb', 1.9, d.p[0], d.p[1], d.p[2], d.yaw, .145, 0, -.105);
         rec.bar = makeBar(g, .52);
      } else if (d.type === 'cook') {
         dropFood('frying-pan.glb', .42, .42, .42, d.p[0], d.p[1] + .02, d.p[2], d.yaw + Math.PI, 0, 0, .08);
         rec.burner = g.add('ringY').move(0, .01, 0).scale(.14, .008, .14);
         rec.sizzle = [0, 1, 2].map(() => g.add('sphere').color(1, 1, 1).opacity(.6));
         rec.bar = makeBar(g, .4);
      } else if (d.type === 'board') {
         dropFood('cutting-board.glb', .4, .4, .4, d.p[0], d.p[1] + .005, d.p[2], d.yaw - Math.PI * 1.5);
         rec.knife = new Gltf2Node({ url: FOOD_URL + 'cooking-knife.glb', txtr: FOOD_TX, matte: true });
         global.gltfRoot.addNode(rec.knife);
         rec.poseKnife = (dx, dy, dz, rz) => {
            let M = cg.mMultiply(cg.mTranslate(d.p[0], d.p[1], d.p[2]), cg.mRotateY(d.yaw || 0));
            M = cg.mMultiply(M, cg.mTranslate(dx, dy, dz));
            M = cg.mMultiply(M, cg.mRotateZ(rz || 0));
            rec.knife.matrix = cg.mMultiply(M, cg.mScale(.38, .38, .38));
         };
         rec.poseKnife(.05, .04, .02, 0);
         rec.bar = makeBar(g, .32, .14);
      } else if (d.type === 'serve') {
         g.add('cube').move(0, .01, .02).scale(.4, .008, .24).color(.62, .14, .12).dull();
         g.add('cube').move(0, .018, .02).scale(.3, .004, .15).color(.95, .82, .38).dull();
         g.add('ringY').move(0, .026, .02).scale(.1, .005, .1).color(.42, .24, .12);
         const counterPic = () => {
            const c = document.createElement('canvas');
            c.width = 512; c.height = 320;
            const x = c.getContext('2d');
            x.fillStyle = '#f3e0be';
            x.fillRect(0, 0, 512, 320);
            x.fillStyle = '#8ec8e8';
            x.fillRect(28, 16, 456, 108);
            x.fillStyle = '#f7f7f2';
            x.fillRect(248, 16, 10, 108);
            x.fillRect(28, 64, 456, 10);
            x.fillStyle = '#d08a4c';
            x.fillRect(0, 148, 512, 26);
            x.fillStyle = '#f6f1e6';
            x.beginPath(); x.ellipse(110, 154, 30, 11, 0, 0, 7); x.fill();
            x.beginPath(); x.ellipse(190, 152, 22, 8, 0, 0, 7); x.fill();
            x.fillStyle = '#6eb4d2';
            x.fillRect(310, 122, 18, 30);
            x.fillStyle = '#8a5830';
            x.fillRect(0, 174, 512, 78);
            x.strokeStyle = '#5c3a22';
            x.lineWidth = 6;
            for (let px of [20, 140, 260, 380]) x.strokeRect(px, 188, 108, 50);
            x.fillStyle = '#d24a4a';
            for (let px of [70, 220, 370]) {
               x.fillRect(px, 268, 16, 40);
               x.beginPath(); x.ellipse(px + 8, 266, 30, 12, 0, 0, 7); x.fill();
            }
            x.fillStyle = '#6e6a66';
            x.fillRect(0, 308, 512, 12);
            return c;
         };
         model.txtrSrc(5, counterPic());
         g.add('square').move(0, .3, -.19).scale(.36, .225, 1).color(1, 1, 1).txtr(5).dull();
         g.add('cube').move(0, .07, -.2).scale(.4, .014, .016).color(.4, .26, .14).dull();
         for (let px of [-.38, .38])
            g.add('cube').move(px, .3, -.2).scale(.016, .24, .016).color(.4, .26, .14).dull();
         g.add('cube').move(0, .54, -.2).scale(.4, .014, .016).color(.4, .26, .14).dull();
         say(g, 'ORDER UP', 0, .58, -.17, 0, 2.4);
         let bell = g.add().move(.28, .02, .14);
         bell.add('tubeY').move(0, .008, 0).scale(.05, .006, .05).color(.42, .28, .14).dull();
         bell.add('sphere').move(0, .028, 0).scale(.038, .024, .038).color(.9, .72, .26);
         bell.add('sphere').move(0, .05, 0).scale(.009).color(.98, .95, .86);
      } else if (d.type === 'trash') {
         let can = new Gltf2Node({ url: KIT_URL + 'trashcan.glb', txtr: 0, matte: true });
         let M = cg.mMultiply(cg.mTranslate(d.p[0], 0, d.p[2]), cg.mRotateY(d.yaw || 0));
         can.matrix = cg.mMultiply(M, cg.mMultiply(cg.mTranslate(.01, 0, 0), cg.mScale(1.6, 1.6, 1.6)));
         global.gltfRoot.addNode(can);
      }
      st[sid] = rec;
   }

   // orders

   const RICE = [.94, .88, .72], HOT = [.82, .14, .1];
   let tickets = [];
   for (let face of ['A', 'B']) {
      let yaw = face === 'A' ? 0 : Math.PI;
      let row = model.add().move(0, 2.05, 0);
      for (let i = 0; i < S.MAX_ORDERS; i++) {
         let x = (i - 2) * .58;
         if (face === 'B') x = -x;
         let root = row.add().move(x, 0, 0).turnY(yaw);
         let card = root.add('cube').move(0, .02, -.015).scale(.24, .32, .008).color(RICE).dull();
         let mark = i === 0 ? say(root, 'NEXT', 0, .4, 0, 0, 2.2) : null;
         let name = say(root, ' ', 0, .22, 0, 0, 2.1);
         let clock = say(root, ' ', 0, -.22, 0, 0, 2.2);
         let layers = buildStack(root.add().move(0, -.02, 0), .9);
         tickets.push({ face, i, root, card, mark, name, clock, layers });
      }
   }

   // hearts
   {
      const verts = [];
      const put = (x, y) => {
         const v = clay.vertexArray([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 0]);
         for (let k = 0; k < v.length; k++) verts.push(v[k]);
      };
      const N = 48, sc = 0.0042;
      const pts = [];
      for (let i = 0; i < N; i++) {
         let t = i / N * Math.PI * 2, s = Math.sin(t);
         pts.push([16 * s * s * s * sc,
                   (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * sc]);
      }
      let cy = pts.reduce((a, p) => a + p[1], 0) / N;
      for (let i = 0; i < N; i++) {
         let a = pts[i], b = pts[(i + 1) % N];
         put(b[0], b[1] - cy); put(a[0], a[1] - cy); put(0, 0);
      }
      const mesh = new Float32Array(verts);
      mesh.isTriangles = true;
      clay.defineMesh('ocHeart', mesh);
   }
   let hearts = [];
   for (let face of ['A', 'B']) {
      let yaw = face === 'A' ? 0 : Math.PI;
      let dir = face === 'A' ? 1 : -1;
      for (let i = 0; i < S.HEARTS; i++) {
         let hold = model.add().move(dir * (1.62 + i * .2), 2.05, 0).turnY(yaw);
         hearts.push({ face, i, node: hold.add('ocHeart').color(1, .18, .28) });
      }
   }

   let sb = model.add().move(0, 2.68, 0);
   let sbLine = {};
   for (let side of ['A', 'B']) {
      let yaw = side === 'A' ? 0 : Math.PI;
      sbLine[side] = [
         say(sb, ' ', 0, .12, 0, yaw, 3.2),
         say(sb, ' ', 0, -.1, 0, yaw, 2.4),
      ];
   }

   let hud = model.add();
   let hudLine = say(hud, ' ', 0, -.32, 0, 0, 1.3);
   let cursor = { left: model.add('sphere').scale(0), right: model.add('sphere').scale(0) };

   // seats
   let pick = model.add();
   let pickTitle = [];
   let pickSub = [];
   let pickReady = [];
   for (let face of [1, -1]) {
      let yaw = face > 0 ? 0 : Math.PI;
      pickTitle.push(say(pick, 'PICK A SEAT', 0, .72, .4 * face, yaw, 3));
      pickSub.push(say(pick, ' ', 0, .58, .4 * face, yaw, 2));
      pickReady.push(pick.add('cube').move(0, .36, .22 * face).scale(.16, .012, .008).color(.7, .7, .7));
   }
   const makeSeat = (x, side) => {
      let d = S.SIDES[side];
      let g = pick.add().move(x, .22, 0);
      let body = g.add('cube').scale(.32, .16, .32).color(d.rgb[0] * .35, d.rgb[1] * .35, d.rgb[2] * .35).dull();
      let header = g.add('cube').move(0, .2, 0).scale(.32, .045, .32).color(d.rgb);
      let status = [];
      let role = [];
      for (let face of [1, -1]) {
         let yaw = face > 0 ? 0 : Math.PI;
         status.push(say(g, d.name, 0, .08, .34 * face, yaw, 2.4));
         role.push(say(g, 'OPEN', 0, -.04, .34 * face, yaw, 1.8));
      }
      return { side, x, rgb: d.rgb, name: d.name, role: d.role, body, header, status, roleLabs: role };
   };
   let seats = [makeSeat(-.42, 'A'), makeSeat(.42, 'B')];
   const seatAt = hp => {
      if (!hp || hp[1] < S.COUNTER_TOP - .05 || hp[1] > S.COUNTER_TOP + .85) return null;
      if (Math.abs(hp[2]) > .9) return null;
      for (let seat of seats) if (Math.abs(hp[0] - seat.x) < .38) return seat.side;
      return null;
   };

   // local state

   let good = null;                        
   let shown = null;                       
   let recent = [];                        
   let mySide = null, sideAt = 0, usedStick = false, spectatorPlaced = false;
   let held = { left: null, right: null };
   let gripWas = { left: false, right: false };
   let hist = { left: [], right: [] };
   let pending = [];
   let poses = {};
   let chefs = {};
   let me = null, meSide = '';
   let itemNodes = {};
   let lastPose = 0, lastCast = 0, lastRecon = 0, turnLatch = 0, knifeAt = 0;
   let seq = 0;
   let heard = null;

   const send = m => server.send('ocMsg', m);

   const place = def => {
      let R = cg.mRotateY(def.yaw);
      let h = [0, 0, 0];
      if (isXR() && window.views && views.length) {
         let iv = clay.root().inverseViewMatrix(0);
         if (iv && isFinite(iv[12]) && iv[13] > .5 && iv[13] < 2.4) h = [iv[12], 0, iv[14]];
      }
      let rs = cg.mTransform(R, def.spawn);
      setWorld(cg.mMultiply(cg.mTranslate(h[0] - rs[0], 0, h[2] - rs[2]), R));
   };

   const locomote = (def, dt, t) => {
      let H = headMat();
      if (!H) return;
      let W = window.worldCoords.slice();
      let stick = joyStickState.left || { x: 0, y: 0 }, look = joyStickState.right || { x: 0, y: 0 };
      let sx = Math.abs(stick.x) > .25 ? stick.x : 0, sy = Math.abs(stick.y) > .25 ? -stick.y : 0;
      if (sx || sy) {
         usedStick = true;
         let fwd = flat(-H[8], -H[10], [0, 0, -1]), right = flat(H[0], H[2], [1, 0, 0]);
         let d = cg.scale(cg.add(cg.scale(right, sx), cg.scale(fwd, sy)), 1.5 * dt);
         W = cg.mMultiply(W, cg.mTranslate(-d[0], 0, -d[2]));
      }
      if (Math.abs(look.x) > .7 && t > turnLatch) {
         turnLatch = t + 400;
         usedStick = true;
         let theta = -(look.x > 0 ? 1 : -1) * Math.PI / 4;
         let s0 = [H[12], 0, H[14]];
         W = cg.mMultiply(W, cg.mMultiply(cg.mTranslate(s0[0], 0, s0[2]),
                cg.mMultiply(cg.mRotateY(-theta), cg.mTranslate(-s0[0], 0, -s0[2]))));
      }
      if (def) {
         let iv = clay.root().inverseViewMatrix(0);
         let p = cg.mTransform(cg.mInverse(W), [iv[12], iv[13], iv[14]]);
         let cx = Math.max(def.x[0], Math.min(def.x[1], p[0]));
         let cz = Math.max(def.z[0], Math.min(def.z[1], p[2]));
         if (Math.abs(cx - p[0]) > 1e-4 || Math.abs(cz - p[2]) > 1e-4)
            W = cg.mMultiply(W, cg.mTranslate(-(cx - p[0]), 0, -(cz - p[2])));
      }
      setWorld(W);
   };

   const throwVel = (hand, t) => {
      let h = hist[hand];
      if (h.length < 2) return [0, 0, 0];
      let last = h[h.length - 1], old = null;
      for (let i = 0; i < h.length; i++) if (last.t - h[i].t <= 130) { old = h[i]; break; }
      if (!old || last.t - old.t < 15) return [0, 0, 0];
      let v = cg.scale(cg.subtract(last.p, old.p), 1200 / (last.t - old.t));
      let n = cg.norm(v);
      if (n > 7) v = cg.scale(v, 7 / n);
      if (n < .4) v = [0, 0, 0];
      return v;
   };

   const notePose = (m, from, t) => {
      if (!m || !m.h) return;
      try {
         poses[from] = {
            head: cg.unpackMatrix(m.h),
            left: m.l ? cg.unpackMatrix(m.l) : null,
            right: m.r ? cg.unpackMatrix(m.r) : null,
            at: t,
         };
      } catch (e) {}
   };

   const carryOver = (prev, next, t) => {
      if (!prev || !next || prev === next) return;
      for (let r of recent) {
         if (t - r.at > 500) continue;
         let m = r.m, a = prev.items[m.id], b = next.items[m.id];
         if (m.op === 'release' && a && !a.h && b && b.h && b.h.id == r.from) {
            b.h = null; b.p = a.p.slice(); b.v = a.v.slice(); b.r = a.r;
         } else if (m.op === 'grab' && a && a.h && b && !b.h) {
            b.h = a.h; b.s = null; b.slot = -1; b.r = 0;
         } else if (m.op === 'spawn' && a && !b) {
            next.items[m.id] = a;
         }
      }
   };

   const heldHand = id => held.left && held.left.id === id ? 'left' : held.right && held.right.id === id ? 'right' : null;
   const isPending = id => pending.some(r => r.id === id);

   const freeMesh = rec => { if (rec && rec.gltf && rec.gltf.parent) rec.gltf.parent.removeNode(rec.gltf); };
   const poseMesh = (rec, M) => { if (rec.gltf) rec.gltf.matrix = cg.mMultiply(M, rec.fit); };

   const ensureItem = (id, k) => {
      let rec = itemNodes[id];
      if (rec && rec.k !== k) { freeMesh(rec); model.remove(rec.node); rec = null; }
      if (!rec) rec = itemNodes[id] = buildItem(model.add(), k);
      return rec;
   };

   const holdMatrix = M => cg.mMultiply(M, cg.mTranslate(HOLD[0], HOLD[1], HOLD[2]));

   const remoteHand = (id, hand) => {
      let p = poses[id];
      if (p && p[hand]) return p[hand];
      let m = window.clientState && clientState.hand(id, hand);
      return m && m.length === 16 ? m : null;
   };

   const remoteHead = id => {
      let p = poses[id];
      if (p && p.head) return p.head;
      let m = window.clientState && clientState.isXR(id) ? clientState.head(id) : null;
      return m && m.length === 16 ? m : null;
   };

   model.animate(() => {
      let dt = Math.min(.05, model.deltaTime || .016);
      let t = now();
      let lights = global.gltfRoot && global.gltfRoot._renderer;
      if (lights) {
         lights.globalLightColor = [7, 6, 5];
         lights.globalLightDir1 = [0.4, -1, 0.25];
         lights.globalLightDir2 = [-0.35, -1, -0.3];
      }
      if (window.clay && clay.setDirectionalLights)
         clay.setDirectionalLights(
            [0.4, -1, 0.25, -0.35, -1, -0.3],
            [0.38, 0.26, 0.18, 0.16, 0.14, 0.22],
            2);
      let glow = .72 + .28 * Math.sin(model.time * 2);
      for (let face of lampFaces) face.color(.8 * glow, .55 * glow, .22 * glow);
      let inbox = [];
      server.sync('ocMsg', (msgs, from) => { for (let i in msgs) inbox.push({ m: msgs[i], from }); });
      server.sync('ocPose', (msgs, from) => { for (let i in msgs) notePose(msgs[i], from, t); });
      let stateIn = null;
      server.sync('ocState', (msgs, from) => {
         if (!window.clients || from != window.clients[0] || from == window.clientID) return;
         for (let i in msgs) stateIn = msgs[i];
      });
      if (!window.clients || window.clientID === undefined) return;

      let s;
      if (isMaster()) {
         if (!good) {
            let seed = S.valid(shown) ? shown : window.ocState;
            good = (S.valid(seed) && t - (seed.t || 0) < 15000) ? seed : S.fresh(t);
         }
         s = window.ocState = good;
      } else {
         good = null;
         if (stateIn && S.valid(stateIn) && stateIn !== shown) {
            carryOver(shown, stateIn, t);
            shown = stateIn;
         } else if (!shown && S.valid(window.ocState)) {
            shown = window.ocState;
         }
         s = shown;
      }
      if (!s) {
         hud.identity().hud();
         retitle(hudLine, 'CONNECTING TO THE KITCHEN');
         return;
      }
      for (let r of inbox) {
         S.applyMsg(s, r.m, r.from, t, isMaster());
         if (r.m.op === 'chop') { tone(900, .05, 0, 'square', .04); knifeAt = t; }
         if (r.m.op === 'grab' || r.m.op === 'release' || r.m.op === 'spawn') recent.push({ m: r.m, from: r.from, at: t });
      }
      while (recent.length && t - recent[0].at > 600) recent.shift();
      let side = s.sides.A == clientID ? 'A' : s.sides.B == clientID ? 'B' : null;
      if (side !== mySide) { mySide = side; sideAt = t; usedStick = false; }
      let def = mySide ? S.SIDES[mySide] : null;
      if (mySide && t - sideAt < 2500 && !usedStick) place(def);
      else if (!mySide && !spectatorPlaced) { place(S.SIDES.A); spectatorPlaced = true; }
      if (isXR()) locomote(def, dt, t);

      // hands
      let hoverSide = null;
      let cooking = s.phase === 'play';
      for (let hand of ['left', 'right']) {
         let M = handMat(hand);
         let hp = M ? cg.mTransform(M, POINT) : null;
         if (hp) {
            hist[hand].push({ p: hp, t });
            while (hist[hand].length > 12) hist[hand].shift();
         }
         let grip = gripDown(hand);
         let pressed = grip && !gripWas[hand], letGo = !grip && gripWas[hand];
         gripWas[hand] = grip;
         if (!hp) { cursor[hand].identity().scale(0); continue; }

         let hover = s.phase === 'lobby' ? seatAt(hp) : null;
         if (hover) hoverSide = hover;
         if (pressed && hover) {
            let owner = s.sides[hover];
            if (owner != null && owner != clientID) {
               buzz(hand, .9, 120);
               tone(140, .12, 0, 'sawtooth', .05);
            } else if (owner != clientID) {
               send({ op: 'join', side: hover });
               buzz(hand, .45, 50);
               tone(660, .08, 0, 'square', .045);
            }
         }
         if (letGo && held[hand]) {
            let v = throwVel(hand, t);
            let p = cg.roundVec(3, cg.mTransform(M, HOLD));
            send({ op: 'release', id: held[hand].id, p, v: cg.roundVec(2, v) });
            pending.push({ id: held[hand].id, p, v, at: t, tries: 0 });
            held[hand] = null;
            buzz(hand, cg.norm(v) > 1 ? .6 : .3, 35);
            tone(cg.norm(v) > 1 ? 380 : 300, .05, 0, 'square', .03);
         }
         if (!cooking || !mySide) {
            let blocked = hover && s.sides[hover] != null && s.sides[hover] != clientID;
            cursor[hand].identity().move(hp).scale(hover ? .02 : 0).color(blocked ? [1, .35, .3] : [.4, 1, .5]);
            continue;
         }

         if (pressed && !held[hand]) {
            let act = S.decide(s, hp);
            if (act && act.op === 'chop') {
               send({ op: 'chop' });
               knifeAt = t;
               buzz(hand, .7, 50);
            } else if (act && act.op === 'grab') {
               held[hand] = { id: act.id, since: t, k: s.items[act.id].k, resent: 0 };
               send({ op: 'grab', id: act.id, hand });
               buzz(hand, .5, 40);
               tone(620, .05, 0, 'square', .035);
            } else if (act && act.op === 'spawn') {
               if (S.countItems(s) < S.MAX_ITEMS) {
                  let id = 'i' + clientID + '_' + (seq++) + '_' + (t % 100000);
                  let p = cg.roundVec(3, cg.mTransform(M, HOLD));
                  held[hand] = { id, since: t, k: act.k, spawn: true, p, resent: 0 };
                  send({ op: 'spawn', id, k: act.k, hand, p });
                  buzz(hand, .5, 40);
                  tone(520, .06, 0, 'square', .035);
               } else {
                  buzz(hand, .9, 120);
                  tone(140, .15, 0, 'sawtooth', .05);
               }
            }
         }
         let can = !held[hand] && S.decide(s, hp);
         cursor[hand].identity().move(hp).scale(can ? .014 : .007).color(can ? [.3, 1, .4] : [1, 1, 1]);
      }

      if (t - lastRecon > 400) {
         lastRecon = t;
         for (let hand of ['left', 'right']) {
            let h = held[hand];
            if (!h) continue;
            let it = s.items[h.id], age = t - h.since;
            if (!it) {
               if (h.spawn && age > 800 && !h.resent) { h.resent = 1; send({ op: 'spawn', id: h.id, k: h.k, hand, p: h.p }); }
               else if (age > 1800) held[hand] = null;
            } else if (it.h && it.h.id == clientID) {
            } else if (it.h) {
               if (age > 500) held[hand] = null;
            } else if (age > 600) {
               if (!h.resent) { h.resent = 1; send({ op: 'grab', id: h.id, hand }); }
               else if (age > 1500) held[hand] = null;
            }
         }
         for (let i = pending.length - 1; i >= 0; i--) {
            let r = pending[i], it = s.items[r.id];
            if (!it || !it.h || it.h.id != clientID) { pending.splice(i, 1); continue; }
            if (t - r.at > 500) {
               if (r.tries < 3) { r.tries++; r.at = t; send({ op: 'release', id: r.id, p: r.p, v: r.v }); }
               else pending.splice(i, 1);
            }
         }
         for (let id in s.items) {
            let it = s.items[id];
            if (it.h && it.h.id == clientID && !heldHand(id) && !isPending(id)) {
               let p = cg.roundVec(3, it.p);
               send({ op: 'release', id, p, v: [0, 0, 0] });
               pending.push({ id, p, v: [0, 0, 0], at: t, tries: 0 });
            }
         }
      }

      if (isXR() && t - lastPose > 66) {
         lastPose = t;
         let H = headMat(), L = handMat('left'), R = handMat('right');
         if (H) {
            let m = { h: cg.packMatrix(H) };
            if (L) m.l = cg.packMatrix(L);
            if (R) m.r = cg.packMatrix(R);
            server.send('ocPose', m);
         }
      }

      if (isMaster()) S.masterTick(s, dt, t, window.clients);
      S.stepItems(s, dt);
      if (isMaster() && t - lastCast > 100) {
         lastCast = t;
         server.send('ocState', JSON.parse(JSON.stringify(s)));
      }

      // sounds
      let snap = {
         served: s.served, failed: s.failed, phase: s.phase, n: s.orders.length,
         last: s.orders.length ? s.orders[s.orders.length - 1].id : 0,
      };
      if (heard) {
         if (snap.served > heard.served) [523, 659, 784, 1046].forEach((f, i) => tone(f, .14, i * .08, 'square', .05));
         if (snap.failed > heard.failed) [200, 150].forEach((f, i) => tone(f, .2, i * .15, 'sawtooth', .05));
         if (snap.last !== heard.last && snap.n >= heard.n) [880, 660].forEach((f, i) => tone(f, .18, i * .18, 'triangle', .06));
         if (snap.phase !== heard.phase && snap.phase === 'play') [440, 440, 440, 880].forEach((f, i) => tone(f, .12, i * .25, 'square', .05));
         if (snap.phase !== heard.phase && snap.phase === 'over') [660, 520, 390].forEach((f, i) => tone(f, .25, i * .2, 'square', .05));
         if (snap.phase !== heard.phase && snap.phase === 'count') tone(330, .1, 0, 'square', .04);
      }
      heard = snap;

      // draw items

      let seen = {};
      for (let id in s.items) {
         let it = s.items[id];
         seen[id] = 1;
         let rec = ensureItem(id, it.k), node = rec.node;
         let mine = heldHand(id) || (it.h && it.h.id == clientID ? it.h.hand : null);
         let M = mine ? handMat(mine) : it.h ? remoteHand(it.h.id, it.h.hand) : null;
         let base = M ? holdMatrix(M) : cg.mTranslate(it.p[0], it.p[1], it.p[2]);
         if (M) node.setMatrix(base);
         else node.identity().move(it.p);
         poseMesh(rec, base);
         if (rec.layers) showStack(rec.layers, it.stack, FOOD.plate.h * FOOD.plate.sy / 2 + .008);
      }
      for (let hand of ['left', 'right']) {
         let h = held[hand];
         if (!h || seen[h.id]) continue;
         let M = handMat(hand);
         if (!M) continue;
         seen[h.id] = 1;
         let rec = ensureItem(h.id, h.k);
         let base = holdMatrix(M);
         rec.node.setMatrix(base);
         poseMesh(rec, base);
         if (rec.layers) showStack(rec.layers, [], FOOD.plate.h * FOOD.plate.sy / 2 + .008);
      }
      for (let id in itemNodes)
         if (!seen[id]) { freeMesh(itemNodes[id]); model.remove(itemNodes[id].node); delete itemNodes[id]; }

      // draw stations

      {
         let m = st.mixer, busy = s.mixProg > 0;
         m.machine.node.matrix = cg.mMultiply(cg.mMultiply(m.machine.M, cg.mRotateY(busy ? model.time * 5 : 0)), m.machine.local);
         showBar(m.bar, s.mixProg);

         let o = st.oven, oi = S.itemAt(s, 'oven', 0), baking = !!(oi && oi.k === 'dough');
         showBar(o.bar, baking ? oi.prog : 0);

         let p = st.pan, pi = S.itemAt(s, 'pan', 0), frying = !!(pi && pi.k === 'beef');
         p.burner.identity().move(0, .012, 0).scale(.15, .008, .15).color(frying ? [1.6, .3, .1] : [.3, .1, .08]);
         p.sizzle.forEach((sp, i) => {
            if (!frying) { sp.identity().scale(0); return; }
            let ph = model.time * 3 + i * 2.1;
            sp.identity().move(Math.sin(ph * 1.3) * .06, .1 + (ph % 1) * .14, Math.cos(ph) * .06).scale(.012 * (1 - (ph % 1)));
         });
         showBar(p.bar, frying ? pi.prog : 0);

         let b = st.board, bi = S.itemAt(s, 'board', 0);
         let chopT = Math.max(0, 1 - (t - knifeAt) / 160);
         b.poseKnife(.02 - .12 * chopT, .05 + .07 * Math.sin(chopT * Math.PI), .05, -.9 * chopT);
         showBar(b.bar, bi && S.CHOP[bi.k] ? (bi.chops || 0) / S.CHOPS_NEEDED : 0);

      }

      // draw chefs

      if (isXR() && mySide) {
         if (!me || meSide !== mySide) {
            if (me) model.remove(me.root);
            me = buildChef(model, def.rgb, def.glove, def.name, true);
            meSide = mySide;
         }
         poseChef(me, headMat(), handMat('left'), handMat('right'));
      } else if (me) { model.remove(me.root); me = null; meSide = ''; }

      let live = {};
      for (let id of window.clients) {
         if (id == clientID) continue;
         let cside = s.sides.A == id ? 'A' : s.sides.B == id ? 'B' : null;
         let H = remoteHead(id);
         if (!H) continue;
         live[id] = 1;
         let c = chefs[id];
         let d = cside ? S.SIDES[cside] : { rgb: [.6, .6, .65], glove: [.9, .9, .9], name: 'GUEST' };
         if (!c || c.side !== cside) {
            if (c) model.remove(c.chef.root);
            c = chefs[id] = { side: cside, chef: buildChef(model, d.rgb, d.glove, d.name, false) };
         }
         poseChef(c.chef, H, remoteHand(id, 'left'), remoteHand(id, 'right'));
      }
      for (let id in chefs)
         if (!live[id]) { model.remove(chefs[id].chef.root); delete chefs[id]; }

      let both = s.sides.A != null && s.sides.B != null;
      if (s.phase === 'lobby' || s.phase === 'count') {
         pick.identity().move(0, S.COUNTER_TOP, 0);
         let title = both ? 'BOTH READY' : 'PICK A SEAT';
         let sub = s.phase === 'count'
            ? 'SERVICE IN ' + Math.max(1, Math.ceil((s.phaseAt + S.COUNT_MS - t) / 1000))
            : 'STARTS WHEN P1 AND P2 ARE TAKEN';
         for (let lab of pickTitle) retitle(lab, title);
         for (let lab of pickSub) retitle(lab, sub);
         for (let bar of pickReady) bar.color(both ? [1, .82, .25] : [.45, .22, .16]);
         for (let seat of seats) {
            let owner = s.sides[seat.side];
            let mine = owner == clientID;
            let taken = owner != null;
            let hot = hoverSide === seat.side && !taken;
            let pulse = both ? .85 + .15 * Math.sin(model.time * 5) : taken ? 1 : .62 + .12 * Math.sin(model.time * 3);
            let rgb = seat.rgb.map(c => Math.min(1.3, c * pulse * (hot ? 1.25 : 1)));
            seat.header.color(taken || hot ? rgb : seat.rgb.map(c => c * .4));
            seat.body.color(taken ? rgb.map(c => c * .72) : seat.rgb.map(c => c * .2));
            for (let lab of seat.status) retitle(lab, seat.name);
            let mark = mine ? 'YOU' : taken ? 'TAKEN' : seat.role;
            for (let lab of seat.roleLabs) retitle(lab, mark);
         }
      } else {
         pick.identity().scale(0);
      }

      // boards

      let orders = s.phase === 'play' ? s.orders.slice().sort((a, b) => a.at - b.at) : [];
      for (let tk of tickets) {
         let o = orders[tk.i];
         if (!o || tk.face !== mySide) { tk.root.identity().scale(0); continue; }
         let x = (tk.i - 2) * .58;
         if (tk.face === 'B') x = -x;
         tk.root.identity().move(x, 0, 0).turnY(tk.face === 'A' ? 0 : Math.PI);
         let r = S.RECIPES[o.r];
         let left = Math.max(0, o.at + o.dur - t);
         let heat = 1 - left / o.dur;
         tk.card.color(RICE.map((c, k) => c + (HOT[k] - c) * heat));
         retitle(tk.name, r.name);
         retitle(tk.clock, Math.ceil(left / 1000) + 's');
         showStack(tk.layers, r.parts, 0);
      }
      let nHearts = s.hearts == null ? S.HEARTS : s.hearts;
      for (let h of hearts) h.node.identity().scale(s.phase === 'play' && h.face === mySide && h.i < nHearts ? 1 : 0);

      let toast = s.toast && t - s.toast.at < 3000 ? s.toast : null;
      let line1 = s.phase === 'play' ? 'SCORE ' + s.score + '   ' + s.served + ' / ' + S.ORDER_TOTAL
                : s.phase === 'count' ? 'SERVICE STARTS IN ' + Math.max(1, Math.ceil((s.phaseAt + S.COUNT_MS - t) / 1000))
                : s.phase === 'over' ? (s.lost ? 'OUT OF HEARTS' : 'ORDERS DONE') + '   SCORE ' + s.score
                : 'BURGER KITCHEN';
      for (let side of ['A', 'B']) {
         let line2 = toast ? toast.text
                   : s.phase === 'lobby' ? (both ? 'BOTH SEATS TAKEN' : 'WAITING FOR BOTH PLAYERS')
                   : s.phase === 'over' ? 'SERVED ' + s.served + '   LOST ' + s.failed
                   : s.phase === 'count' ? 'BOTH PLAYERS READY'
                   : (s.orders.length ? 'LEFT TICKET IS NEXT' : 'WAITING FOR THE NEXT ORDER');
         retitle(sbLine[side][0], line1);
         retitle(sbLine[side][1], line2);
      }

      let full = s.sides.A != null && s.sides.B != null && !mySide;
      let hint = !isXR() ? ' '
               : full ? 'BOTH SEATS TAKEN. YOU ARE WATCHING.'
               : !mySide ? ' '
               : s.phase === 'lobby' ? 'YOU ARE ' + def.name + '. WAITING FOR THE OTHER PLAYER.'
               : t - sideAt < 15000 ? 'YOU ARE ' + def.name + '. HOLD THE TRIGGER TO GRAB. LET GO TO DROP OR THROW.'
               : s.phase === 'over' ? (s.lost ? 'OUT OF HEARTS. SCORE ' + s.score : 'ORDERS DONE. SCORE ' + s.score)
               : ' ';
      hud.identity().hud();
      retitle(hudLine, hint);
   });
};
