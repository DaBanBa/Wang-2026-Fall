import {
   GATES, GATE_NAME, COLS, ROWS, EXIT,
   PASSAGE, EDGE_DOOR, edgeKey, cellAt, regionOf,
   adoptState, fmt, isMaster, tickMaster, tickLobby, timeLeft, playerPos, countDigit, ended, takeReset,
   powerNow, setPower, DOOR_COST, roomContents, nextGenerator,
} from "./shared.js";

window.server = new Server(2024);
window.isMasterClient = () => isMaster();

let s = null;
let bag = { claimed: false, epoch: 0, good: null };
let lastMon = 0;
let now = performance.now();

const say = text => {
   if (!s) return;
   s.feed = (s.feed || []).concat(text).slice(-4);
   s.rev = (s.rev | 0) + 1;
   server.broadcastGlobal("wrongWay");
};

let want014 = false;
let wantReset = false;
let round = 0;

const toggleGate = id => {
   if (!s || s.phase !== "play") {
      if (s && (s.phase === "ready" || s.phase === "count")) say("Not yet. Wait for the lockdown.");
      return;
   }
   let juice = powerNow(s);
   if (juice < DOOR_COST) {
      say("Not enough power.");
      return;
   }
   setPower(s, juice - DOOR_COST);
   s.gates[id] = s.gates[id] ? 0 : 1;
   say(GATE_NAME[id] + (s.gates[id] ? " OPEN" : " SHUT") + ". Power " + Math.round(s.power) + "%.");
};

const buttons = {};
const doorBox = document.getElementById("wwo-doors");
for (let id of GATES) {
   let b = document.createElement("button");
   b.type = "button";
   b.className = "gate-" + id;
   b.addEventListener("click", () => toggleGate(id));
   doorBox.appendChild(b);
   buttons[id] = b;
}
let guideOpen = true;
const notebook = document.getElementById("notebook");
const notesTab = document.getElementById("notes-tab");
const setGuide = open => {
   guideOpen = open;
   notebook.style.display = open ? "block" : "none";
   notesTab.style.display = open ? "none" : "block";
};
notebook.addEventListener("click", () => setGuide(false));
notesTab.addEventListener("click", () => setGuide(true));
const readyBtn = document.getElementById("wwo-ready");
readyBtn.addEventListener("click", e => {
   e.stopPropagation();
   want014 = true;
});
const resetBtn = document.getElementById("wwo-reset");
resetBtn.addEventListener("click", e => {
   e.stopPropagation();
   wantReset = true;
});
window.addEventListener("keydown", e => {
   if (e.repeat || guideOpen) return;
   if (e.key === "1") toggleGate("R");
   if (e.key === "2") toggleGate("Y");
   if (e.key === "3") toggleGate("G");
});

const ecgY = p => {
   const bump = (center, width, height) => {
      let d = Math.abs(p - center);
      return d > width ? 0 : height * (1 - d / width);
   };
   return bump(0.16, 0.035, 0.16)
      - bump(0.36, 0.02, 0.22)
      + bump(0.44, 0.025, 1)
      - bump(0.52, 0.02, 0.32)
      + bump(0.66, 0.055, 0.26);
};

const vitalColor = (dist, frozen) => {
   if (frozen) return "rgb(126,182,255)";
   let t = dist == null ? 0 : 1 - Math.min(1, Math.max(0, dist) / 10);
   let r = Math.round(61 + (226 - 61) * t);
   let g = Math.round(206 + (59 - 206) * t);
   let b = Math.round(74 + (50 - 74) * t);
   return "rgb(" + r + "," + g + "," + b + ")";
};

