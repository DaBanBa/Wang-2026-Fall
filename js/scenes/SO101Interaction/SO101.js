// so laggy

import * as cg from '../../render/core/cg.js';
import { buttonState, controllerMatrix, joyStickState } from '../../render/core/controllerInput.js';
import { lcb, rcb } from '../../handle_scenes.js';
import { limitErrors } from './kinematics.js';
import {
   COMPONENT, JOINTS, createArm, createDetail, descendantsOf, demoPose, makePose, preload,
} from './arm.js';
import { deg, makePanel, makeWorldLabel } from './hud.js';

const TEACHER_POS = [-0.12, 1.5, 0];
const COPY_POS = [0.34, 1.5, 0];
const TRIGGER = 0, GRIP = 1, A_BUTTON = 4;

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
   if (!clay.views || !clay.views[0] || !clay.inverseRootMatrix) return [0, 1.6, 0.8];
   const m = cg.mMultiply(clay.inverseRootMatrix, cg.mInverse(clay.views[0].viewMatrix));
   return Number.isFinite(m[12]) ? [m[12], m[13], m[14]] : [0, 1.6, 0.8];
};

const beamRay = beam => {
   if (!beam || !beam.beamMatrix) return null;
   const bm = beam.beamMatrix();
   if (!bm || bm.length < 16) return null;
   return {
      o: [bm[12], bm[13], bm[14]],
      d: cg.normalize([-bm[8], -bm[9], -bm[10]]),
   };
};

const rayToPoint = (ray, p) => {
   const v = cg.subtract(p, ray.o);
   const t = cg.dot(v, ray.d);
   if (t < 0.03 || t > 2.4) return 1e9;
   return cg.distance(cg.add(ray.o, cg.scale(ray.d, t)), p);
};

const offsetToward = (from, eye, rightAmt, upAmt, backAmt = 0) => {
   const toEye = cg.subtract(eye, from);
   const z = cg.norm(toEye) < 1e-4 ? [0, 0, 1] : cg.normalize(toEye);
   let x = cg.cross([0, 1, 0], z);
   x = cg.norm(x) < 1e-4 ? [1, 0, 0] : cg.normalize(x);
   const y = cg.normalize(cg.cross(z, x));
   return cg.add(from, cg.add(cg.scale(x, rightAmt), cg.add(cg.scale(y, upAmt), cg.scale(z, backAmt))));
};

if (window.__so101iKey) {
   window.removeEventListener('keydown', window.__so101iKey);
   window.__so101iKey = null;
}

