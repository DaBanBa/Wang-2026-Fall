/*
   PLEASE HOLD
   A bigger maze. Agent 007 only sees nearby, and restores power in each wing
   so Agent 014 can see the doors there. 014 always sees both of them,
   and throws red, yellow, and green. Each color moves every door of that color.
   The Abomination is 10% slower than Agent 007.
*/

import * as cg from "../../render/core/cg.js";
import * as global from "../../global.js";
import { joyStickState, controllerMatrix, buttonState } from "../../render/core/controllerInput.js";
import { lcb, rcb } from "../../handle_scenes.js";
import { linefont } from "./linefont.js";

import {
   SHIFT, CELL, COLS, ROWS, SIGHT, EXIT, WALK, EDGES, GATES, REGION_NAME,
   PASSAGE, EDGE_DOOR, edgeKey, center, regionOf, timeLeft, rating, fmt,
   hudLine, cellAt, adoptState, tickMaster, tickLobby, isMaster, countDigit, ended, takeReset,
   ITEMS, BAT_GAIN, STUN_MS, FAST_MS, powerNow, setPower, stunned,
} from "./shared.js";

const TH = 0.09;
const DOOR_TH = 0.16;
const WH = 4.6;
const BODY = 0.26;

const SOL_ROT = [
   [1, 1, 2],
   [3, 0, 0],
   [0, 1, 3],
];
const SOL_KIND = [
   ["elbow", "straight", "elbow"],
   ["elbow", "straight", "elbow"],
   ["elbow", "straight", "elbow"],
];
const SCRAMBLE = {
   1: [[1, 0], [0, 1], [0, 2], [1, 2]],
   2: [[0, 0], [0, 1], [1, 1], [1, 2]],
   3: [[1, 0], [0, 2], [1, 2], [2, 0]],
};

const rotBits = (kind, rot) => {
   let b = kind === "elbow" ? (1 | 2) : (1 | 4);
   let turns = kind === "elbow" ? ((rot % 4) + 4) % 4 : ((rot % 2) + 2) % 2;
   for (let i = 0; i < turns; i++) {
      let n = (b & 1) ? 2 : 0;
      let e = (b & 2) ? 4 : 0;
      let s = (b & 4) ? 8 : 0;
      let w = (b & 8) ? 1 : 0;
      b = n | e | s | w;
   }
   return b;
};

const circuit = tiles => {
   const bit = (c, r) => rotBits(tiles[r][c].kind, tiles[r][c].rot);
   const on = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
   const q = [];
   if (bit(0, 1) & 8) q.push([0, 1]);
   while (q.length) {
      const [c, r] = q.shift();
      if (on[r][c]) continue;
      on[r][c] = 1;
      const b = bit(c, r);
      if ((b & 1) && r > 0 && (bit(c, r - 1) & 4)) q.push([c, r - 1]);
      if ((b & 4) && r < 2 && (bit(c, r + 1) & 1)) q.push([c, r + 1]);
      if ((b & 2) && c < 2 && (bit(c + 1, r) & 8)) q.push([c + 1, r]);
      if ((b & 8) && c > 0 && (bit(c - 1, r) & 2)) q.push([c - 1, r]);
   }
   return { on, solved: !!(on[1][2] && (bit(2, 1) & 2)) };
};

const headCam = () => cg.mMultiply(clay.inverseRootMatrix, clay.root().inverseViewMatrix(0));

const explorer = () => !!(window.isXR && window.isXR());

let actx = null;
const ac = () => {
   if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
   if (actx.state === "suspended") actx.resume();
   return actx;
};

const tone = (freq, dur, when, type, vol) => {
   try {
      let ctx = ac();
      let t0 = ctx.currentTime + (when || 0);
      let o = ctx.createOscillator();
      let g = ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(Math.max(0.0001, vol || 0.05), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
   } catch (e) {}
};

const buzz = (hand, power, ms) => {
   try {
      if (window.vibrate) vibrate(hand, Math.max(0, Math.min(1, power)), ms || 40);
   } catch (e) {}
};

const applyWorld = () => {
   global.gltfRoot.matrix = worldCoords;
   if (window.clay) {
      clay.root().setMatrix(worldCoords);
      clay.inverseRootMatrix = cg.mInverse(worldCoords);
   }
};

let loc = { x: 0, y: 0, z: 0, yaw: 0, settled: false, hold: 0, prev: null };

// The page draws one eye and the headset draws two. A brand new session
// also reports a stand-in pose (emulatedPosition) until the floor locks.
// Either sample will park the maze in the wrong place, so both are ignored.
const headsetEye = () => {
   let pose = window.clay && clay.pose;
   if (pose && pose.emulatedPosition) return null;
   if (!window.views || window.views.length < 2) return null;
   let p = eyeNow();
   if (!p || p.y < 0.8 || p.y > 2.3) return null;
   return p;
};

const camNow = () => {
   try {
      let cam = headCam();
      if (cam && isFinite(cam[12]) && isFinite(cam[14])) return cam;
   } catch (e) {}
   return null;
};

const writeWorld = () => {
   let c = Math.cos(loc.yaw), s = Math.sin(loc.yaw);
   worldCoords[0] = c; worldCoords[1] = 0; worldCoords[2] = -s; worldCoords[3] = 0;
   worldCoords[4] = 0; worldCoords[5] = 1; worldCoords[6] = 0; worldCoords[7] = 0;
   worldCoords[8] = s; worldCoords[9] = 0; worldCoords[10] = c; worldCoords[11] = 0;
   worldCoords[12] = loc.x;
   worldCoords[13] = loc.y;
   worldCoords[14] = loc.z;
   worldCoords[15] = 1;
   applyWorld();
};

const nudge = (dx, dz) => {
   let c = Math.cos(loc.yaw), s = Math.sin(loc.yaw);
   loc.x -= c * dx + s * dz;
   loc.z -= -s * dx + c * dz;
   writeWorld();
};

const eyeNow = () => {
   let view = window.views && window.views[0];
   let p = view && view.viewTransform && view.viewTransform.position;
   return p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z) ? p : null;
};

let strokeN = 0;
const ADVANCE = 0.72;
const LINE = 1.7;
const GLYPH = Object.create(null);
for (let g of linefont) GLYPH[g.name] = g.paths;