const drawVital = (dist, frozen) => {
   const canvas = document.getElementById("wwo-vital");
   const ctx = canvas.getContext("2d");
   const w = canvas.width, h = canvas.height;
   ctx.clearRect(0, 0, w, h);
   let near = dist == null ? 0 : 1 - Math.min(1, Math.max(0, dist) / 10);
   let period = dist == null ? 1.5 : 0.22 + (1 - near) * 1.15;
   if (frozen) period = 1.6;
   let color = vitalColor(dist, frozen);
   ctx.strokeStyle = color;
   ctx.lineWidth = 2;
   ctx.beginPath();
   let now = performance.now() / 1000;
   let phase0 = now / period;
   let amp = frozen ? 0.4 : near * near * 7;
   for (let x = 0; x < w; x++) {
      let y = h * 0.62 - ecgY((phase0 + x / w) % 1) * (h * 0.46);
      y += Math.sin(x * 0.55 + now * 18) * amp + Math.sin(x * 1.4 + now * 27) * amp * 0.45;
      if (x) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
   }
   ctx.stroke();
   for (let part of document.querySelectorAll("#wwo-agent .agent")) part.setAttribute("fill", color);
};

const camName = (c, r) => String.fromCharCode(65 + c) + (r + 1);

const drawIcon = (ctx, kind, x, y, scale, dark) => {
   ctx.save();
   ctx.translate(x, y);
   ctx.scale(scale, scale);
   if (kind === "bat") {
      ctx.fillStyle = dark ? "#143018" : "#3dce4a";
      ctx.fillRect(-5, -7, 10, 16);
      ctx.fillRect(-3, -10, 6, 4);
      ctx.fillStyle = dark ? "#0c1c10" : "#102014";
      ctx.fillRect(-3, -1, 6, 4);
   } else if (kind === "stun") {
      ctx.fillStyle = dark ? "#16304a" : "#7eb6ff";
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
         let a = i * Math.PI / 4 - Math.PI / 2;
         let r = i % 2 ? 4 : 10;
         let px = Math.cos(a) * r, py = Math.sin(a) * r;
         if (i) ctx.lineTo(px, py);
         else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
   } else if (kind === "fast") {
      ctx.fillStyle = dark ? "#4a240c" : "#ff8a2a";
      let arrow = ox => {
         ctx.beginPath();
         ctx.moveTo(ox - 7, -6);
         ctx.lineTo(ox + 2, 0);
         ctx.lineTo(ox - 7, 6);
         ctx.closePath();
         ctx.fill();
      };
      arrow(-2);
      arrow(6);
   } else {
      ctx.fillStyle = dark ? "#4a3c10" : "#e2c043";
      ctx.beginPath();
      ctx.moveTo(3, -10);
      ctx.lineTo(-5, 1);
      ctx.lineTo(-1, 1);
      ctx.lineTo(-3, 10);
      ctx.lineTo(6, -1);
      ctx.lineTo(2, -1);
      ctx.closePath();
      ctx.fill();
   }
   ctx.restore();
};

const drawMonster = (ctx, x, y, scale) => {
   ctx.save();
   ctx.translate(x, y);
   ctx.scale(scale, scale);
   ctx.fillStyle = "#e23b32";
   ctx.beginPath();
   ctx.arc(0, -1, 6, 0, Math.PI * 2);
   ctx.fill();
   ctx.fillRect(-5, 2, 10, 7);
   ctx.fillRect(-1, -12, 2, 6);
   ctx.beginPath();
   ctx.arc(0, -13, 2.2, 0, Math.PI * 2);
   ctx.fill();
   ctx.fillStyle = "#ffe14a";
   ctx.beginPath();
   ctx.arc(-2.4, -1, 1.5, 0, Math.PI * 2);
   ctx.arc(2.4, -1, 1.5, 0, Math.PI * 2);
   ctx.fill();
   ctx.restore();
};

const drawIcons = (ctx, tags, cx, cy, scale, dark) => {
   let gap = 22 * scale;
   let x0 = cx - (tags.length - 1) * gap / 2;
   for (let i = 0; i < tags.length; i++) drawIcon(ctx, tags[i], x0 + i * gap, cy, scale, dark);
};

