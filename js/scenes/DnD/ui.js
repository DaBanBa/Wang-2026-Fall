import * as CG from '../../render/core/cg.js';
import * as Models from './models.js';
import * as Canvas2D from '../../util/g2.js';
import * as Data from './data.js';

const dnd_ui_draw = (() => {
   const cg = CG;
   const { showItemIcon } = Models;

   const CHAR_W = 0.0127;
   const CHAR_H = 0.0254;

   const showIcon = (rec, spr, x, y, s, face) => showItemIcon(rec, spr, x, y, s, face);

   const label = (parent, str, x, y, z, s, rgb, face) => {
      try {
         const n = parent.add(clay.text(String(str)));
         const w = String(str).length * CHAR_W * s;
         const h = CHAR_H * s;
         if (face) n.move(x - w / 2, y + h / 2, z);
         else n.move(x - w / 2, y, z - h / 2).turnX(-Math.PI / 2);
         n.scale(s).color(rgb || [.12, .08, .04]);
         return n;
      } catch (err) { return parent.add(); }
   };

   const billboard = (node, pos, eye, s, face) => {
      const Z = cg.normalize(face || cg.subtract(eye, pos));
      let X = cg.cross([0, 1, 0], Z);
      if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = [1, 0, 0];
      X = cg.normalize(X);
      const Y = cg.normalize(cg.cross(Z, X));
      const k = s == null ? 1 : s;
      node.setMatrix([
         X[0] * k, X[1] * k, X[2] * k, 0,
         Y[0] * k, Y[1] * k, Y[2] * k, 0,
         Z[0] * k, Z[1] * k, Z[2] * k, 0,
         pos[0], pos[1], pos[2], 1,
      ]);
   };

   const addChrome = parent => {
      const back = parent.add('cube').color(.07, .04, .03).dull();
      const gold = parent.add('cube').color(.78, .56, .18).dull();
      const face = parent.add('cube').color(.16, .08, .05).dull();
      return {
         pose(hx, hy) {
            back.identity().move(0, 0, -.006).scale(hx + .01, hy + .01, .004);
            gold.identity().move(0, 0, -.004).scale(hx + .006, hy + .006, .003);
            face.identity().move(0, 0, -.002).scale(hx, hy, .002);
         },
      };
   };

   const addTableChrome = parent => {
      const back = parent.add('cube').color(.07, .04, .03).dull();
      const gold = parent.add('cube').color(.78, .56, .18).dull();
      const face = parent.add('cube').color(.16, .08, .05).dull();
      return {
         pose(hx, hz) {
            back.identity().move(0, .0005, 0).scale(hx + .01, .0014, hz + .01);
            gold.identity().move(0, .0011, 0).scale(hx + .006, .0012, hz + .006);
            face.identity().move(0, .0016, 0).scale(hx, .0008, hz);
         },
      };
   };

   const g2Frame = (g, title) => {
      g.setColor('#1c140e');
      g.fillRect(-1, -1, 2, 2);
      g.setColor('#2e2116');
      g.fillRect(-.96, -.96, 1.92, 1.92, .06);
      g.setColor('#c6a15a');
      g.fillRect(-.96, .9, 1.92, .065, .02);
      g.fillRect(-.96, -1, 1.92, .04, .02);
      g.setColor('#6d5230');
      g.fillRect(-.88, .84, 1.76, .012);
      if (title) {
         const s = String(title);
         g.setColor('#f6e2b0');
         g.textHeight(s.length > 18 ? .068 : s.length > 13 ? .082 : .098);
         g.text(s.toUpperCase(), 0, .68, 'center');
      }
   };

   const hpStripe = (g, x, y, w, v, m, name) => {
      const t = Math.max(0, Math.min(1, m ? v / m : 0));
      g.setColor('#ead8b4');
      g.textHeight(.048);
      g.text(name || 'HP', x, y + .09, 'left');
      g.setColor('#140e0a');
      g.fillRect(x, y, w, .075, .02);
      const col = t > .55 ? '#3eae58' : t > .25 ? '#d2a43a' : '#c4473a';
      g.setColor(col);
      g.fillRect(x + .012, y + .014, Math.max(.02, (w - .024) * t), .047, .014);
   };

   const drawAbils = (g, stats, y) => {
      if (!stats || !stats.length) return;
      const n = stats.length;
      const w = n > 4 ? .28 : .42;
      const gap = n > 4 ? .03 : .08;
      const total = n * w + (n - 1) * gap;
      let x = -total / 2;
      stats.forEach(st => {
         g.setColor('#3a2818');
         g.fillRect(x, y, w, .32, .04);
         g.setColor('#e2c27a');
         g.textHeight(.042);
         g.text(st.name, x + w / 2, y + .24, 'center');
         g.setColor('#f7f1e4');
         g.textHeight(.086);
         g.text(String(st.v), x + w / 2, y + .11, 'center');
         g.setColor('#f0d48a');
         g.textHeight(.046);
         g.text(st.mod || '', x + w / 2, y + .02, 'center');
         x += w + gap;
      });
   };

   const factRow = (g, facts, y) => {
      if (!facts || !facts.length) return;
      const w = facts.length > 4 ? .3 : .36;
      const gap = .035;
      const total = facts.length * w + (facts.length - 1) * gap;
      let x = -total / 2;
      facts.forEach(f => {
         g.setColor('#2a1e14');
         g.fillRect(x, y, w, .15, .03);
         g.setColor('#c6a15a');
         g.textHeight(.038);
         g.text(String(f.k).toUpperCase(), x + w / 2, y + .09, 'center');
         g.setColor('#f4ead4');
         g.textHeight(.05);
         g.text(String(f.v), x + w / 2, y + .02, 'center');
         x += w + gap;
      });
   };
   return { showIcon, label, billboard, addChrome, addTableChrome, g2Frame, hpStripe, drawAbils, factRow };
})();