const strokeMesh = text => {
   const verts = [];
   const put = (x, y, nz) => {
      const v = clay.vertexArray([x, y, 0], [0, 0, nz], [1, 0, 0], [0, 0]);
      for (let i = 0; i < v.length; i++) verts.push(v[i]);
   };
   const tri = (ax, ay, bx, by, cx, cy, nz) => { put(ax, ay, nz); put(bx, by, nz); put(cx, cy, nz); };
   const stroke = (ax, ay, bx, by) => {
      let dx = bx - ax, dy = by - ay;
      let len = Math.hypot(dx, dy);
      if (len < 1e-5) return;
      let ex = -dy / len * 0.045, ey = dx / len * 0.045;
      tri(ax + ex, ay + ey, ax - ex, ay - ey, bx + ex, by + ey, 1);
      tri(ax - ex, ay - ey, bx - ex, by - ey, bx + ex, by + ey, 1);
      tri(ax - ex, ay - ey, ax + ex, ay + ey, bx + ex, by + ey, -1);
      tri(bx - ex, by - ey, ax - ex, ay - ey, bx + ex, by + ey, -1);
   };
   String(text).split("\n").forEach((line, row) => {
      const y0 = -row * LINE;
      for (let col = 0; col < line.length; col++) {
         const paths = GLYPH[line[col]];
         if (!paths) continue;
         const ox = col * ADVANCE;
         for (let path of paths) {
            for (let i = 1; i < path.length; i++)
               stroke(ox + path[i - 1][0] / 100, y0 - path[i - 1][1] / 100, ox + path[i][0] / 100, y0 - path[i][1] / 100);
         }
      }
   });
   if (!verts.length) tri(0, 0, 0, 0, 0, 0, 1);
   const mesh = new Float32Array(verts);
   mesh.isTriangles = true;
   return mesh;
};

const unit3 = v => {
   let n = Math.hypot(v[0], v[1], v[2]) || 1;
   return [v[0] / n, v[1] / n, v[2] / n];
};

const flatDir = (x, z, fallback) => {
   let n = Math.hypot(x, z);
   if (n < 1e-4) return fallback;
   return [x / n, 0, z / n];
};

const pushCircle = (x, z, box) => {
   let cx = Math.max(box.x - box.sx, Math.min(x, box.x + box.sx));
   let cz = Math.max(box.z - box.sz, Math.min(z, box.z + box.sz));
   let dx = x - cx, dz = z - cz;
   let d2 = dx * dx + dz * dz;
   if (d2 >= BODY * BODY) return null;
   if (d2 < 1e-8) {
      let ox = box.sx + BODY - Math.abs(x - box.x);
      let oz = box.sz + BODY - Math.abs(z - box.z);
      if (ox < oz) return { x: Math.sign(x - box.x || 1) * ox, z: 0 };
      return { x: 0, z: Math.sign(z - box.z || 1) * oz };
   }
   let d = Math.sqrt(d2);
   let k = (BODY - d) / d;
   return { x: dx * k, z: dz * k };
};

const triggerDown = hand => !!(buttonState[hand] && buttonState[hand][0] && buttonState[hand][0].pressed);
const faceDown = hand => !!(buttonState[hand] && buttonState[hand][4] && buttonState[hand][4].pressed);

const handLocal = hand => {
   let m = controllerMatrix[hand];
   if (!m || m.length < 16 || !clay.inverseRootMatrix) return null;
   return cg.mMultiply(clay.inverseRootMatrix, m);
};

const handTips = hand => {
   let local = handLocal(hand);
   if (!local) return [];
   return [cg.mTransform(local, [0, 0, 0]), cg.mTransform(local, [0, 0, -0.16])];
};

const beamOf = hand => hand === "left" ? lcb : rcb;

const beamCast = (hand, point, radius, maxDist) => {
   let cb = beamOf(hand);
   if (!cb || !cb.beamMatrix || !window.worldCoords) return null;
   let bm = cb.beamMatrix();
   if (!bm || bm.length < 16) return null;
   let o = [bm[12], bm[13], bm[14]];
   let dir = unit3([-bm[8], -bm[9], -bm[10]]);
   let p = cg.mTransform(worldCoords, point);
   let w = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
   let t = w[0] * dir[0] + w[1] * dir[1] + w[2] * dir[2];
   if (t < 0.05 || t > maxDist) return null;
   let dx = p[0] - (o[0] + dir[0] * t);
   let dy = p[1] - (o[1] + dir[1] * t);
   let dz = p[2] - (o[2] + dir[2] * t);
   if (dx * dx + dy * dy + dz * dz > radius * radius) return null;
   return t;
};

