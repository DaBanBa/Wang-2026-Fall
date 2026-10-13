//   game scene

//   Turn on AI mode, look at someone, a green circle will appear and wrap
//   around them. If their face is in your "collection," a floating panel will
//   show you what you know about them.

//   How to run
//   1) ./startserver
//    This will shut down all ports so please run this first.
//   2) js/scenes/ICanSeeYou/backend/run.sh
//      Dont forget (first time)
//         cd js/scenes/ICanSeeYou/backend
//         python3 -m venv .venv && source .venv/bin/activate
//         pip install -r requirements.txt
//   3) Cast Quest to computer, Then Start capture on the Casting tab
//   4) Enter XR on quest and start invading their no no square

//   Controls
//      A (right)            AI mode
//      B (right)            add person
//      X (left)             end conversation + summarizes
//      Y (left)             hide / show Jarvis
//      left stick click     hide / show the profile
//      right stick click    hide / show the transcript

import * as cg from "../../render/core/cg.js";
import {
  buttonState,
  controllerMatrix,
  joyStickState,
} from "../../render/core/controllerInput.js";
import { makeChunkRecorder, blobToB64 } from "./mic.js";
import {
  makePanel,
  makeKeyboard,
  ascii,
  billboard,
  clear,
  addText,
} from "./panel.js";

server.neverLoadOrSave();
server.init("icsyState", {});
server.init("icsyCtl", {});

const TORSO_H = 0.85;
const RING_PAD = 1.15;
const SEG = 40;
const TRANSCRIPT_ROWS = 12; 
const JARVIS_ROWS = 8; 
const HUD_S = 1.05,
  CHIP_S = 0.95;
const BEAM_BEND = Math.PI / 4; 
const STALE_MS = 3000;  

const GREEN = [0.25, 1.5, 0.45],
  PALE = [0.7, 1.3, 0.8],
  AMBER = [1.5, 0.95, 0.2],
  CYAN = [0.3, 1.1, 1.5],
  GRAY = [0.6, 0.6, 0.6],
  WHITE = [0.92, 0.94, 0.96],
  DIM = [0.55, 0.58, 0.62],
  RED = [1.6, 0.25, 0.2];

// format date
const fmtDate = (sec) =>
  new Date(sec * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const isQuest = /OculusBrowser|Quest/.test(navigator.userAgent);

if (isQuest && navigator.mediaDevices)
  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => s.getTracks().forEach((t) => t.stop()))
    .catch(() => {});

