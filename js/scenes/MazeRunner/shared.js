/*
   Shared maze rules for the headset scene and the desktop window.
   Both pages read and write window.wrongWay through the class server.
*/

export const BOOT = 9;
export const COUNT_MS = 5000;
export const SHIFT = 240;
export const START_POWER = 90;
export const BAT_GAIN = 50;
export const DOOR_COST = 10;
export const SEC_PER_PERCENT = 4;
export const STUN_MS = 5000;
export const FAST_MS = 5000;
export const CELL = 2.35;
export const COLS = 6;
export const ROWS = 6;
export const SIGHT = 3.15;
export const EXIT = [5, 5];
export const WALK = 1.4;
export const MONSTER_SPEED = WALK * 0.5;

export const EDGES = [
   [0, 0, 0, 1, null], [0, 1, 0, 2, null], [0, 2, 0, 3, null], [0, 4, 0, 5, null],
   [1, 1, 1, 2, null], [1, 4, 1, 5, null],
   [2, 0, 2, 1, null], [2, 1, 2, 2, null], [2, 2, 2, 3, null], [2, 3, 2, 4, null],
   [3, 2, 3, 3, null], [3, 4, 3, 5, null],
   [4, 1, 4, 2, null],
   [5, 0, 5, 1, null], [5, 2, 5, 3, null], [5, 3, 5, 4, null],
   [0, 1, 1, 1, null], [0, 3, 1, 3, null], [0, 5, 1, 5, null],
   [1, 0, 2, 0, null], [1, 1, 2, 1, null], [1, 3, 2, 3, null],
   [2, 0, 3, 0, null], [2, 1, 3, 1, null],
   [3, 5, 4, 5, null],
   [4, 0, 5, 0, null], [4, 1, 5, 1, null], [4, 2, 5, 2, null], [4, 3, 5, 3, null], [4, 4, 5, 4, null],
   [3, 0, 4, 0, "R"], [3, 1, 4, 1, "R"], [1, 3, 1, 4, "R"], [3, 3, 4, 3, "R"], [4, 2, 4, 3, "R"],
   [2, 4, 3, 4, "Y"], [3, 2, 4, 2, "Y"], [4, 5, 5, 5, "Y"],
   [1, 2, 2, 2, "G"], [1, 5, 2, 5, "G"], [5, 1, 5, 2, "G"],
];

export const GATES = ["R", "Y", "G"];
export const GATE_NAME = { R: "RED", Y: "YELLOW", G: "GREEN" };
export const REGION_NAME = ["Lobby", "West wing", "Core", "East wing"];

export const TICKER = [
   "Wait until 007 to restore more powers to see more of the map.",
   "Dont forget to use the special items.",
   "Yellow is the exit... surely?",
   "Make sure to use doors to your advantage.",
   "The Abomination is fat, it moves much slower than Agent 007.",
   "Agent 014 is on PC. Agent 007 is in danger.",
];

export const edgeKey = (c, r, c2, r2) => {
   if (c > c2 || (c === c2 && r > r2)) return edgeKey(c2, r2, c, r);
   return c + "," + r + "," + c2 + "," + r2;
};

export const PASSAGE = new Set();
export const EDGE_DOOR = {};
for (let e of EDGES) {
   let k = edgeKey(e[0], e[1], e[2], e[3]);
   if (e[4]) EDGE_DOOR[k] = e[4];
   else PASSAGE.add(k);
}

export const ITEMS = [
   { kind: "bat", c: 2, r: 0 },
   { kind: "bat", c: 5, r: 1 },
   { kind: "bat", c: 1, r: 5 },
   { kind: "bat", c: 0, r: 5 },
   { kind: "bat", c: 2, r: 4 },
   { kind: "bat", c: 5, r: 4 },
   { kind: "stun", c: 1, r: 1 },
   { kind: "stun", c: 3, r: 5 },
   { kind: "stun", c: 4, r: 4 },
   { kind: "fast", c: 3, r: 0 },
   { kind: "fast", c: 0, r: 2 },
   { kind: "fast", c: 5, r: 2 },
];

export const GENERATORS = [
   { region: 1, c: 0, r: 3, name: "WEST" },
   { region: 2, c: 2, r: 3, name: "CORE" },
   { region: 3, c: 5, r: 3, name: "EAST" },
];

