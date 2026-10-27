/*
   1v1 Rocket League
   Two players, Kenney's CC0 karts (see models/License.txt), one ball.

   The steering wheel is the line between the left and right controllers.
   Tilt that line down on the left to turn left, down on the right to turn right.
   Right trigger is gas. Left trigger is brake.
   Left grip, or A / X, jumps. Jump again in the air to dodge.
   Squeeze both grips to seat the cockpit on your head.
   Desktop preview: J / L steer, I gas, K brake, Space jump.

   Orange defends the near orange goal and scores in the blue goal.
   Blue does the opposite. First to 5.
*/

import * as cg from "../../render/core/cg.js";
import * as global from "../../global.js";
import { quat } from "../../render/math/gl-matrix.js";
import { Gltf2Node } from "../../render/nodes/gltf2.js";
import { buttonState, controllerMatrix } from "../../render/core/controllerInput.js";
import { G2 } from "../../util/g2.js";
import { loadSound, playSoundAtPosition } from "../../util/positional-audio.js";

const SCALE = 1.35;
const SEAT_BACK = 0.45;
const MODEL = "./js/scenes/MarioCart/models/";
const KARTS = [
   { drive: "kart-oobi-drive.glb", full: "kart-oobi.glb" },
   { drive: "kart-oodi-drive.glb", full: "kart-oodi.glb" },
];

const FW = 20;
const FL = 30;
const GH = 5.5;
const GD = 5.2;
const GOAL_H = 5;
const CEIL = 14;
const BALL_R = 1.05;
const CAR_R = 0.9;
const WIN = 5;

const soundBuffer = [];
for (let i = 0; i < 6; i++)
   loadSound("../../media/sound/bounce/" + i + ".wav", buffer => soundBuffer[i] = buffer);

if (!window.__marioCartKeys) {
   window.__marioCartKeys = { held: {} };
   addEventListener("keydown", e => { window.__marioCartKeys.held[e.key.toLowerCase()] = true; });
   addEventListener("keyup", e => { window.__marioCartKeys.held[e.key.toLowerCase()] = false; });
}
const held = window.__marioCartKeys.held;

const forward = yaw => [Math.sin(yaw), 0, Math.cos(yaw)];
const rightOf = yaw => [Math.cos(yaw), 0, -Math.sin(yaw)];

const blank = () => ({
   p: [0, 0, 0], v: [0, 0, 0], yaw: 0, slot: 0, spin: 0, jumps: 0,
});

const mySlot = () => {
   if (!window.clients || window.clientID == null) return 0;
   let i = clients.indexOf(clientID);
   return i < 0 ? 0 : i;
};

const spawn = slot => ({
   x: slot % 2 ? 2.4 : -2.4,
   z: slot % 2 ? 12 : -12,
   yaw: slot % 2 ? Math.PI : 0,
});

const respawn = car => {
   let s = spawn(car.slot);
   car.p = [s.x, 0, s.z];
   car.v = [0, 0, 0];
   car.yaw = s.yaw;
   car.spin = 0;
   car.jumps = 0;
};

const resetBall = () => {
   ball.p = [0, BALL_R, 0];
   ball.v = [0, 0, 0];
};

let actx = null;
const tone = (freq, dur) => {
   try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      let t0 = actx.currentTime;
      let o = actx.createOscillator(), g = actx.createGain();
      o.type = "square";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.045, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
   } catch (e) {}
};

const buzz = (hand, power, ms) => {
   try { if (window.vibrate) vibrate(hand, power, ms || 40); } catch (e) {}
};

let lastThump = 0;
const thump = p => {
   let t = Date.now();
   if (t - lastThump < 120) return;
   lastThump = t;
   let buf = soundBuffer[(Math.random() * 6) >> 0];
   if (!buf) return;
   try { playSoundAtPosition(buf, p); } catch (e) {}
};

const trigger = hand => {
   let b = buttonState[hand] && buttonState[hand][0];
   if (!b) return 0;
   if (b.value > 0.02) return b.value;
   return b.pressed ? 1 : 0;
};

const gripped = hand => !!(buttonState[hand] && buttonState[hand][1] && buttonState[hand][1].pressed);
const faceDown = hand => !!(buttonState[hand] && buttonState[hand][4] && buttonState[hand][4].pressed);