const drawCams = (canvas, state) => {
   const ctx = canvas.getContext("2d");
   const W = canvas.width, H = canvas.height;
   const boxW = 86, boxH = 64, gapX = 48, gapY = 28;
   const ox = (W - (COLS * boxW + (COLS - 1) * gapX)) / 2;
   const oy = 16;
   const at = (c, r) => ({
      x: ox + c * (boxW + gapX),
      y: oy + r * (boxH + gapY),
      w: boxW,
      h: boxH,
   });
   let mc = state && typeof state.mx === "number" ? cellAt(state.mx, state.mz) : null;
   const known = (c, r) => {
      if (!state || !state.shown) return false;
      if (mc && mc[0] === c && mc[1] === r) return true;
      if (c === EXIT[0] && r === EXIT[1]) return true;
      return !!state.shown[regionOf(c, r)];
   };
   ctx.fillStyle = "#070707";
   ctx.fillRect(0, 0, W, H);

   ctx.lineWidth = 3;
   ctx.strokeStyle = "#f4f4f4";
   ctx.fillStyle = "#f4f4f4";
   ctx.font = "bold 13px Courier New";
   ctx.textAlign = "center";
   ctx.textBaseline = "middle";

   const link = (c, r, c2, r2) => {
      if (!state || (!known(c, r) && !known(c2, r2))) return;
      let a = at(c, r), b = at(c2, r2);
      let horiz = r === r2;
      let x1 = horiz ? a.x + a.w : a.x + a.w / 2;
      let y1 = horiz ? a.y + a.h / 2 : a.y + a.h;
      let x2 = horiz ? b.x : b.x + b.w / 2;
      let y2 = horiz ? b.y + b.h / 2 : b.y;
      let key = edgeKey(c, r, c2, r2);
      let gate = EDGE_DOOR[key];
      if (!PASSAGE.has(key) && !gate) return;
      let open = !gate || !!(state.gates && state.gates[gate]);
      let mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const GATE_COLOR = { R: "#e23b32", Y: "#e2c043", G: "#6fbf3a" };
      ctx.lineWidth = gate ? 6 : 3;
      ctx.strokeStyle = gate ? GATE_COLOR[gate] : "#f4f4f4";
      ctx.beginPath();
      if (!gate || open) {
         ctx.moveTo(x1, y1);
         ctx.lineTo(x2, y2);
      } else if (horiz) {
         ctx.moveTo(x1, y1);
         ctx.lineTo(mx - 16, y1);
         ctx.moveTo(mx + 16, y2);
         ctx.lineTo(x2, y2);
      } else {
         ctx.moveTo(x1, y1);
         ctx.lineTo(x1, my - 14);
         ctx.moveTo(x2, my + 14);
         ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      if (!gate) return;
      ctx.fillStyle = open ? GATE_COLOR[gate] : "#070707";
      ctx.fillRect(mx - 15, my - 13, 30, 26);
      ctx.strokeStyle = GATE_COLOR[gate];
      ctx.lineWidth = 3;
      ctx.strokeRect(mx - 15, my - 13, 30, 26);
      ctx.fillStyle = open ? "#111" : GATE_COLOR[gate];
      ctx.font = "bold 16px Courier New";
      ctx.fillText(gate, mx, my);
   };

   for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
         if (c + 1 < COLS) link(c, r, c + 1, r);
         if (r + 1 < ROWS) link(c, r, c, r + 1);
      }

   let pos = state ? playerPos(state) : null;
   let pc = pos ? cellAt(pos[0], pos[1]) : null;

   for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
         let seen = known(c, r);
         let here = pc && pc[0] === c && pc[1] === r;
         let it = mc && mc[0] === c && mc[1] === r;
         if (!seen && !here && !it) continue;
         let b = at(c, r);
         let exit = c === EXIT[0] && r === EXIT[1];
         ctx.fillStyle = here ? "#6fbf3a" : exit ? "#1c4a30" : "#2a2a2a";
         ctx.fillRect(b.x, b.y, b.w, b.h);
         ctx.strokeStyle = it && !here ? "#e23b32" : exit ? "#6fbf3a" : "#f4f4f4";
         ctx.lineWidth = (it && !here) || exit ? 4 : 3;
         ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
         ctx.fillStyle = here ? "#111" : "#f4f4f4";
         let tags = seen ? roomContents(c, r, state) : [];
         let label = seen ? camName(c, r) : (here ? "007" : "");
         if (seen && c === EXIT[0] && r === EXIT[1]) label = "Exit";
         let foot = here || (it && seen);
         ctx.font = "bold 14px Courier New";
         if (label) ctx.fillText(label, b.x + b.w / 2, b.y + ((tags.length || foot) ? 14 : b.h / 2));
         if (tags.length)
            drawIcons(ctx, tags, b.x + b.w / 2, b.y + b.h / 2 + (foot ? 0 : 6), 0.85, !!here);
         if (here && label !== "007") {
            ctx.fillStyle = "#111";
            ctx.font = "bold 11px Courier New";
            ctx.fillText("007", b.x + (it ? 18 : b.w / 2), b.y + b.h - 12);
         }
         if (it) drawMonster(ctx, b.x + b.w / 2, b.y + b.h / 2 + (here ? 4 : 8), 1.15);
      }

   let nxt = state ? nextGenerator(state) : null;
   if (nxt && !known(nxt.c, nxt.r)) {
      let b = at(nxt.c, nxt.r);
      let here = pc && pc[0] === nxt.c && pc[1] === nxt.r;
      let it = mc && mc[0] === nxt.c && mc[1] === nxt.r;
      ctx.fillStyle = "#1a1408";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = "#e2c043";
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3);
      drawIcon(ctx, "gen", b.x + b.w / 2, b.y + 18, 1.15, false);
      ctx.fillStyle = "#e2c043";
      ctx.font = "bold 12px Courier New";
      ctx.fillText(nxt.name, b.x + b.w / 2, b.y + 38);
      if (here) {
         ctx.fillStyle = "#6fbf3a";
         ctx.font = "bold 11px Courier New";
         ctx.fillText("007", b.x + b.w / 2 + (it ? -14 : 0), b.y + b.h - 11);
      }
      if (it) drawMonster(ctx, b.x + b.w / 2 + (here ? 14 : 0), b.y + b.h - 12, 0.7);
   }

   if (!pos) {
      ctx.fillStyle = "#f4f4f4";
      ctx.font = "bold 16px Courier New";
      ctx.textAlign = "left";
      ctx.fillText("007 NOT ON CAMERA", 16, H - 28);
      ctx.textAlign = "center";
   }
};

