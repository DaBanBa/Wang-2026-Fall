// DnD collaborative game

// Both players are god and pawns at the same time, they can press X to switch between the 2
// put down monsters or chests or trees and tell your own story!
// can press A to access stuff like chests

import * as cg from '../../render/core/cg.js';
import { buttonState, controllerMatrix, joyStickState } from '../../render/core/controllerInput.js';
import { lcb, rcb } from '../../handle_scenes.js';
import {
   N, TILE, HALF, TABLE_Y, BOARD_Z, ADV, MP_MAX, KIND, KINDS, GROUND,
   ABILS, ABIL_SHORT, WEAPONS, ITEMS, LOOT, abilityMod, signed, profBonus,
   attackBonus, damageFormula, weaponOf, attackText, itemLabel, foeSheet,
   rollWeaponDamage, rollMonsterDamage, rollDie, rollPool, rollPotion,
   grantXp, monsterSheet, startHero, startScores, startPack,
} from './data.js';
import {
   bindArt, makeToken, dropToken, tokenSize, paintTile, setGroundOpacity,
   poseToken, hideToken, setTokenKind, showItemIcon, itemSprite,
   makeGround, makeItemIcon,
} from './models.js';
import { createUI } from './ui.js';
import { startPlayers, installMultiplayer, makePawn, installAvatars } from './multiplayer.js';

if (!window.__dndKeys) {
   window.__dndKeys = { down: {}, edge: {} };
   addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      window.__dndKeys.down[k] = true;
      window.__dndKeys.edge[k] = true;
   });
   addEventListener('keyup', e => { window.__dndKeys.down[e.key.toLowerCase()] = false; });
}

const here = () => !window.currentName || /dnd/i.test(window.currentName);
const now = () => Date.now() / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inb = (c, r) => c >= 0 && r >= 0 && c < N && r < N;
const tileX = c => (c - 3.5) * TILE;
const tileZ = r => (r - 3.5) * TILE;

const keyEdge = k => {
   if (!window.__dndKeys.edge[k]) return false;
   window.__dndKeys.edge[k] = false;
   return true;
};

const rayBox = (ray, matrix) => {
   const inv = cg.mInverse(matrix);
   const o = cg.mTransform(inv, ray.o);
   const d4 = cg.mTransform(inv, [ray.d[0], ray.d[1], ray.d[2], 0]);
   const d = [d4[0], d4[1], d4[2]];
   let tNear = 0.02, tFar = 12, hit = false;
   for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-8) {
         if (o[a] < -1 || o[a] > 1) return null;
         continue;
      }
      let t1 = (-1 - o[a]) / d[a], t2 = (1 - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tNear) { tNear = t1; hit = true; }
      if (t2 < tFar) tFar = t2;
      if (tNear > tFar) return null;
   }
   return !hit || tNear > tFar ? null : { t: tNear };
};

const beamRay = hand => {
   const cb = hand === 'left' ? lcb : rcb;
   if (!cb || !cb.beamMatrix || !clay.inverseRootMatrix) return null;
   let bm;
   try { bm = cb.beamMatrix(); } catch (err) { return null; }
   if (!bm || bm.length < 16) return null;
   const len = Math.hypot(bm[8], bm[9], bm[10]);
   if (len < 1e-4) return null;
   const o = cg.mTransform(clay.inverseRootMatrix, [bm[12], bm[13], bm[14]]);
   const d4 = cg.mTransform(clay.inverseRootMatrix, [-bm[8] / len, -bm[9] / len, -bm[10] / len, 0]);
   const dn = Math.hypot(d4[0], d4[1], d4[2]);
   if (dn < 1e-4) return null;
   return { o, d: [d4[0] / dn, d4[1] / dn, d4[2] / dn] };
};

const headMat = () => {
   try {
      const a = clay.root().inverseViewMatrix(0);
      if (!a) return null;
      const b = clay.root().inverseViewMatrix(1);
      return cg.mMultiply(clay.inverseRootMatrix, b ? cg.mix(a, b, .5) : a);
   } catch (err) { return null; }
};

const eyeOf = () => {
   const H = headMat();
   return H ? H.slice(12, 15) : [0, 1.55, .4];
};

const handPos = hand => {
   const p = inputEvents.pos(hand);
   if (p && isFinite(p[0])) return p;
   const m = controllerMatrix[hand];
   if (!m || m.length < 16 || !clay.inverseRootMatrix) return null;
   return cg.mTransform(clay.inverseRootMatrix, [m[12], m[13], m[14]]);
};

const pressed = (hand, i) => !!(buttonState[hand] && buttonState[hand][i] && buttonState[hand][i].pressed);

const rise = (was, hand, i, key) => {
   const down = pressed(hand, i);
   const edge = down && !was[key];
   was[key] = down;
   return edge;
};

let actx = null;
const tone = (freq, dur, vol) => {
   try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(vol || .04, t0);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur + .02);
   } catch (err) {}
};

const buzz = (hand, power, ms) => {
   try { if (window.vibrate) vibrate(hand, clamp(power, 0, 1), ms || 40); } catch (err) {}
};

const installWorld = g => {
   g.say = msg => { g.S.log = msg; };

   g.tileName = (c, r) => '(' + (c + 1) + ',' + (r + 1) + ')';

   g.groundAt = (c, r) => GROUND[g.S.ground[r][c]] || GROUND.stone;

   g.pieceAt = (c, r) => g.S.pieces.find(p => p.c === c && p.r === r);

   g.heroAt = (c, r, exceptSlot) => Object.entries(g.S.players)
      .find(([slot, player]) => Number(slot) !== exceptSlot && player.hero.c === c && player.hero.r === r);

   g.blocks = (c, r) => {
      if (g.heroAt(c, r, g.S.playerSlot)) return true;
      if (g.groundAt(c, r).block) return true;
      const p = g.pieceAt(c, r);
      return !!(p && KIND[p.kind].block);
   };

   g.occupy = (c, r, except) => {
      const { S } = g;
      if (g.heroAt(c, r)) return true;
      const p = g.pieceAt(c, r);
      return !!(p && p !== except);
   };

   g.nearHero = (c, r) => {
      const { S } = g;
      return Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r) <= 1;
   };

   g.nearestTile = (x, z) => {
      const c = clamp(Math.round(x / TILE + 3.5), 0, N - 1);
      const r = clamp(Math.round(z / TILE + 3.5), 0, N - 1);
      return { c, r, d: Math.hypot(x - tileX(c), z - tileZ(r)) };
   };

   g.onBoard = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;

   g.stageOf = p => cg.mTransform(cg.mInverse(g.stage.getMatrix()), p);

   g.give = item => {
      const { S } = g;
      if (item.type === 'gold') {
         S.hero.gold += item.amount || 0;
         return item.amount + ' gold';
      }
      S.pack.push({ uid: S.nextUid++, type: item.type, id: item.id });
      return itemLabel(item);
   };

   g.spawnPiece = (kind, c, r) => {
      const { S, stage, tokens } = g;
      if (!inb(c, r) || g.occupy(c, r)) return null;
      const spec = KIND[kind];
      const piece = {
         id: g.net.slot() + ':' + S.nextPid++, kind, c, r, yaw: 0,
         loot: spec.interact === 'chest' ? [] : null,
         opened: false, used: false,
         sheet: spec.interact === 'fight' ? foeSheet(kind) : null,
      };
      tokens.set(piece.id, makeToken(stage, spec.sprite || kind));
      S.pieces.push(piece);
      return piece;
   };

   g.restorePiece = piece => {
      g.tokens.set(piece.id, makeToken(g.stage, KIND[piece.kind].sprite || piece.kind));
      g.S.pieces.push(piece);
   };

   g.withPiece = (piece, after) => {
      if (!piece || !g.net.canPlay()) return false;
      const mode = g.S.mode;
      return g.net.claim('piece:' + piece.id, () => {
         const current = g.S.pieces.find(p => p.id === piece.id);
         if (!current || g.S.mode !== mode) {
            g.net.release('piece:' + piece.id);
            return;
         }
         after(current);
      });
   };

   g.removePiece = piece => {
      if (!piece) return;
      const { S, stage, tokens, ui } = g;
      const rec = tokens.get(piece.id);
      if (rec) {
         dropToken(stage, rec);
         tokens.delete(piece.id);
      }
      S.pieces = S.pieces.filter(p => p.id !== piece.id);
      if (S.chestId === piece.id) { S.chestId = 0; ui.chest.hide(); }
      if (S.focus && S.focus.kind === 'piece' && S.focus.id === piece.id) g.closeFocus();
   };

   g.lookNeighbor = () => {
      const { S } = g;
      const face = S.hero.face || 0;
      const dc = Math.abs(Math.sin(face)) > .5 ? Math.sign(Math.sin(face)) : 0;
      const dr = Math.abs(Math.cos(face)) > .5 ? Math.sign(Math.cos(face)) : 0;
      const n = [
         g.pieceAt(S.hero.c, S.hero.r),
         g.pieceAt(S.hero.c + dc, S.hero.r + dr),
         g.pieceAt(S.hero.c + 1, S.hero.r),
         g.pieceAt(S.hero.c - 1, S.hero.r),
         g.pieceAt(S.hero.c, S.hero.r + 1),
         g.pieceAt(S.hero.c, S.hero.r - 1),
      ];
      return n.find(p => p);
   };
};

