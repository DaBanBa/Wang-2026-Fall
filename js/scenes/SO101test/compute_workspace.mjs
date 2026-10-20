import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { ARM, EXPECTED_DEG, TOOL, jacobian, limitErrors, manipulability, solve, translation } from './kinematics.js';

const here = new URL('.', import.meta.url);
const VOXEL = 0.02;
const GRID = {
   shoulder_pan: 14,
   shoulder_lift: 12,
   elbow_flex: 12,
   wrist_flex: 10,
   wrist_roll: 8,
};

const nums = text => text.trim().split(/\s+/).map(Number);

const parseUrdf = xml => {
   const blocks = xml.match(/<joint name="[^"]+" type="[^"]+">[\s\S]*?<\/joint>/g) || [];
   const joints = blocks.map(block => {
      const name = block.match(/name="([^"]+)"/)[1];
      const type = block.match(/type="([^"]+)"/)[1];
      const origin = block.match(/<origin[^>]*>/)[0];
      const parent = block.match(/<parent link="([^"]+)"/)[1];
      const child = block.match(/<child link="([^"]+)"/)[1];
      const axis = block.match(/<axis xyz="([^"]+)"/);
      const lower = block.match(/lower="([^"]+)"/);
      const upper = block.match(/upper="([^"]+)"/);
      return {
         name, type, parent, child,
         xyz: nums(origin.match(/xyz="([^"]+)"/)[1]),
         rpy: nums(origin.match(/rpy="([^"]+)"/)[1]),
         axis: axis ? nums(axis[1]) : [0, 0, 0],
         lower: lower ? Number(lower[1]) : 0,
         upper: upper ? Number(upper[1]) : 0,
      };
   });
   const children = new Map();
   for (const joint of joints) {
      if (!children.has(joint.parent)) children.set(joint.parent, []);
      children.get(joint.parent).push(joint);
   }
   for (const group of children.values()) group.sort((a, b) => a.name < b.name ? -1 : 1);
   const ordered = [];
   const walk = link => {
      for (const joint of children.get(link) || []) {
         ordered.push(joint);
         walk(joint.child);
      }
   };
   walk('base_link');
   return ordered;
};

const linspace = (lo, hi, count) => {
   if (count <= 1) return [(lo + hi) / 2];
   const step = (hi - lo) / (count - 1);
   return Array.from({ length: count }, (_, i) => lo + step * i);
};

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const checkStructure = joints => {
   const errors = [];
   const zero = Object.fromEntries(ARM.map(name => [name, 0]));
   zero.gripper = 0;
   const p0 = translation(solve(joints, zero)[TOOL]);
   const gripped = { ...zero, gripper: 1.2 };
   if (distance(p0, translation(solve(joints, gripped)[TOOL])) > 1e-9)
      errors.push('gripper actuator moved the tool frame');
   const rolled = { ...zero, wrist_roll: 1 };
   const rollMotion = distance(p0, translation(solve(joints, rolled)[TOOL]));
   if (!(rollMotion > 0.004 && rollMotion < 0.02))
      errors.push(`wrist roll moved the tool by ${rollMotion.toFixed(4)} m, expected about 8 mm`);
   const panned = { ...zero, shoulder_pan: Math.PI / 2 };
   if (distance(p0, translation(solve(joints, panned)[TOOL])) < 0.05)
      errors.push('shoulder pan did not move the tool');
   const reach = distance(p0, [0, 0, 0]);
   if (!(reach > 0.05 && reach < 0.6))
      errors.push(`tool at the zero pose is ${reach.toFixed(3)} m from the base`);
   return { errors, zeroTool: p0 };
};

const checkJacobian = joints => {
   const probes = [
      Object.fromEntries(ARM.map(name => [name, 0])),
      Object.fromEntries(ARM.map((name, i) => [name, 0.35 * ((-1) ** i)])),
      { shoulder_pan: 1.2, shoulder_lift: -0.8, elbow_flex: 1.1, wrist_flex: -0.6, wrist_roll: 1.4 },
      { shoulder_pan: -1.5, shoulder_lift: 1.4, elbow_flex: -1.3, wrist_flex: 1.2, wrist_roll: -2.0 },
      { shoulder_pan: 0.2, shoulder_lift: 0.2, elbow_flex: 0.2, wrist_flex: 0.2, wrist_roll: 0.2 },
      { shoulder_pan: -0.4, shoulder_lift: -1.2, elbow_flex: 1.5, wrist_flex: -1.4, wrist_roll: 2.2 },
   ];
   const eps = 1e-6;
   let worst = 0;
   for (const q of probes) {
      const columns = jacobian(solve(joints, q));
      ARM.forEach((name, index) => {
         const plus = { ...q, [name]: q[name] + eps };
         const minus = { ...q, [name]: q[name] - eps };
         const pp = translation(solve(joints, plus)[TOOL]);
         const pm = translation(solve(joints, minus)[TOOL]);
         for (let row = 0; row < 3; row++) {
            const numeric = (pp[row] - pm[row]) / (2 * eps);
            worst = Math.max(worst, Math.abs(numeric - columns[index][row]));
         }
      });
   }
   return worst;
};