const dnd_ui_hud = (() => {
   const { G2 } = Canvas2D;
   const { signed, attackBonus, damageFormula } = Data;
   const { addChrome, billboard, g2Frame, hpStripe, factRow } = dnd_ui_draw;

   const makeHud = (model, hooks) => {
      const g2 = new G2();
      model.txtrSrc(5, g2.getCanvas());
      const root = model.add();
      const chrome = addChrome(root);
      const obj = root.add('square').txtr(5).dull();
      const body = root.add('cube').color(.16, .08, .05).opacity(.001);
      let shown = false;
      g2.render = function() {
         const H = hooks.hero();
         const scores = hooks.scores ? hooks.scores() : null;
         const w = hooks.weapon();
         g2Frame(this, (hooks.night() ? 'Night' : 'Day') + '  ' + hooks.turn());
         this.setColor('#e7d3a4');
         this.textHeight(.052);
         this.text((H.className || 'Fighter') + '  ' + (H.level || 1) + '   ' + (H.gold || 0) + ' gp', 0, .5, 'center');
         hpStripe(this, -.78, .26, 1.56, H.hp, H.hpMax, 'HP  ' + H.hp + '/' + H.hpMax);
         factRow(this, [
            { k: 'AC', v: H.ac },
            { k: 'Init', v: signed(H.init || 0) },
            { k: 'Insp', v: H.insp || 0 },
         ], .02);
         this.setColor('#9dcea6');
         this.textHeight(.055);
         this.text('Move  ' + '●'.repeat(hooks.mp()) + '○'.repeat(Math.max(0, 3 - hooks.mp())), 0, -.28, 'center');
         this.setColor('#f0e2c4');
         this.textHeight(.046);
         const line = w && scores
            ? w.name + '  ' + signed(attackBonus(scores, H.level, w)) + '  ' + damageFormula(scores, w)
            : (w ? w.name : '');
         this.text(line, 0, -.48, 'center');
         this.setColor('#cbb48a');
         this.textHeight(.04);
         this.text(hooks.log() || '', 0, -.72, 'center');
      };
      return {
         obj: root,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         active() { return false; },
         matrix(m) {
            if (!shown) { root.identity().scale(0); return; }
            root.setMatrix(m);
         },
         place(pos, eye, s, face) {
            if (!shown) { root.identity().scale(0); return; }
            chrome.pose(.16, .21);
            body.identity().move(0, 0, -.014).scale(.17, .22, .008);
            obj.identity().move(0, 0, .004).scale(.152, .202, 1);
            billboard(root, pos, eye, s || .55, face);
         },
         update() { g2.update(); },
         body,
      };
   };
   return { makeHud };
})();

