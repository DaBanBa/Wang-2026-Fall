import * as cg from '../../render/core/cg.js';
import { stl } from '../../render/core/stl.js';
import { buttonState, controllerMatrix, joyStickState } from '../../render/core/controllerInput.js';
import { ARM, TOOL, limitErrors, reachSolutions, solve, translation } from './kinematics.js';
const BASE_POS = [-0.1, 1.5, 0];
const YELLOW = [1, 0.86, 0.12];
const FIELD_MATERIAL = [0.45, 0.45, 0.45, 0, 0, 0, 0, 0, 0, 1];
const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];
const LIVE_URL = 'ws://127.0.0.1:8765';

const LINKS = {
   base_link: [
      { stl: 'base_motor_holder_so101_v1', xyz: [-0.00636471, -0.0000994414, -0.0024], rpy: [1.5708, 0, 1.5708], color: [1, .82, .12] },
      { stl: 'base_so101_v2', xyz: [-0.00636471, 0, -0.0024], rpy: [1.5708, 0, 1.5708], color: [1, .82, .12] },
      { stl: 'sts3215_03a_v1', xyz: [0.0263353, 0, 0.0437], rpy: [0, 0, 0], color: [.1, .1, .1] },
      { stl: 'waveshare_mounting_plate_so101_v2', xyz: [-0.0309827, -0.000199441, 0.0474], rpy: [1.5708, 0, 1.5708], color: [1, .82, .12] },
   ],
   shoulder_link: [
      { stl: 'sts3215_03a_v1', xyz: [-0.0303992, 0.000422241, -0.0417], rpy: [1.5708, 1.5708, 0], color: [.1, .1, .1] },
      { stl: 'motor_holder_so101_base_v1', xyz: [-0.0675992, -0.000177759, 0.0158499], rpy: [1.5708, -1.5708, 0], color: [1, .82, .12] },
      { stl: 'rotation_pitch_so101_v1', xyz: [0.0122008, 0.0000222413, 0.0464], rpy: [-1.5708, 0, 0], color: [1, .82, .12] },
   ],
   upper_arm_link: [
      { stl: 'sts3215_03a_v1', xyz: [-0.11257, -0.0155, 0.0187], rpy: [-3.14159, 0, -1.5708], color: [.1, .1, .1] },
      { stl: 'upper_arm_s0101_v1', xyz: [-0.065085, 0.012, 0.0182], rpy: [3.14159, 0, 0], color: [1, .82, .12] },
   ],
   lower_arm_link: [
      { stl: 'under_arm_so101_v1', xyz: [-0.0648499, -0.032, 0.0182], rpy: [3.14159, 0, 0], color: [1, .82, .12] },
      { stl: 'motor_holder_so101_wrist_v1', xyz: [-0.0648499, -0.032, 0.018], rpy: [-3.14159, 0, 0], color: [1, .82, .12] },
      { stl: 'sts3215_03a_v1', xyz: [-0.1224, 0.0052, 0.0187], rpy: [-3.14159, 0, -3.14159], color: [.1, .1, .1] },
   ],
   wrist_link: [
      { stl: 'sts3215_03a_no_horn_v1', xyz: [0, -0.0424, 0.0306], rpy: [1.5708, 1.5708, 0], color: [.1, .1, .1] },
      { stl: 'wrist_roll_pitch_so101_v2', xyz: [0, -0.028, 0.0181], rpy: [-1.5708, -1.5708, 0], color: [1, .82, .12] },
   ],
   gripper_link: [
      { stl: 'sts3215_03a_v1', xyz: [0.0077, 0.0001, -0.0234], rpy: [-1.5708, 0, 0], color: [.1, .1, .1] },
      { stl: 'wrist_roll_follower_so101_v1', xyz: [0, -0.000218214, 0.000949706], rpy: [-3.14159, 0, 0], color: [1, .82, .12] },
   ],
   moving_jaw_so101_v1_link: [
      { stl: 'moving_jaw_so101_v1', xyz: [0, 0, 0.0189], rpy: [0, 0, 0], color: [1, .82, .12] },
   ],
};