const referencePoses = joints => {
   const poses = [
      Object.fromEntries(ARM.map(name => [name, 0])),
      { shoulder_pan: 0.4, shoulder_lift: -0.5, elbow_flex: 0.8, wrist_flex: -0.3, wrist_roll: 0.6 },
      { shoulder_pan: -1.0, shoulder_lift: 0.7, elbow_flex: -0.9, wrist_flex: 0.5, wrist_roll: -1.2 },
      { shoulder_pan: 1.5, shoulder_lift: -1.2, elbow_flex: 1.4, wrist_flex: -1.1, wrist_roll: 2.0 },
   ];
   return poses.map(q => {
      const frames = solve(joints, q);
      const columns = jacobian(frames);
      return { q, p: translation(frames[TOOL]), mu: manipulability(columns), J: columns };
   });
};

const sample = joints => {
   const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
   const axes = ARM.map(name => linspace(byName[name].lower, byName[name].upper, GRID[name]));
   const voxels = new Map();
   let count = 0;
   let muMax = 0;
   let muMin = Infinity;
   const started = performance.now();
   for (const q0 of axes[0])
   for (const q1 of axes[1])
   for (const q2 of axes[2])
   for (const q3 of axes[3])
   for (const q4 of axes[4]) {
      const q = { shoulder_pan: q0, shoulder_lift: q1, elbow_flex: q2, wrist_flex: q3, wrist_roll: q4 };
      const frames = solve(joints, q);
      const position = translation(frames[TOOL]);
      const score = manipulability(jacobian(frames));
      if (score > muMax) muMax = score;
      if (score < muMin) muMin = score;
      const key = position.map(value => Math.floor(value / VOXEL + 0.5)).join(',');
      const previous = voxels.get(key);
      if (previous === undefined || score > previous) voxels.set(key, score);
      count++;
   }
   const packed = [];
   for (const [key, score] of voxels) {
      const index = key.split(',').map(Number);
      packed.push([
         Math.round(index[0] * VOXEL * 1e6) / 1e6,
         Math.round(index[1] * VOXEL * 1e6) / 1e6,
         Math.round(index[2] * VOXEL * 1e6) / 1e6,
         score,
      ]);
   }
   return { count, muMin, muMax, voxels: packed, seconds: (performance.now() - started) / 1000 };
};

const xml = readFileSync(new URL('./urdf/so101_new_calib.urdf', here), 'utf8');
const joints = parseUrdf(xml);
const limits = limitErrors(joints);
const structure = checkStructure(joints);
const jacobianError = checkJacobian(joints);
const errors = [...limits, ...structure.errors];
if (jacobianError > 1e-5) errors.push(`Jacobian finite-difference error ${jacobianError.toExponential(3)}`);
if (errors.length) {
   for (const error of errors) console.error('FAIL', error);
   process.exit(1);
}

console.log('limits match the new-calibration URDF');
console.log(`zero-pose tool ${structure.zeroTool.map(v => v.toFixed(4)).join(' ')} m`);
console.log(`jacobian finite-difference max abs error ${jacobianError.toExponential(3)}`);

const field = sample(joints);
if (!(field.muMax > 0) || !(field.muMin < 0.25 * field.muMax)) {
   console.error('FAIL manipulability range is not usable', field.muMin, field.muMax);
   process.exit(1);
}

const data = new URL('./data/', here);
mkdirSync(data, { recursive: true });
writeFileSync(new URL('robot.json', data), JSON.stringify({
   name: 'so101_new_calib',
   source: 'https://github.com/TheRobotStudio/SO-ARM100/blob/main/Simulation/SO101/so101_new_calib.urdf',
   units: {
      joint: 'URDF radians. New calibration: zero is the middle of each arm joint range.',
      motor: 'A LeRobot .pos value for this calibration is degrees and converts by pi/180. No extra offset is applied.',
      length: 'meters in base_link, Z up',
      vr: 'one base transform, move(-0.1, 1.5, 0) then turnX(-pi/2), shared by the arm and the field',
   },
   arm: ARM,
   tool: TOOL,
   joints,
   expectedDeg: EXPECTED_DEG,
}));
writeFileSync(new URL('workspace.json', data), JSON.stringify({
   calibration: 'so101_new_calib',
   quantity: 'positional manipulability of the gripper frame',
   score: 'max over samples in the voxel of the product of the three singular values of the 3x5 positional Jacobian',
   not: 'Not a collision map and not a guarantee that a grasp or task is feasible.',
   unsampled: 'Cells with no sample are omitted. A stored score of 0 would be a sampled singular pose.',
   voxel: VOXEL,
   sampleCount: field.count,
   voxelCount: field.voxels.length,
   muMinSample: field.muMin,
   muMax: field.muMax,
   grid: GRID,
   seconds: Math.round(field.seconds * 1000) / 1000,
   voxels: field.voxels,
}));
writeFileSync(new URL('validation.json', data), JSON.stringify({
   jacobianMaxAbsError: jacobianError,
   muMinSample: field.muMin,
   muMax: field.muMax,
   zeroTool: structure.zeroTool,
   poses: referencePoses(joints),
}));

console.log(`samples ${field.count} in ${field.seconds.toFixed(2)}s (${Math.round(field.count / field.seconds)}/s)`);
console.log(`voxels ${field.voxels.length} at ${VOXEL.toFixed(3)} m`);
console.log(`mu sample range ${field.muMin.toExponential(6)} .. ${field.muMax.toExponential(6)}`);
console.log('wrote data/robot.json data/workspace.json data/validation.json');