const dnd_ui_god = (() => {
   const { KINDS, KIND, HALF } = Data;
   const { label, addTableChrome } = dnd_ui_draw;

   const makeGodSheet = stage => {
      const root = stage.add();
      const palette = root.add();
      const acts = root.add();
      const palChrome = addTableChrome(palette);
      const actChrome = addTableChrome(acts);
      const cols = 3;
      const rows = Math.ceil(KINDS.length / cols);
      const pitch = 0.056;
      const z0 = ((rows - 1) * pitch) / 2;
      label(palette, 'PAWNS', 0, .012, z0 + 0.048, .36, [.95, .82, .5], false);

      const cells = [];
      KINDS.forEach((kind, i) => {
         const col = i % cols, row = (i / cols) | 0;
         const x = (col - (cols - 1) / 2) * pitch;
         const z = z0 - row * pitch;
         const tile = palette.add('cube').color(.18, .1, .06).dull();
         const gold = palette.add('cube').color(.78, .56, .2).dull();
         const rim = palette.add('cube').color(1.15, .9, .4);
         label(palette, KIND[kind].label.toUpperCase(), x, .014, z - .022, .16, [.95, .82, .5], false);
         cells.push({ id: kind, type: 'kind', tile, gold, rim, x, z, hx: .024, hz: .022 });
      });

      [
         { id: 'enter', label: 'PLAY', color: [.28, .5, .26] },
         { id: 'tiles', label: 'TILES', color: [.22, .36, .5] },
         { id: 'clear', label: 'CLEAR', color: [.55, .22, .18] },
      ].forEach((act, i) => {
         const x = -0.056 + i * 0.056;
         const z = 0;
         const tile = acts.add('cube').color(act.color).dull();
         const gold = acts.add('cube').color(.78, .56, .2).dull();
         const rim = acts.add('cube').color(1.1, .9, .4);
         label(acts, act.label, x, .014, z, .28, [.95, .85, .55], false);
         cells.push({ id: act.id, type: 'act', tile, gold, rim, x, z, hx: .026, hz: .02 });
      });

      let shown = true;
      return {
         root, cells,
         ox: HALF + 0.20, oy: 0.003, oz: 0,
         ax: -HALF - 0.20, ay: 0.003, az: 0,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(sel, hover) {
            if (!shown) { root.identity().scale(0); return; }
            root.identity();
            palette.identity().move(this.ox, this.oy, this.oz);
            acts.identity().move(this.ax, this.ay, this.az);
            palChrome.pose(.10, z0 + 0.07);
            actChrome.pose(.11, .045);
            cells.forEach(c => {
               const on = c.id === sel || c.id === hover;
               c.tile.identity().move(c.x, .005, c.z).scale(c.hx, .0025, c.hz);
               if (c.gold) c.gold.identity().move(c.x, .003, c.z).scale(c.hx + .003, .0015, c.hz + .003);
               if (c.rim) {
                  if (on) c.rim.identity().move(c.x, .006, c.z).scale(c.hx + .005, .0012, c.hz + .005);
                  else c.rim.identity().scale(0);
               }
            });
         },
      };
   };
   return { makeGodSheet };
})();