const paint = () => {
   const canvas = document.getElementById("wwo-map");
   if (!s) {
      drawCams(canvas, null);
      drawVital(null, false);
      document.getElementById("wwo-log").textContent = guideOpen ? "" : "NO SIGNAL";
      document.getElementById("wwo-night").textContent = "NO SIGNAL";
      return;
   }
   let left = timeLeft(s);
   let pct = Math.max(0, Math.min(100, Math.round(powerNow(s))));
   document.getElementById("wwo-time").textContent = fmt(left);
   document.getElementById("wwo-time").style.color = s.phase === "play" && pct < 20 ? "#e23b32" : "#f4f4f4";
   document.getElementById("wwo-power").textContent = pct + "%";
   let fill = document.getElementById("wwo-battery-fill");
   fill.style.height = pct + "%";
   fill.classList.toggle("low", pct < 20);
   fill.classList.toggle("mid", pct >= 20 && pct < 50);
   document.getElementById("wwo-night").textContent = s.phase === "count"
      ? String(countDigit(s))
      : s.phase === "ready" ? "STANDBY" : s.phase === "play" ? "LOCKDOWN" : s.phase === "win" ? "OUT" : "DOWN";
   readyBtn.style.display = s.phase === "ready" ? "block" : "none";
   readyBtn.disabled = want014;
   readyBtn.classList.toggle("on", want014);
   readyBtn.textContent = want014 ? (s.r007 ? "READY" : "WAITING FOR 007") : "READY";
   let countEl = document.getElementById("wwo-count");
   if (s.phase === "count") {
      countEl.style.display = "flex";
      countEl.textContent = String(countDigit(s));
   } else countEl.style.display = "none";
   let pos = playerPos(s);
   let dist = pos ? Math.hypot(pos[0] - s.mx, pos[1] - s.mz) : null;
   drawVital(dist, !!(s.stunUntil && s.stunUntil > Date.now()));
   const lookOpen = { R: true, Y: true, G: true };
   for (let id of GATES) {
      let b = buttons[id];
      let open = !!s.gates[id];
      b.textContent = id + (open ? "  OPEN" : "  SHUT");
      b.disabled = s.phase !== "play";
      b.classList.toggle("open", open && lookOpen[id]);
   }
   let stunLeft = s.stunUntil ? Math.ceil((s.stunUntil - Date.now()) / 1000) : 0;
   document.getElementById("wwo-log").textContent = s.phase === "play" && stunLeft > 0
      ? ("Abomination stunned. " + stunLeft + ".")
      : s.phase === "count"
      ? ("Lockdown in " + countDigit(s) + ".")
      : s.phase === "ready"
      ? (s.r007 && s.r014 ? "Both ready."
         : s.r007 ? "Agent 007 is ready. Waiting for Agent 014."
         : s.r014 ? "Agent 014 is ready. Waiting for Agent 007."
         : "Waiting for both agents to press READY.")
      : ((s.feed || []).slice(-1)[0] || "");
   let end = document.getElementById("wwo-end");
   if (s.phase === "win" || s.phase === "lose") {
      end.style.display = "flex";
      document.getElementById("wwo-end-title").textContent = s.phase === "win" ? "OUT" : (s.caught ? "CAUGHT" : "POWER OUT");
      document.getElementById("wwo-end-body").textContent = s.phase === "win"
         ? "Agent 007 is out. Agent 014 still has the tapes."
         : (s.caught ? "The Abomination caught Agent 007." : "The building went dark with Agent 007 still inside.");
   } else end.style.display = "none";
   drawCams(canvas, s);
};