const handXR = hand => {
   let m = controllerMatrix[hand];
   if (!m || m.length < 16) return null;
   if (!isFinite(m[12]) || !isFinite(m[13]) || !isFinite(m[14])) return null;
   if (m[12] === 0 && m[13] === 0 && m[14] === 0) return null;
   return [m[12], m[13], m[14]];
};

const wheelSteer = () => {
   let L = handXR("left"), R = handXR("right");
   if (!L || !R) return null;
   let span = Math.hypot(R[0] - L[0], R[2] - L[2]);
   if (span < 0.18) return null;
   // Positive steer is a left turn. Track +X is the driver's left, because the
   // world is yawed 180 degrees so the kart's nose points along the player's view.
   let steer = (R[1] - L[1]) / span / 0.5;
   if (Math.abs(steer) < 0.07) steer = 0;
   if (steer > 1) steer = 1;
   if (steer < -1) steer = -1;
   return steer;
};

const inVR = () => !!(window.isXR && window.isXR());

const headNow = () => {
   let poseH = window.clay && clay.pose;
   if (inVR() && poseH && poseH.emulatedPosition) return null;
   let view = window.views && window.views[0];
   let p = view && view.viewTransform && view.viewTransform.position;
   if (!p || !isFinite(p.x) || !isFinite(p.y) || !isFinite(p.z)) return null;
   return [p.x, p.y, p.z];
};

const hitCenter = car => [car.p[0], car.p[1] + 0.4, car.p[2]];

// Equal-mass response from bouncing.js. Each client keeps only its own car
// and puts the other one back, so the two headsets split the overlap.
const bounceCars = (a, b) => {
   let pa = hitCenter(a), pb = hitCenter(b);
   let dist = cg.distance(pa, pb);
   if (!(dist < CAR_R * 2) || dist < 1e-4) return false;
   let d = cg.normalize(cg.subtract(pb, pa));
   let rel = cg.dot(cg.subtract(b.v, a.v), d);
   if (rel < 0) {
      let mix0 = cg.mix(a.v, b.v, .5);
      a.v = cg.add(a.v, cg.scale(d, -2 * cg.dot(a.v, d)));
      b.v = cg.add(b.v, cg.scale(d, -2 * cg.dot(b.v, d)));
      let mix1 = cg.mix(a.v, b.v, .5);
      let c = cg.scale(cg.subtract(mix0, mix1), .5);
      a.v = cg.add(a.v, cg.add(c, cg.scale(d, -.01)));
      b.v = cg.add(b.v, cg.add(c, cg.scale(d, .01)));
   }
   let push = (CAR_R * 2 - dist) * .5;
   a.p = cg.add(a.p, cg.scale(d, -push));
   b.p = cg.add(b.p, cg.scale(d, push));
   return true;
};

// Car is heavy, ball is light. Same separating axis as the bouncing demo.
const hitBall = (car, sphere, own) => {
   let c = hitCenter(car);
   let d = cg.subtract(sphere.p, c);
   let dist = Math.hypot(d[0], d[1], d[2]);
   let min = CAR_R + BALL_R;
   if (dist >= min || dist < 1e-4) return false;
   let n = cg.scale(d, 1 / dist);
   let rel = cg.dot(cg.subtract(sphere.v, car.v), n);
   let savedP = car.p.slice(), savedV = car.v.slice();
   if (rel < 0) {
      let mc = 5, mb = 1, e = 0.9;
      let j = -(1 + e) * rel / (1 / mc + 1 / mb);
      car.v = cg.add(car.v, cg.scale(n, -j / mc));
      sphere.v = cg.add(sphere.v, cg.scale(n, j / mb));
   }
   let push = min - dist;
   sphere.p = cg.add(sphere.p, cg.scale(n, push * 5 / 6));
   car.p = cg.add(car.p, cg.scale(n, -push / 6));
   if (!own) {
      car.p = savedP;
      car.v = savedV;
   }
   return rel < 0;
};