const dnd_ui_tiles = (() => {
   const { GROUNDS, GROUND, HALF } = Data;
   const { tileForm, TILE_CH } = Models;
   const { label, addTableChrome } = dnd_ui_draw;

   const makeTileSheet = stage => {
      const root = stage.add();
      const chrome = addTableChrome(root);
      label(root, 'TERRAIN', 0, .012, .155, .42, [.95, .82, .5], false);

      const cells = [];
      GROUNDS.forEach((id, i) => {
         const col = i % 2, row = (i / 2) | 0;
         const x = -0.034 + col * 0.068;
         const z = 0.078 - row * 0.052;
         const gold = root.add('cube').color(.78, .56, .2).dull();
         const tile = root.add(tileForm(id)).txtr(TILE_CH).dull().color(1, 1, 1);
         const rim = root.add('cube').color(1.1, .9, .35);
         label(root, GROUND[id].label.toUpperCase(), x, .018, z - .024, .22, [.95, .82, .5], false);
         cells.push({ id, type: 'ground', tile, gold, rim, x, z, hx: .03, hz: .024 });
      });
      [
         { id: 'build', label: 'BUILD', color: [.28, .5, .26] },
         { id: 'fill', label: 'FILL', color: [.55, .42, .16] },
      ].forEach((act, i) => {
         const x = -0.034 + i * 0.068;
         const z = -0.12;
         const tile = root.add('cube').color(act.color).dull();
         const gold = root.add('cube').color(.78, .56, .2).dull();
         const rim = root.add('cube').color(1.1, .9, .4);
         label(root, act.label, x, .014, z, .26, [.95, .85, .55], false);
         cells.push({ id: act.id, type: 'act', tile, gold, rim, x, z, hx: .028, hz: .018 });
      });

      let shown = false;
      return {
         root, cells,
         ox: HALF + 0.20, oy: 0.003, oz: 0,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(sel, hover) {
            if (!shown) { root.identity().scale(0); return; }
            root.identity().move(this.ox, this.oy, this.oz);
            chrome.pose(.12, .175);
            cells.forEach(c => {
               const on = c.id === sel || c.id === hover;
               if (c.gold) c.gold.identity().move(c.x, .004, c.z).scale(c.hx + .004, .002, c.hz + .004);
               c.tile.identity().move(c.x, .008, c.z).scale(c.hx, .006, c.hz);
               if (c.type === 'ground') c.tile.txtr(TILE_CH).dull().color(1, 1, 1);
               if (on) c.rim.identity().move(c.x, .01, c.z).scale(c.hx + .006, .0015, c.hz + .006);
               else c.rim.identity().scale(0);
            });
         },
      };
   };
   return { makeTileSheet };
})();