const installSheets = g => {
   g.sameFocus = (a, b) => !!(a && b && a.kind === b.kind && a.index === b.index && a.id === b.id);

   g.closeFocus = () => {
      g.S.focus = null;
      if (g.ui.inspect) g.ui.inspect.hide();
   };

   g.openFocus = focus => {
      const { S, ui } = g;
      if (!focus || S.roll) return;
      if (S.mode === 'adv' && S.combat) return;
      if (g.sameFocus(S.focus, focus)) { g.closeFocus(); return; }
      S.focus = focus;
      ui.inspect.show();
      if (S.mode === 'adv' && focus.kind === 'piece') {
         const p = S.pieces.find(x => x.id === focus.id);
         if (p) g.placeToward('inspect', g.pieceWorld(p));
      }
      tone(440, .05);
   };

   g.abilRow = src => ABILS.map(k => ({
      id: k, name: ABIL_SHORT[k], v: src[k] != null ? src[k] : 10, mod: signed(abilityMod(src[k])),
   }));

   g.inspectView = () => {
      const { S } = g;
      const f = S.focus;
      if (!f) return { title: '', sub: '', lines: [], actions: [] };
      if (f.kind === 'hero') {
         const H = S.hero;
         const w = weaponOf(S.pack, S.equipped);
         return {
            title: H.className || 'Fighter',
            sub: 'Level ' + H.level + '  ·  ' + (H.armor || 'Scale Mail'),
            portrait: 'hero',
            bar: { v: H.hp, m: H.hpMax, label: 'HP  ' + H.hp + '/' + H.hpMax },
            stats: g.abilRow(S.stats),
            facts: [
               { k: 'AC', v: H.ac },
               { k: 'PB', v: signed(H.pb) },
               { k: 'Init', v: signed(H.init) },
               { k: 'Spd', v: H.speed },
               { k: 'Insp', v: H.insp },
            ],
            foot: (w ? w.name : 'Unarmed') + '  ' + signed(attackBonus(S.stats, H.level, w)) + '  ' + damageFormula(S.stats, w),
            note: 'XP ' + H.xp + '  ·  Saves STR, CON',
            actions: [],
         };
      }
      if (f.kind === 'item') {
         const it = S.pack[f.index];
         if (!it) return { title: 'Empty', sub: '', lines: [], actions: [] };
         if (it.type === 'weapon') {
            const w = WEAPONS[it.id];
            const on = S.equipped === it.uid;
            return {
               title: w.name,
               sub: (on ? 'Equipped' : 'In your pack') + (w.magic ? '  ·  +' + w.magic : ''),
               item: itemSprite({ type: 'weapon', id: it.id }),
               facts: [
                  { k: 'Hit', v: signed(attackBonus(S.stats, S.hero.level, w)) },
                  { k: 'Dmg', v: damageFormula(S.stats, w) },
                  { k: 'Uses', v: ABIL_SHORT[w.stat] },
               ],
               foot: w.type,
               actions: on ? ['unequip'] : ['equip'],
            };
         }
         if (it.type === 'item' && it.id === 'godsbeard')
            return {
               title: ITEMS.godsbeard.name,
               sub: '2d4+2 hit points',
               item: 'herb',
               actions: ['use'],
            };
         if (it.type === 'item' && it.id === 'spellbook')
            return {
               title: 'Spellbook',
               sub: 'Arcane notes',
               item: 'book',
               actions: [],
            };
         return { title: itemLabel(it), sub: '', lines: [], actions: [] };
      }
      const p = S.pieces.find(x => x.id === f.id);
      if (!p) return { title: '', sub: '', lines: [], actions: [] };
      if (!KIND[p.kind] || !KIND[p.kind].interact) {
         return {
            title: KIND[p.kind] ? KIND[p.kind].label : 'Object',
            sub: (KIND[p.kind] && KIND[p.kind].title) || '',
            portrait: p.kind,
            actions: [],
         };
      }
      if (p.kind === 'chest') {
         const loot = p.loot || [];
         const found = p.found || [];
         return {
            title: p.opened && found.length ? 'You found' : 'Chest',
            sub: p.opened ? (found.length ? found.join('\n') : 'Nothing inside') : 'DC 15 Strength (Athletics)',
            portrait: loot.length && !p.opened ? 'chest_gold' : 'chest',
            foot: p.opened ? (found.length ? 'Added to your pack' : '') : 'Your bonus ' + signed(abilityMod(S.stats.str) + profBonus(S.hero.level)),
            actions: S.mode === 'adv' && !p.opened ? ['open'] : [],
         };
      }
      const sheet = p.sheet || foeSheet(p.kind);
      return {
         title: sheet.title || sheet.name,
         sub: sheet.name + '  ·  CR ' + sheet.cr,
         portrait: sheet.portrait || p.kind,
         bar: { v: sheet.hp, m: sheet.hpMax, label: 'HP  ' + sheet.hp + '/' + sheet.hpMax },
         stats: g.abilRow(sheet),
         facts: [
            { k: 'AC', v: sheet.ac },
            { k: 'Spd', v: sheet.speed },
            { k: 'CR', v: sheet.cr },
         ],
         foot: attackText(sheet.attack),
         note: sheet.breath ? sheet.breath.name + '  DC ' + sheet.breath.dc : '',
         actions: S.mode === 'adv' ? ['fight'] : [],
      };
   };

   g.battleView = () => {
      const { S } = g;
      const sheet = S.combat && S.combat.sheet;
      if (!sheet) return {};
      const actions = ['attack', 'herb', 'flee'];
      if (S.roll && S.roll.waiting && S.roll.why === 'attack') actions.push('reroll', 'confirm');
      return {
         foeName: sheet.title || sheet.name,
         foeAc: sheet.ac,
         foeHp: sheet.hp,
         foeMax: sheet.hpMax,
         foePortrait: sheet.portrait || 'dragon',
         heroName: 'You',
         heroAc: S.hero.ac,
         heroHp: S.hero.hp,
         heroMax: S.hero.hpMax,
         message: S.log || '',
         actions: S.combat.turn === 'player' && !S.roll ? actions
            : (S.roll && S.roll.waiting ? ['reroll', 'confirm'] : []),
      };
   };

   g.inspectPiece = p => {
      const { S, ui } = g;
      if (!p || S.combat || S.roll) return;
      if (S.mode === 'god') {
         if (p.kind === 'chest') {
            g.closeFocus();
            g.openChestWidget(p);
            return;
         }
         g.closeChest();
         g.openFocus({ kind: 'piece', id: p.id });
         return;
      }
      if (S.mode !== 'adv') return;
      if (!g.nearHero(p.c, p.r)) { g.say('Get next to it first.'); return; }
      if (!KIND[p.kind] || !KIND[p.kind].interact) {
         g.say(KIND[p.kind] && KIND[p.kind].block ? 'The ' + KIND[p.kind].label.toLowerCase() + ' blocks this square.' : 'Nothing to do here.');
         return;
      }
      g.openFocus({ kind: 'piece', id: p.id });
      g.say(KIND[p.kind].label + '.');
   };

   g.inspectHero = () => {
      const { S, ui } = g;
      if (S.combat || S.roll) return;
      g.closeChest();
      g.openFocus({ kind: 'hero' });
      g.say('Adventurer.');
   };

   g.godInspect = () => {
      const { S } = g;
      if (S.mode !== 'god') return;
      const hit = g.pick('right') || g.pick('left');
      if (hit && hit.kind === 'avatar') { g.inspectHero(); return; }
      if (hit && hit.kind === 'piece') { g.inspectPiece(hit.piece); return; }
      if (hit && hit.kind === 'tile') {
         if (hit.c === S.hero.c && hit.r === S.hero.r) { g.inspectHero(); return; }
         const p = g.pieceAt(hit.c, hit.r);
         if (p) { g.inspectPiece(p); return; }
      }
   };

   g.inspectSlot = i => {
      const { S } = g;
      const it = S.pack[i];
      if (!it) return;
      g.openFocus({ kind: 'item', index: i });
      g.say(itemLabel(it) + '.');
   };

   g.showPieceCard = p => {
      if (!p) return;
      g.S.focus = { kind: 'piece', id: p.id };
      g.ui.inspect.show();
      g.placeToward('inspect', g.pieceWorld(p));
   };
};

const CARD_IDS = ['hud', 'pack', 'inspect', 'fight'];
const defaultCardLocal = {
   hud:     [-0.42,  0.14, 0.42],
   pack:    [-0.48, -0.08, 0.34],
   inspect: [ 0.48,  0.04, 0.34],
   fight:   [ 0.00,  0.03, 0.46],
};

const installDock = g => {
   g.headBasis = () => {
      const e = eyeOf();
      const H = headMat() || cg.mIdentity();
      let fwd = [-H[8], 0, -H[10]];
      if (Math.hypot(fwd[0], fwd[2]) < 1e-4) fwd = [0, 0, -1];
      fwd = cg.normalize(fwd);
      let right = cg.cross(fwd, [0, 1, 0]);
      if (Math.hypot(right[0], right[1], right[2]) < 1e-4) right = [1, 0, 0];
      right = cg.normalize(right);
      return { e, fwd, right, up: [0, 1, 0] };
   };

   g.worldToLocal = p => {
      const { e, fwd, right, up } = g.headBasis();
      const d = cg.subtract(p, e);
      return [cg.dot(d, right), cg.dot(d, up), cg.dot(d, fwd)];
   };

   g.localToWorld = loc => {
      const { e, fwd, right, up } = g.headBasis();
      return cg.add(e, cg.add(cg.scale(right, loc[0]), cg.add(cg.scale(up, loc[1]), cg.scale(fwd, loc[2]))));
   };

   g.pinCard = (id, pos) => {
      const e = eyeOf();
      const f = cg.subtract(e, pos);
      const n = Math.hypot(f[0], f[1], f[2]) || 1;
      g.cards[id] = { pos: pos.slice(), face: [f[0] / n, f[1] / n, f[2] / n] };
   };

   g.pieceWorld = p => cg.mTransform(g.stage.getMatrix(), [tileX(p.c), 0.08, tileZ(p.r)]);

   g.placeToward = (id, target) => {
      const e = eyeOf();
      const delta = cg.subtract(target, e);
      const n = Math.hypot(delta[0], delta[1], delta[2]) || 1;
      const dir = delta.map(v => v / n);
      const dist = Math.max(0.36, Math.min(0.52, n * 0.55));
      g.pinCard(id, cg.add(e, cg.scale(dir, dist)));
   };

   g.resetCardOrbit = () => {
      CARD_IDS.forEach(id => g.pinCard(id, g.localToWorld(defaultCardLocal[id])));
   };

   g.placeFightCard = piece => {
      if (piece) g.placeToward('fight', g.pieceWorld(piece));
      else g.pinCard('fight', g.localToWorld(defaultCardLocal.fight));
   };

   g.layoutDock = () => {
      if (!g.cards.hud) g.resetCardOrbit();
      g.dock = {
         hud: g.cards.hud.pos,
         pack: g.cards.pack.pos,
         side: g.cards.inspect.pos,
         battle: g.cards.fight.pos,
      };
   };

   g.projectSphere = (ray, center, r) => {
      const oc = cg.subtract(ray.o, center);
      const b = 2 * cg.dot(oc, ray.d);
      const c0 = cg.dot(oc, oc) - r * r;
      const disc = b * b - 4 * c0;
      const along = t => cg.add(ray.o, cg.scale(ray.d, t));
      const onto = p => {
         const d = cg.subtract(p, center);
         const n = Math.hypot(d[0], d[1], d[2]) || 1;
         return cg.add(center, cg.scale(d, r / n));
      };
      if (disc < 0) {
         const t = Math.max(0, -cg.dot(oc, ray.d));
         return onto(along(t));
      }
      const s = Math.sqrt(disc);
      let t0 = (-b - s) / 2, t1 = (-b + s) / 2;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      if (t1 < 0.02) return onto(along(Math.max(0, t1)));
      return along(t0 >= 0.02 ? t0 : t1);
   };

   g.grabCard = (id, hand) => {
      g.layoutDock();
      const pos = { hud: g.dock.hud, pack: g.dock.pack, inspect: g.dock.side, fight: g.dock.battle }[id];
      if (!pos) return;
      const r = Math.max(0.25, cg.distance(eyeOf(), pos));
      g.S.drag = { hand, kind: 'card', id, r, t0: now() };
      buzz(hand, .22, 18);
   };

   g.moveCard = hand => {
      const { S } = g;
      if (!S.drag || S.drag.kind !== 'card' || S.drag.hand !== hand) return;
      const ray = g.aimRay(hand);
      if (!ray) return;
      const e = eyeOf();
      const p = g.projectSphere(ray, e, S.drag.r);
      let loc = g.worldToLocal(p);
      loc[1] = clamp(loc[1], -0.45, 0.5);
      if (loc[2] < 0.1) loc[2] = 0.1;
      const n = Math.hypot(loc[0], loc[1], loc[2]) || 1;
      const placed = loc.map(v => v / n * S.drag.r);
      g.pinCard(S.drag.id, g.localToWorld(placed));
   };
};

