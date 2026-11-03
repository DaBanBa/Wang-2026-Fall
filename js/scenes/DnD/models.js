import * as cg from '../../render/core/cg.js';
import { TILE } from './data.js';

const ART = './js/scenes/DnD/sprites/';
export const TILE_CH = 1;
export const ITEM_CH = 3;
export const PIECE_CH = 9;

const TILE_ORDER = ['stone', 'grass', 'floor', 'dirt', 'water', 'sand'];
const SPRITE_ORDER = [
   'hero', 'chest', 'chest_gold', 'dragon', 'boar', 'tree',
   'moss', 'pillar', 'idol', 'white', 'rubble', 'black', 'gray', 'knight', 'healer',
   'pine', 'dead', 'tiefling', 'drow', 'elf',
   'goblin', 'shroom', 'skeleton', 'slime', 'fire',
];
const ITEM_ORDER = ['sword', 'relic', 'herb', 'gold', 'pouch', 'axe', 'bow', 'book'];
const CELL = 128;
const TILE_COLS = 3;
const ITEM_COLS = 4;
const TILE_ATLAS = [384, 256];
const ITEM_ATLAS = [512, 256];

// Source pixel size. 16px = one board tile; taller/wider sheets overflow.
const SPRITE_PX = {
   hero: [31, 48],
   chest: [32, 24],
   chest_gold: [32, 24],
   dragon: [80, 84],
   boar: [48, 36],
   tree: [57, 64],
   moss: [28, 27],
   pillar: [18, 46],
   idol: [20, 42],
   white: [40, 28],
   rubble: [30, 28],
   black: [44, 25],
   gray: [44, 26],
   knight: [18, 46],
   healer: [22, 46],
   pine: [45, 64],
   dead: [58, 64],
   tiefling: [28, 48],
   drow: [36, 48],
   elf: [29, 48],
   goblin: [44, 40],
   shroom: [44, 40],
   skeleton: [49, 48],
   slime: [38, 28],
   fire: [36, 40],
};

const SPRITE_UV = {
   hero:       [0.002930, 0.005859, 0.063477, 0.193359],
   chest:      [0.066406, 0.005859, 0.128906, 0.099609],
   chest_gold: [0.131836, 0.005859, 0.194336, 0.099609],
   dragon:     [0.197266, 0.005859, 0.353516, 0.333984],
   boar:       [0.356445, 0.005859, 0.450195, 0.146484],
   tree:       [0.453125, 0.005859, 0.564453, 0.255859],
   moss:       [0.567383, 0.005859, 0.622070, 0.111328],
   pillar:     [0.625000, 0.005859, 0.660156, 0.185547],
   idol:       [0.663086, 0.005859, 0.702148, 0.169922],
   white:      [0.705078, 0.005859, 0.783203, 0.115234],
   rubble:     [0.786133, 0.005859, 0.844727, 0.115234],
   black:      [0.847656, 0.005859, 0.933594, 0.103516],
   gray:       [0.002930, 0.339844, 0.088867, 0.441406],
   knight:     [0.091797, 0.339844, 0.126953, 0.519531],
   healer:     [0.129883, 0.339844, 0.172852, 0.519531],
   pine:       [0.175781, 0.339844, 0.263672, 0.589844],
   dead:       [0.266602, 0.339844, 0.379883, 0.589844],
   tiefling:   [0.382812, 0.339844, 0.437500, 0.527344],
   drow:       [0.440430, 0.339844, 0.510742, 0.527344],
   elf:        [0.513672, 0.339844, 0.570312, 0.527344],
   goblin:     [0.573242, 0.339844, 0.659180, 0.496094],
   shroom:     [0.662109, 0.339844, 0.748047, 0.496094],
   skeleton:   [0.750977, 0.339844, 0.846680, 0.527344],
   slime:      [0.849609, 0.339844, 0.923828, 0.449219],
   fire:       [0.926758, 0.339844, 0.997070, 0.496094],
};

export const yawKind = () => true;

const cellUV = (i, atlas, cols, pad) => {
   const m = pad == null ? 2 : pad;
   const col = i % cols, row = (i / cols) | 0;
   let u0 = (col * CELL + m) / atlas[0];
   let u1 = (col * CELL + CELL - m) / atlas[0];
   let v0 = (row * CELL + m) / atlas[1];
   let v1 = (row * CELL + CELL - m) / atlas[1];
   return { u0, v0, u1, v1 };
};

