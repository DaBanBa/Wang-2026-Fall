import * as cg from '../../render/core/cg.js';

export const ARM = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll'];
export const TOOL = 'gripper_frame_joint';

export const EXPECTED_DEG = {
   shoulder_pan: [-110, 110],
   shoulder_lift: [-100, 100],
   elbow_flex: [-96.8, 96.8],
   wrist_flex: [-95, 95],
   wrist_roll: [-157.2, 162.8],
};

const mul = cg.mMultiply;

const origins = new WeakMap();

const originMatrix = joint => {
   const cached = origins.get(joint);
   if (cached) return cached;
   const [roll, pitch, yaw] = joint.rpy;
   const fixed = mul(mul(cg.mRotateZ(yaw), cg.mRotateY(pitch)), cg.mRotateX(roll));
   const matrix = mul(cg.mTranslate(joint.xyz[0], joint.xyz[1], joint.xyz[2]), fixed);
   origins.set(joint, matrix);
   return matrix;
};

export const solve = (joints, q) => {
   const children = new Map();
   for (const joint of joints) {
      if (!children.has(joint.parent)) children.set(joint.parent, []);
      children.get(joint.parent).push(joint);
   }
   const frames = {};
   const walk = (link, parent) => {
      const group = children.get(link);
      if (!group) return;
      for (const joint of group) {
         const angle = joint.type === 'revolute' ? (q[joint.name] || 0) : 0;
         const world = mul(parent, mul(originMatrix(joint), cg.mRotateZ(angle)));
         frames[joint.name] = world;
         walk(joint.child, world);
      }
   };
   walk('base_link', cg.mIdentity());
   return frames;
};

export const translation = m => [m[12], m[13], m[14]];

const axisZ = m => [m[8], m[9], m[10]];

const cross = (a, b) => [
   a[1] * b[2] - a[2] * b[1],
   a[2] * b[0] - a[0] * b[2],
   a[0] * b[1] - a[1] * b[0],
];

export const jacobian = frames => {
   const tip = translation(frames[TOOL]);
   return ARM.map(name => {
      const origin = translation(frames[name]);
      return cross(axisZ(frames[name]), [
         tip[0] - origin[0],
         tip[1] - origin[1],
         tip[2] - origin[2],
      ]);
   });
};

const jacobiEigenvalues = matrix => {
   const a = matrix.map(row => row.slice());
   for (let sweep = 0; sweep < 16; sweep++) {
      for (let p = 0; p < 3; p++) {
         for (let q = p + 1; q < 3; q++) {
            const apq = a[p][q];
            if (Math.abs(apq) < 1e-18) continue;
            const app = a[p][p], aqq = a[q][q];
            const tau = (aqq - app) / (2 * apq);
            const t = Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
            const c = 1 / Math.sqrt(1 + t * t);
            const s = t * c;
            for (let i = 0; i < 3; i++) {
               if (i === p || i === q) continue;
               const aip = a[i][p], aiq = a[i][q];
               a[i][p] = a[p][i] = c * aip - s * aiq;
               a[i][q] = a[q][i] = s * aip + c * aiq;
            }
            a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
            a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
            a[p][q] = a[q][p] = 0;
         }
      }
   }
   return [a[0][0], a[1][1], a[2][2]];
};

// Product of the three singular values of the 3x5 positional Jacobian.
export const manipulability = columns => {
   const gram = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
   for (const column of columns) {
      for (let i = 0; i < 3; i++)
         for (let k = 0; k < 3; k++)
            gram[i][k] += column[i] * column[k];
   }
   let mu = 1;
   for (const value of jacobiEigenvalues(gram))
      mu *= value > 0 ? Math.sqrt(value) : 0;
   return mu;
};

const CHAIN = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper_frame_joint'];
const chains = new WeakMap();

const chainOf = joints => {
   const cached = chains.get(joints);
   if (cached) return cached;
   const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
   const chain = CHAIN.map(name => byName[name]);
   chains.set(joints, chain);
   return chain;
};

const toolFrames = (joints, q) => {
   const frames = {};
   let world = cg.mIdentity();
   for (const joint of chainOf(joints)) {
      const angle = joint.type === 'revolute' ? (q[joint.name] || 0) : 0;
      world = mul(world, mul(originMatrix(joint), cg.mRotateZ(angle)));
      frames[joint.name] = world;
   }
   return frames;
};

const solve3 = (matrix, b) => {
   const m = matrix.map((row, i) => [row[0], row[1], row[2], b[i]]);
   for (let col = 0; col < 3; col++) {
      let pivot = col;
      for (let row = col + 1; row < 3; row++)
         if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
      [m[col], m[pivot]] = [m[pivot], m[col]];
      const div = m[col][col];
      if (Math.abs(div) < 1e-12) return null;
      for (let c = col; c < 4; c++) m[col][c] /= div;
      for (let row = 0; row < 3; row++) {
         if (row === col) continue;
         const factor = m[row][col];
         for (let c = col; c < 4; c++) m[row][c] -= factor * m[col][c];
      }
   }
   return [m[0][3], m[1][3], m[2][3]];
};