const noteRound = () => {
   if (!s || s.epoch === round) return;
   if (round) want014 = false;
   round = s.epoch;
   wantReset = false;
};

const frame = t => {
   let dt = Math.min(0.05, (t - now) / 1000 || 0.016);
   now = t;
   s = adoptState(bag);
   if (s) noteRound();
   if (want014 && s && s.phase === "ready") s.r014 = 1;
   if (wantReset && ended(s)) s.askReset = 1;
   if (s && !isMaster()) {
      let live = window.wrongWay;
      if (live && live !== s && live.epoch === s.epoch) {
         if (want014 && live.phase === "ready") live.r014 = 1;
         if (wantReset) live.askReset = 1;
         if (s.powerAt && (!live.powerAt || s.powerAt >= live.powerAt)) {
            live.power = s.power;
            live.powerAt = s.powerAt;
            live.gates = { R: s.gates.R, Y: s.gates.Y, G: s.gates.G };
         }
         s = live;
      }
   }
   if (s && isMaster()) {
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
      else if ((s.phase === "play" || want014) && t - lastMon > 30) {
         lastMon = t;
         server.broadcastGlobal("wrongWay");
      }
   } else if (s && ((want014 && s.phase === "ready") || (wantReset && ended(s))) && t - lastMon > 50) {
      lastMon = t;
      server.broadcastGlobal("wrongWay");
   }
   paint();
   requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