const quadMesh = (u0, v0, u1, v1) => clay.trianglesMesh([
   { pos: [-1,  1, 0], nor: [0, 0, 1], uv: [u0, v0] },
   { pos: [-1, -1, 0], nor: [0, 0, 1], uv: [u0, v1] },
   { pos: [ 1,  1, 0], nor: [0, 0, 1], uv: [u1, v0] },
   { pos: [ 1,  1, 0], nor: [0, 0, 1], uv: [u1, v0] },
   { pos: [-1, -1, 0], nor: [0, 0, 1], uv: [u0, v1] },
   { pos: [ 1, -1, 0], nor: [0, 0, 1], uv: [u1, v1] },
   { pos: [ 1,  1, 0], nor: [0, 0,-1], uv: [u1, v0] },
   { pos: [ 1, -1, 0], nor: [0, 0,-1], uv: [u1, v1] },
   { pos: [-1,  1, 0], nor: [0, 0,-1], uv: [u0, v0] },
   { pos: [-1,  1, 0], nor: [0, 0,-1], uv: [u0, v0] },
   { pos: [ 1, -1, 0], nor: [0, 0,-1], uv: [u1, v1] },
   { pos: [-1, -1, 0], nor: [0, 0,-1], uv: [u0, v1] },
]);

const boxMesh = (u0, v0, u1, v1) => {
   // Top of the PNG sits on +Z (near the default view). Previous mapping
   // put v0 on -Z, which showed the image upside-down on the table.
   const faces = [
      { n: [ 0, 1, 0], q: [[-1, 1, 1], [ 1, 1, 1], [ 1, 1,-1], [-1, 1,-1]],
        uv: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] },
      { n: [ 0,-1, 0], q: [[-1,-1,-1], [ 1,-1,-1], [ 1,-1, 1], [-1,-1, 1]],
        uv: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] },
      { n: [ 0, 0, 1], q: [[-1,-1, 1], [ 1,-1, 1], [ 1, 1, 1], [-1, 1, 1]],
        uv: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] },
      { n: [ 0, 0,-1], q: [[ 1,-1,-1], [-1,-1,-1], [-1, 1,-1], [ 1, 1,-1]],
        uv: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] },
      { n: [ 1, 0, 0], q: [[ 1,-1,-1], [ 1,-1, 1], [ 1, 1, 1], [ 1, 1,-1]],
        uv: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] },
      { n: [-1, 0, 0], q: [[-1,-1, 1], [-1,-1,-1], [-1, 1,-1], [-1, 1, 1]],
        uv: [[u0, v1], [u1, v1], [u1, v0], [u0, v0]] },
   ];
   const verts = [];
   for (const f of faces) {
      const a = { pos: f.q[0], nor: f.n, uv: f.uv[0] };
      const b = { pos: f.q[1], nor: f.n, uv: f.uv[1] };
      const c = { pos: f.q[2], nor: f.n, uv: f.uv[2] };
      const d = { pos: f.q[3], nor: f.n, uv: f.uv[3] };
      verts.push(a, b, c, a, c, d);
   }
   return clay.trianglesMesh(verts);
};

export const tileForm = id => 'dnd_tile_' + (id || 'stone');
export const spriteForm = kind => 'dnd_spr_' + (kind || 'chest');
export const itemForm = id => 'dnd_item_' + (id || 'sword');

export const itemSprite = item => {
   if (!item) return null;
   if (item.type === 'gold') return (item.amount || 0) >= 20 ? 'pouch' : 'gold';
   if (item.type === 'item') return item.id === 'spellbook' ? 'book' : 'herb';
   if (item.id === 'relic_sword') return 'relic';
   if (item.id === 'battleaxe') return 'axe';
   if (item.id === 'longbow') return 'bow';
   if (item.type === 'weapon') return 'sword';
   return 'pouch';
};

export const bindArt = model => {
   model.txtrSrc(TILE_CH, ART + 'tiles.png?v=3');
   model.txtrSrc(ITEM_CH, ART + 'items.png?v=4');
   model.txtrSrc(PIECE_CH, ART + 'pieces.png?v=6');
   TILE_ORDER.forEach((id, i) => {
      const { u0, v0, u1, v1 } = cellUV(i, TILE_ATLAS, TILE_COLS, 0);
      clay.defineMesh(tileForm(id), boxMesh(u0, v0, u1, v1));
   });
   SPRITE_ORDER.forEach(id => {
      const [u0, v0, u1, v1] = SPRITE_UV[id];
      clay.defineMesh(spriteForm(id), quadMesh(u0, v0, u1, v1));
   });
   ITEM_ORDER.forEach((id, i) => {
      const { u0, v0, u1, v1 } = cellUV(i, ITEM_ATLAS, ITEM_COLS);
      clay.defineMesh(itemForm(id), quadMesh(u0, v0, u1, v1));
   });
};