export const nextGenerator = s => {
   for (let g of GENERATORS) if (!s || !s.shown || !s.shown[g.region]) return g;
   return null;
};

export const roomContents = (c, r, s) => {
   let tags = [];
   if (s && s.items)
      for (let i = 0; i < ITEMS.length; i++)
         if (ITEMS[i].c === c && ITEMS[i].r === r && s.items[i]) tags.push(ITEMS[i].kind);
   for (let g of GENERATORS) if (g.c === c && g.r === r) tags.push("gen");
   return tags;
};

export const stunned = s => !!(s && s.stunUntil && Date.now() < s.stunUntil);

export const center = (c, r) => [c * CELL, 0.35 - r * CELL];
export const MONSTER_HOME = center(5, 4);
export const regionOf = (c, r) => r <= 1 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : 3;

export const doors = () => {
   let out = { R: [], Y: [], G: [] };
   for (let e of EDGES) {
      if (!e[4]) continue;
      let a = center(e[0], e[1]), b = center(e[2], e[3]);
      out[e[4]].push({
         x: (a[0] + b[0]) / 2,
         z: (a[1] + b[1]) / 2,
         regions: [regionOf(e[0], e[1]), regionOf(e[2], e[3])],
      });
   }
   return out;
};

export const playerPos = s => (s && typeof s.px === "number") ? [s.px, s.pz] : null;

export const cellAt = (x, z) => {
   let best = [0, 0], bd = 1e9;
   for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
         let p = center(c, r);
         let d = (p[0] - x) * (p[0] - x) + (p[1] - z) * (p[1] - z);
         if (d < bd) { bd = d; best = [c, r]; }
      }
   return best;
};

const neighbors = (c, r, gates) => {
   let out = [];
   for (let d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let c2 = c + d[0], r2 = r + d[1];
      if (c2 < 0 || r2 < 0 || c2 >= COLS || r2 >= ROWS) continue;
      let k = edgeKey(c, r, c2, r2);
      let gate = EDGE_DOOR[k];
      if (gate) { if (gates[gate]) out.push([c2, r2]); }
      else if (PASSAGE.has(k)) out.push([c2, r2]);
   }
   return out;
};

export const nextCell = (from, to, gates) => {
   if (from[0] === to[0] && from[1] === to[1]) return null;
   let q = [from];
   let prev = new Map();
   prev.set(from[0] + "," + from[1], null);
   let found = false;
   while (q.length) {
      let cur = q.shift();
      if (cur[0] === to[0] && cur[1] === to[1]) { found = true; break; }
      for (let n of neighbors(cur[0], cur[1], gates)) {
         let k = n[0] + "," + n[1];
         if (prev.has(k)) continue;
         prev.set(k, cur);
         q.push(n);
      }
   }
   if (!found) {
      let best = null;
      let tp = center(to[0], to[1]);
      let bd = Math.hypot(center(from[0], from[1])[0] - tp[0], center(from[0], from[1])[1] - tp[1]);
      for (let n of neighbors(from[0], from[1], gates)) {
         let p = center(n[0], n[1]);
         let d = Math.hypot(p[0] - tp[0], p[1] - tp[1]);
         if (d < bd - 0.05) { bd = d; best = n; }
      }
      return best;
   }
   let cur = to;
   let parent = prev.get(to[0] + "," + to[1]);
   while (parent && !(parent[0] === from[0] && parent[1] === from[1])) {
      cur = parent;
      parent = prev.get(parent[0] + "," + parent[1]);
   }
   return cur;
};

export const fresh = epoch => ({
   boot: BOOT,
   epoch,
   phase: "ready",
   endsAt: 0,
   frozen: SHIFT,
   gates: { R: 1, Y: 0, G: 0 },
   shown: [1, 0, 0, 0],
   mx: MONSTER_HOME[0],
   mz: MONSTER_HOME[1],
   px: null,
   pz: null,
   r007: 0,
   r014: 0,
   countAt: 0,
   power: START_POWER,
   powerAt: 0,
   items: ITEMS.map(() => 1),
   stunUntil: 0,
   feed: ["Cameras up. Agent 007 is not on them yet."],
   rev: 1,
});