const installPicking = g => {
   g.lookRay = () => {
      const H = headMat();
      if (!H) return null;
      return { o: H.slice(12, 15), d: cg.normalize([-H[8], -H[9], -H[10]]) };
   };

   g.aimRay = hand => beamRay(hand) || g.lookRay();

   g.hoverTile = hand => {
      const ray = g.aimRay(hand);
      if (!ray) return null;
      const { stage } = g;
      const origin = cg.mTransform(stage.getMatrix(), [0, 0.004, 0]);
      const n4 = cg.mTransform(stage.getMatrix(), [0, 1, 0, 0]);
      const n = [n4[0], n4[1], n4[2]];
      const nl = Math.hypot(n[0], n[1], n[2]);
      if (nl < 1e-6) return null;
      n[0] /= nl; n[1] /= nl; n[2] /= nl;
      const den = cg.dot(ray.d, n);
      if (Math.abs(den) < 1e-5) return null;
      const t = cg.dot(cg.subtract(origin, ray.o), n) / den;
      if (t < 0.03 || t > 8) return null;
      const p = cg.add(ray.o, cg.scale(ray.d, t));
      const q = g.stageOf(p);
      if (!g.onBoard(q[0], q[2])) return null;
      return Object.assign(g.nearestTile(q[0], q[2]), { t });
   };

   g.hitCells = (ray, kit) => {
      if (!kit || !kit.visible()) return null;
      let best = null;
      for (const cell of kit.cells) {
         if (cell.off) continue;
         let M;
         try { M = cell.tile.getGlobalMatrix(); } catch (err) { continue; }
         const h = rayBox(ray, M);
         if (h && (!best || h.t < best.t)) best = { kind: 'ui', kit, cell, t: h.t };
      }
      return best;
   };

   g.hitCardBody = (ray, kit, id) => {
      if (!kit || !kit.body || (kit.visible && !kit.visible())) return null;
      let M;
      try { M = kit.body.getGlobalMatrix(); } catch (err) { return null; }
      const h = rayBox(ray, M);
      return h ? { kind: 'card', id, kit, t: h.t } : null;
   };

   g.pick = hand => {
      const { S, ui, stage } = g;
      const ray = g.aimRay(hand);
      if (!ray) return null;
      let best = null;
      const consider = hit => {
         if (hit && hit.t != null && (!best || hit.t < (best.t || 99))) best = hit;
      };
      consider(g.hitCells(ray, ui.god));
      consider(g.hitCells(ray, ui.tiles));
      consider(g.hitCells(ray, ui.chest));
      consider(g.hitCells(ray, ui.pack));
      consider(g.hitCells(ray, ui.inspect));
      consider(g.hitCells(ray, ui.fight));
      if (S.mode === 'adv') {
         consider(g.hitCardBody(ray, ui.hud, 'hud'));
         consider(g.hitCardBody(ray, ui.pack, 'pack'));
         consider(g.hitCardBody(ray, ui.inspect, 'inspect'));
         consider(g.hitCardBody(ray, ui.fight, 'fight'));
      }
      if (best && (best.kind === 'ui' || best.kind === 'card')) {
         const inspectHit = (best.kind === 'ui' && best.kit === ui.inspect) ||
            (best.kind === 'card' && best.id === 'inspect');
         const walkPast = S.mode === 'adv' && !S.combat && inspectHit;
         if (!walkPast) {
            best.hand = hand;
            return best;
         }
      }
      if (S.mode === 'god' || (S.mode === 'adv' && !S.combat)) {
         for (const piece of S.pieces) {
            const spr = KIND[piece.kind].sprite || piece.kind;
            const { sx, sy } = tokenSize(spr);
            const M = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(piece.c), sy, tileZ(piece.r)), cg.mScale(sx, sy, sx)));
            const h = rayBox(ray, M);
            if (h) consider({ kind: 'piece', piece, hand, t: h.t });
         }
         if (S.mode === 'god') {
            const AM = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(S.hero.c), .055, tileZ(S.hero.r)), cg.mScale(.045, .055, .03)));
            const ah = rayBox(ray, AM);
            if (ah) consider({ kind: 'avatar', hand, t: ah.t });
         }
      }
      const tile = g.hoverTile(hand);
      if (tile && (S.mode === 'god' || S.mode === 'tile' || (S.mode === 'adv' && !S.combat))) {
         const walk = S.mode === 'adv' && (Math.abs(tile.c - S.hero.c) + Math.abs(tile.r - S.hero.r)) === 1;
         const inspectHit = best && ((best.kind === 'ui' && best.kit === ui.inspect) ||
            (best.kind === 'card' && best.id === 'inspect'));
         if (walk && inspectHit)
            best = { kind: 'tile', c: tile.c, r: tile.r, hand, t: tile.t };
         else
            consider({ kind: 'tile', c: tile.c, r: tile.r, hand, t: tile.t });
      }
      if (best) best.hand = hand;
      return best;
   };

   g.advPointer = () => {
      const { S, stage } = g;
      if (S.mode !== 'adv' || S.combat) return {};
      const ray = g.aimRay('right') || g.aimRay('left');
      if (!ray) return {};
      let piece = null, pt = 99;
      for (const p of S.pieces) {
         if (!g.nearHero(p.c, p.r)) continue;
         const spr = p.kind === 'chest' && p.loot && p.loot.length && !p.opened ? 'chest_gold' : (KIND[p.kind].sprite || p.kind);
         const { sx, sy } = tokenSize(spr);
         const M = cg.mMultiply(stage.getMatrix(), cg.mMultiply(cg.mTranslate(tileX(p.c), sy, tileZ(p.r)), cg.mScale(sx, sy, sx)));
         const h = rayBox(ray, M);
         if (h && h.t < pt) { pt = h.t; piece = p; }
      }
      const tile = g.hoverTile('right') || g.hoverTile('left');
      if (piece && (!tile || pt <= tile.t + 0.02)) return { piece };
      if (!tile) return {};
      const on = g.pieceAt(tile.c, tile.r);
      if (on && g.nearHero(on.c, on.r)) return { piece: on };
      if (g.canStep(tile.c, tile.r)) return { tile };
      return {};
   };
};