// Clay caches the mesh name in a closure, so swapping node._form does
// nothing. Each ground cube keeps one child per terrain type instead.
export const makeGround = (parent, id) => {
   const root = parent.add();
   const faces = {};
   TILE_ORDER.forEach(g => {
      faces[g] = root.add(tileForm(g)).txtr(TILE_CH).dull().color(1, 1, 1);
      faces[g].identity().scale(0);
   });
   const rec = { root, faces, id: id || 'stone' };
   paintTile(rec, rec.id);
   return rec;
};

export const paintTile = (rec, id, night, tint) => {
   if (!rec || !rec.faces) return;
   rec.id = id || rec.id || 'stone';
   TILE_ORDER.forEach(g => {
      const n = rec.faces[g];
      if (g === rec.id) {
         n.identity().txtr(TILE_CH).dull();
         if (tint) n.color(tint);
         else if (night) n.color(.55, .58, .72);
         else n.color(1, 1, 1);
      } else n.identity().scale(0);
   });
};

export const setGroundOpacity = (rec, a) => {
   if (!rec || !rec.faces) return;
   TILE_ORDER.forEach(g => rec.faces[g].opacity(a));
};

export const makeItemIcon = parent => {
   const root = parent.add();
   const faces = {};
   ITEM_ORDER.forEach(id => {
      faces[id] = root.add(itemForm(id)).txtr(ITEM_CH).dull().color(1, 1, 1);
      faces[id].identity().scale(0);
   });
   return { root, faces };
};

export const showItemIcon = (rec, spr, x, y, s, face) => {
   if (!rec) return;
   ITEM_ORDER.forEach(id => {
      const n = rec.faces[id];
      if (!spr || id !== spr) { n.identity().scale(0); return; }
      if (face) n.identity().move(x, y, .006).scale(s || .014).txtr(ITEM_CH).dull().color(1, 1, 1);
      else n.identity().move(x, .014, y).turnX(-Math.PI / 2).scale(s || .012).txtr(ITEM_CH).dull().color(1, 1, 1);
   });
};

export const makeToken = (parent, kind) => {
   const root = parent.add();
   const art = root.add(spriteForm(kind)).txtr(PIECE_CH).dull().color(1, 1, 1);
   return { root, art, kind };
};

export const setTokenKind = (rec, kind) => {
   if (!rec || rec.kind === kind) return;
   rec.kind = kind;
   rec.art._form = spriteForm(kind);
   rec.art.txtr(PIECE_CH).dull();
};

export const poseToken = (rec, x, y, z, eye, sx, sy, run) => {
   if (!rec) return;
   if (sy == null) sy = sx;
   const bob = run ? Math.abs(Math.sin(run)) : 0;
   const pos = [x, y + bob * sx * 0.45, z];
   const look = eye || [x, y + 1, z + 1];
   const dx = look[0] - pos[0], dz = look[2] - pos[2];
   const len = Math.hypot(dx, dz);
   const Z = len < 1e-4 ? [0, 0, 1] : [dx / len, 0, dz / len];
   let X = cg.cross([0, 1, 0], Z);
   if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = [1, 0, 0];
   X = cg.normalize(X);
   const Y = [0, 1, 0];
   rec.root.setMatrix([
      X[0] * sx, X[1] * sx, X[2] * sx, 0,
      Y[0] * sy, Y[1] * sy, Y[2] * sy, 0,
      Z[0] * sx, Z[1] * sx, Z[2] * sx, 0,
      pos[0], pos[1], pos[2], 1,
   ]);
   if (rec.art) {
      if (run) rec.art.identity().move(Math.sin(run) * .08, bob * .18, 0).turnZ(Math.sin(run) * .22);
      else rec.art.identity();
   }
};

export const hideToken = rec => {
   if (rec) rec.root.identity().scale(0);
};

export const dropToken = (parent, rec) => {
   if (!rec || !rec.root) return;
   try { parent.remove(rec.root); } catch (err) { hideToken(rec); }
};

// 16 source pixels span one board tile. Wider/taller sheets overflow.
export const PX = TILE / 16;
export const spriteScale = PX * 8;

const CREATURE = {
   hero: true, dragon: true, boar: true, tiefling: true, drow: true, elf: true,
   goblin: true, shroom: true, skeleton: true, slime: true,
};
const WOLF = { white: true, black: true, gray: true };

export const tokenSize = kind => {
   const [w, h] = SPRITE_PX[kind] || [16, 16];
   let k = (CREATURE[kind] ? 0.5 : 1) * 0.5;
   if (WOLF[kind]) {
      const [bw, bh] = SPRITE_PX.boar;
      const boar = (CREATURE.boar ? 0.5 : 1) * 0.5;
      k = Math.max(bw, bh) * boar / Math.max(w, h);
   }
   return { sx: w * PX / 2 * k, sy: h * PX / 2 * k };
};