const dnd_ui_chest = (() => {
   const { LOOT } = Data;
   const { spriteForm, PIECE_CH, itemSprite, makeItemIcon, tokenSize } = Models;
   const { label, addChrome, billboard, showIcon } = dnd_ui_draw;

   const makeChestTray = model => {
      const root = model.add();
      const chrome = addChrome(root);
      const portraits = {
         chest: root.add(spriteForm('chest')).txtr(PIECE_CH).dull().color(1, 1, 1),
         gold: root.add(spriteForm('chest_gold')).txtr(PIECE_CH).dull().color(1, 1, 1),
      };
      label(root, 'CHEST', 0, .2, .006, .4, [.95, .82, .5], true);
      const cells = [];
      const lootTint = [
         [.55, .4, .12],
         [.62, .5, .14],
         [.16, .38, .18],
         [.28, .3, .38],
         [.42, .18, .48],
      ];
      LOOT.forEach((loot, i) => {
         const col = i % 3, row = (i / 3) | 0;
         const x = -0.07 + col * 0.07;
         const y = 0.04 - row * 0.07;
         const gold = root.add('cube').color(.78, .56, .2).dull();
         const tile = root.add('cube').color(lootTint[i] || [.32, .2, .38]).dull();
         const rim = root.add('cube').color(1.15, .9, .4);
         const icon = makeItemIcon(root);
         label(root, loot.tag || loot.label, x, y - .028, .006, .16, [.95, .82, .5], true);
         cells.push({ id: 'add' + i, type: 'add', index: i, tile, gold, rim, icon, spr: itemSprite(loot.make()), x, y, hx: .03, hy: .028 });
      });
      [0, 1, 2, 3, 4, 5].forEach(i => {
         const col = i % 3, row = (i / 3) | 0;
         const x = -0.07 + col * 0.07;
         const y = -0.12 - row * 0.055;
         const gold = root.add('cube').color(.5, .34, .12).dull();
         const tile = root.add('cube').color(.12, .07, .04).dull();
         const rim = root.add('cube').color(.95, .4, .3);
         const token = makeItemIcon(root);
         cells.push({ id: 'drop' + i, type: 'drop', index: i, tile, gold, rim, token, x, y, hx: .03, hy: .022 });
      });
      const closeGold = root.add('cube').color(.78, .56, .2).dull();
      const close = root.add('cube').color(.35, .22, .12).dull();
      const closeRim = root.add('cube').color(1.1, .9, .4);
      label(root, 'CLOSE', 0, -.24, .006, .24, [.95, .85, .55], true);
      cells.push({ id: 'close', type: 'act', tile: close, gold: closeGold, rim: closeRim, x: 0, y: -.24, hx: .05, hy: .016 });

      let shown = false;
      return {
         root, cells,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(loot, hover) {
            if (!shown) { root.identity().scale(0); return; }
            chrome.pose(.14, .28);
            const filled = !!(loot && loot.length);
            const fitChest = (node, show) => {
               if (!show) { node.identity().scale(0); return; }
               const { sx, sy } = tokenSize('chest');
               const k = 0.05 / Math.max(sx, sy);
               node.identity().move(0, .145, .012).scale(sx * k, sy * k, sx * k);
            };
            fitChest(portraits.chest, !filled);
            fitChest(portraits.gold, filled);
            cells.forEach(c => {
               const on = c.id === hover;
               if (c.gold) c.gold.identity().move(c.x, c.y, 0).scale(c.hx + .004, c.hy + .004, .002);
               c.tile.identity().move(c.x, c.y, .002).scale(c.hx, c.hy, .003);
               if (on) c.rim.identity().move(c.x, c.y, -.001).scale(c.hx + .006, c.hy + .006, .002);
               else c.rim.identity().scale(0);
               if (c.icon) showIcon(c.icon, c.spr, c.x, c.y, .016, true);
               if (c.token) showIcon(c.token, itemSprite(loot && loot[c.index]), c.x, c.y, .016, true);
            });
         },
         place(pos, eye, face) {
            if (!shown) { root.identity().scale(0); return; }
            billboard(root, pos, eye, 1, face);
         },
      };
   };
   return { makeChestTray };
})();

const dnd_ui_pack = (() => {
   const { itemSprite, makeItemIcon } = Models;
   const { label, addChrome, billboard, showIcon } = dnd_ui_draw;

   const makeBackpack = model => {
      const root = model.add();
      const chrome = addChrome(root);
      label(root, 'PACK', 0, .12, .006, .4, [.95, .82, .5], true);
      const cells = [];
      for (let i = 0; i < 6; i++) {
         const col = i % 3, row = (i / 3) | 0;
         const x = -0.055 + col * 0.055;
         const y = 0.05 - row * 0.055;
         const gold = root.add('cube').color(.78, .56, .2).dull();
         const tile = root.add('cube').color(.18, .1, .06).dull();
         const rim = root.add('cube').color(1.15, .88, .28);
         const token = makeItemIcon(root);
         cells.push({ id: 'slot' + i, type: 'slot', index: i, tile, gold, rim, token, x, y, hx: .024, hy: .024 });
      }
      [
         { id: 'act', label: 'ACT', color: [.22, .36, .5], x: -0.055 },
         { id: 'end', label: 'END', color: [.28, .5, .26], x: 0 },
         { id: 'god', label: 'GOD', color: [.55, .42, .16], x: 0.055 },
      ].forEach(act => {
         const y = -0.08;
         const gold = root.add('cube').color(.78, .56, .2).dull();
         const tile = root.add('cube').color(act.color).dull();
         const rim = root.add('cube').color(1.1, .9, .4);
         label(root, act.label, act.x, y, .006, .26, [.95, .85, .55], true);
         cells.push({ id: act.id, type: 'act', tile, gold, rim, x: act.x, y, hx: .024, hy: .016 });
      });

      const body = root.add('cube').color(.16, .08, .05).opacity(.001);
      let shown = false;
      return {
         root, cells, body,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(pack, equipped, hover) {
            if (!shown) { root.identity().scale(0); return; }
            chrome.pose(.12, .16);
            body.identity().move(0, 0, -.014).scale(.13, .17, .008);
            cells.forEach(c => {
               const on = c.id === hover || (c.type === 'slot' && pack[c.index] && pack[c.index].uid === equipped);
               if (c.gold) c.gold.identity().move(c.x, c.y, 0).scale(c.hx + .004, c.hy + .004, .002);
               c.tile.identity().move(c.x, c.y, .002).scale(c.hx, c.hy, .003);
               if (on) c.rim.identity().move(c.x, c.y, -.001).scale(c.hx + .006, c.hy + .006, .002);
               else c.rim.identity().scale(0);
               if (c.token) showIcon(c.token, itemSprite(pack[c.index]), c.x, c.y, .016, true);
            });
         },
         place(pos, eye, face) {
            if (!shown) { root.identity().scale(0); return; }
            billboard(root, pos, eye, 1, face);
         },
      };
   };
   return { makeBackpack };
})();