export const init = async model => {
   if (window.server && server.neverLoadOrSave) server.neverLoadOrSave();
   let bag = { claimed: false, epoch: 0, good: null };
   let visuals = [];
   let solids = [];
   let doorNodes = { R: [], Y: [], G: [] };
   let doorGeom = { R: [], Y: [], G: [] };
   let doorOpen = { R: 1, Y: 0, G: 0 };
   let panels = [];
   let turnLatch = 0;
   let lastAlarm = 0;
   let lastMon = 0;
   let lastBuzz = 0;
   let held = { left: false, right: false };
   let faceWas = { left: false, right: false };
   let hands = { left: "", right: "" };
   let claimed = ITEMS.map(() => 0);
   let fastUntil = 0;
   const FAST_MULT = 1.8;
   let want007 = false;
   let wantReset = false;
   let resetWas = false;
   let round = 0;
   let heard = null;

   const oldUi = document.getElementById("wwo-vr-ui");
   if (oldUi) oldUi.remove();
   const ui = document.createElement("div");
   ui.id = "wwo-vr-ui";
   ui.innerHTML = `
      <style>
        #wwo-vr-ui, #wwo-vr-ui * { box-sizing: border-box; }
        #wwo-vr-book, #wwo-vr-notes {
          font-family: "Courier New", Courier, monospace;
          font-weight: 700;
          color: #1a120c;
        }
        #wwo-vr-book {
          display: none;
          position: fixed;
          z-index: 20;
          left: 50%;
          top: 16px;
          transform: translateX(-50%) rotate(-1deg);
          width: min(640px, calc(100vw - 36px));
          max-height: calc(100vh - 110px);
          overflow: auto;
          padding: 18px 26px 16px 42px;
          background:
            linear-gradient(#e7b3b3, #e7b3b3) 34px 0 / 2px 100% no-repeat,
            repeating-linear-gradient(to bottom, transparent 0 23px, rgba(80, 40, 40, 0.18) 24px);
          background-color: #f3e2c0;
          border: 3px solid #2a2118;
          box-shadow: 8px 10px 0 rgba(0, 0, 0, 0.45);
          cursor: pointer;
          line-height: 24px;
        }
        #wwo-vr-book h2 { margin: 0 0 6px; font-size: 20px; letter-spacing: 1px; }
        #wwo-vr-book p { margin: 0 0 8px; font-size: 15px; }
        #wwo-vr-notes {
          display: block;
          position: fixed;
          z-index: 22;
          right: 12px;
          top: 12px;
          padding: 0;
          background: transparent;
          border: none;
          box-shadow: none;
          cursor: pointer;
          line-height: 0;
        }
        #wwo-vr-notes svg { display: block; }
        #wwo-vr-ready {
          position: fixed;
          z-index: 23;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          font-family: "Courier New", Courier, monospace;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 1px;
          color: #f4f4f4;
          background: #1c1c1c;
          border: 3px solid #f4f4f4;
          padding: 12px 28px;
          cursor: pointer;
        }
        #wwo-vr-ready.on { background: #6fbf3a; color: #111; }
        #wwo-vr-ready:disabled { cursor: default; }
        #wwo-vr-reset {
          display: none;
          position: fixed;
          z-index: 23;
          left: 50%;
          bottom: 16px;
          transform: translateX(-50%);
          font-family: "Courier New", Courier, monospace;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 1px;
          color: #111;
          background: #f4f4f4;
          border: 3px solid #f4f4f4;
          padding: 12px 28px;
          cursor: pointer;
        }
        #wwo-vr-count {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 24;
          align-items: center;
          justify-content: center;
          font-family: "Courier New", Courier, monospace;
          font-weight: 700;
          font-size: 180px;
          color: #f4f4f4;
          text-shadow: 0 0 18px #000;
          pointer-events: none;
        }
      </style>
      <button id="wwo-vr-notes" type="button" aria-label="Notes">
        <svg viewBox="0 0 32 40" width="32" height="40">
          <rect x="3" y="2" width="24" height="36" fill="#f3e2c0" stroke="#2a2118" stroke-width="2"/>
          <line x1="9" y1="2" x2="9" y2="38" stroke="#e7b3b3" stroke-width="2"/>
          <line x1="13" y1="12" x2="23" y2="12" stroke="#2a2118" stroke-width="1.6"/>
          <line x1="13" y1="18" x2="23" y2="18" stroke="#2a2118" stroke-width="1.6"/>
          <line x1="13" y1="24" x2="20" y2="24" stroke="#2a2118" stroke-width="1.6"/>
        </svg>
      </button>
      <div id="wwo-vr-book">
        <h2>FIELD NOTES</h2>
        <p>Agent 007 (You) and Agent 014 followed an anonymous tip into Definitely Safe (TM) Laboratories.</p>
        <p>Agent 007 went into the halls to gather proof. Agent 014 stayed in a stolen security room. The moment they were inside, the building locked itself down.</p>
        <p>Agent 007 only sees what is nearby. The monitor starts at half power. Each percent lasts 2 seconds, and at zero the building goes dark.</p>
        <p>Left X and right A grab an object. Each hand holds one. Press the same button again to use it. A full hand cannot grab or turn a wire tile.</p>
        <p>The green battery is worth 50%, up to a full charge. The blue star freezes the Abomination for 5 seconds. The orange arrows make Agent 007 run faster for 5 seconds.</p>
        <p>Left stick walks. Right stick turns. An empty hand's trigger turns a wire tile.</p>
        <p>Wire panels restore cameras for Agent 014. Agent 014 throws the doors, and each throw costs 10% power. Agent 007 cannot throw a gate. Yellow is the way out.</p>
        <p>Press left X and right A together to ready up. Nothing starts until Agent 007 and Agent 014 have both readied. Then the lockdown begins in 5.</p>
        <p>Click the notebook to set it aside.</p>
      </div>
      <button id="wwo-vr-ready" type="button">READY</button>
      <button id="wwo-vr-reset" type="button">RESET</button>
      <div id="wwo-vr-count"></div>
   `;
   document.body.appendChild(ui);
   const vrBook = ui.querySelector("#wwo-vr-book");
   const vrNotes = ui.querySelector("#wwo-vr-notes");
   const vrReady = ui.querySelector("#wwo-vr-ready");
   const vrReset = ui.querySelector("#wwo-vr-reset");
   const vrCount = ui.querySelector("#wwo-vr-count");
   vrBook.addEventListener("click", () => {
      vrBook.style.display = "none";
      vrNotes.style.display = "block";
   });
   vrNotes.addEventListener("click", () => {
      vrBook.style.display = "block";
      vrNotes.style.display = "none";
   });
   vrReady.addEventListener("click", e => {
      e.stopPropagation();
      want007 = true;
   });
   vrReset.addEventListener("click", e => {
      e.stopPropagation();
      wantReset = true;
   });
   const watchLeave = () => {
      if (!document.getElementById("wwo-vr-ui")) return;
      if (window.currentName && window.currentName !== "PLEASE HOLD") {
         ui.remove();
         return;
      }
      requestAnimationFrame(watchLeave);
   };
   requestAnimationFrame(watchLeave);
   let facing = 0;
   let s = null;

   const track = (node, x, z, sx, sz, regions, always) => {
      visuals.push({ node, m: node.getMatrix().slice(), x, z, sx, sz, regions, always: !!always });
   };

   const wallBoxes = [];
   const addWall = (x, z, sx, sz) => {
      if (sx < 0.02 || sz < 0.02) return;
      wallBoxes.push([x, WH / 2, z, sx, WH / 2, sz]);
      solids.push({ x, z, sx, sz });
   };

   const placeEdge = (c, r, c2, r2, gap) => {
      let a = center(c, r), b = center(c2, r2);
      let mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      let alongZ = r === r2;
      if (!gap) {
         if (alongZ) addWall(mx, mz, TH, CELL / 2);
         else addWall(mx, mz, CELL / 2, TH);
         return;
      }
      let opening = 1.12;
      let stub = (CELL - opening) / 2;
      if (stub < 0.04) return;
      let shift = opening / 2 + stub / 2;
      if (alongZ) {
         addWall(mx, mz - shift, TH, stub / 2);
         addWall(mx, mz + shift, TH, stub / 2);
      } else {
         addWall(mx - shift, mz, stub / 2, TH);
         addWall(mx + shift, mz, stub / 2, TH);
      }
   };

   const slab = (c0, r0, c1, r1, rgb) => {
      let x0 = center(c0, r0)[0] - CELL / 2, x1 = center(c1, r1)[0] + CELL / 2;
      let z0 = center(c0, r0)[1] + CELL / 2, z1 = center(c1, r1)[1] - CELL / 2;
      let cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let sx = (x1 - x0) / 2, sz = Math.abs(z0 - z1) / 2;
      let floor = model.add("cube").dull().color(rgb).move(cx, 0.03, cz).scale(sx, 0.03, sz);
      track(floor, cx, cz, sx, sz, [regionOf(c0, r0)], true);
   };
   slab(0, 0, 5, 1, [.4, .52, .75]);
   slab(0, 2, 1, 5, [.32, .48, .72]);
   slab(2, 2, 3, 5, [.48, .36, .7]);
   slab(4, 2, 5, 5, [.28, .55, .48]);

   for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
         let p = center(c, r);
         let reg = regionOf(c, r);
         if (c + 1 < COLS) placeEdge(c, r, c + 1, r, PASSAGE.has(edgeKey(c, r, c + 1, r)) || EDGE_DOOR[edgeKey(c, r, c + 1, r)]);
         else addWall(p[0] + CELL / 2, p[1], TH, CELL / 2);
         if (r + 1 < ROWS) placeEdge(c, r, c, r + 1, PASSAGE.has(edgeKey(c, r, c, r + 1)) || EDGE_DOOR[edgeKey(c, r, c, r + 1)]);
         else addWall(p[0], p[1] - CELL / 2, CELL / 2, TH);
         if (c === 0) addWall(p[0] - CELL / 2, p[1], TH, CELL / 2);
         if (r === 0) addWall(p[0], p[1] + CELL / 2, CELL / 2, TH);
      }
   }
   {
      const verts = [];
      const put = (p, n) => {
         const v = clay.vertexArray(p, n, [1, 0, 0], [0, 0]);
         for (let i = 0; i < v.length; i++) verts.push(v[i]);
      };
      const tri = (n, a, b, c) => { put(a, n); put(b, n); put(c, n); };
      for (let b of wallBoxes) {
         let x = b[0], y = b[1], z = b[2], sx = b[3], sy = b[4], sz = b[5];
         let x0 = x - sx, x1 = x + sx, y0 = y - sy, y1 = y + sy, z0 = z - sz, z1 = z + sz;
         let faces = [
            [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
            [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
            [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
            [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
            [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
            [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
         ];
         for (let f of faces) {
            tri(f[0], f[1], f[2], f[3]);
            tri(f[0], f[1], f[3], f[4]);
         }
      }
      const mesh = new Float32Array(verts);
      mesh.isTriangles = true;
      clay.defineMesh("wwoWalls", mesh);
      model.add("wwoWalls").color(.22, .16, .28).dull();
   }

   for (let e of EDGES) {
      if (!e[4]) continue;
      let a = center(e[0], e[1]), b = center(e[2], e[3]);
      let alongZ = e[1] === e[3];
      let geom = {
         x: (a[0] + b[0]) / 2,
         z: (a[1] + b[1]) / 2,
         sx: alongZ ? DOOR_TH : 0.52,
         sz: alongZ ? 0.52 : DOOR_TH,
         slide: alongZ ? [0, 1.15] : [1.15, 0],
         regions: [regionOf(e[0], e[1]), regionOf(e[2], e[3])],
      };
      doorGeom[e[4]].push(geom);
      let rgb = e[4] === "R" ? [.92, .2, .16] : e[4] === "Y" ? [.95, .78, .14] : [.22, .78, .32];
      let node = model.add("cube").dull().color(rgb[0], rgb[1], rgb[2])
         .move(geom.x, WH / 2, geom.z).scale(geom.sx, WH / 2, geom.sz);
      doorNodes[e[4]].push(node);
   }

   const airText = (parent, lines, rgb, scale, y, z) => {
      const body = Array.isArray(lines) ? lines.join("\n") : String(lines);
      const name = "wwoS" + (strokeN++);
      clay.defineMesh(name, strokeMesh(body));
      const rows = body.split("\n");
      let widest = 1;
      for (let line of rows) widest = Math.max(widest, line.length || 1);
      const g = 0.045 * scale / 2.8;
      const card = parent.add(name).dull().color(rgb[0], rgb[1], rgb[2])
         .move(-(widest * ADVANCE * g) / 2, (y || 0) + (((rows.length - 1) * LINE / 2) + 0.5) * g, z || 0)
         .scale(g);
      const paint = (next, color) => {
         const t = Array.isArray(next) ? next.join("\n") : String(next);
         clay.defineMesh(name, strokeMesh(t));
         if (Array.isArray(color)) card.color(color[0], color[1], color[2]);
      };
      return { card, paint, name, g };
   };

   const sign = (lines, x, y, z, yaw, regions) => {
      let g = model.add().move(x, y, z).turnY(yaw || 0);
      airText(g, lines, [1, .96, .78], 2.8, 0, 0);
      track(g, x, z, 0.4, 0.4, regions);
   };

   let start = center(0, 0);
   sign([
      "Agent 007 (You) AND Agent 014",
      "Are investigating this evil corporation called.",
      "DefinitelySafe.co",
      "Agent 014 will be on the control panel, you can ask 014 for help!",
      "014 knows much more than you, as it can see the whole map + a lot more!",
      "However, some wires are broken, you need to fix them to restore power to the panels!",
      "Controls:",
      "Use your controllers joysticks to move around!",
      "Grab items with your joysticks by pressing X or A, remember you only have 2 hands!",
      "Press X or A again to use items, use them to your advantage! Ask 014 what they do!",
      "Press the back button to interact with wire panels!",
   ], start[0] - 0.72, 1.9, start[1] + 0.05, Math.PI / 2, [0]);

   let exit = center(EXIT[0], EXIT[1]);
   sign([
      "EXIT",
   ], exit[0] + 0.72, 1.3, exit[1], -Math.PI / 2, [regionOf(EXIT[0], EXIT[1])]);

   const addIcon = (g, kind, y, sc) => {
      if (kind === "bat") {
         g.add("cube").move(0, y, 0).scale(.07 * sc, .11 * sc, .04 * sc).color(.22, .78, .28);
         g.add("cube").move(0, y + .08 * sc, 0).scale(.03 * sc, .025 * sc, .025 * sc).color(.9, .9, .35);
      } else if (kind === "stun") {
         g.add("sphere").move(0, y, 0).scale(.045 * sc).color(.35, .6, 1);
         for (let d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])
            g.add("cube").move(d[0] * .07 * sc, y + d[1] * .07 * sc, d[2] * .07 * sc).scale(.02 * sc).color(.75, .9, 1);
      } else {
         let chevron = ox => {
            g.add("cube").move(ox, y + .035 * sc, 0).turnZ(.55).scale(.07 * sc, .016 * sc, .02 * sc).color(1, .5, .12);
            g.add("cube").move(ox, y - .035 * sc, 0).turnZ(-.55).scale(.07 * sc, .016 * sc, .02 * sc).color(1, .5, .12);
         };
         chevron(-.04 * sc);
         chevron(.045 * sc);
      }
   };
   let itemNodes = [];
   for (let item of ITEMS) {
      let p = center(item.c, item.r);
      let x = p[0] + 0.42, z = p[1] - 0.28;
      let g = model.add().move(x, 0, z);
      addIcon(g, item.kind, .8, 1.4);
      itemNodes.push({ g, x, z, y: .8, kind: item.kind });
   }
   let carried = { left: {}, right: {} };
   for (let hand of ["left", "right"])
      for (let kind of ["bat", "stun", "fast"]) {
         let g = model.add();
         addIcon(g, kind, 0, 1);
         carried[hand][kind] = g;
      }

   const buildPanel = (region, c, r, title, wall) => {
      let p = center(c, r);
      let yaw = wall === "east" ? -Math.PI / 2 : 0;
      let anchor = [p[0], 1.28, p[1]];
      if (wall === "east") anchor[0] += CELL * 0.36;
      else anchor[2] -= CELL * 0.36;
      let g = model.add().move(anchor[0], anchor[1], anchor[2]).turnY(yaw);
      g.add("cube").move(0, 0, -0.03).scale(.52, .5, .02).color(.34, .32, .3).dull();
      airText(g, title, [1, .95, .7], 1.6, .28, .04);
      airText(g, "TRIGGER TURNS A TILE", [.8, .95, 1], 1.05, -.32, .04);
      let battery = g.add("cube").move(-.4, 0, .03).scale(.055, .09, .025).color(.95, .78, .1);
      g.add("cube").move(-.4, .07, .035).scale(.04, .025, .02).color(.12, .1, .1);
      g.add("cube").move(-.4, .02, .05).scale(.012, .03, .01).color(1, .25, .2);
      let lead = g.add("cube").move(-.3, 0, .03).scale(.04, .018, .016);
      let bulb = g.add("sphere").move(.4, .02, .05).scale(.07);
      let tiles = [];
      const STEP = 0.2;
      for (let row = 0; row < 3; row++) {
         tiles[row] = [];
         for (let col = 0; col < 3; col++) {
            let lx = (col - 1) * STEP;
            let ly = (1 - row) * STEP;
            let rot = SOL_ROT[row][col];
            if (SCRAMBLE[region].some(([sr, sc]) => sr === row && sc === col)) rot += 1;
            let plate = g.add("cube").color(.62, .58, .52).dull();
            let arms = {};
            for (let bit of [1, 2, 4, 8]) arms[bit] = g.add("cube");
            let nub = g.add("cube");
            tiles[row][col] = { kind: SOL_KIND[row][col], rot, home: rot, plate, arms, nub, lx, ly };
         }
      }
      panels.push({
         region, title, anchor, yaw, g, tiles, battery, lead, bulb,
         x: anchor[0], z: anchor[2], done: false, sent: false,
      });
   };

   const tileWorld = (panel, tile) => {
      let x = tile.lx, z = 0;
      let c = Math.cos(panel.yaw), sn = Math.sin(panel.yaw);
      return [panel.anchor[0] + x * c + z * sn, panel.anchor[1] + tile.ly, panel.anchor[2] - x * sn + z * c];
   };

   buildPanel(1, 0, 3, "WEST WING", "north");
   buildPanel(2, 2, 3, "CORE", "east");
   buildPanel(3, 5, 3, "EAST WING", "east");

   let bot = model.add();
   bot.add("cube").move(0, .72, 0).scale(.42, .44, .34).color(.72, .1, .14).dull();
   bot.add("cube").move(0, 1.28, 0).scale(.3, .22, .28).color(.85, .16, .16).dull();
   bot.add("sphere").move(-.11, 1.34, .22).scale(.06).color(1, .95, .4);
   bot.add("sphere").move(.11, 1.34, .22).scale(.06).color(1, .95, .4);
   bot.add("cube").move(0, 1.62, 0).scale(.04, .16, .04).color(.25, .25, .28);
   bot.add("sphere").move(0, 1.82, 0).scale(.075).color(1, .25, .2);
   bot.add("cube").move(-.3, .52, 0).scale(.11, .32, .14).color(.55, .1, .12).dull();
   bot.add("cube").move(.3, .52, 0).scale(.11, .32, .14).color(.55, .1, .12).dull();
   bot.identity().scale(0);

   let exitPad = model.add("diskY").color(.3, 1.15, .4).dull();

   let hud = model.add();
   const hudMesh = () => {
      let slot = airText(hud, ".", [1, 1, 1], 1, 0, 0);
      slot.last = "";
      return slot;
   };
   let hudTimer = hudMesh();
   let hudScore = hudMesh();
   let hudMove = hudMesh();
   let hudHint = hudMesh();
   let hudBig = hudMesh();
   let hudSub = hudMesh();
   let hudReady = hudMesh();
   let readyHit = hud.add();
   const paintAir = (slot, text, x, y, sc, rgb, center) => {
      let t = text && String(text).trim() ? String(text) : ".";
      if (slot.last !== t) {
         slot.last = t;
         clay.defineMesh(slot.name, strokeMesh(t));
      }
      if (!(sc > 0)) { slot.card.identity().scale(0); return; }
      let g = 0.034 * sc;
      let width = t.length * ADVANCE * g;
      let shift = center ? -width / 2 : 0;
      slot.card.identity().move(x + shift, y + 0.5 * g, 0).scale(g).color(rgb[0], rgb[1], rgb[2]);
      slot.chars = t.length;
   };

   const say = text => {
      s.feed = (s.feed || []).concat(text).slice(-4);
      s.rev = (s.rev | 0) + 1;
      server.broadcastGlobal("wrongWay");
   };

   const reveal = panel => {
      if (!s.shown[panel.region]) s.shown[panel.region] = 1;
      if (!panel.sent) {
         panel.sent = true;
         say(REGION_NAME[panel.region] + " cameras are back.");
         [523, 659, 784].forEach((f, i) => tone(f, .12, i * .07, "square", .06));
         if (explorer()) { buzz("left", .6, 80); buzz("right", .6, 80); }
      }
   };

   const pokePanels = () => {
      if (!explorer() || !s) return;
      for (let hand of ["left", "right"]) {
         let down = triggerDown(hand);
         if (hands[hand]) { held[hand] = down; continue; }
         if (down && !held[hand] && s.phase === "play") {
            let best = null, bd = 2.4, host = null;
            for (let panel of panels) {
               if (panel.done || (s.shown && s.shown[panel.region])) continue;
               for (let row of panel.tiles)
                  for (let tile of row) {
                     let w = tileWorld(panel, tile);
                     let t = beamCast(hand, w, 0.18, 2.4);
                     if (t != null && t < bd) { bd = t; best = tile; host = panel; }
                  }
            }
            if (best) {
               best.rot = (best.rot + 1) % 4;
               tone(720, .04, 0, "square", .04);
               buzz(hand, .35, 25);
               if (circuit(host.tiles).solved) {
                  host.done = true;
                  reveal(host);
               }
            }
         }
         held[hand] = down;
      }
   };

   const useHeld = hand => {
      let kind = hands[hand];
      hands[hand] = "";
      if (kind === "bat") {
         setPower(s, powerNow(s) + BAT_GAIN);
         say("Battery. Monitor at " + Math.round(s.power) + "%.");
         tone(880, .08, 0, "square", .05);
      } else if (kind === "stun") {
         s.stunUntil = Date.now() + STUN_MS;
         say("The Abomination is stunned.");
         tone(160, .22, 0, "sawtooth", .07);
      } else if (kind === "fast") {
         fastUntil = model.time + FAST_MS / 1000;
         say("Agent 007 is moving faster.");
         tone(740, .08, 0, "square", .05);
      }
      buzz(hand, .6, 70);
   };

   const grabHands = () => {
      if (!explorer() || !s) return;
      for (let hand of ["left", "right"]) {
         let down = faceDown(hand);
         if (down && !faceWas[hand] && s.phase === "play") {
            if (hands[hand]) useHeld(hand);
            else if (s.items) {
               let best = -1, bd = 3.2;
               for (let i = 0; i < itemNodes.length; i++) {
                  if (!s.items[i] || claimed[i]) continue;
                  let n = itemNodes[i];
                  let t = beamCast(hand, [n.x, n.y, n.z], 0.36, 3.2);
                  if (t != null && t < bd) { bd = t; best = i; }
               }
               if (best >= 0) {
                  claimed[best] = 1;
                  s.items[best] = 0;
                  hands[hand] = itemNodes[best].kind;
                  tone(520, .05, 0, "square", .04);
                  buzz(hand, .4, 35);
               }
            }
         }
         faceWas[hand] = down;
      }
   };

   const drawPanels = nearFn => {
      const ARM = {
         1: [0, .055, .03, .02, .055, .016],
         2: [.055, 0, .03, .055, .02, .016],
         4: [0, -.055, .03, .02, .055, .016],
         8: [-.055, 0, .03, .055, .02, .016],
      };
      for (let panel of panels) {
         let show = nearFn(panel.x, panel.z, .4, .4);
         if (!show) {
            if (!panel.hidden) panel.g.identity().scale(0);
            panel.hidden = true;
            continue;
         }
         panel.hidden = false;
         panel.g.identity().move(panel.anchor[0], panel.anchor[1], panel.anchor[2]).turnY(panel.yaw);
         if (s && s.shown && s.shown[panel.region]) panel.done = true;
         if (explorer() && panel.done && s.phase === "play" && !s.shown[panel.region]) reveal(panel);
         let flow = circuit(panel.tiles);
         if (panel.done && !flow.solved) {
            for (let row = 0; row < 3; row++)
               for (let col = 0; col < 3; col++)
                  panel.tiles[row][col].rot = SOL_ROT[row][col];
            flow = circuit(panel.tiles);
         }
         let hotLead = !!(rotBits(panel.tiles[1][0].kind, panel.tiles[1][0].rot) & 8);
         panel.lead.identity().move(-.3, 0, .03).scale(.045, .016, .014)
            .color(hotLead ? .2 : .15, hotLead ? .9 : .28, hotLead ? .3 : .18);
         panel.bulb.identity().move(.4, .02, .05).scale(.07)
            .color(flow.solved ? 1.3 : .35, flow.solved ? 1.15 : .32, flow.solved ? .45 : .2);
         for (let row = 0; row < 3; row++)
            for (let col = 0; col < 3; col++) {
               let tile = panel.tiles[row][col];
               let bits = rotBits(tile.kind, tile.rot);
               let powered = flow.on[row][col];
               tile.plate.identity().move(tile.lx, tile.ly, 0).scale(.082, .082, .014)
                  .color(powered ? .72 : .55, powered ? .7 : .52, powered ? .6 : .48);
               for (let bit of [1, 2, 4, 8]) {
                  let a = ARM[bit];
                  let on = bits & bit;
                  tile.arms[bit].identity().move(tile.lx + a[0], tile.ly + a[1], a[2])
                     .scale(on ? a[3] : 0, on ? a[4] : 0, on ? a[5] : 0)
                     .color(powered && on ? .15 : .16, powered && on ? .82 : .26, powered && on ? .28 : .18);
               }
               tile.nub.identity().move(tile.lx, tile.ly, .03).scale(bits ? .026 : 0)
                  .color(powered ? .2 : .16, powered ? .9 : .26, powered ? .32 : .18);
            }
      }
   };

   const react = () => {
      let snap = {
         phase: s.phase,
         caught: s.caught ? 1 : 0,
         gates: "" + s.gates.R + s.gates.Y + s.gates.G,
         shown: (s.shown || []).join(""),
      };
      if (!heard) { heard = snap; return; }
      if (heard.gates !== snap.gates) tone(90, .12, 0, "sawtooth", .07);
      if (heard.phase !== "count" && snap.phase === "count") tone(440, .12, 0, "square", .05);
      if (heard.phase !== "play" && snap.phase === "play") tone(660, .08, 0, "square", .05);
      if (heard.phase !== "win" && snap.phase === "win") {
         [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, i * .1, "square", .07));
         if (explorer()) { buzz("left", .8, 140); buzz("right", .8, 140); }
      }
      if (heard.phase !== "lose" && snap.phase === "lose") {
         [180, 120, 80].forEach((f, i) => tone(f, .2, i * .12, "sawtooth", .07));
         if (explorer()) { buzz("left", 1, 220); buzz("right", 1, 220); }
      }
      heard = snap;
   };

   const localReset = () => {
      want007 = false;
      wantReset = false;
      fastUntil = 0;
      heard = null;
      hands.left = "";
      hands.right = "";
      held.left = false;
      held.right = false;
      faceWas.left = false;
      faceWas.right = false;
      for (let i = 0; i < claimed.length; i++) claimed[i] = 0;
      doorOpen.R = 1;
      doorOpen.Y = 0;
      doorOpen.G = 0;
      for (let panel of panels) {
         panel.done = false;
         panel.sent = false;
         for (let row of panel.tiles)
            for (let tile of row) tile.rot = tile.home;
      }
      loc.settled = false;
      loc.hold = 0;
      loc.prev = null;
   };

   const noteRound = () => {
      if (!s || s.epoch === round) return;
      if (round) localReset();
      round = s.epoch;
      wantReset = false;
   };

   model.animate(() => {
      let dt = Math.min(0.05, model.deltaTime || 0.016);
      s = adoptState(bag);
      if (!s) return;
      noteRound();

      let bothFaces = faceDown("left") && faceDown("right");
      if (explorer() && ended(s) && bothFaces && !resetWas) wantReset = true;
      resetWas = bothFaces;
      if (explorer() && s.phase === "ready" && !want007 && !s.r007 && bothFaces)
         want007 = true;
      if (wantReset && ended(s)) s.askReset = 1;

      if (explorer()) {
         let eye = headsetEye();
         if (eye && !loc.settled) {
            let home = center(0, 0);
            let jump = loc.prev ? Math.hypot(eye.x - loc.prev[0], eye.y - loc.prev[1], eye.z - loc.prev[2]) : 0;
            loc.prev = [eye.x, eye.y, eye.z];
            loc.hold = jump < 0.08 ? loc.hold + dt : 0;
            loc.x = eye.x - home[0];
            loc.z = eye.z - home[1];
            loc.yaw = 0;
            loc.y = eye.y - 1.55;
            if (loc.hold > 0.6) loc.settled = true;
         } else if (eye) loc.y = eye.y - 1.55;
         writeWorld();
         let cam = camNow();
         if (!cam) cam = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, center(0, 0)[0], 1.55, center(0, 0)[1], 1];
         let fwd = flatDir(-(cam[8] || 0), -(cam[10] || 0), [0, 0, -1]);
         let right = flatDir(cam[0] || 1, cam[2] || 0, [1, 0, 0]);
         let stick = joyStickState.left || { x: 0, y: 0 };
         let look = joyStickState.right || { x: 0, y: 0 };
         let sx = Math.abs(stick.x) > .22 ? stick.x : 0;
         let sy = Math.abs(stick.y) > .22 ? -stick.y : 0;
         if (sx || sy || Math.abs(look.x) > .7) loc.settled = true;
         if (s.items)
            for (let i = 0; i < claimed.length; i++) if (claimed[i]) s.items[i] = 0;
         let pace = model.time < fastUntil ? WALK * FAST_MULT : WALK;
         if ((sx || sy) && s.phase === "play")
            nudge((right[0] * sx + fwd[0] * sy) * pace * dt, (right[2] * sx + fwd[2] * sy) * pace * dt);
         if (Math.abs(look.x) > .7 && model.time > turnLatch) {
            turnLatch = model.time + .38;
            try {
               let yaw = (look.x > 0 ? 1 : -1) * 0.55;
               let px = clay.root().inverseViewMatrix(0);
               let ox = px[12], oy = px[13], oz = px[14];
               let spin = cg.mMultiply(cg.mTranslate(ox, oy, oz),
                  cg.mMultiply(cg.mRotateY(yaw), cg.mTranslate(-ox, -oy, -oz)));
               let next = cg.mMultiply(spin, worldCoords);
               loc.yaw = Math.atan2(-next[2], next[0]);
               loc.x = next[12];
               loc.z = next[14];
               writeWorld();
            } catch (e) {}
         }
         let boxes = solids.slice();
         for (let id of GATES)
            if (doorOpen[id] < 0.72)
               for (let d of doorGeom[id])
                  boxes.push({
                     x: d.x + d.slide[0] * doorOpen[id],
                     z: d.z + d.slide[1] * doorOpen[id],
                     sx: d.sx, sz: d.sz,
                  });
         for (let n = 0; n < 4; n++) {
            cam = camNow() || cam;
            let hit = null;
            for (let box of boxes) {
               let push = pushCircle(cam[12], cam[14], box);
               if (push && (!hit || Math.hypot(push.x, push.z) > Math.hypot(hit.x, hit.z))) hit = push;
            }
            if (!hit) break;
            nudge(hit.x, hit.z);
         }
         cam = camNow() || cam;
         if (s.phase === "play") {
            let cell = cellAt(cam[12], cam[14]);
            if (cell[0] === EXIT[0] && cell[1] === EXIT[1]) {
               s.frozen = timeLeft(s);
               s.phase = "win";
               say("Agent 007 found the way out.");
            }
         }
         cam = camNow() || cam;
         s.px = cam[12];
         s.pz = cam[14];
         pokePanels();
         grabHands();
      }

      if (want007) s.r007 = 1;
      if (!isMaster()) {
         let live = window.wrongWay;
         if (live && live !== s && live.epoch === s.epoch) {
            if (explorer()) {
               live.px = s.px;
               live.pz = s.pz;
               if (s.phase === "win" && live.phase === "play") {
                  live.phase = "win";
                  live.frozen = s.frozen;
                  live.feed = s.feed;
               }
               if (s.shown && live.shown)
                  for (let i = 0; i < s.shown.length; i++) if (s.shown[i]) live.shown[i] = 1;
               if (s.items && live.items)
                  for (let i = 0; i < s.items.length; i++) if (!s.items[i]) live.items[i] = 0;
               if ((s.stunUntil || 0) > (live.stunUntil || 0)) live.stunUntil = s.stunUntil;
               if (s.powerAt && (!live.powerAt || s.powerAt >= live.powerAt)) {
                  live.power = s.power;
                  live.powerAt = s.powerAt;
               }
            }
            if (want007) live.r007 = 1;
            if (wantReset) live.askReset = 1;
            window.wrongWay = live;
            bag.good = live;
            s = live;
         }
      }
      if (isMaster()) {
         let restarted = takeReset(bag, s);
         if (restarted !== s) {
            s = restarted;
            noteRound();
         }
         let lobby = tickLobby(s);
         if (lobby === "count") say("Both ready. Lockdown in 5.");
         else if (lobby === "play") say("Lockdown. The Abomination is already moving.");
         let ev = tickMaster(s, dt);
         if (ev === "caught") say("The Abomination caught Agent 007.");
         else if (ev === "time") say("Power's gone. Agent 007 is still inside.");
      }
      if ((isMaster() || explorer() || want007 || wantReset) && model.time - lastMon > 0.12) {
         lastMon = model.time;
         server.broadcastGlobal("wrongWay");
      }
      vrReady.style.display = s.phase === "ready" ? "block" : "none";
      vrReset.style.display = ended(s) ? "block" : "none";
      vrReady.disabled = want007;
      vrReady.classList.toggle("on", want007);
      vrReady.textContent = want007 ? (s.r014 ? "READY" : "WAITING FOR 014") : "PRESS X AND A";
      if (s.phase === "count") {
         vrCount.style.display = "flex";
         vrCount.textContent = String(countDigit(s));
      } else vrCount.style.display = "none";

      let posNow = (typeof s.px === "number") ? [s.px, s.pz] : null;
      let threat = posNow ? Math.hypot(posNow[0] - s.mx, posNow[1] - s.mz) : 99;
      if (s.phase === "play" && threat < 5 && model.time - lastBuzz > Math.max(0.16, threat * 0.14)) {
         lastBuzz = model.time;
         tone(70 + (5 - threat) * 28, .07, 0, "sawtooth", .045);
         if (explorer()) {
            let power = Math.max(.15, 1 - threat / 5);
            buzz("left", power, 30);
            buzz("right", power, 30);
         }
      }
      if (s.phase === "play" && timeLeft(s) < 20 && model.time - lastAlarm > 1) {
         lastAlarm = model.time;
         tone(180, .05, 0, "square", .035);
      }

      react();

      let home = center(0, 0);
      let px = home[0], pz = home[1], have = true;
      let seen = camNow();
      if (seen) { px = seen[12]; pz = seen[14]; }
      const near = (x, z, sx, sz) => {
         if (!have) return false;
         let cx = Math.max(x - (sx || 0), Math.min(px, x + (sx || 0)));
         let cz = Math.max(z - (sz || 0), Math.min(pz, z + (sz || 0)));
         return Math.hypot(px - cx, pz - cz) < SIGHT;
      };
      const showPiece = (x, z, sx, sz, regions) => near(x, z, sx, sz);

      for (let v of visuals) {
         let on = v.always || showPiece(v.x, v.z, v.sx, v.sz, v.regions);
         if (v.on === on) continue;
         v.on = on;
         if (on) v.node.setMatrix(v.m);
         else v.node.identity().scale(0);
      }
      for (let id of GATES) {
         let target = s.gates[id] ? 1 : 0;
         doorOpen[id] += (target - doorOpen[id]) * Math.min(1, dt * 8);
         let rgb = id === "R" ? [.92, .2, .16] : id === "Y" ? [.95, .78, .14] : [.22, .78, .32];
         for (let i = 0; i < doorGeom[id].length; i++) {
            let d = doorGeom[id][i];
            let x = d.x + d.slide[0] * doorOpen[id];
            let z = d.z + d.slide[1] * doorOpen[id];
            let node = doorNodes[id][i];
            node.identity().move(x, WH / 2, z).scale(d.sx, WH / 2, d.sz).color(rgb[0], rgb[1], rgb[2]);
         }
      }

      drawPanels(near);

      let prevM = bot._prev || [s.mx, s.mz];
      let vx = s.mx - prevM[0], vz = s.mz - prevM[1];
      if (Math.hypot(vx, vz) > 0.002) facing = Math.atan2(vx, vz);
      bot._prev = [s.mx, s.mz];
      let seeBot = near(s.mx, s.mz, 0.3, 0.3);
      for (let i = 0; i < itemNodes.length; i++) {
         let n = itemNodes[i];
         let on = s.items && s.items[i] && near(n.x, n.z, 0.2, 0.2);
         if (!on) n.g.identity().scale(0);
         else n.g.identity().move(n.x, Math.sin(model.time * 3 + i) * 0.04, n.z);
      }
      for (let hand of ["left", "right"]) {
         let tip = null;
         if (hands[hand] && explorer()) {
            let tips = handTips(hand);
            tip = tips[tips.length - 1] || null;
         }
         for (let kind of ["bat", "stun", "fast"]) {
            let node = carried[hand][kind];
            if (tip && kind === hands[hand]) node.identity().move(tip[0], tip[1], tip[2]);
            else node.identity().scale(0);
         }
      }

      if (!seeBot) bot.identity().scale(0);
      else {
         let frozen = stunned(s);
         let bob = frozen ? 0 : Math.abs(Math.sin(model.time * 7)) * 0.04;
         bot.identity().move(s.mx, bob, s.mz).turnY(facing);
         bot.child(0).color(frozen ? .25 : .72, frozen ? .35 : .1, frozen ? .75 : .14);
         bot.child(1).color(frozen ? .3 : .85, frozen ? .4 : .16, frozen ? .8 : .16);
         let hot = !frozen && threat < SIGHT;
         bot.child(2).color(hot ? 1 : .4, hot ? .95 : .15, hot ? .35 : .1);
         bot.child(3).color(hot ? 1 : .4, hot ? .95 : .15, hot ? .35 : .1);
      }

      if (!showPiece(exit[0], exit[1], 0.6, 0.6, [regionOf(EXIT[0], EXIT[1])])) exitPad.identity().scale(0);
      else exitPad.identity().move(exit[0], 0.07, exit[1]).scale(.55, .02, .55);

      if (have) {
         hud.identity().hud();
         let left = timeLeft(s);
         let hot = s.phase === "play" && (left < 30 || threat < 2.8);
         paintAir(hudTimer, fmt(left), -.72, .42, 1.5, hot ? [1, .35, .3] : [1, .9, .3], false);
         paintAir(hudScore, (s.phase === "ready" || s.phase === "count") ? "RATING ---" : "RATING " + rating(s), .08, .42, 1.05, [.55, 1, .7], false);
         let holdLine = (hands.left || hands.right)
            ? "PRESS X OR A AGAIN TO USE IT. ONE ITEM EACH HAND."
            : "POINT THE RAY. LEFT X OR RIGHT A PICKS UP.";
         paintAir(hudMove, model.time < fastUntil ? "MOVING FASTER" : holdLine, 0, .28, .8, [.8, .9, 1], true);
         let rayOnItem = false;
         if (explorer() && s.phase === "play" && s.items)
            for (let hand of ["left", "right"]) {
               if (hands[hand]) continue;
               for (let i = 0; i < itemNodes.length; i++) {
                  if (!s.items[i]) continue;
                  let n = itemNodes[i];
                  if (beamCast(hand, [n.x, n.y, n.z], 0.36, 3.2) != null) rayOnItem = true;
               }
            }
         let nearPanel = panels.some(p => near(p.x, p.z, 0, 0) && Math.hypot(px - p.x, pz - p.z) < 1.6 && !(s.shown && s.shown[p.region]));
         let emptyHand = !hands.left || !hands.right;
         let hint = model.time < fastUntil ? "YOU ARE MOVING FASTER."
            : rayOnItem && emptyHand ? "RAY IS ON AN ITEM. PRESS X OR A TO PICK IT UP."
            : (hands.left && hands.right) ? "BOTH HANDS ARE FULL. PRESS X OR A TO USE ONE."
            : nearPanel && s.phase === "play" && emptyHand ? "POINT THE RAY AT A TILE AND PULL THE TRIGGER."
            : s.phase === "ready" ? "HOLD LEFT X AND RIGHT A TOGETHER."
            : hudLine(s);
         paintAir(hudHint, hint, 0, -.42, .78, [1, 1, 1], true);
         let ended = s.phase === "win" || s.phase === "lose";
         let counting = s.phase === "count";
         paintAir(hudBig, counting ? String(countDigit(s)) : s.phase === "win" ? "007 IS OUT" : s.phase === "lose" ? (s.caught ? "CAUGHT" : "TIME IS UP") : ".", 0, counting ? .08 : .04, (ended || counting) ? (counting ? 3 : 1.8) : 0, [1, .35, .3], true);
         paintAir(hudSub, counting ? "LOCKDOWN" : s.phase === "win" ? "THE ABOMINATION IS NOT" : s.phase === "lose" ? (s.caught ? "IT CAUGHT 007" : "POWER IS GONE") : ".", 0, counting ? -.16 : -.08, (ended || counting) ? 1 : 0, [1, .95, .75], true);
         let readyOn = s.phase === "ready";
         let xDown = faceDown("left");
         let aDown = faceDown("right");
         let readyLabel = ended
            ? "PRESS X AND A TO RESET"
            : want007 || s.r007
            ? (s.r014 ? "READY" : "WAITING FOR 014")
            : xDown && aDown ? "X AND A"
            : xDown ? "X IS DOWN. PRESS A TOO."
            : aDown ? "A IS DOWN. PRESS X TOO."
            : "PRESS X AND A";
         readyHit.identity().scale(0);
         paintAir(hudReady, readyLabel, 0, ended ? -.34 : .02, (readyOn || ended) ? (ended ? 1.15 : 2.1) : 0, (ended || (xDown && aDown) || want007 || s.r007) ? [.55, 1, .45] : [1, .92, .35], true);
      } else hud.identity().scale(0);
   });
};
