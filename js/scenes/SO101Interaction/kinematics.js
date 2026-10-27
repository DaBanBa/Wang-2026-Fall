import * as cg from '../../render/core/cg.js';

export const TOOL = 'gripper_frame_joint';

const EXPECTED_DEG = {
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
