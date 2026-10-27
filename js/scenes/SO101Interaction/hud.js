import * as cg from '../../render/core/cg.js';
import { G2 } from '../../util/g2.js';

export const reparent = (node, newParent) => {
   if (!node || !newParent || node._parent === newParent) return node;
   if (node._parent) node._parent.remove(node);
   newParent._children.push(node);
   node._parent = newParent;
   return node;
};

const worldBillboard = (pos, eye, scale) => {
   if (window.vr && eye) {
      const Z = cg.normalize(cg.subtract(eye, pos));
      let X = cg.cross([0, 1, 0], Z);
      X = cg.norm(X) < 1e-4 ? [1, 0, 0] : cg.normalize(X);
      const Y = cg.normalize(cg.cross(Z, X));
      return [
         X[0] * scale, X[1] * scale, X[2] * scale, 0,
         Y[0] * scale, Y[1] * scale, Y[2] * scale, 0,
         Z[0] * scale, Z[1] * scale, Z[2] * scale, 0,
         pos[0], pos[1], pos[2], 1,
      ];
   }
   return [
      scale, 0, 0, 0,
      0, scale, 0, 0,
      0, 0, scale, 0,
      pos[0], pos[1], pos[2], 1,
   ];
};

export const billboard = (node, pos, eye, scale) => {
   node.setMatrix(worldBillboard(pos, eye, scale));
};

const localFromWorld = (node, world) => {
   const parentM = node._parent ? node._parent.getGlobalMatrix() : cg.mIdentity();
   node.setMatrix(cg.mMultiply(cg.mInverse(parentM), world));
};

const parentPosOf = node => node._parent ? node._parent.getGlobalPos() : [0, 0, 0];

export const makePanel = (model, txtr, scale = 0.15) => {
   const g2 = new G2();
   model.txtrSrc(txtr, g2.getCanvas());
   const obj = model.add('square').txtr(txtr);
   let visible = false;
   const panel = {
      g2,
      obj,
      scale,
      widgets: {},
      offset: [0, 0, 0],
      home: [0, 0.16, 0],
      userMoved: false,
      lastPos: [0, 0, 0],
      attach(parentNode, home) {
         reparent(obj, parentNode);
         if (home) panel.home = [...home];
         return panel;
      },
      resetPlace() { panel.userMoved = false; },
      show() { visible = true; },
      hide() {
         visible = false;
         obj.identity().move(0, -8, 0).scale(0);
      },
      visible() { return visible; },
      active() { return visible && g2.isActiveWidget(); },
      add(type, name, x, y, color, label, action, size) {
         const widget = g2.addWidget(obj, type, x, y, color, label, action, size);
         if (type === 'button') {
            const paint = widget.draw;
            widget.draw = function() {
               g2.textHeight(.09);
               return paint.call(this);
            };
         }
         panel.widgets[name] = widget;
         return widget;
      },
      worldCenter() { return panel.lastPos; },
      dragTo(worldPos) {
         panel.userMoved = true;
         panel.offset = cg.subtract(worldPos, parentPosOf(obj));
         panel.lastPos = [...worldPos];
      },
      follow(eye, s = scale) {
         if (!visible) {
            obj.identity().move(0, -8, 0).scale(0);
            return;
         }
         if (!panel.userMoved) panel.offset = [...panel.home];
         const pos = cg.add(parentPosOf(obj), panel.offset);
         panel.lastPos = pos;
         localFromWorld(obj, worldBillboard(pos, eye, s));
      },
      update() { g2.update(); },
   };
   g2.render = function() {};
   panel.hide();
   return panel;
};

export const deg = rad => (rad * 180 / Math.PI).toFixed(1);

export const makeWorldLabel = (model, meshName, color = [1, 0.86, 0.12]) => {
   clay.defineTextMesh(meshName, '.');
   const board = model.add();
   const glyph = board.add(meshName).color(color);
   let caption = '';
   return {
      set(text) {
         if (text === caption) return;
         caption = text;
         clay.defineTextMesh(meshName, text);
         const width = Math.max(...String(text).split('\n').map(line => line.length)) * 0.019;
         glyph.identity().move(-width / 2, 0.02, 0);
      },
      place(pos, eye, scale = 0.45) {
         if (window.vr && eye) billboard(board, pos, eye, scale);
         else board.identity().move(pos[0], pos[1], pos[2]).scale(scale);
      },
      hide() { board.identity().move(0, -8, 0).scale(0); },
   };
};