const dnd_ui_inspect = (() => {
   const { G2 } = Canvas2D;
   const { spriteForm, PIECE_CH, makeItemIcon, showItemIcon, tokenSize } = Models;
   const { label, addChrome, billboard, g2Frame, hpStripe, drawAbils, factRow } = dnd_ui_draw;

   const PORTRAITS = ['hero', 'chest', 'chest_gold', 'dragon', 'boar', 'tree', 'moss', 'pillar', 'idol', 'white', 'rubble', 'black', 'gray', 'knight', 'healer', 'pine', 'dead', 'tiefling', 'drow', 'elf', 'goblin', 'shroom', 'skeleton', 'slime', 'fire'];

   const makeInspect = model => {
      const g2 = new G2();
      model.txtrSrc(2, g2.getCanvas());
      const root = model.add();
      const chrome = addChrome(root);
      const plate = root.add('square').txtr(2).dull();
      const portraits = {};
      PORTRAITS.forEach(id => {
         portraits[id] = root.add(spriteForm(id)).txtr(PIECE_CH).dull().color(1, 1, 1);
      });
      const itemPic = makeItemIcon(root);
      const body = root.add('cube').color(.16, .08, .05).opacity(.001);
      const cells = [];
      const acts = [
         { id: 'equip', label: 'EQUIP', color: [.28, .5, .26] },
         { id: 'unequip', label: 'UNEQUIP', color: [.55, .32, .14] },
         { id: 'use', label: 'USE', color: [.22, .48, .24] },
         { id: 'open', label: 'OPEN', color: [.55, .42, .16] },
         { id: 'fight', label: 'FIGHT', color: [.62, .2, .16] },
         { id: 'close', label: 'CLOSE', color: [.32, .22, .14] },
      ];
      acts.forEach(act => {
         const g = root.add();
         const gold = g.add('cube').color(.78, .56, .2).dull();
         const tile = g.add('cube').color(act.color).dull();
         const rim = g.add('cube').color(1.15, .9, .4);
         label(g, act.label, 0, 0, .005, .22, [.95, .85, .55], true);
         cells.push({ id: act.id, type: 'act', tile, gold, rim, g, hx: .1, hy: .016, off: true });
      });
      let shown = false;
      let view = { title: '', sub: '', lines: [], actions: [] };
      g2.render = function() {
         g2Frame(this, view.title || '');
         this.setColor('#d7c09a');
         this.textHeight(.05);
         this.text(view.sub || '', 0, .5, 'center');
         let y = .32;
         if (view.bar && view.bar.m) {
            hpStripe(this, -.84, y, 1.68, view.bar.v, view.bar.m, view.bar.label || 'HP');
            y -= .2;
         }
         if (view.stats && view.stats.length) {
            drawAbils(this, view.stats, y - .34);
            y -= .42;
         }
         if (view.facts && view.facts.length) {
            factRow(this, view.facts, y - .16);
            y -= .26;
         }
         this.setColor('#f3e6cc');
         this.textHeight(.046);
         if (view.foot) this.text(view.foot, 0, y, 'center');
         this.setColor('#b89a6a');
         this.textHeight(.038);
         if (view.note) this.text(view.note, 0, y - .12, 'center');
      };
      return {
         root, cells, body,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(next, hover) {
            if (!shown) { root.identity().scale(0); return; }
            view = next || view;
            g2.update();
            const actions = view.actions ? view.actions.slice() : [];
            if (actions.indexOf('close') < 0) actions.push('close');
            chrome.pose(.155, .30);
            body.identity().move(0, 0, -.014).scale(.165, .31, .008);
            plate.identity().move(0, -.02, .003).scale(.14, .20, 1);
            Object.keys(portraits).forEach(id => {
               const n = portraits[id];
               if (view.portrait !== id) { n.identity().scale(0); return; }
               const { sx, sy } = tokenSize(id);
               const k = 0.06 / Math.max(sx, sy);
               n.identity().move(0, .2, .014).scale(sx * k, sy * k, sx * k);
            });
            if (view.item) showItemIcon(itemPic, view.item, 0, .2, .034, true);
            else showItemIcon(itemPic, null, 0, 0, .034, true);
            const seen = {};
            cells.forEach(c => {
               const i = actions.indexOf(c.id);
               c.off = i < 0 || seen[c.id];
               if (!c.off) seen[c.id] = true;
               if (c.off) { c.g.identity().scale(0); return; }
               const y = -0.25 - i * .038;
               c.g.identity().move(0, y, .004);
               if (c.gold) c.gold.identity().move(0, 0, -.001).scale(c.hx + .004, c.hy + .004, .002);
               c.tile.identity().move(0, 0, 0).scale(c.hx, c.hy, .003);
               if (c.id === hover) c.rim.identity().move(0, 0, -.002).scale(c.hx + .006, c.hy + .006, .002);
               else c.rim.identity().scale(0);
            });
         },
         place(pos, eye, face) {
            if (!shown) { root.identity().scale(0); return; }
            billboard(root, pos, eye, 1, face);
         },
      };
   };
   return { makeInspect };
})();