// Scene init
export const init = async (model) => {
  const isXR = () => !!(window.isXR && window.isXR());

  let S = null,
    gotAt = 0,
    lastS = null;

  // Keep the latest state message
  const onState = (msgs, from) => {
    if (from == window.clientID) return;
    for (const i in msgs) {
      S = msgs[i];
      gotAt = Date.now();
    }
  };

  // Send a control message
  const ctl = (m) => server.send("icsyCtl", m);

  // head pose history

  let poses = [];

  // Between the eyes. View 0 alone sits left of the passthrough cameras.
  const headNow = () =>
    cg.mMultiply(
      clay.inverseRootMatrix,
      cg.mix(clay.root().inverseViewMatrix(0), clay.root().inverseViewMatrix(1), 0.5),
    );

  // Headset pose from `msAgo`
  const headAt = (msAgo) => {
    const t = Date.now() - msAgo;
    for (let i = poses.length - 1; i >= 0; i--)
      if (poses[i].t <= t) return poses[i].m;
    return poses.length ? poses[0].m : headNow();
  };

  // Cast calibration
  let cal = null,
    calSentAt = 0,
    calDirty = false;

  const depths = {};

  const median = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];

  // Computer square → circle at its center, then send that point back as a torso.
  const place = (id, box, H) => {
    const [x0, y0, x1, y1] = box;
    const aspect = S.fr[1] / S.fr[0],
      fl = cal.fl;
    const bw = Math.max(0.01, x1 - x0),
      bh = Math.max(0.01, (y1 - y0) * aspect);
    let d = (fl * TORSO_H) / bh;
    d = Math.max(0.8, Math.min(6, d));
    const hist = (depths[id] = (depths[id] || []).concat(d).slice(-9));
    d = median(hist);
    const u = (x0 + x1) / 2,
      v = (y0 + y1) / 2;
    const dir = cg.normalize([u - 0.5, -(v - 0.5) * aspect, -fl]);
    const r = Math.max(0.12, ((0.5 * d * Math.max(bw, bh)) / fl) * RING_PAD);
    return { p: cg.mTransform(H, cg.scale(dir, d)), d, r };
  };

  // Normalized [x0,y0,x1,y1]
  const boxOf = (id) => {
    for (const tr of S.tracks || []) if (tr[0] === id) return tr.slice(1);
    return null;
  };

  let targets = { lock: null, cand: null },
    shown = { lock: null, cand: null };

  // Recompute 3D targets
  const retarget = () => {
    if (!cal || (!calDirty && Date.now() - calSentAt > 3000))
      cal = { fl: S.fl, lat: S.lat };
    const H = headAt(Date.now() - gotAt + (S.age || 0) + cal.lat);
    for (const id in depths) if (!boxOf(+id)) delete depths[id];
    for (const key of ["lock", "cand"]) {
      const id =
        key === "lock"
          ? S.lock
            ? S.lock.tid
            : null
          : S.cand
          ? S.cand[0]
          : null;
      if (id === null) {
        targets[key] = null;
        continue;
      }
      const box = boxOf(id);
      if (box)
        targets[key] =
          key === "cand" && targets.lock && targets.lock.id === id
            ? targets.lock
            : { id, ...place(id, box, H) };
      else if (targets[key] && targets[key].id !== id) targets[key] = null;
      if (!targets[key] && key === "lock" && shown.cand && shown.cand.id === id)
        targets.lock = { ...shown.cand };
    }
  };

  // warped the ring so it doesnt jump
  const follow = (key, dt) => {
    const T = targets[key];
    if (!T) return (shown[key] = null);
    let s = shown[key];
    if (!s || s.id !== T.id)
      return (shown[key] = { id: T.id, p: T.p.slice(), d: T.d, r: T.r });
    const a = 1 - Math.exp(-dt * 3.2);
    s.p = cg.mix(s.p, T.p, a);
    s.d += (T.d - s.d) * a;
    s.r += (T.r - s.r) * a;
    return s;
  };

  // Build ring
  const makeRing = () => {
    const root = model.add(),
      segs = [];
    for (let i = 0; i < SEG; i++) segs.push(root.add("cube"));
    return { root, segs };
  };

  // Billboard ring
  const drawRing = (ring, s, eye, fill, rgb, spin = 0, width = 0.025) => {
    if (!s) {
      ring.root.identity().scale(0);
      return;
    }
    billboard(ring.root, s.p, eye).scale(s.r);
    for (let i = 0; i < SEG; i++) {
      const on = i < fill * SEG - 1e-6;
      const a = Math.PI / 2 - ((i + 0.5) / SEG) * 2 * Math.PI + spin;
      ring.segs[i]
        .identity()
        .move(Math.cos(a), Math.sin(a), 0)
        .turnZ(a)
        .scale(on ? width : 0, on ? 0.065 : 0, on ? 0.02 : 0)
        .color(rgb);
    }
  };

  const candRing = makeRing(),
    lockRing = makeRing();

  // Panels

  const card = makePanel(model, {
    cols: 44,
    ts: 0.6,
    title: 1.5,
    titleField: "name",
  });
  const transcript = makePanel(model, { cols: 40, ts: 0.55, grabbable: true });
  const jarvis = makePanel(model, { cols: 36, ts: 0.52, grabbable: true }); // Jarvis activity tab
  const keyboard = makeKeyboard(model);
  const grabbables = [jarvis, transcript];
  let cardHidden = false,
    jarvisOn = true,
    transcriptOn = true;
  let edit = null; 
  const FIELD_DB = {
    name: "name",
    who: "who",
    last: "last_conversation",
    remember: "remember",
    how: "how_we_met",
    web: "news",
  };

  // Place person card
  const placeCard = (s, eye) => {
    const dir = cg.normalize(cg.subtract(s.p, eye));
    const dp = Math.max(0.7, Math.min(1.4, s.d * 0.85));
    const X = cg.normalize(cg.cross([0, 1, 0], cg.scale(dir, -1)));
    let C = cg.add(eye, cg.scale(dir, dp));
    C = cg.add(
      C,
      cg.scale(X, ((s.r * dp) / s.d) * 1.3 + (card.w + 0.02) * dp),
    );
    C = cg.add(C, [0, -0.3 * card.h * dp, 0]);
    card.place(C, eye, dp);
  };

  // Editable rows
  const profileRows = (p) => [
    {
      field: "who",
      label: "WHO THEY ARE",
      value: p.who || (p.researching ? "Looking them up..." : "Just met them."),
    },
    {
      field: "how",
      label: "HOW YOU MET",
      value: p.how || "Point here and type if you want to add this.",
    },
    {
      field: "remember",
      label: "REMEMBER",
      value: p.remember || "Something useful next time.",
    },
    {
      field: "web",
      label: "FROM THE WEB",
      value:
        p.web ||
        (p.researching ? "Looking up public info..." : "Nothing extra from the web yet."),
    },
    {
      field: "last",
      label: "LAST TIME" + (p.last_at ? " (" + fmtDate(p.last_at) + ")" : ""),
      value: p.last || "This is your first conversation.",
    },
  ];

  // Card content
  const cardContent = () => {
    const st = S.lock && S.lock.status;
    if (st === "matched" && S.profile) {
      const p = { ...S.profile };
      if (edit && edit.pid === p.pid) p[edit.field] = edit.value;
      return [(p.name || "NAME").toUpperCase(), GREEN, profileRows(p)];
    }
    if (st === "unknown")
      return [
        "Unknown person",
        AMBER,
        [
          "Not in your collection.",
          "",
          "Press B to add them. Only do this if they agree to be remembered.",
        ],
      ];
    if (st === "enrolling")
      return [
        "Adding new person",
        CYAN,
        [
          "Ask them to slowly turn their head left and right.",
          "",
          [
            `Captured ${S.enroll ? S.enroll[0] : 0} of ${
              S.enroll ? S.enroll[1] : 5
            } angles.`,
            CYAN,
          ],
          "",
          "Press B to cancel.",
        ],
      ];
    if (st === "offline") return ["Recognition offline", GRAY, [S.msg]];
    return null;
  };

  // Wrap colored rows
  const wrapRows = (rows, cols, n) => {
    const flat = [];
    for (const [str, c, marked] of rows)
      for (const l of cg.split(ascii(str), cols).split("\n"))
        flat.push([l, c, marked]);
    return flat.slice(-n);
  };

  // Transcript content
  const transcriptContent = () => {
    const lines = S.transcript || [];
    const who = S.conv
      ? "with " + S.conv
      : lines.length
      ? "not linked to anyone yet"
      : "";
    let rows = lines.map(([, text], i) => {
      const newest = i === lines.length - 1;
      return [text, newest ? WHITE : DIM, newest];
    });
    if (!rows.length) rows = [["Listening... what is said appears here.", DIM]];
    return [
      "TRANSCRIPT" + (who ? "  " + who : ""),
      GREEN,
      wrapRows(rows, 40, TRANSCRIPT_ROWS),
    ];
  };

  // Recent Jarvis activity
  const jarvisContent = () => {
    const lines = S.jarvis || [];
    let rows = lines.map((text, i) => {
      const newest = i === lines.length - 1;
      return [text, newest ? WHITE : DIM, newest];
    });
    if (!rows.length)
      rows = [["Idle. Lookups and profile updates show up here.", DIM]];
    return ["JARVIS", GREEN, wrapRows(rows, 36, JARVIS_ROWS)];
  };

  // Spawn grabbable panel
  const spawn = (panel, H, side, down = 0.1, dist = 0.85) => {
    const eye = H.slice(12, 15);
    const f = cg.normalize([-H[8], 0, -H[10]]);
    const r = cg.normalize(cg.cross(f, [0, 1, 0]));
    panel.pos = cg.add(
      cg.add(eye, cg.scale(f, dist)),
      cg.add(cg.scale(r, side * 0.38), [0, -down, 0]),
    );
  };

  const hitDot = model.add("sphere");
  let drag = null,
    wasXR = false;

  // Controller rays

  const handMat = (hand) => {
    const m = controllerMatrix[hand];
    if (!isXR() || !m || m.length < 16 || !clay.inverseRootMatrix) return null;
    return cg.mMultiply(clay.inverseRootMatrix, m);
  };

  // Pointing ray
  const ray = (hand) => {
    const hm = handMat(hand);
    if (!hm) return null;
    const M = cg.mMultiply(hm, cg.mRotateX(-BEAM_BEND));
    return {
      o: cg.mTransform(M, [0, 0.0212, 0]),
      d: cg.normalize([-M[8], -M[9], -M[10]]),
    };
  };

  // Holding
  const holding = (hand) => {
    const b = buttonState[hand];
    return !!(b && ((b[0] && b[0].pressed) || (b[1] && b[1].pressed)));
  };
  const gripping = (hand) => {
    const b = buttonState[hand];
    return !!(b && b[1] && b[1].pressed);
  };

  // Controller hints

  const hints = {};
  for (const hand of ["left", "right"])
    hints[hand] = { node: model.add(), key: "", w: 0 };
  const HINT_S = 0.42;

  // Draw hint
  const drawHint = (hand, lines, eye) => {
    const h = hints[hand],
      hm = handMat(hand),
      key = lines.join("\n");
    if (!hm || !key) {
      h.node.identity().scale(0);
      return;
    }
    if (key !== h.key) {
      h.key = key;
      clear(h.node);
      h.w = ((Math.max(...lines.map((l) => l.length)) * 0.0254) / 2) * HINT_S;
      h.node
        .add("square")
        .move(0, (-lines.length * 0.0254 * HINT_S) / 2, -0.001)
        .scale(h.w / 2 + 0.008, (lines.length * 0.0254 * HINT_S) / 2 + 0.006, 1)
        .color(0.03, 0.04, 0.06)
        .opacity(0.7);
      addText(h.node, key, -h.w / 2, 0, HINT_S, PALE);
    }
    billboard(h.node, cg.mTransform(hm, [0, 0.085, 0.03]), eye);
  };

  // HUD

  const hud = model.add(),
    hudText = hud.add(),
    dot = hud.add("sphere");
  const chips = hud.add(),
    toastNode = hud.add();
  let hudKey = "",
    hudX = 0,
    chipKey = "",
    toastKey = "";
  let toast = null;

  // Say
  const say = (text, rgb = WHITE, ms = 2200) =>
    (toast = { text: ascii(text), rgb, until: Date.now() + ms });

  // Set HUD
  const setHud = (line1, line2, rgb) => {
    const key = line1 + "|" + line2 + "|" + rgb;
    if (key === hudKey) return;
    hudKey = key;
    clear(hudText);
    const t = ascii(line2 ? line1 + "\n" + line2 : line1);
    hudX =
      (((-Math.max(...t.split("\n").map((l) => l.length)) * 0.0254) / 2) *
        HUD_S) /
      2;
    if (t) hudText.add(clay.text(t)).color(rgb);
  };

  // Rebuild the top HUD chips
  const setChips = (list) => {
    const key = JSON.stringify(list);
    if (key === chipKey) return;
    chipKey = key;
    clear(chips);
    const cw = (0.0254 / 2) * CHIP_S,
      gap = 4;
    const total =
      list.reduce((n, c) => n + c[0].length, 0) + gap * (list.length - 1);
    let x = (-total * cw) / 2;
    for (const [label, rgb] of list) {
      addText(chips, label, x, 0, CHIP_S, rgb);
      x += (label.length + gap) * cw;
    }
  };

  // Draw or clear the current toast
  const setToast = () => {
    const t = toast && Date.now() < toast.until ? toast : null;
    const key = t ? t.text + t.rgb : "";
    if (key !== toastKey) {
      toastKey = key;
      clear(toastNode);
      if (t) {
        const s = HUD_S * 1.2,
          w = ((t.text.length * 0.0254) / 2) * s;
        toastNode
          .add("square")
          .move(0, (-0.0254 * s) / 2, -0.002)
          .scale(w / 2 + 0.03, (0.0254 * s) / 2 + 0.015, 1)
          .color(0.03, 0.04, 0.06)
          .opacity(0.75);
        addText(toastNode, t.text, -w / 2, 0, s, t.rgb);
      }
    }
    toastNode.identity().move(0, -0.28, 0);
  };

  // Input

  const was = {};

  // Rising edge of a controller button this frame
  const pressed = (hand, i) => {
    const b = buttonState[hand] && buttonState[hand][i];
    const down = !!(b && b.pressed),
      edge = down && !was[hand + i];
    was[hand + i] = down;
    return edge;
  };

  // Reuse the same recorder across scene reloads so we don't reopen the mic
  const mic = (window.__icsyHeadsetMic =
    window.__icsyHeadsetMic ||
    makeChunkRecorder(async (blob, mime) =>
      server.send("icsyCtl", { op: "audio", mime, b64: await blobToB64(blob) }),
    ));

  let aiOffAt = 0,
    lastAi = null,
    pingAt = 0;

  // Socket open
  const socketOpen = () => !!(server.socket && server.socket.readyState === 1);

  // Save edit
  const saveEdit = () => {
    if (!edit) return;
    const db = FIELD_DB[edit.field];
    let value = edit.value;
    if (edit.field === "name") value = value.toUpperCase();
    if (db) ctl({ op: "edit", id: edit.pid, [db]: value });
    say("Saved", GREEN, 1200);
    edit = null;
  };

  // Start edit. Same field again saves and closes.
  const startEdit = (field) => {
    const p = S && S.profile;
    if (!p || !p.pid) return;
    if (edit && edit.field === field && edit.pid === p.pid) return saveEdit();
    if (edit) saveEdit();
    const cur = field === "name" ? (p[field] || "").toUpperCase() : p[field] || "";
    edit = { pid: p.pid, field, value: cur };
    if (!keyboard.pos) spawn(keyboard, headNow(), 0, 0.12, 0.4);
    say("Editing " + field + " — type, trigger the field again to save", PALE, 1800);
  };

  // Type key
  const typeKey = (ch) => {
    if (!edit) return;
    if (ch === "del") edit.value = edit.value.slice(0, -1);
    else if (ch) edit.value += edit.field === "name" ? ch.toUpperCase() : ch;
  };

  // Per-frame loop
  model.animate(() => {
    const dt = Math.min(0.1, model.deltaTime || 0.016);
    const now = Date.now();

    server.sync("icsyState", onState);
    if (now - pingAt > 2000) {
      pingAt = now;
      ctl({ op: "ping" });
    }
    server.sync("icsyCtl", () => {});

    const H = headNow();
    poses.push({ t: now, m: H });
    while (poses.length && now - poses[0].t > 4000) poses.shift();
    const eye = H.slice(12, 15);

    const live = S && now - gotAt < STALE_MS;
    if (live && S !== lastS) {
      lastS = S;
      retarget();
    }
    const status = live && S.ai && S.lock ? S.lock.status : null;

    // buttons

    if (pressed("right", 4)) {
      const turnOn = !(live && S.ai);
      ctl({ op: "ai", on: turnOn });
      say(
        !live
          ? "PC station not connected"
          : turnOn
          ? "AI mode ON - look at someone"
          : "AI mode OFF",
        !live ? GRAY : turnOn ? GREEN : GRAY,
      );
    }
    if (pressed("right", 5)) {
      if (live && S.enroll) {
        ctl({ op: "cancel" });
        say("Stopped adding them", GRAY);
      } else {
        ctl({ op: "enroll" });
        say(
          status === "unknown"
            ? "Adding them - ask them to turn their head slowly"
            : "Look at an unknown person (amber ring) first",
          status === "unknown" ? CYAN : AMBER,
          2800,
        );
      }
    }
    if (pressed("left", 4)) {
      ctl({ op: "end" });
      say(
        live && S.conv
          ? "Conversation ended - saving the summary"
          : "No conversation to end",
        live && S.conv ? GREEN : GRAY,
      );
    }
    if (pressed("left", 5)) {
      jarvisOn = !jarvisOn;
      if (jarvisOn) spawn(jarvis, H, -1);
      else say("Jarvis hidden - Y brings it back", GRAY, 1800);
    }
    if (pressed("left", 3)) {
      cardHidden = !cardHidden;
      say(cardHidden ? "Person card hidden" : "Person card shown", GRAY, 1500);
    }
    if (pressed("right", 3)) {
      transcriptOn = !transcriptOn;
      if (transcriptOn) spawn(transcript, H, 1, 0.15);
      say(
        transcriptOn
          ? "Transcript shown"
          : "Transcript hidden - right stick click brings it back",
        GRAY,
        1800,
      );
    }

    // Calibration: hold right grip (not on a panel) and move the right stick

    const grip = buttonState.right[1] && buttonState.right[1].pressed;
    const js = joyStickState.right || { x: 0, y: 0 };
    if (
      grip &&
      !drag &&
      live &&
      cal &&
      (Math.abs(js.x) > 0.2 || Math.abs(js.y) > 0.2)
    ) {
      if (Math.abs(js.x) > 0.2)
        cal.lat = Math.max(0, Math.min(1500, cal.lat + js.x * dt * 400));
      if (Math.abs(js.y) > 0.2)
        cal.fl = Math.max(0.25, Math.min(0.6, cal.fl * (1 - js.y * dt * 0.25)));
      calDirty = true;
      say(
        `Cast delay ${Math.round(
          cal.lat,
        )} ms (stick L/R)    spread ${cal.fl.toFixed(3)} (stick U/D)`,
        CYAN,
        1500,
      );
    }
    if (calDirty && now - calSentAt > 250) {
      ctl({ op: "cal", fl: +cal.fl.toFixed(3), lat: Math.round(cal.lat) });
      calSentAt = now;
      calDirty = false;
      retarget();
    }

    // Grabbable panels: spawn, hover, drag

    const xr = isXR();
    if ((xr && !wasXR) || !jarvis.pos) spawn(jarvis, H, -1);
    if ((xr && !wasXR) || !transcript.pos) spawn(transcript, H, 1, 0.15);
    wasXR = xr;

    let hover = null;
    for (const p of grabbables) p.state = "idle";
    keyboard.state = "idle";
    if (drag) {
      if (!holding(drag.hand) || !drag.panel.axes) drag = null;
      else {
        const r = ray(drag.hand);
        if (r) {
          drag.t = Math.max(
            0.3,
            Math.min(3, drag.t - (joyStickState[drag.hand].y || 0) * dt * 1.2),
          );
          const tip = cg.add(r.o, cg.scale(r.d, drag.t));
          drag.panel.pos = cg.add(tip, drag.off);
          drag.panel.state = "drag";
          hover = { p: tip };
        }
      }
    }
    if (!drag)
      search: for (const hand of ["right", "left"]) {
        const r = ray(hand);
        let best = null;
        for (const p of grabbables) {
          const hit = p.hit(r);
          if (hit && (!best || hit.t < best.hit.t)) best = { p, hit };
        }
        if (!best) continue;
        hover = best.hit;
        best.p.state = "hover";
        if (holding(hand) && !was["grab" + hand]) {
          drag = {
            hand,
            panel: best.p,
            t: best.hit.t,
            off: cg.subtract(best.p.pos, best.hit.p),
          };
          best.p.state = "drag";
        }
        break search;
      }
    if (edit && !drag)
      for (const hand of ["right", "left"]) {
        const r = ray(hand);
        const hit = r && keyboard.hit(r);
        if (!hit || !gripping(hand) || was["grab" + hand] || !keyboard.pos) continue;
        drag = {
          hand,
          panel: keyboard,
          t: hit.t,
          off: cg.subtract(keyboard.pos, hit.p),
        };
        keyboard.state = "drag";
        hover = hit;
        break;
      }
    for (const hand of ["left", "right"]) was["grab" + hand] = holding(hand);

    if (edit && (!S || !S.profile || S.profile.pid !== edit.pid)) saveEdit();

    let fieldHover = "";
    keyboard.hover = "";
    if (!drag)
      for (const hand of ["right", "left"]) {
        const r = ray(hand);
        const keyHit = edit && keyboard.hit(r);
        if (keyHit && keyHit.ch) {
          keyboard.hover = keyHit.ch;
          hover = keyHit;
          if (pressed(hand, 0)) typeKey(keyHit.ch);
          break;
        }
        const f = status === "matched" && !cardHidden && card.hitField(r);
        if (f) {
          fieldHover = f;
          hover = card.hit(r) || hover;
          if (pressed(hand, 0)) startEdit(f);
          break;
        }
      }
    card.hoverField = fieldHover;
    card.editField = edit ? edit.field : "";

    if (jarvisOn && live && S.ai) {
      jarvis.set(...jarvisContent());
      jarvis.place(jarvis.pos, eye);
    } else jarvis.hide();
    if (transcriptOn && live && S.ai) {
      transcript.set(...transcriptContent());
      transcript.place(transcript.pos, eye);
    } else transcript.hide();

    hitDot.identity();
    if (hover)
      hitDot
        .move(hover.p)
        .scale(0.007)
        .color(drag ? GREEN : WHITE);
    else hitDot.scale(0);

    // mic

    const wantMic = isQuest && live && S.ai && S.mic === "headset";
    if (wantMic && !mic.running && !mic.failed) mic.start();
    if (!wantMic && mic.running) mic.stop();

    // HUD

    const on = live && S.ai;
    if (live && S.ai !== lastAi) {
      lastAi = S.ai;
      if (!S.ai) aiOffAt = now;
    }

    hud.identity().hud();
    hudText.identity().move(hudX, -0.4, 0).scale(HUD_S);
    chips.identity().move(0, 0.4, 0);
    setToast();

    const micOn =
      live &&
      S.ai &&
      ((S.mic === "headset" && mic.running && !mic.failed) ||
        S.mic === "computer");
    const micLabel = !live
      ? null
      : mic.failed
      ? ["MIC OFF", RED]
      : micOn
      ? ["MIC ON", GREEN]
      : ["MIC OFF", GRAY];
    const chipList = !socketOpen()
      ? [["NO CONNECTION - RELOAD PAGE", AMBER]]
      : !live
      ? [["PC STATION OFFLINE", GRAY]]
      : [
          S.ai ? ["AI ON", GREEN] : ["AI OFF", GRAY],
          ...(micLabel ? [micLabel] : []),
          ...(S.enroll ? [[`ADDING ${S.enroll[0]}/${S.enroll[1]}`, CYAN]] : []),
          ...(S.conv
            ? [
                [
                  "TALKING WITH " + ascii(S.conv).toUpperCase().slice(0, 24),
                  GREEN,
                ],
              ]
            : []),
        ];
    setChips(chipList);

    if (!socketOpen())
      setHud(
        "Lost the connection to the app server (was it restarted?)",
        "Reload this page in the Quest browser",
        AMBER,
      );
    else if (!live)
      setHud(
        "Waiting for the PC station",
        "Open ICanSeeYou/station.html on the computer and keep it open",
        GRAY,
      );
    else if (!S.ai)
      setHud(
        now - aiOffAt < 5000 ? "AI mode off   (A to turn on)" : "",
        "",
        GRAY,
      );
    else
      setHud(
        S.msg || (S.conv ? "With " + S.conv : ""),
        "",
        status === "unknown" ? AMBER : PALE,
      );
    dot
      .identity()
      .scale(on && !S.lock ? 0.004 : 0)
      .color(PALE);

    // controller hints

    drawHint(
      "right",
      !live
        ? []
        : [
            "A  " + (S.ai ? "AI off" : "AI on"),
            ...(S.enroll
              ? ["B  cancel adding"]
              : status === "unknown"
              ? ["B  add them"]
              : []),
            ...(status === "matched"
              ? [edit ? "trigger  type / field again to save" : "trigger  edit a field"]
              : []),
          ],
      eye,
    );
    drawHint(
      "left",
      [
        ...(live && S.conv ? ["X  end talk"] : []),
        "Y  " + (jarvisOn ? "hide Jarvis" : "Jarvis"),
      ],
      eye,
    );

    // rings and card

    const L = on ? follow("lock", dt) : null;
    const C = on ? follow("cand", dt) : null;
    drawRing(candRing, C, eye, on && S.cand ? S.cand[1] : 0, PALE, 0, 0.02);

    if (!L || !status) drawRing(lockRing, null);
    else if (status === "matched")
      drawRing(lockRing, L, eye, 1, GREEN, 0, 0.032);
    else if (status === "searching")
      drawRing(lockRing, L, eye, 0.3, GREEN, -model.time * 6);
    else if (status === "noface")
      drawRing(lockRing, L, eye, 0.3, GRAY, -model.time * 3, 0.02);
    else if (status === "unknown") drawRing(lockRing, L, eye, 1, AMBER);
    else if (status === "enrolling")
      drawRing(
        lockRing,
        L,
        eye,
        S.enroll ? S.enroll[0] / S.enroll[1] : 0,
        CYAN,
        0,
        0.032,
      );
    else drawRing(lockRing, L, eye, 1, GRAY, 0, 0.02);

    const content = L && !cardHidden && cardContent();
    if (content) {
      card.set(...content);
      placeCard(L, eye);
      if (edit) {
        if (!keyboard.pos) spawn(keyboard, H, 0, 0.12, 0.4);
        keyboard.place(keyboard.pos, eye, 1);
      } else keyboard.hide();
    } else {
      card.hide();
      keyboard.hide();
    }
  });
};