const limitsOf = joints => {
   const limits = {};
   for (const joint of joints)
      if (joint.type === 'revolute') limits[joint.name] = [joint.lower, joint.upper];
   return limits;
};

const clampAngle = (limits, name, value) => {
   const span = limits[name];
   return span ? Math.max(span[0], Math.min(span[1], value)) : value;
};

const descend = (joints, seed, target, limits) => {
   const q = { ...seed };
   let best = { ...q };
   let bestError = Infinity;
   for (let iter = 0; iter < 36; iter++) {
      const frames = toolFrames(joints, q);
      const p = translation(frames[TOOL]);
      const error = [target[0] - p[0], target[1] - p[1], target[2] - p[2]];
      const miss = Math.hypot(error[0], error[1], error[2]);
      if (miss < bestError) {
         bestError = miss;
         best = { ...q };
      }
      if (miss < 0.0015) break;
      const columns = jacobian(frames);
      const gram = [[1e-3, 0, 0], [0, 1e-3, 0], [0, 0, 1e-3]];
      for (const column of columns)
         for (let i = 0; i < 3; i++)
            for (let k = 0; k < 3; k++)
               gram[i][k] += column[i] * column[k];
      const y = solve3(gram, error);
      if (!y) break;
      const step = ARM.map((_, index) => {
         const column = columns[index];
         return column[0] * y[0] + column[1] * y[1] + column[2] * y[2];
      });
      const largest = Math.max(...step.map(value => Math.abs(value)), 1e-9);
      const scale = Math.min(1, 0.4 / largest);
      ARM.forEach((name, index) => {
         q[name] = clampAngle(limits, name, (q[name] || 0) + step[index] * scale);
      });
   }
   return { q: best, error: bestError };
};

const samples = (limits, name, count) => {
   const [lo, hi] = limits[name];
   const values = [];
   for (let i = 0; i < count; i++)
      values.push(lo + (hi - lo) * (i + 0.5) / count);
   return values;
};

const different = (a, b) => ARM.slice(0, 4).some(name => Math.abs(a[name] - b[name]) > 0.3);

// Joint poses that put the tool on one point. Wrist roll barely moves the
// tip, so the distinct poses are the other ways to fold the arm.
export const reachSolutions = (joints, target, current) => {
   const limits = limitsOf(joints);
   const shoulder = chainOf(joints)[0].xyz;
   const pan = Math.atan2(target[1] - shoulder[1], target[0] - shoulder[0]);
   const pans = [];
   for (const turn of [pan, pan + Math.PI]) {
      const angle = Math.atan2(Math.sin(turn), Math.cos(turn));
      if (angle < limits.shoulder_pan[0] - 1e-3 || angle > limits.shoulder_pan[1] + 1e-3) continue;
      const clamped = clampAngle(limits, 'shoulder_pan', angle);
      if (pans.every(value => Math.abs(value - clamped) > 0.05)) pans.push(clamped);
   }
   const seeds = [{ ...current }];
   for (const shoulderPan of pans)
      for (const shoulderLift of samples(limits, 'shoulder_lift', 3))
         for (const elbowFlex of samples(limits, 'elbow_flex', 3))
            for (const wristFlex of samples(limits, 'wrist_flex', 3))
               seeds.push({
                  ...current,
                  shoulder_pan: shoulderPan,
                  shoulder_lift: shoulderLift,
                  elbow_flex: elbowFlex,
                  wrist_flex: wristFlex,
               });
   const found = [];
   for (const seed of seeds) {
      const solved = descend(joints, seed, target, limits);
      if (solved.error > 0.02) continue;
      if (found.some(pose => !different(pose, solved.q))) continue;
      found.push(solved.q);
   }
   const distance = pose => Math.hypot(...ARM.map(name => (pose[name] || 0) - (current[name] || 0)));
   found.sort((a, b) => distance(a) - distance(b));
   return found;
};

export const limitErrors = joints => {
   const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
   const errors = [];
   for (const [name, expected] of Object.entries(EXPECTED_DEG)) {
      const joint = byName[name];
      const got = [joint.lower * 180 / Math.PI, joint.upper * 180 / Math.PI];
      if (Math.abs(got[0] - expected[0]) > 0.2 || Math.abs(got[1] - expected[1]) > 0.2)
         errors.push(`${name} limits ${got.map(v => v.toFixed(2))} differ from ${expected}`);
      const axis = joint.axis;
      if (Math.abs(axis[0]) > 1e-6 || Math.abs(axis[1]) > 1e-6 || Math.abs(axis[2] - 1) > 1e-6)
         errors.push(`${name} axis is not local Z`);
   }
   return errors;
};