const dnd_ui_fight = (() => {
   const { G2 } = Canvas2D;
   const { spriteForm, PIECE_CH, tokenSize } = Models;
   const { label, addChrome, billboard, g2Frame, hpStripe } = dnd_ui_draw;

   const PORTRAITS = ['hero', 'dragon', 'boar', 'white', 'black', 'gray', 'tree', 'chest', 'goblin', 'shroom', 'skeleton', 'slime'];

   const makeFightTray = model => {
      const g2 = new G2();
      model.txtrSrc(4, g2.getCanvas());
      const root = model.add();
      const chrome = addChrome(root);
      const plate = root.add('square').txtr(4).dull();
      const portraits = {};
      PORTRAITS.forEach(id => {
         portraits[id] = root.add(spriteForm(id)).txtr(PIECE_CH).dull().color(1, 1, 1);
      });
      const body = root.add('cube').color(.16, .08, .05).opacity(.001);
      const cells = [];
      [
         { id: 'attack', label: 'FIGHT', color: [.62, .18, .14] },
         { id: 'herb', label: 'POT', color: [.22, .48, .24] },
         { id: 'flee', label: 'RUN', color: [.22, .34, .55] },
         { id: 'reroll', label: 'INSP', color: [.55, .42, .14] },
         { id: 'confirm', label: 'GO', color: [.5, .5, .48] },
      ].forEach(act => {
         const g = root.add();
         const gold = g.add('cube').color(.78, .56, .2).dull();
         const tile = g.add('cube').color(act.color).dull();
         const rim = g.add('cube').color(1.15, .9, .4);
         label(g, act.label, 0, 0, .005, .2, [.95, .85, .55], true);
         cells.push({ id: act.id, type: 'act', tile, gold, rim, g, hx: .042, hy: .016, off: true });
      });
      let shown = false;
      let view = {};
      g2.render = function() {
         g2Frame(this, view.foeName || 'Foe');
         this.setColor('#e7c56a');
         this.textHeight(.04);
         this.text(view.foeAc != null ? 'AC  ' + view.foeAc : '', -.82, .58, 'left');
         hpStripe(this, -.86, .4, 1.2, view.foeHp, view.foeMax, 'HP  ' + (view.foeHp || 0) + '/' + (view.foeMax || 0));
         this.setColor('#f6e2b0');
         this.textHeight(.046);
         this.text('You   AC  ' + (view.heroAc != null ? view.heroAc : ''), -.05, -.38, 'left');
         hpStripe(this, -.1, -.54, 1.0, view.heroHp, view.heroMax, 'HP  ' + (view.heroHp || 0) + '/' + (view.heroMax || 0));
         this.setColor('#140e0a');
         this.fillRect(-.86, -.86, 1.72, .18, .03);
         this.setColor('#f0e2c0');
         this.textHeight(.04);
         this.text(view.message || '', 0, -.78, 'center');
      };
      const poseSprite = (id, x, y, k) => {
         const n = portraits[id];
         if (!n) return;
         const { sx, sy } = tokenSize(id);
         const s = (k || 0.05) / Math.max(sx, sy);
         n.identity().move(x, y, .014).scale(sx * s, sy * s, sx * s);
      };
      return {
         root, cells, body,
         show() { shown = true; },
         hide() { shown = false; root.identity().scale(0); },
         visible() { return shown; },
         pose(next, hover) {
            if (!shown) { root.identity().scale(0); return; }
            view = next || view;
            g2.update();
            chrome.pose(.17, .24);
            body.identity().move(0, 0, -.014).scale(.18, .25, .008);
            plate.identity().move(0, .02, .003).scale(.16, .215, 1);
            Object.keys(portraits).forEach(id => portraits[id].identity().scale(0));
            poseSprite(view.foePortrait || 'dragon', .07, .12, 0.055);
            poseSprite('hero', -.08, -.02, 0.04);
            const actions = (view.actions || []).slice();
            const seen = {};
            const live = actions.filter(id => {
               if (seen[id]) return false;
               seen[id] = true;
               return cells.some(c => c.id === id);
            });
            cells.forEach(c => {
               const i = live.indexOf(c.id);
               c.off = i < 0;
               if (c.off) { c.g.identity().scale(0); return; }
               const x = (i - (live.length - 1) / 2) * .09;
               c.g.identity().move(x, -.2, .006);
               c.gold.identity().move(0, 0, -.001).scale(c.hx + .004, c.hy + .004, .002);
               c.tile.identity().move(0, 0, 0).scale(c.hx, c.hy, .003);
               if (c.id === hover) c.rim.identity().move(0, 0, -.002).scale(c.hx + .006, c.hy + .006, .002);
               else c.rim.identity().scale(0);
            });
         },
         place(pos, eye, face) {
            if (!shown) { root.identity().scale(0); return; }
            billboard(root, pos, eye, 1, face);
         },
      };
   };
   return { makeFightTray };
})();

const dnd_ui = (() => {
   const { bindArt } = Models;
   const { makeHud } = dnd_ui_hud;
   const { makeGodSheet } = dnd_ui_god;
   const { makeTileSheet } = dnd_ui_tiles;
   const { makeChestTray } = dnd_ui_chest;
   const { makeBackpack } = dnd_ui_pack;
   const { makeInspect } = dnd_ui_inspect;
   const { makeFightTray } = dnd_ui_fight;

   const createUI = (model, stage, hooks) => {
      bindArt(model);
      const god = makeGodSheet(stage);
      const tiles = makeTileSheet(stage);
      const chest = makeChestTray(model);
      const pack = makeBackpack(model);
      const inspect = makeInspect(model);
      const fight = makeFightTray(model);
      const hud = makeHud(model, hooks);
      tiles.hide();
      chest.hide();
      pack.hide();
      inspect.hide();
      fight.hide();
      return { god, tiles, chest, pack, inspect, fight, hud };
   };
   return { createUI };
})();

export const { createUI } = dnd_ui;
