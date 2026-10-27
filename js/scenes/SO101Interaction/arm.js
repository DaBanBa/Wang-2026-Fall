import * as cg from '../../render/core/cg.js';
import { stl } from '../../render/core/stl.js';
import { reparent } from './hud.js';

export const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];

export const LINKS = {
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

export const COMPONENT = {
   base_link: { title: 'Base', link: 'base_link' },
   shoulder_pan: { title: 'Shoulder pan', link: 'shoulder_link' },
   shoulder_lift: { title: 'Shoulder lift', link: 'upper_arm_link' },
   elbow_flex: { title: 'Elbow flex', link: 'lower_arm_link' },
   wrist_flex: { title: 'Wrist flex', link: 'wrist_link' },
   wrist_roll: { title: 'Wrist roll', link: 'gripper_link' },
   gripper: { title: 'Gripper jaw', link: 'moving_jaw_so101_v1_link' },
};

export const ARC = {
   shoulder_pan: 0.055,
   shoulder_lift: 0.042,
   elbow_flex: 0.034,
   wrist_flex: 0.030,
   wrist_roll: 0.026,
   gripper: 0.022,
};

const SELECT = [0.25, 0.95, 1.0];
const HOVER = [1.0, 0.92, 0.35];
const AFFECTED = [1.0, 0.45, 0.12];
const COPY_PRINTED = [0.35, 0.78, 0.92];

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

export const preload = () => {
   for (const meshes of Object.values(LINKS))
      for (const mesh of meshes)
         stl('SO101/' + mesh.stl);
};

export const makePose = joints => {
   const limits = {};
   for (const joint of joints)
      if (joint.type === 'revolute')
         limits[joint.name] = { lower: joint.lower, upper: joint.upper };
   const q = {};
   for (const name of JOINTS) q[name] = 0;
   const clamp = (name, value) => {
      const span = limits[name];
      if (!span || !Number.isFinite(value)) return q[name] || 0;
      return Math.max(span.lower, Math.min(span.upper, value));
   };
   return {
      q,
      limits,
      setJoint(name, value) { q[name] = clamp(name, value); },
      copyFrom(other) {
         for (const name of JOINTS) q[name] = other.q[name];
      },
      normalized(name) {
         const span = limits[name];
         if (!span) return 0.5;
         return (q[name] - span.lower) / (span.upper - span.lower);
      },
      fromNormalized(name, t) {
         const span = limits[name];
         if (!span) return;
         this.setJoint(name, span.lower + t * (span.upper - span.lower));
      },
   };
};

export const descendantsOf = (joints, name) => {
   const children = new Map();
   for (const joint of joints) {
      if (!children.has(joint.parent)) children.set(joint.parent, []);
      children.get(joint.parent).push(joint);
   }
   const byName = Object.fromEntries(joints.map(joint => [joint.name, joint]));
   const joint = byName[name];
   if (!joint) return [];
   const found = [];
   const walk = link => {
      for (const child of children.get(link) || []) {
         found.push(child);
         walk(child.child);
      }
   };
   walk(joint.child);
   return found;
};

export const demoPose = (pose, time) => {
   const speeds = [0.31, 0.23, 0.29, 0.37, 0.19, 0.41];
   JOINTS.forEach((name, i) => {
      const span = pose.limits[name];
      if (!span) return;
      const mid = (span.lower + span.upper) / 2;
      const amp = (span.upper - span.lower) * 0.32;
      pose.setJoint(name, mid + amp * Math.sin(time * speeds[i] + i));
   });
};

const addAxes = parent => {
   const root = parent.add();
   root.add('tubeZ').color(0.95, 0.2, 0.15).dull().move(0.022, 0, 0).turnY(Math.PI / 2).scale(0.0015, 0.0015, 0.022);
   root.add('tubeZ').color(0.2, 0.9, 0.25).dull().move(0, 0.022, 0).turnX(-Math.PI / 2).scale(0.0015, 0.0015, 0.022);
   root.add('tubeZ').color(0.25, 0.45, 1).dull().move(0, 0, 0.022).scale(0.0015, 0.0015, 0.022);
   return root;
};

const tint = (rgb, toward) => rgb.map((c, i) => c * 0.45 + toward[i] * 0.55);

export const createArm = (model, joints, { id, pos, role }) => {
   const root = model.add();
   const base = root.add();
   const linkNode = { base_link: base };
   const mounts = {};
   const parts = [];
   const pending = [];
   const handles = {};
   const marks = {};
   const printed = role === 'copy' ? COPY_PRINTED : [1, .82, .12];

   for (const joint of joints) {
      const origin = linkNode[joint.parent].add();
      const pivot = origin.add();
      linkNode[joint.child] = pivot;
      mounts[joint.name] = { origin, pivot, joint };
   }

   for (const [link, meshes] of Object.entries(LINKS)) {
      for (const mesh of meshes) {
         const partName = 'SO101/' + mesh.stl;
         pending.push({ link, mesh, partName });
      }
   }

   handles.base_link = {
      name: 'base_link',
      node: base.add('sphere').scale(0.014).color(0.55, 0.55, 0.6),
      kind: 'base',
   };
   for (const name of JOINTS) {
      const mount = mounts[name];
      if (!mount) continue;
      handles[name] = {
         name,
         node: mount.origin.add('sphere').scale(0.011).color(0.35, 0.7, 0.95),
         kind: 'joint',
      };
   }

   for (const name of Object.keys(ARC)) {
      const mount = mounts[name];
      const joint = mount && mount.joint;
      if (!joint || joint.type !== 'revolute') continue;
      const radius = ARC[name];
      marks[name] = {
         arc: mount.origin.add(arcMesh('so101iArc_' + id + '_' + name, joint.lower, joint.upper, radius)),
         needle: mount.pivot.add('cube').move(radius * 0.55, 0, 0).scale(radius * 0.45, 0.0016, 0.0016),
         axes: addAxes(mount.origin),
      };
   }

   if (linkNode.gripper_frame_link)
      linkNode.gripper_frame_link.add('sphere').scale(0.007).color(0.95, 0.95, 0.9);

   const hud = root.add();
   const locators = { base_link: base.add() };
   for (const name of JOINTS)
      if (mounts[name]) locators[name] = mounts[name].origin.add();

   const alignWorld = node => {
      const parentM = node._parent.getGlobalMatrix();
      node.setMatrix(cg.mMultiply(cg.mInverse(parentM), cg.mTranslate([parentM[12], parentM[13], parentM[14]])));
   };

   const alignAnchors = () => {
      hud.identity().turnX(Math.PI / 2);
      for (const node of Object.values(locators)) alignWorld(node);
   };

   const arm = {
      id,
      role,
      root,
      base,
      hud,
      pos: [...pos],
      linkNode,
      mounts,
      parts,
      handles,
      marks,
      visible: true,
      locator(name) { return locators[name] || locators.base_link; },
      applyPose(q) {
         root.identity().move(arm.pos[0], arm.pos[1], arm.pos[2]).turnX(-Math.PI / 2);
         for (const joint of joints) {
            const mount = mounts[joint.name];
            const [roll, pitch, yaw] = joint.rpy;
            const angle = joint.type === 'revolute' ? (q[joint.name] || 0) : 0;
            mount.origin.identity().move(...joint.xyz).turnZ(yaw).turnY(pitch).turnX(roll);
            mount.pivot.identity().turnZ(angle);
         }
         alignAnchors();
      },
      place(next) {
         arm.pos = [...next];
         root.identity().move(arm.pos[0], arm.pos[1], arm.pos[2]).turnX(-Math.PI / 2);
         alignAnchors();
      },
      hide() {
         arm.visible = false;
         root.identity().move(0, -8, 0).scale(0);
      },
      show() { arm.visible = true; },
      pollMeshes() {
         for (const item of pending) {
            if (item.done || !clay.formMesh(item.partName)) continue;
            const color = item.mesh.color[0] > 0.5 ? printed : item.mesh.color;
            const node = linkNode[item.link].add(item.partName)
               .move(item.mesh.xyz)
               .turnZ(item.mesh.rpy[2]).turnY(item.mesh.rpy[1]).turnX(item.mesh.rpy[0])
               .color(color);
            parts.push({ node, link: item.link, color, mesh: item.mesh, partName: item.partName });
            item.done = true;
         }
      },
      setOpacity(value) {
         for (const part of parts) part.node.opacity(value);
         for (const handle of Object.values(handles)) handle.node.opacity(value * 0.7);
      },
      paint({ selected, hovered, affected, showArcs, showAxes, q }) {
         const selectedLink = selected && COMPONENT[selected] ? COMPONENT[selected].link : selected;
         const hoveredLink = hovered && COMPONENT[hovered] ? COMPONENT[hovered].link : hovered;
         for (const part of parts) {
            let rgb = part.color;
            if (selectedLink && part.link === selectedLink) rgb = SELECT;
            else if (hoveredLink && part.link === hoveredLink) rgb = HOVER;
            else if (affected && affected.has(part.link)) rgb = tint(part.color, AFFECTED);
            part.node.color(rgb);
         }
         for (const [name, handle] of Object.entries(handles)) {
            const on = name === selected;
            const over = name === hovered;
            handle.node.color(on ? SELECT : over ? HOVER : name === 'base_link' ? [0.55, 0.55, 0.6] : [0.35, 0.7, 0.95]);
            handle.node.opacity(on || over ? 0.95 : 0.45);
         }
         for (const [name, mark] of Object.entries(marks)) {
            const show = !!showArcs && (name === selected || name === hovered);
            const value = q[name] || 0;
            const joint = mounts[name].joint;
            const remain = Math.min(value - joint.lower, joint.upper - value) / ((joint.upper - joint.lower) / 2);
            const color = name === selected ? SELECT : remain > 0.35 ? [0.72, 0.86, 0.95] : remain > 0.15 ? [0.95, 0.72, 0.18] : [0.95, 0.22, 0.16];
            mark.arc.color(color).opacity(show ? 1 : 0);
            mark.needle.color(color).opacity(show ? 1 : 0);
            mark.axes.opacity(showAxes && name === selected ? 1 : 0);
         }
      },
      jointWorld(name) {
         return (handles[name] || handles.base_link).node.getGlobalPos();
      },
   };
   arm.place(pos);
   return arm;
};

export const createDetail = model => {
   const root = model.add();
   const body = root.add();
   const arcHolder = root.add();
   const needleHolder = root.add();
   const axes = addAxes(root);
   let built = '';
   const detail = {
      root,
      offset: [0.3, 0.1, 0.1],
      home: [0.3, 0.1, 0.1],
      userMoved: false,
      visible: false,
      lastPos: [0, 0, 0],
      attach(parentNode, home) {
         reparent(root, parentNode);
         if (home) detail.home = [...home];
         return detail;
      },
      resetPlace() { detail.userMoved = false; },
      hide() {
         detail.visible = false;
         root.identity().move(0, -8, 0).scale(0);
      },
      worldCenter() { return detail.lastPos; },
      dragTo(worldPos) {
         detail.userMoved = true;
         const parentPos = root._parent ? root._parent.getGlobalPos() : [0, 0, 0];
         detail.offset = cg.subtract(worldPos, parentPos);
         detail.lastPos = [...worldPos];
      },
      show(link, srcMatrix, options = {}) {
         const { name, joint, angle = 0, showAxes, showArcs } = options;
         detail.visible = true;
         const meshes = LINKS[link] || [];
         const ready = meshes.every(mesh => clay.formMesh('SO101/' + mesh.stl));
         if (ready && built !== link) {
            while (body.nChildren()) body.remove(0);
            for (const mesh of meshes) {
               body.add('SO101/' + mesh.stl)
                  .move(mesh.xyz)
                  .turnZ(mesh.rpy[2]).turnY(mesh.rpy[1]).turnX(mesh.rpy[0])
                  .color(SELECT);
            }
            while (arcHolder.nChildren()) arcHolder.remove(0);
            while (needleHolder.nChildren()) needleHolder.remove(0);
            if (joint && joint.type === 'revolute' && ARC[name]) {
               const radius = ARC[name];
               arcHolder.add(arcMesh('so101iDetailArc_' + name, joint.lower, joint.upper, radius)).color(SELECT);
               needleHolder.add('cube').move(radius * 0.55, 0, 0).scale(radius * 0.45, 0.0016, 0.0016).color(SELECT);
            }
            built = link;
         }
         if (!detail.userMoved) detail.offset = [...detail.home];
         const parentPos = root._parent ? root._parent.getGlobalPos() : [0, 0, 0];
         detail.lastPos = cg.add(parentPos, detail.offset);
         const R = srcMatrix.slice();
         R[12] = 0; R[13] = 0; R[14] = 0;
         const S = 2.15;
         const world = cg.mMultiply(cg.mTranslate(detail.lastPos), cg.mMultiply(
            [S, 0, 0, 0, 0, S, 0, 0, 0, 0, S, 0, 0, 0, 0, 1], R
         ));
         const parentM = root._parent ? root._parent.getGlobalMatrix() : cg.mIdentity();
         root.setMatrix(cg.mMultiply(cg.mInverse(parentM), world));
         const on = !!(showArcs && joint && joint.type === 'revolute' && ARC[name]);
         arcHolder.identity().turnZ(-angle);
         arcHolder.opacity(on ? 1 : 0);
         needleHolder.opacity(on ? 1 : 0);
         axes.opacity(showAxes ? 1 : 0);
      },
   };
   return detail;
};