const drive = (car, gas, brake, steer, jumpEdge, dt) => {
   let ground = car.p[1] <= 0.03 && car.v[1] <= 0;
   if (ground) {
      car.p[1] = 0;
      car.v[1] = 0;
      car.jumps = 0;
   }
   if (jumpEdge && ground) {
      car.v[1] = 7.2;
      car.p[1] = 0.12;
      car.jumps = 1;
      ground = false;
   } else if (jumpEdge && car.jumps === 1) {
      let f = forward(car.yaw);
      car.v = cg.add(car.v, cg.scale(f, 9));
      car.v = cg.add(car.v, cg.scale(rightOf(car.yaw), steer * 11));
      car.v[1] = Math.max(car.v[1], 0) + 4.2;
      car.jumps = 2;
   }
   let f = forward(car.yaw);
   let accel = 12.8 * gas;
   let cap = 13.6;
   car.v = cg.add(car.v, cg.scale(f, accel * dt));
   car.v = cg.add(car.v, cg.scale(f, -(ground ? 28 : 8) * brake * dt));
   let drag = ground ? 0.4 : 0.06;
   car.v[0] *= Math.max(0, 1 - drag * dt);
   car.v[2] *= Math.max(0, 1 - drag * dt);
   if (!ground) car.v[1] -= 15 * dt;
   let along = cg.dot(car.v, f);
   if (along > cap) car.v = cg.add(car.v, cg.scale(f, -(along - cap) * Math.min(1, 2 * dt)));
   if (ground && along < -6.4) car.v = cg.add(car.v, cg.scale(f, -6.4 - along));
   along = cg.dot(car.v, forward(car.yaw));
   let turn = steer * (ground ? 2.05 : 1.2) * Math.max(.4, Math.min(1, Math.abs(along) / 6)) * dt;
   if (along < -0.4) turn = -turn;
   let c = Math.cos(turn), s = Math.sin(turn);
   let vx = car.v[0] * c + car.v[2] * s;
   let vz = -car.v[0] * s + car.v[2] * c;
   car.v[0] = vx;
   car.v[2] = vz;
   car.yaw += turn;
   if (ground) {
      let rgt = rightOf(car.yaw);
      let lat = cg.dot(car.v, rgt);
      car.v = cg.add(car.v, cg.scale(rgt, -lat * Math.min(1, 6 * dt)));
   }
   car.p = cg.add(car.p, cg.scale(car.v, dt));
   car.spin += cg.dot(car.v, forward(car.yaw)) * dt / (0.21 * SCALE);
};

const reflect = (v, axis, sign, keep) => {
   v[axis] = sign * Math.abs(v[axis]) * keep;
};

const confineCar = car => {
   let r = 0.7;
   if (car.p[1] < 0) {
      car.p[1] = 0;
      if (car.v[1] < 0) car.v[1] = 0;
      car.jumps = 0;
   }
   if (car.p[1] > CEIL - 1.5) {
      car.p[1] = CEIL - 1.5;
      car.v[1] = Math.min(0, car.v[1]);
   }
   if (car.p[0] > FW - r) { car.p[0] = FW - r; reflect(car.v, 0, -1, .3); }
   if (car.p[0] < -FW + r) { car.p[0] = -FW + r; reflect(car.v, 0, 1, .3); }
   let az = Math.abs(car.p[2]);
   let inMouth = Math.abs(car.p[0]) < GH - r;
   if (!inMouth && az > FL - r) {
      car.p[2] = Math.sign(car.p[2]) * (FL - r);
      reflect(car.v, 2, -Math.sign(car.p[2]), .3);
   }
   if (az > FL + GD - r) {
      car.p[2] = Math.sign(car.p[2]) * (FL + GD - r);
      reflect(car.v, 2, -Math.sign(car.p[2]), .25);
   }
   if (az > FL && Math.abs(car.p[0]) > GH - r) {
      car.p[0] = Math.sign(car.p[0]) * (GH - r);
      reflect(car.v, 0, -Math.sign(car.p[0]), .25);
   }
};