const installTable = g => {
   g.gripping = {};

   g.closeChest = () => {
      if (g.S.chestId) g.net.release('piece:' + g.S.chestId);
      g.S.chestId = 0;
      g.ui.chest.hide();
   };

   g.openChestWidget = piece => {
      if (g.S.mode !== 'god') return;
      if (g.S.chestId !== piece.id) g.closeChest();
      g.withPiece(piece, current => {
         if (g.S.chestId && g.S.chestId !== current.id) g.closeChest();
         g.S.chestId = current.id;
         g.ui.chest.show();
         g.say('Chest.');
      });
   };

   g.addLoot = i => {
      const p = g.S.pieces.find(x => x.id === g.S.chestId);
      if (!p || !p.loot || p.loot.length >= 6) return;
      if (!g.net.owns('piece:' + p.id)) { g.say('Claim the chest before editing its loot.'); return; }
      p.loot.push(LOOT[i].make());
      g.say(LOOT[i].label + ' dropped in the chest.');
   };

   g.removeLoot = i => {
      const p = g.S.pieces.find(x => x.id === g.S.chestId);
      if (!p || !p.loot || !p.loot[i]) return;
      if (!g.net.owns('piece:' + p.id)) { g.say('Claim the chest before editing its loot.'); return; }
      p.loot.splice(i, 1);
   };

   g.paintCell = (c, r, id, quiet, claimed = false) => {
      const { S } = g;
      if (!inb(c, r)) return false;
      const next = id || S.groundSel;
      if (S.ground[r][c] === next) return false;
      if (!claimed) return g.net.claim('tile:' + r + ',' + c, () => {
         if (S.mode === 'god' || S.mode === 'tile') g.paintCell(c, r, next, quiet, true);
         g.net.release('tile:' + r + ',' + c);
      });
      S.ground[r][c] = next;
      if (!quiet) {
         g.say(GROUND[next].label + ' on ' + g.tileName(c, r) + '.');
         tone(480, .05);
      }
      return true;
   };

   g.strokePaint = hand => {
      const { S } = g;
      if (S.mode !== 'tile') return;
      if (S.drag && S.drag.kind !== 'paint') return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'ui') return;
      const aim = g.hoverTile(hand);
      if (!aim) return;
      if (g.paintCell(aim.c, aim.r, S.groundSel, true)) {
         if (S.paintNote !== S.groundSel) {
            S.paintNote = S.groundSel;
            g.say(GROUND[S.groundSel].label + '.');
         }
         buzz(hand, .12, 12);
      }
   };

   g.liftTile = (hand, c, r, claimed = false) => {
      const { S } = g;
      if (!claimed) return g.net.claim('tile:' + r + ',' + c, () => {
         if (g.gripping[hand] && (S.mode === 'god' || S.mode === 'tile')) g.liftTile(hand, c, r, true);
         else g.net.release('tile:' + r + ',' + c);
      });
      const type = S.ground[r][c];
      S.groundSel = type;
      S.paintNote = '';
      S.drag = { hand, kind: 'tile', c, r, type, t0: now(), start: { c, r }, from: handPos(hand), moved: false };
      g.say(GROUND[type].label + '.');
      buzz(hand, .22, 18);
   };

   g.grabStamp = (hand, id) => {
      const { S } = g;
      S.groundSel = id;
      S.paintNote = '';
      S.drag = { hand, kind: 'stamp', type: id, t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
      g.say(GROUND[id].label + '.');
      buzz(hand, .25, 20);
   };

   g.useUI = (hit, hand) => {
      const { S, ui } = g;
      const c = hit.cell;
      if (c.type === 'kind') {
         S.selected = c.id;
         S.drag = { hand, kind: 'ghost', palette: c.id, t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
         g.say(KIND[c.id].label + '.');
         buzz(hand, .3, 30);
         return;
      }
      if (c.type === 'ground') {
         g.grabStamp(hand, c.id);
         return;
      }
      if (c.type === 'add') { g.addLoot(c.index); return; }
      if (c.type === 'drop') { g.removeLoot(c.index); return; }
      if (c.type === 'slot') { g.inspectSlot(c.index); return; }
      if (c.id === 'tiles') g.enterTiles();
      else if (c.id === 'enter') g.enterAdv();
      else if (c.id === 'clear') g.clearBoard();
      else if (c.id === 'build') g.enterGod();
      else if (c.id === 'fill') g.fillGround();
      else if (c.id === 'close' && hit.kit === ui.chest) g.closeChest();
      else if (c.id === 'close' && hit.kit === ui.pack) { S.packOpen = false; ui.pack.hide(); }
      else if (c.id === 'close' && hit.kit === ui.inspect) g.closeFocus();
      else if (c.id === 'act') g.tryInteract();
      else if (c.id === 'end') g.endTurn();
      else if (c.id === 'god') g.enterGod();
      else if (c.id === 'equip') {
         const it = S.focus && S.pack[S.focus.index];
         if (it && it.type === 'weapon') { S.equipped = it.uid; g.say('Equipped ' + WEAPONS[it.id].name + '.'); tone(480, .07); }
      }
      else if (c.id === 'unequip') {
         S.equipped = 0;
         g.say('Unequipped. Fists ready.');
         tone(260, .07);
      }
      else if (c.id === 'use') {
         if (S.focus && S.focus.kind === 'item') g.useSlot(S.focus.index);
         g.closeFocus();
      }
      else if (c.id === 'open') {
         const p = S.focus && S.pieces.find(x => x.id === S.focus.id);
         g.closeFocus();
         if (p) g.interactPiece(p);
      }
      else if (c.id === 'fight') {
         const p = S.focus && S.pieces.find(x => x.id === S.focus.id);
         g.closeFocus();
         if (p) g.startFight(p);
      }
      else if (c.id === 'attack') g.combatAttack();
      else if (c.id === 'flee') g.combatFlee();
      else if (c.id === 'herb') g.useHerb();
      else if (c.id === 'reroll') g.rerollFail();
      else if (c.id === 'confirm') g.confirmRoll();
   };

   g.grab = hand => {
      const { S } = g;
      g.gripping[hand] = true;
      const hit = g.pick(hand);
      if (!hit) return;
      if (hit.kind === 'ui') { g.useUI(hit, hand); return; }
      if (S.mode === 'tile') {
         if (hit.kind === 'tile') g.liftTile(hand, hit.c, hit.r);
         return;
      }
      if (S.mode !== 'god') return;
      if (hit.kind === 'piece') {
         g.withPiece(hit.piece, piece => {
            if (!g.gripping[hand]) { g.net.release('piece:' + piece.id); return; }
            S.drag = { hand, kind: 'piece', piece, t0: now(), start: { c: piece.c, r: piece.r }, from: handPos(hand), moved: false };
            buzz(hand, .25, 25);
         });
      } else if (hit.kind === 'avatar') {
         S.drag = { hand, kind: 'avatar', t0: now(), start: g.hoverTile(hand), from: handPos(hand), moved: false };
         buzz(hand, .25, 25);
      } else if (hit.kind === 'tile') {
         g.liftTile(hand, hit.c, hit.r);
      }
   };

   g.drop = hand => {
      g.gripping[hand] = false;
      const drag = g.S.drag;
      g.finishDrop(hand);
      if (drag && drag.hand === hand) {
         if (drag.kind === 'piece' && g.S.chestId !== drag.piece.id)
            g.net.release('piece:' + drag.piece.id);
      }
   };

   g.finishDrop = hand => {
      const { S } = g;
      if (!S.drag || S.drag.hand !== hand) return;
      const drag = S.drag;
      S.drag = null;
      if (drag.kind === 'card') return;
      const aim = g.hoverTile(hand);
      const dt = now() - drag.t0;

      if (drag.kind === 'ghost') {
         if (!aim) return;
         const p = g.spawnPiece(drag.palette, aim.c, aim.r);
         g.say(p ? KIND[drag.palette].label + ' on ' + g.tileName(aim.c, aim.r) + '.' : 'That tile is taken.');
         tone(p ? 520 : 180, .08);
         return;
      }
      if (drag.kind === 'avatar') {
         if (aim && inb(aim.c, aim.r) && !g.blocks(aim.c, aim.r)) {
            g.net.move(aim.c, aim.r, true, () => g.say('Your pawn starts on ' + g.tileName(aim.c, aim.r) + '.'));
         } else if (aim) {
            g.say('That square is blocked or occupied by the other pawn.');
         }
         return;
      }
      if (drag.kind === 'paint') return;
      if (drag.kind === 'stamp') {
         if (aim && inb(aim.c, aim.r)) {
            g.paintCell(aim.c, aim.r, drag.type);
            tone(420, .06);
         }
         return;
      }
      if (drag.kind === 'tile') {
         g.net.release('tile:' + drag.r + ',' + drag.c);
         if (aim && inb(aim.c, aim.r) && (aim.c !== drag.c || aim.r !== drag.r)) {
            g.net.claim(['tile:' + aim.r + ',' + aim.c, 'tile:' + drag.r + ',' + drag.c], () => {
               const a = S.ground[drag.r][drag.c];
               const b = S.ground[aim.r][aim.c];
               S.ground[drag.r][drag.c] = b;
               S.ground[aim.r][aim.c] = a;
               g.say(GROUND[a].label + ' swapped with ' + GROUND[b].label + ' on ' + g.tileName(aim.c, aim.r) + '.');
               g.net.release('tile:' + drag.r + ',' + drag.c);
               g.net.release('tile:' + aim.r + ',' + aim.c);
            });
         } else g.say('Tile set down.');
         return;
      }
      if (drag.kind === 'piece') {
         if (pressed(hand, 1)) {
            g.removePiece(drag.piece);
            g.say(KIND[drag.piece.kind].label + ' removed.');
            tone(160, .1);
            return;
         }
         if (dt < .35 && !drag.moved && drag.piece.kind === 'chest') {
            g.openChestWidget(drag.piece);
            return;
         }
         if (aim && inb(aim.c, aim.r) && !g.occupy(aim.c, aim.r, drag.piece)) {
            drag.piece.c = aim.c; drag.piece.r = aim.r;
            g.say(KIND[drag.piece.kind].label + ' moved to ' + g.tileName(aim.c, aim.r) + '.');
            return;
         }
         if (!aim) {
            g.removePiece(drag.piece);
            g.say(KIND[drag.piece.kind].label + ' thrown away.');
            tone(160, .1);
         }
      }
   };

   g.enterAdv = assigned => {
      const { S, ui } = g;
      if (g.net && !g.net.canPlay()) return;
      if (!assigned && S.mode === 'adv') return;
      if (!assigned && g.blocks(S.hero.c, S.hero.r)) {
         g.say('Move the avatar off a blocked tile first.');
         return;
      }
      const e = eyeOf();
      g.net.releaseAll();
      S.drag = null;
      g.gripping = {};
      g.advAnchor = [e[0], 0, e[2]];
      g.resetCardOrbit();
      g.layoutDock();
      S.mode = 'adv';
      S.mp = MP_MAX;
      S.packOpen = true;
      S.chestId = 0;
      g.closeFocus();
      ui.god.hide();
      ui.tiles.hide();
      ui.chest.hide();
      ui.pack.show();
      ui.hud.show();
      g.say('The dungeon waits.');
      tone(360, .12);
   };

   g.enterGod = () => {
      const { S, ui } = g;
      if (g.net && !g.net.canPlay()) return;
      g.net.releaseAll();
      g.gripping = {};
      S.mode = 'god';
      S.combat = null;
      S.roll = null;
      S.drag = null;
      S.packOpen = false;
      S.chestId = 0;
      ui.chest.hide();
      g.closeFocus();
      ui.hud.hide();
      ui.pack.hide();
      ui.inspect.hide();
      ui.fight.hide();
      ui.tiles.hide();
      ui.god.show();
      const H = headMat();
      const e = eyeOf();
      const yaw = H ? Math.atan2(H[8], H[10]) : 0;
      g.godAnchor = cg.mMultiply(cg.mTranslate(e[0], TABLE_Y, e[2]),
         cg.mMultiply(cg.mRotateY(yaw), cg.mTranslate(0, 0, BOARD_Z - .4)));
      g.say('God Mode.');
   };

   g.enterTiles = () => {
      const { S, ui } = g;
      if (g.net && g.net.role() !== 'god') return;
      g.net.releaseAll();
      g.gripping = {};
      S.mode = 'tile';
      S.drag = null;
      S.chestId = 0;
      g.closeFocus();
      ui.god.hide();
      ui.chest.hide();
      ui.inspect.hide();
      ui.hud.hide();
      ui.pack.hide();
      ui.fight.hide();
      ui.tiles.show();
      g.say('Terrain.');
      tone(320, .08);
   };

   g.fillGround = () => {
      const { S } = g;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) g.paintCell(c, r, S.groundSel, true);
      g.say('Filled the grid with ' + GROUND[S.groundSel].label + '.');
   };

   g.clearBoard = () => {
      const { S } = g;
      [...S.pieces].forEach(piece => g.withPiece(piece, current => {
         g.removePiece(current);
         g.net.release('piece:' + current.id);
      }));
      const hero = startHero();
      Object.assign(S.hero, { ...hero, c: S.hero.c, r: S.hero.r });
      g.say('Clearing unclaimed objects. Your pawn stays on its square.');
   };
};