export const powerNow = s => {
   if (!s) return 0;
   let p = typeof s.power === "number" ? s.power : START_POWER;
   if (s.phase !== "play" || !s.powerAt) return Math.max(0, Math.min(100, p));
   return Math.max(0, p - (Date.now() - s.powerAt) / 1000 / SEC_PER_PERCENT);
};

export const setPower = (s, next) => {
   s.power = Math.max(0, Math.min(100, next));
   s.powerAt = s.phase === "play" ? Date.now() : 0;
};

export const timeLeft = s => {
   if (!s || s.phase === "ready" || s.phase === "count")
      return (s && typeof s.power === "number" ? s.power : START_POWER) * SEC_PER_PERCENT;
   if (s.phase === "play") return powerNow(s) * SEC_PER_PERCENT;
   return s.frozen || 0;
};

export const countDigit = s => {
   if (!s || s.phase !== "count" || !s.countAt) return 0;
   let left = s.countAt + COUNT_MS - Date.now();
   if (left <= 0) return 1;
   return Math.min(5, Math.max(1, Math.ceil(left / 1000)));
};

const wingsLit = s => (s && s.shown ? s.shown.reduce((a, b) => a + (b ? 1 : 0), 0) : 0);

export const rating = s => {
   if (!s || s.phase === "ready" || s.phase === "count") return 0;
   let sc = Math.ceil(timeLeft(s)) * 2 + wingsLit(s) * 80;
   if (s.phase === "win") sc += 500;
   return Math.max(0, sc);
};

export const fmt = t => {
   t = Math.max(0, Math.ceil(t));
   let m = t / 60 | 0, sec = t % 60;
   return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
};

const gapOf = s => {
   let p = playerPos(s);
   return p ? Math.hypot(p[0] - s.mx, p[1] - s.mz) : 99;
};

export const wingLine = s => {
   let live = [], dark = [];
   for (let i = 0; i < 4; i++) (s.shown[i] ? live : dark).push(REGION_NAME[i].toUpperCase());
   return "ON THE MAP: " + live.join(", ") + (dark.length ? ". STILL DARK: " + dark.join(", ") : ".");
};

export const objective = s => {
   if (s.phase === "count") return "Lockdown in " + countDigit(s) + ".";
   if (s.phase === "ready") {
      if (s.r007 && s.r014) return "Both agents are ready.";
      if (s.r007) return "Agent 007 is ready. Waiting for Agent 014.";
      if (s.r014) return "Agent 014 is ready. Waiting for Agent 007.";
      return "Both agents press READY. Then the lockdown begins in 5.";
   }
   if (s.phase === "win") return "Agent 007 reached the way out. The Abomination did not.";
   if (s.phase === "lose") return s.caught ? "The Abomination caught Agent 007." : "Time ran out. Agent 007 is still inside.";
   let d = gapOf(s);
   if (d < 2.6) return "The Abomination is close. Shut the color between them.";
   if (powerNow(s) <= 25) return "Power is low. A battery in a lit room is worth 50% once 007 uses it.";
   if (stunned(s)) return "The Abomination is stunned.";
   if (s.gates.R) return "Red is open. That is the Abomination's way across the south. Slam it once 007 is clear.";
   if (!s.shown[3]) return "East is still dark. The exit is in there. 007 has to restore the power.";
   if (!s.gates.Y) return "Yellow opens the exit, and every other yellow door with it.";
   return "Keep Agent 007 moving toward the green cell while yellow is open.";
};

export const hudLine = s => {
   if (s.phase === "count") return "LOCKDOWN IN " + countDigit(s);
   if (s.phase === "ready") {
      if (s.r007 && !s.r014) return "007 IS READY. WAITING FOR 014.";
      if (!s.r007 && s.r014) return "014 IS READY. 007, PRESS READY.";
      return "007, PRESS READY. 014 MUST TOO.";
   }
   if (s.phase === "win") return "007 IS OUT. THE ABOMINATION IS NOT.";
   if (s.phase === "lose") return s.caught ? "THE ABOMINATION CAUGHT 007" : "TIME IS UP";
   let d = gapOf(s);
   if (d < SIGHT) return "IT IS CLOSE. MOVE.";
   if (stunned(s)) return "THE ABOMINATION IS STUNNED.";
   if (powerNow(s) <= 25) return "POWER IS LOW. GRAB A BATTERY.";
   if (d < 5) return "IT IS GAINING. ASK 014 WHICH GATE.";
   return "WIRE A PANEL. 014 CANNOT SEE THOSE DOORS.";
};