const confineBall = () => {
   let r = BALL_R;
   if (ball.p[1] < r) {
      ball.p[1] = r;
      ball.v[1] = Math.abs(ball.v[1]) * 0.55;
      if (ball.v[1] < 1.2) ball.v[1] = 0;
   }
   if (ball.p[1] > CEIL - r) {
      ball.p[1] = CEIL - r;
      reflect(ball.v, 1, -1, .65);
   }
   if (ball.p[0] > FW - r) { ball.p[0] = FW - r; reflect(ball.v, 0, -1, .72); }
   if (ball.p[0] < -FW + r) { ball.p[0] = -FW + r; reflect(ball.v, 0, 1, .72); }
   let az = Math.abs(ball.p[2]);
   let inMouth = Math.abs(ball.p[0]) < GH - 0.4 && ball.p[1] < GOAL_H;
   if (!inMouth && az > FL - r && az < FL + GD) {
      ball.p[2] = Math.sign(ball.p[2]) * (FL - r);
      reflect(ball.v, 2, -Math.sign(ball.p[2]), .72);
   }
   if (az > FL + GD - r) {
      ball.p[2] = Math.sign(ball.p[2]) * (FL + GD - r);
      reflect(ball.v, 2, -Math.sign(ball.p[2]), .45);
   }
   if (az > FL) {
      if (ball.p[0] > GH - r) { ball.p[0] = GH - r; reflect(ball.v, 0, -1, .5); }
      if (ball.p[0] < -(GH - r)) { ball.p[0] = -(GH - r); reflect(ball.v, 0, 1, .5); }
   }
};

const stepBall = dt => {
   ball.v[1] -= 14 * dt;
   ball.v = cg.scale(ball.v, Math.max(0, 1 - 0.12 * dt));
   ball.p = cg.add(ball.p, cg.scale(ball.v, dt));
   if (ball.p[1] <= BALL_R + 0.02) {
      ball.v[0] *= Math.max(0, 1 - 0.55 * dt);
      ball.v[2] *= Math.max(0, 1 - 0.55 * dt);
   }
   confineBall();
};

const r2 = n => Math.round(n * 100) / 100;

let net = false;
const bootNet = () => {
   if (net || !window.server) return;
   net = true;
   server.neverLoadOrSave();
   server.init("mcKart", {});
   server.init("mcBall", {});
   server.init("mcMatch", {});
};

const isMaster = () => {
   if (!window.clients || !window.clients.length || window.clientID == null) return true;
   return window.clientID == window.clients[0];
};

let match = { phase: "practice", goAt: 0, gen: 0, s0: 0, s1: 0, goalFor: -1, goalUntil: 0 };
let appliedGen = 0;
let karts = {};
let self = blank();
let ball = { p: [0, BALL_R, 0], v: [0, 0, 0] };
let anchor = null;
let lastSend = 0;
let lastMatchSend = 0;
let lastBallSend = 0;
let sawSlot = -1;
let lastBeep = "";
let lastPhase = "";
let jumpWas = false;
let myNode = null, myKind = -1, myWheels = [];
let remoteNodes = {};
let ballSeq = 0;
let seenSeq = 0;
let holdBall = 0;

const seat = force => {
   let h = headNow();
   if (!h) {
      if (!anchor) anchor = [0, 0, 0];
      return;
   }
   if (anchor && !force) return;
   anchor = [h[0], h[1] - 1.45, h[2]];
};

const setWorld = car => {
   seat(gripped("left") && gripped("right"));
   let a = Math.PI - car.yaw;
   let R = cg.mRotateY(a);
   let f = forward(car.yaw);
   let t = cg.mTransform(R, [-(car.p[0] - f[0] * SEAT_BACK), -car.p[1], -(car.p[2] - f[2] * SEAT_BACK)]);
   let W = R.slice();
   W[12] = anchor[0] + t[0];
   W[13] = anchor[1] + t[1];
   W[14] = anchor[2] + t[2];
   W[15] = 1;
   window.worldCoords = W;
   global.gltfRoot.matrix = W;
   if (window.clay) {
      clay.root().setMatrix(W);
      clay.inverseRootMatrix = cg.mInverse(W);
   }
};

const collectWheels = root => {
   let out = [];
   let walk = n => {
      if (!n) return;
      if (n.name && n.name.indexOf("wheel") === 0) {
         let base = quat.create();
         if (n.rotation) quat.copy(base, n.rotation);
         out.push({ node: n, base });
      }
      let kids = n.children || [];
      for (let i = 0; i < kids.length; i++) walk(kids[i]);
   };
   walk(root);
   return out;
};

const spinWheels = (wheels, roll, steer) => {
   for (let w of wheels) {
      let q = quat.create();
      let front = w.node.name && w.node.name.indexOf("front") >= 0;
      quat.rotateY(q, w.base, front ? steer * 0.45 : 0);
      quat.rotateX(q, q, roll);
      w.node.rotation = q;
   }
};