const installAdventure = g => {
   g.reachable = () => {
      const { S } = g;
      const dist = Array.from({ length: N }, () => Array(N).fill(99));
      const q = [[S.hero.c, S.hero.r]];
      dist[S.hero.r][S.hero.c] = 0;
      while (q.length) {
         const [c, r] = q.shift();
         const d = dist[r][c];
         if (d >= S.mp) continue;
         for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc, nr = r + dr;
            if (!inb(nc, nr) || g.blocks(nc, nr) || dist[nr][nc] <= d + 1) continue;
            dist[nr][nc] = d + 1;
            q.push([nc, nr]);
         }
      }
      return dist;
   };

   g.canStep = (c, r) => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return false;
      if (!inb(c, r) || (Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r)) !== 1) return false;
      return !g.blocks(c, r);
   };

   g.stepTo = (c, r) => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return false;
      if (!inb(c, r) || (Math.abs(c - S.hero.c) + Math.abs(r - S.hero.r)) !== 1) return false;
      if (g.heroAt(c, r, S.playerSlot)) {
         g.say('The other pawn occupies that square.');
         return false;
      }
      if (g.blocks(c, r)) {
         const p = g.pieceAt(c, r);
         if (p && KIND[p.kind].interact) { g.inspectPiece(p); return true; }
         g.say(p ? 'The ' + KIND[p.kind].label.toLowerCase() + ' blocks this square.' : 'Blocked.');
         return false;
      }
      return g.net.move(c, r, false, () => {
         g.closeFocus();
         tone(420, .06, .03);
         buzz('right', .2, 20);
         g.say(S.mp <= 0 ? 'No steps left.' : 'Steps: ' + S.mp);
      });
   };

   g.tryInteract = () => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll) return;
      const p = g.lookNeighbor();
      if (!p) return;
      g.inspectPiece(p);
   };

   g.interactPiece = (p, claimed = false) => {
      const { S } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || !p) {
         if (claimed && p && (!S.combat || S.combat.piece !== p)) g.net.release('piece:' + p.id);
         return;
      }
      if (!g.nearHero(p.c, p.r)) {
         g.say('Get next to it first.');
         if (claimed) g.net.release('piece:' + p.id);
         return;
      }
      if (!claimed) return g.withPiece(p, current => g.interactPiece(current, true));
      if (KIND[p.kind].interact === 'fight') { g.startFight(p); return; }
      if (p.kind !== 'chest') {
         g.say('Nothing to do here.');
         g.net.release('piece:' + p.id);
         return;
      }
      if (p.opened) {
         const found = p.found || [];
         g.say(found.length ? 'You found ' + found.join(', ') + '.' : 'Nothing inside.');
         g.showPieceCard(p);
         g.net.release('piece:' + p.id);
         return;
      }
      const bonus = abilityMod(S.stats.str) + profBonus(S.hero.level);
      g.startRoll('chest', bonus, 15, die => {
         const total = die.face + bonus;
         if (total < 15) g.say('The lock holds. Athletics ' + total + ' vs DC 15.');
         else {
            p.opened = true;
            p.found = (p.loot && p.loot.length) ? p.loot.map(g.give) : [];
            g.say(p.found.length ? 'You found ' + p.found.join(', ') + '.' : 'The chest was empty.');
            p.loot = [];
            tone(720, .12);
         }
         g.showPieceCard(p);
         g.net.release('piece:' + p.id);
         g.endPlayerTurn(true);
      });
   };

   g.monsterStep = p => {
      const { S } = g;
      const adx = S.hero.c - p.c, adz = S.hero.r - p.r;
      if (Math.abs(adx) + Math.abs(adz) <= 1) return 'adjacent';
      const tries = [];
      if (adx) tries.push([p.c + Math.sign(adx), p.r]);
      if (adz) tries.push([p.c, p.r + Math.sign(adz)]);
      tries.sort((a, b) =>
         (Math.abs(a[0] - S.hero.c) + Math.abs(a[1] - S.hero.r)) -
         (Math.abs(b[0] - S.hero.c) + Math.abs(b[1] - S.hero.r))
      );
      for (const [c, r] of tries) {
         if (!inb(c, r)) continue;
         if (c === S.hero.c && r === S.hero.r) return 'adjacent';
         if (g.occupy(c, r, p) || g.groundAt(c, r).block) continue;
         const other = g.pieceAt(c, r);
         if (other && other !== p) continue;
         p.c = c; p.r = r;
         return Math.abs(p.c - S.hero.c) + Math.abs(p.r - S.hero.r) <= 1 ? 'adjacent' : 'moved';
      }
      return 'stuck';
   };

   g.moveMonsters = () => {
      const { S } = g;
      const skip = S.justFled;
      S.justFled = 0;
      const foes = S.pieces.filter(p => KIND[p.kind] && KIND[p.kind].interact === 'fight');
      foes.sort((a, b) =>
         (Math.abs(a.c - S.hero.c) + Math.abs(a.r - S.hero.r)) -
         (Math.abs(b.c - S.hero.c) + Math.abs(b.r - S.hero.r))
      );
      let engaged = null;
      for (const p of foes) {
         if (g.net.busy('piece:' + p.id)) continue;
         g.withPiece(p, current => {
            const result = g.monsterStep(current);
            if (result === 'adjacent' && !engaged && current.id !== skip && !S.combat && !S.roll) {
               engaged = current;
               g.startFight(current, true);
            } else if (!S.combat || S.combat.piece !== current) g.net.release('piece:' + current.id);
         });
      }
   };

   g.endPlayerTurn = keep => {
      const { S } = g;
      if (S.mode !== 'adv' || g.net.turnPending()) return;
      if (!keep) g.closeFocus();
      S.roll = null;
      g.net.endTurn(() => {
         g.say((S.night ? 'Night' : 'Day') + '. Turn ' + S.turn + '.');
         tone(240, .1);
         if (!S.combat) g.moveMonsters();
      });
   };

   g.endTurn = () => {
      const { S } = g;
      if (S.mode !== 'adv' || S.roll || S.combat) return;
      g.endPlayerTurn();
   };

   g.pollMove = () => {
      const { S, model } = g;
      if (S.mode !== 'adv' || S.combat || S.roll || S.mp <= 0) return;
      if (model.time < S.joyAt) return;
      const j = joyStickState.left || { x: 0, y: 0 };
      const k = window.__dndKeys.down;
      let x = j.x || 0, y = j.y || 0;
      if (k.a || k.arrowleft) x = -1;
      if (k.d || k.arrowright) x = 1;
      if (k.w || k.arrowup) y = -1;
      if (k.s || k.arrowdown) y = 1;
      if (Math.hypot(x, y) < .6) return;
      const H = headMat();
      let fx = 0, fz = -1, rx = 1, rz = 0;
      if (H) {
         fx = -H[8]; fz = -H[10];
         const n = Math.hypot(fx, fz) || 1;
         fx /= n; fz /= n;
         rx = fz; rz = -fx;
      }
      const wx = fx * -y + rx * x;
      const wz = fz * -y + rz * x;
      const dc = Math.abs(wx) > Math.abs(wz) ? Math.sign(wx) : 0;
      const dr = Math.abs(wz) >= Math.abs(wx) ? Math.sign(wz) : 0;
      if (dc || dr) {
         g.stepTo(S.hero.c + dc, S.hero.r + dr);
         S.joyAt = model.time + .32;
      }
   };
};