export const isMaster = () => !!(window.clients && window.clients.length &&
   window.clientID == window.clients[0]);

export const adoptState = bag => {
   let server = window.server;
   let s = server.synchronize("wrongWay");
   if (!window.clients || window.clientID === undefined) return null;
   if (isMaster()) {
      if (!bag.claimed) { bag.claimed = true; bag.epoch = Date.now(); }
      if (!s || s.boot !== BOOT || s.epoch !== bag.epoch) {
         if (!bag.good) bag.good = fresh(bag.epoch);
         window.wrongWay = bag.good;
         server.broadcastGlobal("wrongWay");
         s = bag.good;
      } else bag.good = s;
   } else if (!s || s.boot !== BOOT || !s.epoch) return null;
   if (!s.gates) s.gates = { R: 1, Y: 0, G: 0 };
   if (!s.shown) s.shown = [1, 0, 0, 0];
   if (!s.r007) s.r007 = 0;
   if (!s.r014) s.r014 = 0;
   if (!s.countAt) s.countAt = 0;
   if (typeof s.power !== "number") s.power = START_POWER;
   if (!s.items || s.items.length !== ITEMS.length) s.items = ITEMS.map(() => 1);
   if (!s.stunUntil) s.stunUntil = 0;
   return s;
};

export const ended = s => !!(s && (s.phase === "win" || s.phase === "lose"));

// Either agent can ask. Only the first client replaces the shared round,
// so both windows land on the same fresh state.
export const takeReset = (bag, s) => {
   if (!isMaster() || !s || !s.askReset || !ended(s)) return s;
   let epoch = Date.now();
   bag.claimed = true;
   bag.epoch = epoch;
   bag.good = fresh(epoch);
   window.wrongWay = bag.good;
   if (window.server) window.server.broadcastGlobal("wrongWay");
   return bag.good;
};

export const tickLobby = s => {
   if (!s) return null;
   if (s.phase === "ready" && s.r007 && s.r014) {
      s.phase = "count";
      s.countAt = Date.now();
      return "count";
   }
   if (s.phase === "count" && s.countAt && Date.now() >= s.countAt + COUNT_MS) {
      s.phase = "play";
      s.powerAt = Date.now();
      s.endsAt = s.powerAt + powerNow(s) * SEC_PER_PERCENT * 1000;
      return "play";
   }
   return null;
};

export const stepMonster = (s, dt) => {
   if (stunned(s)) return;
   let pos = playerPos(s);
   if (!pos) return;
   let from = cellAt(s.mx, s.mz);
   let to = cellAt(pos[0], pos[1]);
   let dest = null;
   if (from[0] === to[0] && from[1] === to[1]) dest = pos;
   else {
      let hop = nextCell(from, to, s.gates);
      if (hop) dest = center(hop[0], hop[1]);
   }
   if (!dest) return;
   let dx = dest[0] - s.mx, dz = dest[1] - s.mz;
   let dist = Math.hypot(dx, dz);
   if (dist < 0.04) return;
   let k = Math.min(1, MONSTER_SPEED * dt / dist);
   s.mx += dx * k;
   s.mz += dz * k;
};

export const tickMaster = (s, dt) => {
   if (!s || s.phase !== "play") return null;
   stepMonster(s, dt);
   let pos = playerPos(s);
   if (!stunned(s) && pos && Math.hypot(pos[0] - s.mx, pos[1] - s.mz) < 0.75) {
      s.frozen = timeLeft(s);
      s.phase = "lose";
      s.caught = 1;
      return "caught";
   }
   if (timeLeft(s) <= 0) {
      s.phase = "lose";
      s.caught = 0;
      s.frozen = 0;
      return "time";
   }
   return null;
};