const ARC = {
   shoulder_pan: ['shoulder pan', 0.055],
   shoulder_lift: ['shoulder lift', 0.042],
   elbow_flex: ['elbow flex', 0.034],
   wrist_flex: ['wrist flex', 0.030],
   wrist_roll: ['wrist roll', 0.026],
};

const BANDS = [
   { name: 'so101Near', max: 0.045, opacity: 1, radius: 0.012 },
   { name: 'so101Mid', max: 0.085, opacity: 0.5, radius: 0.009 },
   { name: 'so101Far', max: 0.13, opacity: 0.18, radius: 0.007 },
];

const OCTA = [
   [0, 2, 4], [1, 4, 2], [0, 4, 3], [1, 3, 4],
   [0, 5, 2], [1, 2, 5], [0, 3, 5], [1, 5, 3],
];
const AXIS = [
   [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const unit = v => {
   const n = Math.hypot(v[0], v[1], v[2]) || 1;
   return [v[0] / n, v[1] / n, v[2] / n];
};
const TETRA = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(unit);
const TETRA_FACES = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];

const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const scoreRGB = t => {
   const u = t < 0 ? 0 : t > 1 ? 1 : t;
   const blue = [0.18, 0.32, 0.95], green = [0.12, 0.78, 0.28], red = [0.92, 0.16, 0.12];
   const rgb = u < 0.5 ? mix(blue, green, u * 2) : mix(green, red, (u - 0.5) * 2);
   return rgb.map(channel => channel * channel);
};

const moved = (corners, center, radius) => corners.map(v => [
   center[0] + radius * v[0],
   center[1] + radius * v[1],
   center[2] + radius * v[2],
]);

const emitFace = (mesh, offset, a, b, c, rgb) => {
   const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
   const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
   let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
   const len = Math.hypot(nx, ny, nz) || 1;
   nx /= len; ny /= len; nz /= len;
   [a, b, c].forEach((v, i) => clay.vertexArrayComponents(
      mesh, offset + i * 16, v[0], v[1], v[2], nx, ny, nz, 0, 0, rgb[0], rgb[1], rgb[2]
   ));
   return offset + 48;
};

const emitSolid = (mesh, offset, corners, faces, center, radius, rgb) => {
   const points = moved(corners, center, radius);
   for (const [ia, ib, ic] of faces)
      offset = emitFace(mesh, offset, points[ia], points[ib], points[ic], rgb);
   return offset;
};

const paintField = node => node.color(FIELD_MATERIAL).dull();

const createField = (parent, workspace) => {
   const cell = 0.03;
   const coarse = new Map();
   for (const sample of workspace.voxels) {
      const ix = Math.floor(sample[0] / cell + 0.5);
      const iy = Math.floor(sample[1] / cell + 0.5);
      const iz = Math.floor(sample[2] / cell + 0.5);
      const key = ix + ',' + iy + ',' + iz;
      const previous = coarse.get(key);
      if (!previous || sample[3] > previous[3])
         coarse.set(key, [ix * cell, iy * cell, iz * cell, sample[3]]);
   }
   const cells = [...coarse.values()];
   const count = cells.length;
   const x = new Float32Array(count), y = new Float32Array(count), z = new Float32Array(count);
   const r = new Float32Array(count), g = new Float32Array(count), b = new Float32Array(count);
   const scale = workspace.muMax || 1;
   for (let i = 0; i < count; i++) {
      const rgb = scoreRGB(cells[i][3] / scale);
      x[i] = cells[i][0]; y[i] = cells[i][1]; z[i] = cells[i][2];
      r[i] = rgb[0]; g[i] = rgb[1]; b[i] = rgb[2];
   }
   const bands = BANDS.map(band => {
      const mesh = new Float32Array(0);
      mesh.isTriangles = true;
      clay.defineMesh(band.name, mesh);
      const node = paintField(parent.add(band.name));
      node.opacity(0);
      return { ...band, node };
   });
   let key = '';
   const reach2 = BANDS[BANDS.length - 1].max ** 2;

   return {
      update(local, visible) {
         if (!visible || !local) {
            for (const band of bands) band.node.opacity(0);
            key = '';
            return;
         }
         const next = [0, 1, 2].map(i => Math.round(local[i] / 0.01)).join(',');
         if (next === key) return;
         key = next;
         const grouped = bands.map(() => []);
         for (let i = 0; i < count; i++) {
            const dx = x[i] - local[0], dy = y[i] - local[1], dz = z[i] - local[2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 > reach2) continue;
            const hit = { x: x[i], y: y[i], z: z[i], r: r[i], g: g[i], b: b[i] };
            const d = Math.sqrt(d2);
            for (let n = 0; n < bands.length; n++) {
               if (d <= bands[n].max) {
                  grouped[n].push(hit);
                  break;
               }
            }
         }
         bands.forEach((band, n) => {
            const hits = grouped[n];
            if (hits.length) {
               const mesh = new Float32Array(hits.length * 12 * 16);
               mesh.isTriangles = true;
               let offset = 0;
               for (const hit of hits)
                  offset = emitSolid(mesh, offset, TETRA, TETRA_FACES, [hit.x, hit.y, hit.z], band.radius, [hit.r, hit.g, hit.b]);
               clay.defineMesh(band.name, mesh);
            }
            band.node.opacity(hits.length ? band.opacity : 0);
         });
      },
   };
};

const legend = parent => {
   const mesh = new Float32Array(5 * 24 * 16);
   mesh.isTriangles = true;
   let offset = 0;
   for (let i = 0; i < 5; i++)
      offset = emitSolid(mesh, offset, AXIS, OCTA, [i * 0.028, 0, 0], 0.01, scoreRGB(i / 4));
   clay.defineMesh('so101Legend', mesh);
   return paintField(parent.add('so101Legend'));
};

const arcMesh = (name, lo, hi, radius) => {
   const steps = Math.max(24, Math.ceil(Math.abs(hi - lo) / (Math.PI / 24)));
   const sides = 5;
   const ring = t => {
      const center = [radius * Math.cos(t), radius * Math.sin(t), 0];
      const bitangent = [Math.cos(t), Math.sin(t), 0];
      const points = [];
      for (let s = 0; s < sides; s++) {
         const a = 2 * Math.PI * s / sides;
         points.push([
            center[0] + 0.0026 * Math.sin(a) * bitangent[0],
            center[1] + 0.0026 * Math.sin(a) * bitangent[1],
            center[2] + 0.0026 * Math.cos(a),
         ]);
      }
      return points;
   };
   const rings = [];
   for (let i = 0; i <= steps; i++)
      rings.push(ring(lo + (hi - lo) * (i / steps)));
   const mesh = new Float32Array(steps * sides * 12 * 16);
   mesh.isTriangles = true;
   let offset = 0;
   const white = [1, 1, 1];
   for (let i = 0; i < steps; i++) {
      for (let s = 0; s < sides; s++) {
         const s1 = (s + 1) % sides;
         const a = rings[i][s], b = rings[i][s1], c = rings[i + 1][s], d = rings[i + 1][s1];
         offset = emitFace(mesh, offset, a, b, d, white);
         offset = emitFace(mesh, offset, a, d, b, white);
         offset = emitFace(mesh, offset, a, d, c, white);
         offset = emitFace(mesh, offset, a, c, d, white);
      }
   }
   clay.defineMesh(name, mesh);
   return name;
};

const faceCamera = (node, pos, eye, up, scale) => {
   const Z = cg.normalize(cg.subtract(eye, pos));
   let X = cg.cross(up, Z);
   X = cg.norm(X) < 1e-4 ? [1, 0, 0] : cg.normalize(X);
   const Y = cg.normalize(cg.cross(Z, X));
   node.setMatrix([
      X[0] * scale, X[1] * scale, X[2] * scale, 0,
      Y[0] * scale, Y[1] * scale, Y[2] * scale, 0,
      Z[0] * scale, Z[1] * scale, Z[2] * scale, 0,
      pos[0], pos[1], pos[2], 1,
   ]);
};

const limitColor = (q, lo, hi) => {
   const remain = Math.min(q - lo, hi - q) / ((hi - lo) / 2);
   if (remain > 0.35) return [0.72, 0.86, 0.95];
   if (remain > 0.15) return [0.95, 0.72, 0.18];
   return [0.95, 0.22, 0.16];
};

const createMarks = (mounts, joints, labelRoot) => {
   const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
   const marks = {};
   for (const [name, [title, radius]] of Object.entries(ARC)) {
      const joint = byName[name];
      const { origin, pivot } = mounts[name];
      const meshName = 'so101Label_' + name;
      clay.defineTextMesh(meshName, title);
      const board = labelRoot.add();
      marks[name] = {
         arc: origin.add(arcMesh('so101Arc_' + name, joint.lower, joint.upper, radius)),
         needle: pivot.add('cube').move(radius * 0.55, 0, 0).scale(radius * 0.45, 0.0016, 0.0016),
         board,
         glyph: board.add(meshName).color(YELLOW),
         meshName,
         caption: '',
         title,
         joint,
         anchor: origin,
      };
   }
   return marks;
};

const updateMarks = (marks, q, active, eyeIn, labelRoot) => {
   const rootInv = cg.mInverse(labelRoot.getGlobalMatrix());
   const up = cg.normalize([rootInv[4], rootInv[5], rootInv[6]]);
   const eyeLocal = eyeIn ? cg.mTransform(rootInv, eyeIn) : null;
   for (const [name, mark] of Object.entries(marks)) {
      const value = q[name] || 0;
      const show = name === active;
      const color = show ? YELLOW : limitColor(value, mark.joint.lower, mark.joint.upper);
      mark.arc.color(color);
      mark.needle.color(color);
      mark.board.opacity(show ? 1 : 0);
      if (!show) continue;
      const deg = rad => (rad * 180 / Math.PI).toFixed(0);
      const text = `${mark.title}\n${deg(value)} deg\n${deg(mark.joint.lower)} to ${deg(mark.joint.upper)}`;
      if (mark.caption !== text) {
         clay.defineTextMesh(mark.meshName, text);
         const width = Math.max(...text.split('\n').map(line => line.length)) * 0.019;
         mark.glyph.identity().move(-width / 2, 0.02, 0);
         mark.caption = text;
      }
      const anchor = cg.mTransform(rootInv, mark.anchor.getGlobalPos());
      let pos = cg.add(anchor, cg.scale(up, 0.04));
      let eye = eyeLocal || cg.add(pos, [0, 0, 0.5]);
      if (eyeLocal) {
         let right = cg.cross(up, cg.subtract(eyeLocal, anchor));
         if (cg.norm(right) > 1e-4)
            pos = cg.add(pos, cg.scale(cg.normalize(right), 0.03));
      }
      faceCamera(mark.board, pos, eye, up, 0.55);
   }
};

const createAdapter = joints => {
   const limits = {};
   for (const joint of joints)
      if (joint.type === 'revolute')
         limits[joint.name] = { lower: joint.lower, upper: joint.upper };
   const q = {};
   for (const name of JOINTS) q[name] = 0;
   let mode = 'sim';
   let socket = null;
   let auto = true;
   const clamp = (name, value) => {
      const span = limits[name];
      if (!span || !Number.isFinite(value)) return q[name] || 0;
      return Math.max(span.lower, Math.min(span.upper, value));
   };
   const apply = msg => {
      const bag = msg.positions || msg.joints || msg.observation || msg;
      let used = 0;
      for (const name of JOINTS) {
         const raw = bag[name];
         const pos = bag[name + '.pos'];
         const value = typeof raw === 'number' ? raw : pos;
         if (typeof value !== 'number' || !Number.isFinite(value)) continue;
         const unit = msg.unit || (typeof pos === 'number' && typeof raw !== 'number' ? 'deg' : null);
         if (unit !== 'deg' && unit !== 'rad') continue;
         q[name] = clamp(name, unit === 'deg' ? value * Math.PI / 180 : value);
         used++;
      }
      if (!used) return;
      mode = 'live';
      auto = false;
   };
   return {
      q,
      limits,
      get mode() { return mode; },
      get auto() { return auto; },
      set auto(value) { auto = value && mode === 'sim'; },
      setJoint(name, value) {
         if (mode !== 'sim' || !limits[name]) return;
         q[name] = clamp(name, value);
      },
      demo(time) {
         if (mode !== 'sim' || !auto) return;
         const speeds = [0.31, 0.23, 0.29, 0.37, 0.19, 0.41];
         JOINTS.forEach((name, i) => {
            const span = limits[name];
            if (!span) return;
            const mid = (span.lower + span.upper) / 2;
            const amp = (span.upper - span.lower) * 0.32;
            q[name] = clamp(name, mid + amp * Math.sin(time * speeds[i] + i));
         });
      },
      connect(url = LIVE_URL) {
         if (socket) {
            socket.close();
            socket = null;
            mode = 'sim';
            return;
         }
         let ws;
         try { ws = new WebSocket(url); }
         catch (error) {
            console.error('SO101 could not open ' + url, error);
            return;
         }
         socket = ws;
         ws.onmessage = event => {
            try { apply(JSON.parse(event.data)); }
            catch (error) { console.error('SO101 live message was not JSON', error); }
         };
         ws.onclose = () => { if (socket === ws) socket = null; };
      },
   };
};

const loadJson = async name => {
   const response = await fetch(new URL('./data/' + name, import.meta.url));
   if (!response.ok) throw new Error(name + ' ' + response.status);
   return response.json();
};

const worldPoint = matrix => {
   if (!matrix || matrix.length < 16 || !clay.inverseRootMatrix) return null;
   if (Math.hypot(matrix[0], matrix[1], matrix[2]) < 0.5) return null;
   const p = cg.mTransform(clay.inverseRootMatrix, [matrix[12], matrix[13], matrix[14]]);
   return p.every(Number.isFinite) ? p : null;
};

const eyePosition = () => {
   if (!clay.views || !clay.views[0] || !clay.inverseRootMatrix) return null;
   const m = cg.mMultiply(clay.inverseRootMatrix, cg.mInverse(clay.views[0].viewMatrix));
   return Number.isFinite(m[12]) ? [m[12], m[13], m[14]] : null;
};

if (window.__so101Key) {
   window.removeEventListener('keydown', window.__so101Key);
   window.__so101Key = null;
}

export const init = async model => {
   let robot, workspace, validation;
   try {
      [robot, workspace, validation] = await Promise.all([
         loadJson('robot.json'),
         loadJson('workspace.json'),
         loadJson('validation.json'),
      ]);
   } catch (error) {
      clay.defineTextMesh('so101Missing', 'workspace data missing');
      model.add().move(-0.25, 1.5, 0).add('so101Missing').color(1, .4, .3);
      console.error(error);
      return;
   }

   const problems = limitErrors(robot.joints);
   const reference = solve(robot.joints, validation.poses[0].q);
   const referenceError = Math.max(...translation(reference[TOOL]).map((value, i) => Math.abs(value - validation.poses[0].p[i])));
   if (problems.length || referenceError > 1e-5)
      console.error('SO101 kinematics check failed', problems, referenceError);

   const adapter = createAdapter(robot.joints);
   const base = model.add().move(BASE_POS[0], BASE_POS[1], BASE_POS[2]).turnX(-Math.PI / 2);
   const linkNode = { base_link: base };
   const mounts = {};
   for (const joint of robot.joints) {
      const origin = linkNode[joint.parent].add();
      const pivot = origin.add();
      linkNode[joint.child] = pivot;
      mounts[joint.name] = { origin, pivot, joint };
   }

   const pending = [];
   for (const [link, meshes] of Object.entries(LINKS)) {
      for (const mesh of meshes) {
         const partName = 'SO101/' + mesh.stl;
         stl(partName);
         pending.push({ link, mesh, partName });
      }
   }

   const field = createField(base, workspace);
   let fieldOn = true;
   const marks = createMarks(mounts, robot.joints, model);
   linkNode.gripper_frame_link.add('sphere').scale(0.007).color(0.95, 0.95, 0.9);
   legend(model.add().move(-0.52, 1.2, 0.18));

   const TRIGGER = 0, GRIP = 1, A = 3, B = 4;
   let selected = 0;
   const held = {};
   let reachTarget = null;
   let reachPoses = [];
   let reachIndex = 0;
   let lastTime = 0;
   let aligned = false;

   const jog = amount => {
      adapter.auto = false;
      const name = ARM[selected];
      adapter.setJoint(name, adapter.q[name] + amount);
   };
   const rose = button => {
      const pressed = buttonState.right[button].pressed;
      const fired = pressed && !held[button];
      held[button] = pressed;
      return fired;
   };
   const holdPose = pose => {
      adapter.auto = false;
      for (const name of ARM) adapter.setJoint(name, pose[name]);
   };

   window.__so101Key = event => {
      const code = event.code;
      if (code >= 'Digit1' && code <= 'Digit5') {
         selected = Number(code.slice(5)) - 1;
         event.preventDefault();
      } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
         jog((code === 'ArrowRight' ? 0.04 : -0.04) * (event.shiftKey ? 0.25 : 1));
         event.preventDefault();
      } else if (code === 'Space') {
         adapter.auto = true;
         event.preventDefault();
      } else if (code === 'KeyV') {
         fieldOn = !fieldOn;
      } else if (code === 'KeyC') {
         adapter.connect();
      } else if (code === 'KeyG') {
         adapter.auto = false;
         const span = adapter.limits.gripper;
         const mid = span ? (span.lower + span.upper) / 2 : 0;
         adapter.setJoint('gripper', adapter.q.gripper > mid ? span.lower : span.upper);
      }
   };
   window.addEventListener('keydown', window.__so101Key);

   model.animate(() => {
      const dt = Math.min(0.05, Math.max(0, model.time - lastTime));
      lastTime = model.time;
      const stickX = joyStickState.right.x;
      if (adapter.mode === 'sim' && Math.abs(stickX) > 0.25)
         jog(stickX * 0.9 * dt);
      if (rose(B)) selected = (selected + 1) % ARM.length;
      if (rose(A)) adapter.auto = true;
      if (rose(TRIGGER)) fieldOn = !fieldOn;

      const hand = worldPoint(controllerMatrix.right);
      const grip = rose(GRIP);
      if (fieldOn && hand && grip) {
         const local = cg.mTransform(cg.mInverse(base.getGlobalMatrix()), hand);
         const samePlace = reachTarget && cg.distance(reachTarget, local) < 0.04 && reachPoses.length > 1;
         if (samePlace) reachIndex = (reachIndex + 1) % reachPoses.length;
         else {
            reachPoses = reachSolutions(robot.joints, local, adapter.q);
            reachTarget = [...local];
            reachIndex = 0;
         }
         if (reachPoses[reachIndex]) holdPose(reachPoses[reachIndex]);
      }

      adapter.demo(model.time);

      for (const item of pending) {
         if (item.done || !clay.formMesh(item.partName)) continue;
         linkNode[item.link].add(item.partName)
            .move(item.mesh.xyz)
            .turnZ(item.mesh.rpy[2]).turnY(item.mesh.rpy[1]).turnX(item.mesh.rpy[0])
            .color(item.mesh.color);
         item.done = true;
      }
      for (const joint of robot.joints) {
         const mount = mounts[joint.name];
         const [roll, pitch, yaw] = joint.rpy;
         const angle = joint.type === 'revolute' ? (adapter.q[joint.name] || 0) : 0;
         mount.origin.identity().move(...joint.xyz).turnZ(yaw).turnY(pitch).turnX(roll);
         mount.pivot.identity().turnZ(angle);
      }

      updateMarks(marks, adapter.q, ARM[selected], eyePosition(), model);
      const focus = hand || linkNode.gripper_frame_link.getGlobalPos();
      field.update(cg.mTransform(cg.mInverse(base.getGlobalMatrix()), focus), fieldOn);

      if (!aligned) {
         const local = translation(solve(robot.joints, adapter.q)[TOOL]);
         const expected = cg.mTransform(base.getGlobalMatrix(), local);
         const err = cg.distance(expected, linkNode.gripper_frame_link.getGlobalPos());
         if (err > 1e-4) console.error('SO101 tool frame does not match forward kinematics', err);
         aligned = true;
      }
   });
};