const installCombat = g => {
   g.settleCoin = R => {
      const d = R.dice[0];
      let face = rollDie(20);
      if (R.advantage) face = Math.max(face, rollDie(20));
      d.face = face;
      d.total = face + R.bonus;
      d.ok = R.attack ? (face === 20 || (face !== 1 && d.total >= R.dc)) : d.total >= R.dc;
      d.done = false;
      d.t = .85;
   };

   g.startRoll = (why, bonus, dc, after, attack, advantage) => {
      const { S, model } = g;
      S.roll = {
         why, bonus, dc, after, attack: !!attack, advantage: !!advantage,
         dice: [{}],
         started: model.time,
         waiting: false,
         inspired: false,
         hold: 0,
      };
      g.settleCoin(S.roll);
      const vs = (attack ? ' vs AC ' : ' vs DC ') + dc;
      g.say((advantage ? 'Pack Tactics. ' : '') + 'Flipping. ' + signed(bonus) + vs);
      tone(300, .05);
   };

   g.finishRoll = () => {
      const { S } = g;
      const R = S.roll;
      if (!R) return;
      R.waiting = false;
      const die = R.dice[0];
      const after = R.after;
      S.roll = null;
      if (after) after(die);
   };

   g.confirmRoll = () => {
      const { S } = g;
      if (!S.roll || S.roll.dice.some(d => !d.done)) return;
      g.finishRoll();
   };

   g.rerollFail = () => {
      const { S, model } = g;
      const R = S.roll;
      if (!R || !R.waiting) return;
      if (R.inspired) { g.say('That coin was already flipped again.'); return; }
      if (S.hero.insp <= 0) { g.say('No Heroic Inspiration.'); return; }
      S.hero.insp -= 1;
      R.inspired = true;
      R.waiting = false;
      R.hold = 0;
      R.started = model.time;
      g.settleCoin(R);
      g.say('Heroic Inspiration. Flipping again.');
      tone(640, .08);
   };

   g.startFight = (piece, claimed = false) => {
      const { S } = g;
      if (!piece || !KIND[piece.kind] || KIND[piece.kind].interact !== 'fight'
         || S.mode !== 'adv' || S.combat || S.roll) {
         if (claimed && piece && (!S.combat || S.combat.piece !== piece)) g.net.release('piece:' + piece.id);
         return;
      }
      if (!g.nearHero(piece.c, piece.r)) {
         g.say('Get next to it first.');
         if (claimed) g.net.release('piece:' + piece.id);
         return;
      }
      if (!claimed) return g.withPiece(piece, current => g.startFight(current, true));
      g.closeFocus();
      g.placeFightCard(piece);
      const sheet = piece.sheet || monsterSheet();
      S.combat = { piece, sheet, turn: 'player' };
      const heroInit = rollDie(20) + abilityMod(S.stats.dex);
      const foeInit = rollDie(20) + abilityMod(sheet.dex);
      const name = sheet.title || sheet.name;
      const heroFirst = heroInit > foeInit || (heroInit === foeInit && abilityMod(S.stats.dex) >= abilityMod(sheet.dex));
      g.say('Initiative ' + heroInit + ' vs ' + foeInit + '. ' + (heroFirst ? 'You go first.' : name + ' goes first.'));
      tone(200, .15);
      if (!heroFirst) g.monsterSwing();
   };

   g.combatAttack = () => {
      const { S } = g;
      if (!S.combat || S.roll || S.combat.turn !== 'player') return;
      const w = weaponOf(S.pack, S.equipped);
      const bonus = attackBonus(S.stats, S.hero.level, w);
      const ac = S.combat.sheet.ac;
      g.startRoll('attack', bonus, ac, die => {
         if (!g.S.combat) return;
         const total = die.face + bonus;
         const crit = die.face === 20;
         const miss = die.face === 1 || (!crit && total < ac);
         if (miss) g.say('Miss. ' + die.face + signed(bonus) + ' = ' + total + ' vs AC ' + ac + '.');
         else {
            const dmg = rollWeaponDamage(g.S.stats, w, crit);
            g.S.combat.sheet.hp = Math.max(0, g.S.combat.sheet.hp - dmg);
            g.say((crit ? 'Critical hit! ' : 'Hit! ') + total + ' vs AC ' + ac + '. ' + dmg + ' ' + w.type + '.');
            tone(180, .1);
         }
         if (g.S.combat.sheet.hp <= 0) g.winFight();
         else { g.S.combat.turn = 'monster'; g.monsterSwing(); }
      }, true);
   };

   g.combatFlee = () => {
      const { S, ui } = g;
      if (!S.combat || S.roll) return;
      g.say('You Disengage.');
      S.justFled = S.combat.piece.id;
      g.net.release('piece:' + S.combat.piece.id);
      ui.fight.hide();
      S.combat = null;
      S.packOpen = true;
      g.endPlayerTurn();
   };

   g.heroFalls = () => {
      const { S, ui } = g;
      g.say('You fall. The dungeon fades back to your table.');
      S.hero.hp = 1;
      ui.fight.hide();
      S.combat = null;
      S.roll = null;
      S.packOpen = true;
      g.enterGod();
   };

   g.monsterSwing = () => {
      const { S } = g;
      if (!S.combat) return;
      const sheet = S.combat.sheet;
      const name = sheet.title || sheet.name;
      if (sheet.breath && rollDie(6) >= sheet.breath.recharge) {
         const breath = sheet.breath;
         const saveBonus = abilityMod(S.stats.dex);
         const face = rollDie(20);
         const total = face + saveBonus;
         const saved = total >= breath.dc;
         let dmg = rollPool(breath.n, breath.die);
         if (saved) dmg = Math.floor(dmg / 2);
         S.hero.hp = Math.max(0, S.hero.hp - dmg);
         g.say(breath.name + '. Dexterity ' + total + ' vs DC ' + breath.dc + '. ' + dmg + ' ' + breath.type + '.');
         buzz('left', .7, 80);
         if (S.hero.hp <= 0) g.heroFalls();
         else S.combat.turn = 'player';
         return;
      }
      const allies = S.pieces.filter(p => p !== S.combat.piece && KIND[p.kind] && KIND[p.kind].interact === 'fight'
         && Math.abs(p.c - S.hero.c) + Math.abs(p.r - S.hero.r) <= 1).length;
      const advantage = !!(sheet.pack && allies);
      g.startRoll('monster', sheet.attack.bonus, S.hero.ac, die => {
         if (!g.S.combat) return;
         const bonus = sheet.attack.bonus;
         const total = die.face + bonus;
         const crit = die.face === 20;
         const miss = die.face === 1 || (!crit && total < g.S.hero.ac);
         if (miss) g.say(name + ' misses. ' + total + ' vs AC ' + g.S.hero.ac + '.');
         else {
            const dmg = rollMonsterDamage(sheet.attack, crit);
            g.S.hero.hp = Math.max(0, g.S.hero.hp - dmg);
            g.say(name + (crit ? ' critical hits' : ' hits') + ' for ' + dmg + ' ' + sheet.attack.type + '.');
            buzz('left', .5, 50);
         }
         if (g.S.hero.hp <= 0) g.heroFalls();
         else g.S.combat.turn = 'player';
      }, true, advantage);
   };

   g.winFight = () => {
      const { S, ui } = g;
      const piece = S.combat.piece;
      const sheet = S.combat.sheet;
      S.hero.gold += sheet.gold || 0;
      const note = grantXp(S.hero, S.stats, sheet.xp || 0);
      g.say((sheet.title || sheet.name) + ' falls. +' + (sheet.gold || 0) + ' gp, +' + (sheet.xp || 0) + ' XP.' + note);
      g.removePiece(piece);
      g.net.release('piece:' + piece.id);
      ui.fight.hide();
      S.combat = null;
      S.packOpen = true;
      tone(660, .16);
      g.endPlayerTurn();
   };

   g.useHerb = () => {
      const { S } = g;
      const i = S.pack.findIndex(p => p.type === 'item' && p.id === 'godsbeard');
      if (i < 0) { g.say('No Potion of Healing left.'); return; }
      S.pack.splice(i, 1);
      const heal = rollPotion();
      S.hero.hp = Math.min(S.hero.hpMax, S.hero.hp + heal);
      g.say('Potion of Healing restores ' + heal + ' HP.');
      tone(500, .1);
      if (S.combat && !S.roll) { S.combat.turn = 'monster'; g.monsterSwing(); }
   };

   g.useSlot = i => {
      const { S } = g;
      const it = S.pack[i];
      if (!it) return;
      if (it.type === 'weapon') {
         S.equipped = it.uid;
         g.say('Equipped ' + WEAPONS[it.id].name + '.');
         tone(480, .07);
      } else if (it.type === 'item' && it.id === 'godsbeard') {
         if (S.combat && S.roll) return;
         g.useHerb();
      }
   };

   g.updateRoll = () => {
      const { S, model } = g;
      const R = S.roll;
      if (!R) return;
      const d = R.dice[0];
      if (!d.done && model.time - R.started >= d.t) {
         d.done = true;
         tone(d.face === 20 ? 880 : d.ok ? 700 : 220, .06);
      }
      if (d.done && !R.waiting) {
         R.waiting = true;
         const side = d.ok ? (d.face === 20 ? 'Heads. Critical. ' : 'Heads. ') : 'Tails. ';
         const vs = (R.attack ? ' vs AC ' : ' vs DC ') + R.dc;
         if (R.why === 'attack') g.say(side + d.total + vs + '.');
         else R.hold = model.time + .6;
      }
      if (R.hold && model.time >= R.hold) g.finishRoll();
   };
};