export const init = async model => {
   let robot;
   try {
      robot = await loadJson('robot.json');
   } catch (error) {
      clay.defineTextMesh('so101iMissing', 'robot.json missing');
      model.add().move(-0.25, 1.5, 0).add('so101iMissing').color(1, .4, .3);
      console.error(error);
      return;
   }

   const problems = limitErrors(robot.joints);
   if (problems.length) console.error('SO101 kinematics check failed', problems);

   preload();

   const teacherPose = makePose(robot.joints);
   const copyPose = makePose(robot.joints);
   const teacher = createArm(model, robot.joints, { id: 'teacher', pos: TEACHER_POS, role: 'teacher' });
   const copy = createArm(model, robot.joints, { id: 'copy', pos: COPY_POS, role: 'copy' });
   const detail = createDetail(model);
   copy.hide();

   // Texture ids 3..7 only. Clay's shader samples uSampler[0..15].
   const studio = makePanel(model, 3);
   const actionPad = makePanel(model, 4);
   const teacherPad = makePanel(model, 5);
   const copyPad = makePanel(model, 6);
   const infoPad = makePanel(model, 7);
   const panels = [studio, actionPad, teacherPad, copyPad, infoPad];
   const teacherLabels = {};
   const copyLabels = {};
   for (const name of ['base_link', ...JOINTS]) {
      teacherLabels[name] = makeWorldLabel(model, 'so101iT_' + name);
      copyLabels[name] = makeWorldLabel(model, 'so101iC_' + name, [0.45, 0.85, 1]);
   }

   const state = {
      selected: null,
      hovered: null,
      copyOn: false,
      copyBehavior: 'resync',
      showAxes: false,
      showArcs: true,
      showChain: true,
      demoPlaying: false,
      demoTime: 0,
      carry: null,
      armMenu: null,
   };

   const following = () => state.copyBehavior === 'resync';
   const shownPose = arm => arm === teacher || following() ? teacherPose : copyPose;
   const editPose = arm => arm === teacher ? teacherPose : copyPose;
   const canEdit = arm => arm === teacher || (state.copyOn && state.copyBehavior === 'desync');
   const copyOpacity = () => following() ? 0.72 : 1;

   const partHomes = arm => {
      const side = arm === teacher ? -1 : 1;
      return {
         action: [side * 0.22, 0.14, 0.05],
         detail: [side * 0.32, 0.08, 0.10],
      };
   };

   const savePartLayout = arm => {
      if (!arm) return;
      arm.partLayout = {
         action: { offset: [...actionPad.offset], userMoved: actionPad.userMoved },
         detail: { offset: [...detail.offset], userMoved: detail.userMoved },
      };
   };

   const loadPartLayout = arm => {
      const homes = partHomes(arm);
      actionPad.home = homes.action;
      detail.home = homes.detail;
      const saved = arm.partLayout;
      if (saved) {
         actionPad.offset = [...saved.action.offset];
         actionPad.userMoved = saved.action.userMoved;
         detail.offset = [...saved.detail.offset];
         detail.userMoved = saved.detail.userMoved;
      } else {
         actionPad.resetPlace();
         detail.resetPlace();
      }
   };

   const dismiss = () => {
      savePartLayout(state.selected && state.selected.arm);
      state.selected = null;
      if (state.carry && (state.carry.kind === 'detail' || state.carry.panel === actionPad || state.carry.panel === infoPad))
         state.carry = null;
      actionPad.hide();
      infoPad.hide();
      detail.hide();
   };

   const closeArmMenu = () => {
      state.armMenu = null;
      if (state.carry && (state.carry.panel === teacherPad || state.carry.panel === copyPad))
         state.carry = null;
      teacherPad.hide();
      copyPad.hide();
   };

   const select = (arm, name) => {
      if (state.selected && state.selected.arm !== arm) savePartLayout(state.selected.arm);
      if (!state.selected || state.selected.arm !== arm) loadPartLayout(arm);
      state.selected = { arm, name };
   };

   const snapshotCopy = () => copyPose.copyFrom(teacherPose);

   const placeCopy = pos => {
      state.copyOn = true;
      if (following()) snapshotCopy();
      copy.place(pos);
      copy.show();
      copy.applyPose(shownPose(copy).q);
      copy.setOpacity(copyOpacity());
      state.armMenu = 'copy';
   };

   const removeCopy = () => {
      state.copyOn = false;
      if (state.carry && (state.carry.kind === 'copy' || state.carry.panel === copyPad))
         state.carry = null;
      copy.hide();
      closeArmMenu();
      if (state.selected && state.selected.arm === copy) dismiss();
   };

   const setCopyBehavior = behavior => {
      if (behavior !== 'resync') snapshotCopy();
      state.copyBehavior = behavior;
      copy.setOpacity(copyOpacity());
   };

   const paintStudio = function() {
      this.setColor('white').fillRect(-1, -1, 2, 2);
      this.setColor('black').textHeight(.09);
      this.text('SO-101 STUDIO', 0, .85, 'center');
   };

   const paintAction = function() {
      this.setColor('white').fillRect(-1, -1, 2, 2);
      const sel = state.selected;
      if (!sel) {
         this.setColor('black').textHeight(.09);
         return;
      }
      const info = COMPONENT[sel.name];
      const pose = shownPose(sel.arm);
      const value = pose.q[sel.name] || 0;
      const span = pose.limits[sel.name];
      this.setColor('black').textHeight(.09);
      this.text('ACTIONS', 0, .85, 'center');
      this.textHeight(.07);
      this.text(info ? info.title : sel.name, 0, .62, 'center');
      if (sel.name !== 'base_link') {
         this.text(deg(value) + ' deg', 0, .48, 'center');
         if (span) this.text(deg(span.lower) + '  to  ' + deg(span.upper), 0, .36, 'center');
      }
      this.textHeight(.09);
   };

   const paintTeacher = function() {
      this.setColor('white').fillRect(-1, -1, 2, 2);
      this.setColor('black').textHeight(.09);
      this.text('TEACHER ARM', 0, .85, 'center');
   };

   const paintCopy = function() {
      this.setColor('white').fillRect(-1, -1, 2, 2);
      this.setColor('black').textHeight(.09);
      this.text('YOUR COPY', 0, .85, 'center');
   };

   const paintInfo = function() {
      this.setColor('white').fillRect(-1, -1, 2, 2);
      const sel = state.selected;
      if (!sel) {
         this.setColor('black').textHeight(.09);
         return;
      }
      const info = COMPONENT[sel.name];
      const pose = shownPose(sel.arm);
      const joint = robot.joints.find(j => j.name === sel.name);
      this.setColor('black').textHeight(.09);
      this.text('PART', 0, .85, 'center');
      this.textHeight(.07);
      this.text(info ? info.title : sel.name, 0, .62, 'center');
      let y = 0.38;
      const row = (key, value) => {
         this.text(key + '  ' + value, 0, y, 'center');
         y -= 0.16;
      };
      if (sel.name === 'base_link') {
         row('child', 'shoulder_pan');
      } else if (joint) {
         row('index', String(JOINTS.indexOf(sel.name)));
         row('parent', joint.parent);
         row('child', joint.child);
         if (joint.type === 'revolute')
            row('now', deg(pose.q[sel.name] || 0) + ' deg');
         const down = descendantsOf(robot.joints, sel.name).map(j => j.child.replace('_link', ''));
         row('moves', down.length ? down.join(', ') : 'this link');
      }
      this.textHeight(.09);
   };

   studio.g2.render = paintStudio;
   actionPad.g2.render = paintAction;
   teacherPad.g2.render = paintTeacher;
   copyPad.g2.render = paintCopy;
   infoPad.g2.render = paintInfo;

   const button = (panel, name, x, y, color, label, action) =>
      panel.add('button', name, x, y, color, Array.isArray(label) ? label : [label], action);

   button(studio, 'play', 0, .18, '#c0ffd0', ['Play demo', 'Pause demo'], () => {
      state.demoPlaying = !state.demoPlaying;
   });
   button(studio, 'reset', 0, -.22, '#ffffff', ['Reset pose'], () => {
      state.demoPlaying = false;
      for (const name of JOINTS) teacherPose.setJoint(name, 0);
      if (!following())
         for (const name of JOINTS) copyPose.setJoint(name, 0);
   });

   actionPad.add('slider', 'angle', 0, .12, '#ffcc66', 'set angle', value => {
      const sel = state.selected;
      if (!sel || sel.name === 'base_link' || !canEdit(sel.arm)) return;
      editPose(sel.arm).fromNormalized(sel.name, value);
      state.demoPlaying = false;
   });
   button(actionPad, 'axes', -.52, -.22, '#cfe8ff', ['Axes off', 'Axes on'], () => {
      state.showAxes = !state.showAxes;
   });
   button(actionPad, 'arcs', 0, -.22, '#cfe8ff', ['Arcs off', 'Arcs on'], () => {
      state.showArcs = !state.showArcs;
   });
   button(actionPad, 'chain', .52, -.22, '#ffc8a0', ['Chain off', 'Chain on'], () => {
      state.showChain = !state.showChain;
   });
   button(actionPad, 'close', 0, -.48, '#ffffff', ['Dismiss'], () => dismiss());
   actionPad.widgets.arcs.state = 1;
   actionPad.widgets.chain.state = 1;

   button(teacherPad, 'makeCopy', 0, -.05, '#7ad7ff', ['Make a copy'], () => {
      placeCopy(COPY_POS);
   });
   button(teacherPad, 'closeTeacher', 0, -.38, '#ffffff', ['Close'], () => closeArmMenu());

   button(copyPad, 'desync', 0, .36, '#9ee0c0', ['Desync'], () => setCopyBehavior('desync'));
   button(copyPad, 'resync', 0, .10, '#7ad7ff', ['Resync'], () => setCopyBehavior('resync'));
   button(copyPad, 'remove', 0, -.20, '#ffffff', ['delete copy'], () => removeCopy());
   button(copyPad, 'closeCopy', 0, -.46, '#ffffff', ['Close'], () => closeArmMenu());

   const held = { left: {}, right: {} };
   const rose = (hand, button) => {
      const pressed = !!(buttonState[hand] && buttonState[hand][button] && buttonState[hand][button].pressed);
      const fired = pressed && !held[hand][button];
      held[hand][button] = pressed;
      return fired;
   };
   const down = (hand, button) => !!(buttonState[hand] && buttonState[hand][button] && buttonState[hand][button].pressed);

   const arms = () => state.copyOn ? [teacher, copy] : [teacher];

   const lookRay = () => {
      if (!clay.views || !clay.views[0] || !clay.inverseRootMatrix) return null;
      const cam = cg.mMultiply(clay.inverseRootMatrix, cg.mInverse(clay.views[0].viewMatrix));
      if (!Number.isFinite(cam[12])) return null;
      return {
         o: [cam[12], cam[13], cam[14]],
         d: cg.normalize([-cam[8], -cam[9], -cam[10]]),
      };
   };

   const pointers = () => ({
      rays: [beamRay(lcb), beamRay(rcb), lookRay()].filter(Boolean),
      hands: [worldPoint(controllerMatrix.left), worldPoint(controllerMatrix.right)].filter(Boolean),
   });

   const distanceTo = (pos, handSlack = 0) => {
      const { rays, hands } = pointers();
      let dist = 1e9;
      for (const ray of rays) dist = Math.min(dist, rayToPoint(ray, pos));
      for (const hand of hands) dist = Math.min(dist, cg.distance(hand, pos) - handSlack);
      return dist;
   };

   const pick = (maxDist = 0.045) => {
      let best = null, bestDist = maxDist;
      for (const arm of arms()) {
         if (!arm.visible) continue;
         for (const name of ['base_link', ...JOINTS]) {
            const pos = arm.jointWorld(name);
            const dist = distanceTo(pos, 0.01);
            if (dist < bestDist) {
               bestDist = dist;
               best = { arm, name, pos };
            }
         }
      }
      return best;
   };

   const widgetHit = () => {
      try {
         for (const panel of panels)
            if (panel.visible() && panel.g2.getUVZ(panel.obj)) return panel;
      } catch (error) {}
      return null;
   };

   const widgetBusy = () => panels.some(panel => panel.active());

   const nearPoint = (pos, maxDist) => {
      if (!pos) return null;
      const dist = distanceTo(pos);
      return dist < maxDist ? dist : null;
   };

   const pickGrip = () => {
      const pointed = widgetHit();
      if (pointed) return { kind: 'panel', panel: pointed };
      let best = null, bestDist = 0.12;
      for (const panel of panels) {
         if (!panel.visible()) continue;
         const dist = nearPoint(panel.worldCenter(), bestDist);
         if (dist != null) {
            bestDist = dist;
            best = { kind: 'panel', panel };
         }
      }
      if (state.selected && detail.visible) {
         const dist = nearPoint(detail.worldCenter(), Math.max(0.16, bestDist));
         if (dist != null && (best === null || dist < bestDist)) {
            bestDist = dist;
            best = { kind: 'detail' };
         }
      }
      if (state.hovered && state.hovered.arm === copy) {
         const dist = nearPoint(state.hovered.pos, 0.09);
         if (dist != null && (best === null || dist < bestDist - 0.02))
            best = { kind: 'copy' };
      }
      return best;
   };

   const carryPos = target => {
      if (target.kind === 'panel') return target.panel.worldCenter();
      if (target.kind === 'detail') return detail.worldCenter();
      return copy.pos;
   };

   let mouseWas = false;
   const mouseRose = () => {
      const z = !!window.mouseZ;
      const fired = z && !mouseWas;
      mouseWas = z;
      return fired;
   };

   const jointCaption = (name, q) => {
      const info = COMPONENT[name];
      const title = info ? info.title : name;
      if (name === 'base_link') return title;
      const joint = robot.joints.find(j => j.name === name);
      if (!joint || joint.type !== 'revolute') return title;
      return `${title}\n${deg(q[name] || 0)} deg`;
   };

   const placeLabels = (labels, arm, q, selName, hoverName, eye) => {
      if (!arm.visible) {
         for (const label of Object.values(labels)) label.hide();
         return;
      }
      for (const name of Object.keys(labels)) {
         const pos = arm.jointWorld(name);
         const on = name === selName || name === hoverName;
         labels[name].set(jointCaption(name, q));
         labels[name].place(offsetToward(pos, eye, 0, 0.038, 0.012), eye, on ? 0.52 : 0.34);
      }
   };

   studio.attach(teacher.hud, [-0.38, 0.22, 0.10]);
   teacherPad.attach(teacher.hud, [-0.12, 0.18, 0.04]);
   copyPad.attach(copy.hud, [0.12, 0.18, 0.04]);
   studio.show();

   let lastTime = 0;
   model.animate(() => {
      const dt = Math.min(0.05, Math.max(0, model.time - lastTime));
      lastTime = model.time;
      const eye = eyePosition();

      teacher.pollMeshes();
      copy.pollMeshes();
      if (state.copyOn) copy.setOpacity(copyOpacity());

      const overWidget = widgetHit();
      const clicked = mouseRose();
      state.hovered = overWidget ? null : pick(0.08);

      if (!widgetBusy()) {
         for (const hand of ['left', 'right']) {
            if (rose(hand, A_BUTTON)) {
               const target = state.hovered || pick(0.1);
               if (target && target.arm === teacher)
                  state.armMenu = state.armMenu === 'teacher' ? null : 'teacher';
               else if (target && target.arm === copy)
                  state.armMenu = state.armMenu === 'copy' ? null : 'copy';
               else closeArmMenu();
            }
            if (!overWidget && (rose(hand, TRIGGER) || clicked)) {
               if (state.hovered) select(state.hovered.arm, state.hovered.name);
               else dismiss();
               break;
            }
            if (rose(hand, GRIP)) {
               const handPos = worldPoint(controllerMatrix[hand]);
               const target = pickGrip();
               if (handPos && target)
                  state.carry = { ...target, hand, offset: cg.subtract(carryPos(target), handPos) };
            }
         }
      }

      for (const hand of ['left', 'right']) {
         const handPos = worldPoint(controllerMatrix[hand]);
         if (!state.carry || state.carry.hand !== hand) continue;
         if (!down(hand, GRIP) || !handPos) {
            state.carry = null;
            continue;
         }
         const next = [
            handPos[0] + state.carry.offset[0],
            Math.max(1.05, handPos[1] + state.carry.offset[1]),
            handPos[2] + state.carry.offset[2],
         ];
         if (state.carry.kind === 'copy') {
            if (!state.copyOn) state.carry = null;
            else copy.place(next);
         } else if (state.carry.kind === 'detail') {
            if (!state.selected) state.carry = null;
            else detail.dragTo(next);
         } else if (state.carry.kind === 'panel' && state.carry.panel) {
            if (!state.carry.panel.visible()) state.carry = null;
            else state.carry.panel.dragTo(next);
         }
      }

      if (state.selected && canEdit(state.selected.arm) && state.selected.name !== 'base_link') {
         const stick = joyStickState.right && joyStickState.right.x || 0;
         if (Math.abs(stick) > 0.25) {
            editPose(state.selected.arm).setJoint(state.selected.name, editPose(state.selected.arm).q[state.selected.name] + stick * 0.9 * dt);
            state.demoPlaying = false;
         }
      }

      if (state.demoPlaying) {
         state.demoTime += dt;
         demoPose(teacherPose, state.demoTime);
      }

      const copyQ = shownPose(copy).q;
      teacher.applyPose(teacherPose.q);
      if (state.copyOn) copy.applyPose(copyQ);
      else copy.hide();

      const affected = new Set();
      if (state.selected && state.showChain && state.selected.name !== 'base_link') {
         affected.add(COMPONENT[state.selected.name].link);
         for (const joint of descendantsOf(robot.joints, state.selected.name))
            affected.add(joint.child);
      }
      const hoverName = state.hovered ? state.hovered.name : null;
      const selectedName = state.selected ? state.selected.name : null;
      const paint = (arm, q) => arm.paint({
         selected: state.selected && state.selected.arm === arm ? selectedName : null,
         hovered: state.hovered && state.hovered.arm === arm ? hoverName : null,
         affected: state.selected && state.selected.arm === arm ? affected : null,
         showArcs: state.showArcs,
         showAxes: state.showAxes,
         q,
      });
      paint(teacher, teacherPose.q);
      if (state.copyOn) paint(copy, copyQ);

      placeLabels(teacherLabels, teacher, teacherPose.q,
         state.selected && state.selected.arm === teacher ? selectedName : null,
         state.hovered && state.hovered.arm === teacher ? hoverName : null, eye);
      if (state.copyOn)
         placeLabels(copyLabels, copy, copyQ,
            state.selected && state.selected.arm === copy ? selectedName : null,
            state.hovered && state.hovered.arm === copy ? hoverName : null, eye);
      else for (const label of Object.values(copyLabels)) label.hide();

      if (state.selected) {
         const { arm, name } = state.selected;
         const info = COMPONENT[name];
         const link = info ? info.link : 'base_link';
         const src = arm.linkNode[link];
         const homes = partHomes(arm);
         actionPad.attach(arm.hud, homes.action);
         actionPad.show();
         actionPad.follow(eye);
         if (!actionPad.active() && shownPose(arm).limits[name]) {
            actionPad.widgets.angle.setValue(shownPose(arm).normalized(name));
            actionPad.widgets.angle.setLabel(deg(shownPose(arm).q[name]) + ' deg');
         }
         if (src) {
            detail.attach(arm.hud, homes.detail);
            detail.show(link, src.getGlobalMatrix(), {
               name,
               joint: robot.joints.find(j => j.name === name),
               angle: shownPose(arm).q[name] || 0,
               showAxes: state.showAxes,
               showArcs: state.showArcs,
            });
            infoPad.attach(detail.root, [0, 0.20, 0.04]);
            infoPad.show();
            infoPad.follow(eye);
         }
         savePartLayout(arm);
      } else {
         actionPad.hide();
         infoPad.hide();
         detail.hide();
      }

      if (state.armMenu === 'teacher') {
         teacherPad.show();
         teacherPad.follow(eye);
      } else teacherPad.hide();
      if (state.armMenu === 'copy' && state.copyOn) {
         copyPad.show();
         copyPad.follow(eye);
      } else copyPad.hide();

      studio.follow(eye);
      studio.widgets.play.state = state.demoPlaying ? 1 : 0;

      for (const panel of panels) panel.update();
   });
};