const poseNode = (node, car, steer) => {
   if (!node) return;
   node.translation = [car.p[0], car.p[1], car.p[2]];
   let q = quat.create();
   quat.rotateY(q, q, car.yaw);
   if (car.p[1] > 0.15) quat.rotateZ(q, q, -steer * 0.35);
   node.rotation = q;
   node.scale = [SCALE, SCALE, SCALE];
};

const ensureMine = slot => {
   let kind = slot % 2;
   if (myNode && myKind === kind) return;
   if (myNode && myNode.parent) myNode.parent.removeNode(myNode);
   myKind = kind;
   myWheels = [];
   myNode = new Gltf2Node({ url: MODEL + KARTS[kind].drive });
   myNode.scale = [SCALE, SCALE, SCALE];
   global.gltfRoot.addNode(myNode);
   myNode.waitForComplete().then(() => { myWheels = collectWheels(myNode); });
};

const ensureRemote = (id, slot) => {
   let kind = slot % 2;
   let rec = remoteNodes[id];
   if (rec && rec.kind === kind) return rec;
   if (rec && rec.node.parent) rec.node.parent.removeNode(rec.node);
   let node = new Gltf2Node({ url: MODEL + KARTS[kind].full });
   node.scale = [SCALE, SCALE, SCALE];
   global.gltfRoot.addNode(node);
   rec = { node, kind, wheels: [], spin: 0 };
   remoteNodes[id] = rec;
   node.waitForComplete().then(() => { rec.wheels = collectWheels(node); });
   return rec;
};

const handScene = hand => {
   if (!handXR(hand) || !window.clay || !clay.inverseRootMatrix) return null;
   let M = cg.mMultiply(clay.inverseRootMatrix, controllerMatrix[hand]);
   if (!isFinite(M[12]) || !isFinite(M[13]) || !isFinite(M[14])) return null;
   return [M[12], M[13], M[14]];
};

const wheelColor = steer => {
   if (steer >= 0) return [1, 1 - steer * .65, 1 - steer * .65];
   return [1 + steer * .65, 1 + steer * .35, 1];
};

const view = { big: "", scoreL: "0", scoreR: "0" };

const slab = (model, x, y, z, sx, sy, sz, color) => {
   model.add("cube").identity().move(x, y, z).scale(sx, sy, sz).color(color).dull();
};

const buildArena = model => {
   slab(model, 0, -0.4, 0, FW + 1.4, 0.4, FL + GD + 1.2, [.14, .2, .24]);
   slab(model, 0, 0.02, -FL / 2, FW - 0.4, 0.015, FL / 2 - 0.2, [.34, .16, .1]);
   slab(model, 0, 0.02, FL / 2, FW - 0.4, 0.015, FL / 2 - 0.2, [.1, .16, .34]);
   slab(model, 0, 0.05, 0, 0.1, 0.012, FL, [.9, .9, .93]);
   slab(model, 0, 0.05, FL, FW - 0.2, 0.012, 0.1, [.9, .9, .93]);
   slab(model, 0, 0.05, -FL, FW - 0.2, 0.012, 0.1, [.9, .9, .93]);
   model.add("tubeY").identity().move(0, 0.05, 0).scale(3.3, 0.015, 3.3).color(.82, .84, .88).dull();

   let wh = 6;
   slab(model, FW, wh, 0, 0.4, wh, FL + GD, [.08, .1, .14]);
   slab(model, -FW, wh, 0, 0.4, wh, FL + GD, [.08, .1, .14]);

   let mouth = (sign, color) => {
      let z = sign * FL;
      let hx = (FW - GH) / 2;
      let cx = (FW + GH) / 2;
      slab(model, cx, wh, z, hx, wh, 0.4, [.08, .1, .14]);
      slab(model, -cx, wh, z, hx, wh, 0.4, [.08, .1, .14]);
      let barH = (12 - GOAL_H) / 2;
      slab(model, 0, GOAL_H + barH, z, GH, barH, 0.45, color);
      slab(model, GH, GOAL_H / 2, z, 0.28, GOAL_H / 2, 0.45, color);
      slab(model, -GH, GOAL_H / 2, z, 0.28, GOAL_H / 2, 0.45, color);
      slab(model, 0, GOAL_H / 2, sign * (FL + GD), GH, GOAL_H / 2, 0.12, color);
      slab(model, GH, GOAL_H / 2, sign * (FL + GD / 2), 0.12, GOAL_H / 2, GD / 2, color);
      slab(model, -GH, GOAL_H / 2, sign * (FL + GD / 2), 0.12, GOAL_H / 2, GD / 2, color);
   };
   mouth(-1, [1, .42, .16]);
   mouth(1, [.28, .48, 1]);
};