const installPose = g => {
   g.godMatrix = () => cg.mMultiply(g.godAnchor || cg.mTranslate(0, TABLE_Y, BOARD_Z),
      cg.mRotateY(g.net.slot() === 1 ? Math.PI : 0));

   g.poseStage = () => {
      const { S, stage } = g;
      if (S.mode !== 'adv') {
         stage.setMatrix(g.godMatrix());
         g.tableControls.identity().turnY(g.net.slot() === 1 ? Math.PI : 0);
         return;
      }
      const tx = tileX(S.hero.c), tz = tileZ(S.hero.r);
      const M = cg.mMultiply(
         cg.mTranslate(g.advAnchor[0], 0, g.advAnchor[2]),
         cg.mMultiply(cg.mScale(ADV, ADV, ADV), cg.mTranslate(-tx, 0, -tz))
      );
      stage.setMatrix(M);
   };

   g.holdStage = (hand, sy) => {
      const hp = handPos(hand);
      if (!hp) return null;
      const ray = beamRay(hand);
      const world = ray
         ? cg.add(hp, cg.add(cg.scale(ray.d, 0.03), [0, 0.012, 0]))
         : cg.add(hp, [0, 0.02, 0]);
      const q = g.stageOf(world);
      return [q[0], q[1] + (sy || 0.02), q[2]];
   };

   g.poseHeld = (rec, hand, kind, eyeS) => {
      if (!rec) return false;
      const { sx, sy } = tokenSize(kind);
      const q = g.holdStage(hand, sy);
      if (!q) return false;
      poseToken(rec, q[0], q[1], q[2], eyeS, sx, sy, g.model.time * 13);
      return true;
   };

   g.dragPreview = () => {
      const drag = g.S.drag;
      if (!drag || !['piece', 'tile', 'avatar'].includes(drag.kind)) return null;
      const sy = drag.kind === 'piece' ? tokenSize(KIND[drag.piece.kind].sprite || drag.piece.kind).sy : 0;
      const pos = g.holdStage(drag.hand, sy);
      if (!pos) return null;
      return {
         kind: drag.kind, pos, id: drag.piece ? drag.piece.id : null,
         slot: g.net.slot(),
         c: drag.c, r: drag.r, type: drag.type,
      };
   };

   g.remotePreview = () => {
      for (const id of g.net.roster()) {
         if (id == null || String(id) === String(window.clientID)) continue;
         const entry = g.net.clients()[id];
         if (entry && entry.active && entry.mode !== 'adv' && entry.preview) return entry.preview;
      }
      return null;
   };

   g.poseBoard = () => {
      const { S, tiles, glows, hoverRing, stampTile } = g;
      const dist = S.mode === 'adv' ? g.reachable() : null;
      let aim = null;
      const pointed = S.mode === 'adv' ? g.advPointer() : {};
      S.aimPiece = pointed.piece ? pointed.piece.id : 0;
      S.aimStep = pointed.tile || null;
      if (S.mode === 'god' || S.mode === 'tile') {
         if (S.drag) aim = g.hoverTile(S.drag.hand);
         else aim = g.hoverTile('right') || g.hoverTile('left');
      }
      S.hover = aim;

      const night = S.night;
      const lifting = S.drag && S.drag.kind === 'tile' ? S.drag : null;
      const remote = g.remotePreview();
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
         const spec = g.groundAt(c, r);
         const thick = 0.0035 * (spec.h || 1);
         const held = lifting && lifting.c === c && lifting.r === r;
         const remoteHeld = remote && remote.kind === 'tile' && remote.c === c && remote.r === r;
         if (held || remoteHeld) {
            const q = remoteHeld ? remote.pos : g.holdStage(lifting.hand, 0.02) || [tileX(c), 0.06, tileZ(r)];
            tiles[r][c].root.identity().move(q[0], Math.max(0.03, q[1]), q[2])
               .scale(TILE / 2, TILE / 3, TILE / 2);
         } else {
            tiles[r][c].root.identity().move(tileX(c), thick, tileZ(r))
               .scale(TILE / 2, thick, TILE / 2);
         }
         const stepHere = S.aimStep && S.aimStep.c === c && S.aimStep.r === r;
         const foeHere = S.aimPiece && g.pieceAt(c, r) && g.pieceAt(c, r).id === S.aimPiece;
         paintTile(tiles[r][c], S.ground[r][c], night, stepHere || foeHere ? [1.35, .62, .58] : null);
         setGroundOpacity(tiles[r][c], spec.block ? .75 : 1);
         const walk = dist && dist[r][c] > 0 && dist[r][c] <= S.mp;
         const pointedTile = aim && aim.c === c && aim.r === r;
         if (stepHere || foeHere) {
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2).color(1.2, .35, .28);
         } else if (walk) {
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2).color(.3, .9, .45);
         } else if (pointedTile) {
            const taken = S.mode === 'god' && g.occupy(c, r, S.drag && S.drag.piece);
            glows[r][c].identity().move(tileX(c), thick * 2 + .001, tileZ(r)).scale(TILE / 2, .0015, TILE / 2)
               .color(taken ? 1.1 : 1.2, taken ? .25 : .85, taken ? .2 : .25);
         } else glows[r][c].identity().scale(0);
      }
      if (aim) hoverRing.identity().move(tileX(aim.c), .01, tileZ(aim.r)).scale(TILE / 2, .0012, TILE / 2);
      else hoverRing.identity().scale(0);

      if (S.drag && S.drag.kind === 'stamp') {
         const q = g.holdStage(S.drag.hand, 0.02);
         const id = S.drag.type || S.groundSel;
         paintTile(stampTile, id, night);
         if (q) stampTile.root.identity().move(q[0], Math.max(0.03, q[1]), q[2]).scale(TILE / 2, TILE / 3, TILE / 2);
         else if (aim) stampTile.root.identity().move(tileX(aim.c), 0.04, tileZ(aim.r)).scale(TILE / 2, TILE / 3, TILE / 2);
         else stampTile.root.identity().scale(0);
      } else stampTile.root.identity().scale(0);
   };

   g.poseShelf = () => {
      const { S, icons, ui } = g;
      const show = S.mode === 'god';
      const eyeS = g.stageOf(eyeOf());
      KINDS.forEach(kind => {
         const rec = icons[kind];
         const cell = ui.god.cells.find(c => c.id === kind);
         const lifting = S.drag && S.drag.kind === 'ghost' && S.drag.palette === kind;
         if (!show || !cell || lifting) {
            hideToken(rec);
            return;
         }
         const { sx, sy } = tokenSize(kind);
         const k = 0.026 / Math.max(sx, sy);
         const pos = cg.mTransform(g.tableControls.getMatrix(),
            [ui.god.ox + cell.x, ui.god.oy + sy * k + 0.006, ui.god.oz + cell.z]);
         poseToken(rec, ...pos, eyeS, sx * k, sy * k);
      });
   };

   g.posePieces = () => {
      const { S, icons, tokens } = g;
      const eyeS = g.stageOf(eyeOf());
      const remote = g.remotePreview();
      if (S.drag && S.drag.kind === 'ghost') {
         const rec = icons[S.drag.palette];
         if (!g.poseHeld(rec, S.drag.hand, S.drag.palette, eyeS)) {
            const aim = g.hoverTile(S.drag.hand);
            const { sx, sy } = tokenSize(S.drag.palette);
            if (rec && aim) poseToken(rec, tileX(aim.c), 0.03 + sy, tileZ(aim.r), eyeS, sx, sy, g.model.time * 13);
         }
      }
      for (const piece of S.pieces) {
         const rec = tokens.get(piece.id);
         if (!rec) continue;
         const dragging = S.drag && S.drag.kind === 'piece' && S.drag.piece === piece;
         const spr = piece.kind === 'chest' && piece.loot && piece.loot.length && !piece.opened ? 'chest_gold' : (KIND[piece.kind].sprite || piece.kind);
         setTokenKind(rec, spr);
         if (dragging && g.poseHeld(rec, S.drag.hand, spr, eyeS)) continue;
         const { sx, sy } = tokenSize(spr);
         if (remote && remote.kind === 'piece' && remote.id === piece.id)
            poseToken(rec, ...remote.pos, eyeS, sx, sy);
         else poseToken(rec, tileX(piece.c), sy, tileZ(piece.r), eyeS, sx, sy);
         if (rec.art) rec.art.color(piece.id === S.aimPiece ? [1.45, .62, .55] : [1, 1, 1]);
      }
   };

   g.poseCoin = () => {
      const { S, model, coinRoot, coinRim, coinHeads, coinTails } = g;
      const R = S.roll;
      if (!R) { coinRoot.identity().scale(0); return; }
      const d = R.dice[0];
      const e = eyeOf();
      const H = headMat() || cg.mIdentity();
      const fwd = cg.normalize([-H[8], 0, -H[10]]);
      const u = d.done ? 1 : Math.min(1, (model.time - R.started) / (d.t || .85));
      const ease = 1 - Math.pow(1 - u, 3);
      const ang = ease * ((d.ok ? 0 : Math.PI) + 4 * Math.PI);
      const lift = Math.sin(u * Math.PI) * .1;
      const pos = cg.add(e, cg.add(cg.scale(fwd, .38), [0, -.08 + lift, 0]));
      const Z = cg.normalize(cg.subtract(e, pos));
      let X = cg.cross([0, 1, 0], Z);
      if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = [1, 0, 0];
      X = cg.normalize(X);
      const Y = cg.normalize(cg.cross(Z, X));
      const c = Math.cos(ang), s = Math.sin(ang);
      const Yr = [Y[0] * c + Z[0] * s, Y[1] * c + Z[1] * s, Y[2] * c + Z[2] * s];
      const Zr = [Z[0] * c - Y[0] * s, Z[1] * c - Y[1] * s, Z[2] * c - Y[2] * s];
      const k = .034;
      coinRoot.setMatrix([
         X[0] * k, X[1] * k, X[2] * k, 0,
         Yr[0] * k, Yr[1] * k, Yr[2] * k, 0,
         Zr[0] * k, Zr[1] * k, Zr[2] * k, 0,
         pos[0], pos[1], pos[2], 1,
      ]);
      coinRim.identity().scale(1, 1, .1);
      coinHeads.identity().move(0, 0, .09).scale(.9, .9, .02);
      coinTails.identity().move(0, 0, -.09).scale(.9, .9, .02);
      if (d.done && d.face === 20) coinHeads.color(1, .92, .45);
      else coinHeads.color(.96, .78, .28);
   };

   g.poseUI = () => {
      const { S, ui, cards } = g;
      if (!g.net.canPlay()) {
         Object.values(ui).forEach(panel => panel.hide());
         g.handWep.root.identity().scale(0);
         return;
      }
      const e = eyeOf();
      const hoverHit = g.pick('right') || g.pick('left');
      S.uiHover = hoverHit && hoverHit.kind === 'ui' ? hoverHit.cell.id : null;
      const hover = S.uiHover;
      if (S.mode === 'god') {
         ui.god.show(); ui.tiles.hide();
         ui.god.pose(S.selected, hover);
         ui.hud.hide(); ui.pack.hide(); ui.fight.hide();
         if (S.chestId) {
            const piece = S.pieces.find(x => x.id === S.chestId);
            ui.chest.show();
            const pos = cg.mTransform(g.stage.getMatrix(), [0, 0.2, HALF + 0.22]);
            ui.chest.place(pos, e);
            ui.chest.pose((piece && piece.loot) || [], hover);
            ui.inspect.hide();
         } else {
            ui.chest.hide();
            if (S.focus) {
               ui.inspect.show();
               const pos = cg.mTransform(g.stage.getMatrix(), [HALF + 0.22, 0.2, 0.02]);
               ui.inspect.place(pos, e);
               ui.inspect.pose(g.inspectView(), hover);
            } else ui.inspect.hide();
         }
      } else if (S.mode === 'tile') {
         ui.tiles.show(); ui.god.hide(); ui.chest.hide();
         ui.tiles.pose(S.groundSel, hover);
         ui.hud.hide(); ui.pack.hide(); ui.inspect.hide(); ui.fight.hide();
      } else {
         ui.god.hide(); ui.tiles.hide(); ui.chest.hide();
         g.layoutDock();
         if (S.focus && S.focus.kind === 'piece') {
            const p = S.pieces.find(x => x.id === S.focus.id);
            if (!p || !g.nearHero(p.c, p.r)) g.closeFocus();
         }
         if (S.focus && S.focus.kind === 'item' && !S.pack[S.focus.index]) g.closeFocus();
         ui.hud.show();
         ui.hud.place(cards.hud.pos, e, .55, cards.hud.face);
         if (S.combat) {
            ui.pack.hide();
            ui.inspect.hide();
            ui.fight.show();
            ui.fight.place(cards.fight.pos, e, cards.fight.face);
            ui.fight.pose(g.battleView(), hover);
         } else {
            ui.fight.hide();
            if (S.packOpen) {
               ui.pack.show();
               ui.pack.place(cards.pack.pos, e, cards.pack.face);
               ui.pack.pose(S.pack, S.equipped, hover);
            } else ui.pack.hide();
            if (S.focus) {
               ui.inspect.show();
               ui.inspect.place(cards.inspect.pos, e, cards.inspect.face);
               ui.inspect.pose(g.inspectView(), hover);
            } else ui.inspect.hide();
         }
      }
      ui.hud.update();
      g.poseHandWeapon();
   };

   g.billboardAt = (node, pos, eye, s) => {
      const Z = cg.normalize(cg.subtract(eye, pos));
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

   g.poseHandWeapon = () => {
      const { S, handWep } = g;
      if (S.mode !== 'adv') {
         handWep.root.identity().scale(0);
         return;
      }
      const it = S.pack.find(p => p.uid === S.equipped);
      const spr = it && it.type === 'weapon' ? itemSprite(it) : null;
      const m = controllerMatrix.right;
      if (!spr || !m || m.length < 16 || !isFinite(m[12]) || !clay.inverseRootMatrix) {
         handWep.root.identity().scale(0);
         return;
      }
      const M = cg.mMultiply(clay.inverseRootMatrix, m);
      const pos = cg.mTransform(M, [0, 0.03, -0.06]);
      showItemIcon(handWep, spr, 0, 0, 0.038, true);
      g.billboardAt(handWep.root, pos, eyeOf(), 1);
   };
};