export const drawMap = (canvas, state) => {
   let doorGeom = doors();
   let pos = playerPos(state);
   let ctx = canvas.getContext("2d");
   let W = canvas.width, H = canvas.height;
   let minX = -CELL * .7, maxX = (COLS - 1) * CELL + CELL * .7;
   let minZ = 0.35 - (ROWS - 1) * CELL - CELL * .7;
   let maxZ = 0.35 + CELL * .7;
   let pad = 28;
   const pt = (x, z) => {
      let u = (x - minX) / (maxX - minX);
      let v = (z - minZ) / (maxZ - minZ);
      return [pad + u * (W - pad * 2), pad + v * (H - pad * 2)];
   };
   const known = (c, r) => !!(state.shown && state.shown[regionOf(c, r)]);
   ctx.clearRect(0, 0, W, H);
   ctx.fillStyle = "#0c0d12";
   ctx.fillRect(0, 0, W, H);
   ctx.fillStyle = "#f2ff6a";
   ctx.font = "18px Courier New";
   ctx.fillText("N", W / 2 - 6, 20);
   for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
         if (!known(c, r)) continue;
         let p = center(c, r);
         let a = pt(p[0] - CELL / 2 + 0.06, p[1] - CELL / 2 + 0.06);
         let b = pt(p[0] + CELL / 2 - 0.06, p[1] + CELL / 2 - 0.06);
         let x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
         let w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
         let reg = regionOf(c, r);
         ctx.fillStyle = (c === EXIT[0] && r === EXIT[1]) ? "#2f8f45"
            : (c === 0 && r === 0) ? "#c4a24a"
            : reg === 1 ? "#2a4a72" : reg === 2 ? "#4a3470" : reg === 3 ? "#1f5a48" : "#1d4c56";
         ctx.fillRect(x, y, w, h);
      }
   }
   ctx.lineWidth = 7;
   ctx.strokeStyle = "#101018";
   const strokeEdge = (c, r, c2, r2) => {
      let a = center(c, r), b = center(c2, r2);
      let p = pt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      let horiz = r === r2;
      ctx.beginPath();
      if (horiz) { ctx.moveTo(p[0], p[1] - 16); ctx.lineTo(p[0], p[1] + 16); }
      else { ctx.moveTo(p[0] - 16, p[1]); ctx.lineTo(p[0] + 16, p[1]); }
      ctx.stroke();
   };
   for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
         if (c + 1 < COLS && (known(c, r) || known(c + 1, r)) && !PASSAGE.has(edgeKey(c, r, c + 1, r)) && !EDGE_DOOR[edgeKey(c, r, c + 1, r)])
            strokeEdge(c, r, c + 1, r);
         if (r + 1 < ROWS && (known(c, r) || known(c, r + 1)) && !PASSAGE.has(edgeKey(c, r, c, r + 1)) && !EDGE_DOOR[edgeKey(c, r, c, r + 1)])
            strokeEdge(c, r, c, r + 1);
      }
   const ink = { R: "#ff5a4a", Y: "#f0c43a", G: "#3dce62" };
   ctx.lineWidth = 3;
   for (let id of GATES) {
      for (let d of doorGeom[id]) {
         if (!d.regions.some(reg => state.shown && state.shown[reg])) continue;
         let p = pt(d.x, d.z);
         let open = !!state.gates[id];
         ctx.beginPath();
         ctx.rect(p[0] - 11, p[1] - 11, 22, 22);
         if (open) { ctx.strokeStyle = ink[id]; ctx.stroke(); }
         else { ctx.fillStyle = ink[id]; ctx.fill(); }
         ctx.fillStyle = open ? ink[id] : "#140c0c";
         ctx.font = "bold 13px Courier New";
         ctx.fillText(id, p[0] - 4, p[1] + 4);
      }
   }
   if (pos) {
      let p = pt(pos[0], pos[1]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
      ctx.fillStyle = "#d8f4ff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#1a6ea8";
      ctx.stroke();
   } else {
      ctx.fillStyle = "#ffb020";
      ctx.font = "16px Courier New";
      ctx.fillText("007 NOT ON CAMERA", 12, H - 16);
   }
   let m = pt(state.mx, state.mz);
   ctx.save();
   ctx.translate(m[0], m[1]);
   ctx.rotate(Math.PI / 4);
   ctx.fillStyle = "#ff3b30";
   ctx.fillRect(-9, -9, 18, 18);
   ctx.lineWidth = 2;
   ctx.strokeStyle = "#fff";
   ctx.strokeRect(-9, -9, 18, 18);
   ctx.restore();
};