const ballPacket = (hit) => ({
   x: r2(ball.p[0]), y: r2(ball.p[1]), z: r2(ball.p[2]),
   vx: r2(ball.v[0]), vy: r2(ball.v[1]), vz: r2(ball.v[2]),
   seq: ballSeq, hit: hit ? 1 : 0,
});

const applyBall = msg => {
   ball.p = [msg.x || 0, msg.y || BALL_R, msg.z || 0];
   ball.v = [msg.vx || 0, msg.vy || 0, msg.vz || 0];
};

const carNear = (car, p) => {
   if (!car) return false;
   return cg.distance(hitCenter(car), p) < CAR_R + BALL_R + 2.2;
};

export const init = async model => {
   bootNet();
   myNode = null;
   myKind = -1;
   myWheels = [];
   remoteNodes = {};
   karts = {};
   self = blank();
   self.slot = mySlot();
   respawn(self);
   ball = { p: [0, BALL_R, 0], v: [0, 0, 0] };
   match = { phase: "practice", goAt: 0, gen: 0, s0: 0, s1: 0, goalFor: -1, goalUntil: 0 };
   appliedGen = 0;
   ballSeq = 0;
   seenSeq = 0;
   holdBall = 0;
   lastPhase = "";
   sawSlot = -1;

   buildArena(model);
   let ballNode = model.add("sphere").color(.95, .95, .97);
   let shadow = model.add("tubeY").color(.02, .03, .04).dull();

   let g2 = new G2(false, 1024, 256);
   model.txtrSrc(8, g2.getCanvas());
   let hud = model.add("square").txtr(8);
   g2.render = function() {
      this.setFont("Helvetica");
      this.setColor([.05, .06, .09, .55]);
      this.fillRect(-.72, -.62, 1.44, 1.24);
      this.textHeight(view.big ? .5 : .62);
      if (view.big) {
         this.setColor("#f4f1e8");
         this.text(view.big, 0, -.08, "center");
         return;
      }
      this.setColor("#ff8a4a");
      this.text(view.scoreL, -.22, -.08, "center");
      this.setColor("#f4f1e8");
      this.text("-", 0, -.08, "center");
      this.setColor("#7eb6ff");
      this.text(view.scoreR, .22, -.08, "center");
   };

   let wheel = model.add("tubeZ");

   model.animate(() => {
      bootNet();
      let dt = Math.min(.05, model.deltaTime || 1 / 60);
      let now = Date.now();
      self.slot = mySlot();

      if (sawSlot !== self.slot && match.phase === "practice" &&
          Math.hypot(self.v[0], self.v[2]) < 0.4 && self.p[1] < 0.2) {
         sawSlot = self.slot;
         respawn(self);
      } else if (sawSlot < 0) sawSlot = self.slot;

      if (window.clientID != null) karts[clientID] = self;

      let inbox = null;
      let ballMsg = null;
      let ballFrom = null;
      if (window.server) {
         server.sync("mcKart", (msgs, from) => {
            if (from == window.clientID) return;
            let last = null;
            for (let i in msgs) last = msgs[i];
            if (!last) return;
            let k = karts[from];
            if (!k) k = karts[from] = blank();
            k.remote = true;
            k.slot = last.slot || 0;
            k.p = [last.x || 0, last.y || 0, last.z || 0];
            k.v = [last.vx || 0, last.vy || 0, last.vz || 0];
            k.yaw = last.yaw || 0;
            k.seen = now;
         });
         server.sync("mcBall", (msgs, from) => {
            if (from == window.clientID) return;
            for (let i in msgs) { ballMsg = msgs[i]; ballFrom = from; }
         });
         server.sync("mcMatch", (msgs, from) => {
            if (!window.clients || from != window.clients[0] || from == window.clientID) return;
            for (let i in msgs) inbox = msgs[i];
         });
      }

      if (inbox) {
         match.phase = inbox.phase || "practice";
         match.goAt = inbox.goAt || 0;
         match.gen = inbox.gen || 0;
         match.s0 = inbox.s0 || 0;
         match.s1 = inbox.s1 || 0;
         match.goalFor = inbox.goalFor == null ? -1 : inbox.goalFor;
         match.goalUntil = inbox.goalUntil || 0;
      }

      if (ballMsg && ballMsg.hit && isMaster() && ballFrom != null) {
         let sender = karts[ballFrom];
         let proposed = [ballMsg.x || 0, ballMsg.y || 0, ballMsg.z || 0];
         if (carNear(sender, proposed) && cg.distance(ball.p, proposed) < 8) {
            applyBall(ballMsg);
            ballSeq = Math.max(ballSeq, ballMsg.seq || 0);
            seenSeq = ballSeq;
         }
      } else if (ballMsg && !ballMsg.hit && ballMsg.seq > seenSeq && now >= holdBall) {
         seenSeq = ballMsg.seq;
         applyBall(ballMsg);
      }

      let fresh = [];
      if (window.clientID != null) fresh.push(clientID);
      for (let id in karts) {
         if (karts[id] === self) continue;
         if (karts[id].seen && now - karts[id].seen < 1500) fresh.push(id);
      }
      let master = isMaster();

      const beginCount = () => {
         match.phase = "count";
         match.goAt = now + 3000;
         match.gen++;
         resetBall();
         ballSeq++;
         seenSeq = ballSeq;
      };

      if (master) {
         let n = fresh.length;
         if (n >= 2 && match.phase === "practice") beginCount();
         else if (n < 2 && match.phase !== "practice" && match.phase !== "goal" && match.phase !== "done") match.phase = "practice";
         else if (match.phase === "count" && now >= match.goAt) match.phase = "play";
         else if (match.phase === "goal" && now >= match.goalUntil) {
            if (match.s0 >= WIN || match.s1 >= WIN) {
               match.phase = "done";
               match.goAt = now + 4000;
            } else if (n >= 2) beginCount();
            else {
               match.phase = "practice";
               resetBall();
            }
         } else if (match.phase === "done" && now >= match.goAt) {
            match.s0 = 0;
            match.s1 = 0;
            if (n >= 2) beginCount();
            else match.phase = "practice";
         }
      }

      if (match.gen !== appliedGen) {
         appliedGen = match.gen;
         respawn(self);
         if (!master) resetBall();
      }

      let bothGrips = gripped("left") && gripped("right");
      let steer = wheelSteer();
      if (steer == null) steer = (held.j ? 1 : 0) - (held.l ? 1 : 0);
      let gas = Math.max(trigger("right"), held.i ? 1 : 0);
      let brake = Math.max(trigger("left"), held.k ? 1 : 0);
      let jumpHeld = !bothGrips && (faceDown("left") || faceDown("right") || !!held[" "] || gripped("left"));
      let jumpEdge = jumpHeld && !jumpWas;
      jumpWas = jumpHeld;

      let frozen = match.phase === "count" && now < match.goAt;
      let localHit = false;

      if (frozen) {
         let s = spawn(self.slot);
         self.p = [s.x, 0, s.z];
         self.v = [0, 0, 0];
         self.yaw = s.yaw;
         self.jumps = 0;
         resetBall();
      } else {
         drive(self, gas, brake, steer, jumpEdge, dt);
         for (let id in karts) {
            let other = karts[id];
            if (other === self || !other.remote) continue;
            let savedP = other.p.slice(), savedV = other.v.slice();
            if (bounceCars(self, other)) {
               other.p = savedP;
               other.v = savedV;
               thump(self.p);
               buzz("left", .35, 40);
               buzz("right", .35, 40);
            }
         }
         confineCar(self);
         stepBall(dt);
         if (hitBall(self, ball, true)) {
            localHit = true;
            thump(ball.p);
            buzz("left", .55, 50);
            buzz("right", .55, 50);
            if (!master) holdBall = now + 220;
         }
         if (master) {
            for (let id in karts) {
               let other = karts[id];
               if (other === self || !other.remote) continue;
               if (id == ballFrom && ballMsg && ballMsg.hit) continue;
               if (hitBall(other, ball, false)) thump(ball.p);
            }
         }
         confineCar(self);
         confineBall();
         if (master && (match.phase === "play" || match.phase === "practice")) {
            let inGoal = Math.abs(ball.p[0]) < GH - 0.4 && ball.p[1] < GOAL_H;
            if (ball.p[2] > FL && inGoal) {
               match.s0++;
               match.phase = "goal";
               match.goalFor = 0;
               match.goalUntil = now + 1800;
            } else if (ball.p[2] < -FL && inGoal) {
               match.s1++;
               match.phase = "goal";
               match.goalFor = 1;
               match.goalUntil = now + 1800;
            }
         }
      }

      if (window.server && window.clientID != null && now - lastSend > 50) {
         lastSend = now;
         server.send("mcKart", {
            slot: self.slot,
            x: r2(self.p[0]), y: r2(self.p[1]), z: r2(self.p[2]),
            vx: r2(self.v[0]), vy: r2(self.v[1]), vz: r2(self.v[2]),
            yaw: Math.round(self.yaw * 1000) / 1000,
         });
      }
      if (window.server && master && (now - lastBallSend > 50 || localHit)) {
         lastBallSend = now;
         ballSeq++;
         seenSeq = ballSeq;
         server.send("mcBall", ballPacket(0));
      } else if (window.server && localHit) {
         server.send("mcBall", ballPacket(1));
      }
      if (master && window.server && now - lastMatchSend > 80) {
         lastMatchSend = now;
         server.send("mcMatch", {
            phase: match.phase, goAt: match.goAt, gen: match.gen,
            s0: match.s0, s1: match.s1,
            goalFor: match.goalFor, goalUntil: match.goalUntil,
         });
      }

      let beep = "";
      if ((match.phase === "count" || match.phase === "play") && match.goAt && now < match.goAt + 700) {
         beep = now < match.goAt ? "" + Math.ceil((match.goAt - now) / 1000) : "GO";
      }
      if (beep && beep !== lastBeep) {
         lastBeep = beep;
         tone(beep === "GO" ? 880 : 440, beep === "GO" ? .2 : .12);
         if (beep === "GO") { buzz("left", .3, 40); buzz("right", .3, 40); }
      }
      if (!beep) lastBeep = "";
      if (match.phase !== lastPhase) {
         if (match.phase === "goal") {
            tone(196, .28);
            buzz("left", .6, 80);
            buzz("right", .6, 80);
         }
         lastPhase = match.phase;
      }

      ensureMine(self.slot);
      poseNode(myNode, self, steer);
      spinWheels(myWheels, self.spin, steer);

      for (let id in karts) {
         let k = karts[id];
         if (k === self || !k.remote) continue;
         let rec = ensureRemote(id, k.slot);
         poseNode(rec.node, k, 0);
         rec.spin += cg.dot(k.v, forward(k.yaw)) * dt / (0.21 * SCALE);
         spinWheels(rec.wheels, rec.spin, 0);
      }

      setWorld(self);

      let hands = [handScene("left"), handScene("right")];
      if (hands[0] && hands[1]) wheel.placeLimb(hands[0], hands[1], .02).color(wheelColor(steer));
      else {
         let f = forward(self.yaw), rgt = rightOf(self.yaw);
         let cx = self.p[0] + f[0] * .48, cz = self.p[2] + f[2] * .48, cy = self.p[1] + 1.05;
         wheel.placeLimb(
            [cx - rgt[0] * .32, cy + steer * .16, cz - rgt[2] * .32],
            [cx + rgt[0] * .32, cy - steer * .16, cz + rgt[2] * .32],
            .02
         ).color(wheelColor(steer));
      }

      ballNode.identity().move(ball.p[0], ball.p[1], ball.p[2]).scale(BALL_R);
      shadow.identity().move(ball.p[0], 0.045, ball.p[2]).scale(BALL_R * .85, 0.012, BALL_R * .85);

      view.scoreL = "" + (match.s0 || 0);
      view.scoreR = "" + (match.s1 || 0);
      if (frozen) view.big = beep || "3";
      else if (beep === "GO") view.big = "GO";
      else if (match.phase === "goal") view.big = "GOAL";
      else if (match.phase === "done") view.big = (match.s0 >= match.s1 ? "ORANGE" : "BLUE") + " WINS";
      else view.big = "";

      g2.update();
      let vr = !!window.vr;
      hud.identity().hud().move(0, vr ? 1.08 : .62, 0).scale(vr ? .84 : .4, vr ? .21 : .1, 1);
   });
};