export const init = async model => {
   bindArt(model);
   const S = {
      mode: 'god',
      turn: 1,
      mp: MP_MAX,
      night: false,
      hero: startHero(),
      players: startPlayers(),
      playerSlot: null,
      stats: startScores(),
      pack: startPack(),
      equipped: 1,
      nextUid: 3,
      pieces: [],
      nextPid: 1,
      drag: null,
      chestId: 0,
      packOpen: false,
      focus: null,
      combat: null,
      roll: null,
      log: '',
      selected: 'chest',
      groundSel: 'grass',
      paintNote: '',
      ground: Array.from({ length: N }, () => Array(N).fill('stone')),
      hover: null,
      joyAt: 0,
      uiHover: null,
      justFled: 0,
   };

   const stage = model.add();
   const tiles = [];
   const glows = [];
   for (let r = 0; r < N; r++) {
      tiles[r] = [];
      glows[r] = [];
      for (let c = 0; c < N; c++) {
         tiles[r][c] = makeGround(stage, 'stone');
         glows[r][c] = stage.add('cube').color(1, .82, .25).opacity(.5);
      }
   }
   const hoverRing = stage.add('cube').color(1.2, .9, .25).opacity(.55);
   const stampTile = makeGround(stage, 'grass');

   const tableControls = stage.add();
   const icons = {};
   KINDS.forEach(kind => {
      icons[kind] = makeToken(stage, kind);
   });
   const pawns = [makePawn(stage), makePawn(stage)];
   const avatar = pawns[0];
   const handWep = makeItemIcon(model);

   const tokens = new Map();
   const coinRoot = model.add();
   const coinRim = coinRoot.add('tubeZ').color(.62, .46, .16).dull();
   const coinHeads = coinRoot.add('tubeZ').color(.96, .78, .28).dull();
   const coinTails = coinRoot.add('tubeZ').color(.38, .28, .16).dull();

   const g = {
      model, S, stage, tableControls, tiles, glows, hoverRing, stampTile,
      icons, avatar, pawns, handWep, tokens,
      coinRoot, coinRim, coinHeads, coinTails,
      was: { left1: false, right1: false, left4: false, right4: false },
      advAnchor: [0, 0, 0],
      godAnchor: null,
      dock: null,
      cards: { hud: null, pack: null, inspect: null, fight: null },
      ui: null,
   };

   installWorld(g);
   installSheets(g);
   installDock(g);
   installPicking(g);
   installTable(g);
   installAdventure(g);
   installCombat(g);
   installPose(g);
   g.active = here;
   g.localHead = headMat;
   g.assignRole = role => {
      if (S.playerSlot != null) g.avatar = pawns[S.playerSlot];
      S.drag = null;
      S.combat = null;
      S.roll = null;
      if (role === 'pawn') g.enterAdv(true);
      else if (role === 'god') g.enterGod();
      else {
         S.mode = 'spectator';
         S.packOpen = false;
         S.chestId = 0;
         g.closeFocus();
         Object.values(g.ui).forEach(panel => panel.hide());
         g.say('Two players are already playing. Spectating.');
      }
   };

   const hooks = {
      selectKind: kind => { S.selected = kind; S.log = KIND[kind].label + '.'; },
      selectedKind: () => S.selected,
      selectGround: id => { S.groundSel = id; S.paintNote = ''; S.log = GROUND[id].label + '.'; },
      selectedGround: () => S.groundSel,
      enterAdv: () => g.enterAdv(),
      enterGod: () => g.enterGod(),
      enterTiles: () => g.enterTiles(),
      fillGround: () => g.fillGround(),
      clear: () => g.clearBoard(),
      addLoot: i => g.addLoot(i),
      removeLoot: i => g.removeLoot(i),
      closeChest: () => g.closeChest(),
      chestLoot: () => {
         const p = S.pieces.find(x => x.id === S.chestId);
         return (p && p.loot) || [];
      },
      togglePack: () => {
         S.packOpen = !S.packOpen;
         if (S.packOpen) { g.layoutDock(); g.ui.pack.show(); }
         else g.ui.pack.hide();
      },
      endTurn: () => g.endTurn(),
      interact: () => g.tryInteract(),
      hero: () => S.hero,
      scores: () => S.stats,
      weapon: () => weaponOf(S.pack, S.equipped),
      night: () => S.night,
      turn: () => S.turn,
      mp: () => S.mp,
      log: () => S.log,
      packItems: () => S.pack,
      equipped: () => S.equipped,
      useSlot: i => g.useSlot(i),
      combat: () => S.combat,
      roll: () => S.roll,
      attack: () => g.combatAttack(),
      flee: () => g.combatFlee(),
      useHerb: () => g.useHerb(),
      reroll: () => g.rerollFail(),
      confirmRoll: () => g.confirmRoll(),
   };
   g.ui = createUI(model, tableControls, hooks);
   installMultiplayer(g);
   installAvatars(g, { tileX, tileZ });

   inputEvents.onPress = hand => {
      if (!here() || !g.net.canPlay()) return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'ui') { g.grab(hand); return; }
      if (hit && hit.kind === 'card' && S.mode === 'adv') { g.grabCard(hit.id, hand); return; }
      if (S.mode === 'god' || S.mode === 'tile') g.grab(hand);
      else if (S.mode === 'adv' && !S.combat) {
         if (hit && hit.kind === 'piece') g.inspectPiece(hit.piece);
         else if (hit && hit.kind === 'tile') {
            const p = g.pieceAt(hit.c, hit.r);
            if (p && KIND[p.kind] && KIND[p.kind].interact) g.inspectPiece(p);
            else g.stepTo(hit.c, hit.r);
         }
      }
   };
   inputEvents.onDrag = hand => {
      if (!here() || !g.net.canPlay()) return;
      if (S.drag && S.drag.kind === 'card' && S.drag.hand === hand) {
         g.moveCard(hand);
         return;
      }
      if (S.mode === 'tile' && S.drag && S.drag.hand === hand && S.drag.kind === 'paint') {
         g.strokePaint(hand);
         return;
      }
      if (!S.drag || S.drag.hand !== hand) return;
      const aim = g.hoverTile(hand);
      if (aim && S.drag.start && S.drag.start.c != null && (aim.c !== S.drag.start.c || aim.r !== S.drag.start.r)) S.drag.moved = true;
      const hp = handPos(hand);
      if (hp && S.drag.from && cg.distance(hp, S.drag.from) > 0.02) S.drag.moved = true;
   };
   inputEvents.onRelease = hand => {
      if (!here() || !g.net.canPlay()) return;
      g.drop(hand);
   };
   inputEvents.onClick = hand => {
      if (!here() || !g.net.canPlay() || S.mode !== 'god') return;
      const hit = g.pick(hand);
      if (hit && hit.kind === 'piece' && hit.piece.kind === 'chest') g.openChestWidget(hit.piece);
   };

   g.ui.god.hide();

   model.animate(() => {
      g.net.begin();
      if (!here()) return;
      if (!g.net.ready()) {
         stage.identity().scale(0);
         coinRoot.identity().scale(0);
         handWep.root.identity().scale(0);
         Object.values(g.ui).forEach(panel => panel.hide());
         return;
      }
      if (g.net.canPlay()) {
         if (keyEdge('tab') || keyEdge('g')) {
            if (S.mode === 'god') g.enterAdv();
            else g.enterGod();
         }
         if (keyEdge('t') && g.net.role() === 'god') {
            if (S.mode === 'tile') g.enterGod(); else g.enterTiles();
         }
         if (keyEdge('b') && S.mode === 'adv') hooks.togglePack();
         if (keyEdge('n') || keyEdge('enter')) g.endTurn();
         if (keyEdge('e') || keyEdge(' ')) g.tryInteract();
         if (keyEdge('a') && S.mode === 'god') g.godInspect();
         KINDS.forEach((kind, i) => { if (keyEdge(String(i + 1))) S.selected = kind; });
         if (rise(g.was, 'left', 4, 'left4')) {
            if (S.mode === 'adv') g.enterGod();
            else if (S.mode === 'god' || S.mode === 'tile') g.enterAdv();
         }
         if (rise(g.was, 'right', 4, 'right4')) {
            if (S.mode === 'adv') g.tryInteract();
            else if (S.mode === 'god') g.godInspect();
         }
         if (rise(g.was, 'left', 1, 'left1') && S.mode === 'adv') hooks.togglePack();
         if (rise(g.was, 'right', 1, 'right1') && S.mode === 'god') {
            const hit = g.pick('right');
            if (hit && hit.kind === 'piece') g.withPiece(hit.piece, piece => {
               g.removePiece(piece); g.say('Removed.'); g.net.release('piece:' + piece.id);
            });
         }
         if (S.mode === 'tile') {
            if (pressed('left', 1)) g.strokePaint('left');
            if (pressed('right', 1)) g.strokePaint('right');
         }
         g.pollMove();
         g.updateRoll();
      }
      g.poseStage();
      g.poseBoard();
      g.poseShelf();
      g.posePieces();
      g.poseCoin();
      g.poseUI();
      g.posePlayers();
      g.net.end();
   });
};
