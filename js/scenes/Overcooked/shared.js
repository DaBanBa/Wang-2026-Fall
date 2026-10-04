// sharables
// aka constants that are used in multiple files

export const VERSION  = 2;
export const ROUND_MS = 240000; 
export const COUNT_MS = 5000; 
export const OVER_MS  = 12000;    
export const ORDER_MS = 60000;
export const ORDER_GAP = 15000;
export const ORDER_TOTAL = 20;
export const MAX_ORDERS = 5;
export const HEARTS = 3;
export const MAX_ITEMS  = 28;
export const CHOPS_NEEDED = 4;
export const GRAB_RADIUS  = 0.22;

export const ROOM = { x: 2.5, z: 3.0, h: 3.0 };
export const COUNTER_TOP = 1.0;
export const TOP = 0.9;
export const DECK = TOP * (0.42 / 0.45);

export const SIDES = {
   A: { name: 'P1', role: 'PANTRY', spawn: [0, 0, 1.6], yaw: 0,       x: [-2.2, 2.2], z: [ 0.75, 2.5], rgb: [1, .55, .15], glove: [1, .9, .7] },
   B: { name: 'P2', role: 'ORDERS', spawn: [0, 0, -1.6], yaw: Math.PI, x: [-2.2, 2.2], z: [-2.5, -.75], rgb: [.15, .7, .75], glove: [.85, .95, 1] },
};

export const KINDS = {
   flour    : { hy: .093, name: 'FLOUR' },
   water    : { hy: .071, name: 'WATER' },
   dough    : { hy: .047, name: 'DOUGH' },
   bun      : { hy: .044, name: 'BUN' },
   cheese   : { hy: .040, name: 'CHEESE' },
   cheese_s : { hy: .011, name: 'CHEESE SLICE' },
   beef     : { hy: .045, name: 'RAW BEEF' },
   patty    : { hy: .016, name: 'PATTY' },
   tomato   : { hy: .072, name: 'TOMATO' },
   tomato_s : { hy: .011, name: 'TOMATO SLICE' },
   lettuce  : { hy: .074, name: 'LETTUCE' },
   lettuce_s: { hy: .025, name: 'CHOPPED LETTUCE' },
   plate    : { hy: .014, name: 'PLATE' },
};

export const CHOP = { cheese: 'cheese_s', tomato: 'tomato_s', lettuce: 'lettuce_s' };
export const TOPPINGS = ['bun', 'patty', 'cheese_s', 'tomato_s', 'lettuce_s'];

const key = parts => parts.slice().sort().join(',');

export const RECIPES = {
   cheese: { name: 'CHEESEBURGER',   parts: ['bun', 'patty', 'cheese_s'] },
   veggie: { name: 'TOMATO LETTUCE', parts: ['bun', 'patty', 'tomato_s', 'lettuce_s'] },
   deluxe: { name: 'DELUXE',         parts: ['bun', 'patty', 'cheese_s', 'tomato_s', 'lettuce_s'] },
};
for (let r in RECIPES) RECIPES[r].key = key(RECIPES[r].parts);
const ORDER_WEIGHTS = [['cheese', .4], ['veggie', .4], ['deluxe', .2]];

export const SOLIDS = [
   { x:  0,   z:  0,    sx: 2.5, sz: .4,  top: COUNTER_TOP },
   { x:  0,   z:  2.7,  sx: 2.5, sz: .3,  top: DECK },
   { x:  2.2, z:  1.35, sx: .28, sz: .45, top: TOP },
   { x:  0,   z: -2.7,  sx: 2.5, sz: .3,  top: DECK },
   { x: -2.2, z: -1.45, sx: .28, sz: .75, top: TOP },
];

export const STATIONS = {
   flour  : { side: 'B', type: 'dispenser', spawn: 'flour',   p: [-2.2, TOP, -1.9], yaw: Math.PI / 2, label: 'FLOUR' },
   water  : { side: 'A', type: 'dispenser', spawn: 'water',   p: [-1.0417, DECK,  2.7], yaw: Math.PI, label: 'WATER' },
   mixer  : { side: 'A', type: 'mixer',  p: [ 0.0, DECK,  2.7], yaw: Math.PI, label: 'MIXER', time: 5,
              slots: [[-.09, .3, 0], [.09, .3, 0], [0, .33, 0]] },
   pan    : { side: 'A', type: 'cook',   p: [ 1.1, DECK,  2.7], yaw: Math.PI, label: 'PAN', time: 7, from: 'beef', to: 'patty',
              slots: [[0, .17, 0]] },
   cheese : { side: 'A', type: 'dispenser', spawn: 'cheese',  p: [ 2.2, TOP,  1.58], yaw: -Math.PI / 2, label: 'CHEESE' },
   beef   : { side: 'B', type: 'dispenser', spawn: 'beef',    p: [-2.2, TOP, -1.45], yaw: Math.PI / 2, label: 'BEEF' },
   tomato : { side: 'B', type: 'dispenser', spawn: 'tomato',  p: [-2.2, TOP, -1.0], yaw: Math.PI / 2, label: 'TOMATO' },
   lettuce: { side: 'A', type: 'dispenser', spawn: 'lettuce', p: [ 2.2, TOP,  1.12], yaw: -Math.PI / 2, label: 'LETTUCE' },
   oven   : { side: 'B', type: 'cook',   p: [-1.6, DECK, -2.7], yaw: 0, label: 'OVEN', time: 7, from: 'dough', to: 'bun',
              slots: [[0, .17, .06]] },
   board  : { side: 'B', type: 'board',  p: [-0.5, DECK, -2.7], yaw: 0, label: 'CUTTING BOARD',
              slots: [[0, .1, 0]] },
   serve  : { side: 'B', type: 'serve',  p: [ 0.8, DECK, -2.7], yaw: 0, label: 'ORDER UP', sx: .5, sz: .3 },
   plates : { side: 'B', type: 'dispenser', spawn: 'plate',   p: [ 2.0, DECK, -2.7], yaw: 0, label: 'PLATES' },
   trashB : { side: 'B', type: 'trash',  p: [ 2.2, 0, -0.95], yaw: -Math.PI / 2, label: 'TRASH' },
};

for (let sid in STATIONS) {
   let st = STATIONS[sid];
   if (st.type === 'dispenser' && st.spawn !== 'water' && st.spawn !== 'plate')
      SOLIDS.push({ x: st.p[0], z: st.p[2], sx: .22, sz: .22, top: TOP + .28 });
   if (sid === 'oven')  SOLIDS.push({ x: st.p[0], z: st.p[2], sx: .3,  sz: .24, top: DECK + .48 });
   if (sid === 'pan')   SOLIDS.push({ x: st.p[0], z: st.p[2], sx: .17, sz: .17, top: DECK + .15 });
   if (sid === 'mixer') SOLIDS.push({ x: st.p[0], z: st.p[2], sx: .2,  sz: .2,  top: DECK + .26 });
   if (sid === 'board') SOLIDS.push({ x: st.p[0], z: st.p[2], sx: .22, sz: .16, top: DECK + .04 });
}

const rotY = (v, yaw) => {
   let c = Math.cos(yaw), s = Math.sin(yaw);
   return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]];
};

export const slotPos = (st, i) => {
   let o = rotY(st.slots[i], st.yaw || 0);
   return [st.p[0] + o[0], st.p[1] + o[1], st.p[2] + o[2]];
};

export const accepts = (st, it) => {
   if (st.type === 'mixer') return it.k === 'flour' ? 0 : it.k === 'water' ? 1 : -1;
   if (st.type === 'cook')  return it.k === st.from ? 0 : -1;
   if (st.type === 'board') return CHOP[it.k] ? 0 : -1;
   return -1;
};

export const itemAt = (s, sid, slot) => {
   for (let id in s.items) {
      let it = s.items[id];
      if (it.s === sid && it.slot === slot) return it;
   }
   return null;
};

export const fresh = now => ({
   v: VERSION, t: now, epoch: now,
   phase: 'lobby', phaseAt: now, endsAt: 0,
   sides: { A: null, B: null },
   items: {}, orders: [], nextOrderAt: 0, spawned: 0, seq: 1, mixProg: 0,
   score: 0, served: 0, failed: 0, hearts: HEARTS, lost: 0, toast: null,
});

export const valid = s => !!(s && s.v === VERSION && s.items && s.sides && s.orders);

const resetRound = s => {
   s.items = {};
   s.orders = [];
   s.score = 0;
   s.served = 0;
   s.failed = 0;
   s.spawned = 0;
   s.hearts = HEARTS;
   s.lost = 0;
   s.toast = null;
   s.mixProg = 0;
};

const newItem = (k, p) => ({
   k, p: p.slice(), v: [0, 0, 0], h: null, s: null, slot: -1, r: 0, prog: 0, chops: 0,
   stack: k === 'plate' ? [] : undefined,
});

export const toast = (s, now, text, good) => {
   s.toast = { text, at: now, good: good ? 1 : 0, n: (s.toast ? s.toast.n : 0) + 1 };
};

export const countItems = s => Object.keys(s.items).length;

export const applyMsg = (s, m, from, now, isMaster) => {
   if (!valid(s) || !m) return;
   if (m.op !== 'join' && s.phase !== 'play') return;
   switch (m.op) {
   case 'join': {
      if (!isMaster || s.phase !== 'lobby') return;
      if (m.side !== 'A' && m.side !== 'B') return;
      let other = m.side === 'A' ? 'B' : 'A';
      if (s.sides[m.side] === from) return;
      if (s.sides[m.side] != null) return;
      if (s.sides[other] === from) s.sides[other] = null;
      s.sides[m.side] = from;
      return;
   }
   case 'spawn': {
      if (!m.id || s.items[m.id] || !KINDS[m.k]) return;
      if (countItems(s) >= MAX_ITEMS) {
         if (isMaster) toast(s, now, 'TOO MUCH STUFF. USE THE TRASH.', false);
         return;
      }
      let it = newItem(m.k, m.p || [0, 1, 0]);
      it.h = { id: from, hand: m.hand };
      s.items[m.id] = it;
      return;
   }
   case 'grab': {
      let it = s.items[m.id];
      if (!it || it.h) return;
      it.h = { id: from, hand: m.hand };
      it.s = null;
      it.slot = -1;
      it.r = 0;
      it.v = [0, 0, 0];
      return;
   }
   case 'release': {
      let it = s.items[m.id];
      if (!it || !it.h || it.h.id !== from) return;
      it.h = null;
      it.p = m.p.slice();
      it.v = (m.v || [0, 0, 0]).slice();
      it.r = 0;
      return;
   }
   case 'chop': {
      let it = itemAt(s, 'board', 0);
      if (!it || !CHOP[it.k]) return;
      it.chops = (it.chops || 0) + 1;
      if (it.chops >= CHOPS_NEEDED) {
         it.k = CHOP[it.k];
         it.chops = 0;
      }
      return;
   }
   }
};

export const stepItems = (s, dt) => {
   if (!valid(s)) return;
   for (let id in s.items) {
      let it = s.items[id];
      if (it.h || it.s || it.r) continue;
      let hy = (KINDS[it.k] || KINDS.dough).hy, rad = .07;
      it.v[1] -= 9.8 * dt;
      let np = [it.p[0] + it.v[0] * dt, it.p[1] + it.v[1] * dt, it.p[2] + it.v[2] * dt];
      let landed = false;
      for (let a of [0, 2]) {
         let lim = (a == 0 ? ROOM.x : ROOM.z) - rad;
         if (np[a] >  lim) { np[a] =  lim; it.v[a] *= -.3; }
         if (np[a] < -lim) { np[a] = -lim; it.v[a] *= -.3; }
      }
      for (let b of SOLIDS) {
         let ex = b.sx + rad * .5, ez = b.sz + rad * .5;
         if (Math.abs(np[0] - b.x) >= ex || Math.abs(np[2] - b.z) >= ez) continue;
         if (np[1] - hy >= b.top) continue;
         if (it.p[1] - hy >= b.top - .02 && it.v[1] <= 0) {
            np[1] = b.top + hy;
            it.v[1] = 0;
            it.v[0] *= .5;
            it.v[2] *= .5;
            landed = true;
         } else {
            let px = ex - Math.abs(np[0] - b.x), pz = ez - Math.abs(np[2] - b.z);
            if (px < pz) { np[0] = b.x + (np[0] >= b.x ? 1 : -1) * ex; it.v[0] *= -.3; }
            else         { np[2] = b.z + (np[2] >= b.z ? 1 : -1) * ez; it.v[2] *= -.3; }
         }
      }
      if (np[1] - hy < 0) {
         np[1] = hy;
         it.v[1] = it.v[1] < -1 ? -it.v[1] * .2 : 0;
         it.v[0] *= .6;
         it.v[2] *= .6;
         landed = true;
      }
      for (let i = 0; i < 3; i++) {
         it.p[i] = Math.round(np[i] * 10000) / 10000;
         it.v[i] = Math.round(it.v[i] * 1000) / 1000;
      }
      if (landed && Math.hypot(it.v[0], it.v[2]) < .12 && Math.abs(it.v[1]) < .3) {
         it.v = [0, 0, 0];
         it.r = 1;
      }
   }
};

const pickRecipe = () => {
   let t = Math.random(), acc = 0;
   for (let [r, w] of ORDER_WEIGHTS) {
      acc += w;
      if (t < acc) return r;
   }
   return 'cheese';
};

const oldest = s => {
   let best = null;
   for (let o of s.orders) if (!best || o.at < best.at) best = o;
   return best;
};

const loseHeart = (s, now, text) => {
   s.failed++;
   s.hearts = Math.max(0, (s.hearts || 0) - 1);
   toast(s, now, text, false);
   if (s.hearts <= 0) {
      s.lost = 1;
      s.phase = 'over';
      s.phaseAt = now;
   }
};

const serve = (s, it, id, now) => {
   let bounce = text => {
      it.v = [0, 2.2, 2.6];
      it.r = 0;
      it.p[2] = STATIONS.serve.p[2] + .45;
      toast(s, now, text, false);
   };
   if (s.phase !== 'play') return bounce('NO ORDERS YET');
   if (!it.stack || !it.stack.length) return bounce('EMPTY PLATE!');
   let o = oldest(s);
   if (!o) return bounce('NO ORDERS YET');
   if (RECIPES[o.r].key !== key(it.stack)) {
      s.orders = s.orders.filter(x => x.id !== o.id);
      delete s.items[id];
      loseHeart(s, now, 'WRONG ORDER');
      return;
   }
   let left = Math.max(0, o.at + o.dur - now);
   let bonus = Math.round(50 * left / o.dur);
   s.score += 100 + bonus;
   s.served++;
   s.orders = s.orders.filter(x => x.id !== o.id);
   delete s.items[id];
   toast(s, now, 'ORDER UP! +' + (100 + bonus), true);
};

const capture = (s, it, id, now) => {
   let p = it.p;
   for (let sid in STATIONS) {
      let st = STATIONS[sid];
      let dx = Math.abs(p[0] - st.p[0]), dz = Math.abs(p[2] - st.p[2]);
      if (st.type === 'trash') {
         if (dx < .42 && dz < .42 && p[1] < 1.35) { delete s.items[id]; return; }
         continue;
      }
      if (st.type === 'serve') {
         if (it.k === 'plate' && dx < st.sx && dz < st.sz && p[1] > DECK - .1 && p[1] < DECK + .7) { serve(s, it, id, now); return; }
         continue;
      }
      if (!st.slots) continue;
      if (dx > .24 || dz > .24 || p[1] < DECK - .08 || p[1] > DECK + .6) continue;
      let slot = accepts(st, it);
      if (slot < 0 || itemAt(s, sid, slot)) continue;
      it.s = sid;
      it.slot = slot;
      it.r = 1;
      it.v = [0, 0, 0];
      it.p = slotPos(st, slot);
      it.prog = 0;
      return;
   }
   if (TOPPINGS.indexOf(it.k) < 0) return;
   for (let pid in s.items) {
      let pl = s.items[pid];
      if (pl.k !== 'plate' || pl.h || pid === id) continue;
      if (Math.hypot(p[0] - pl.p[0], p[2] - pl.p[2]) > .17) continue;
      if (p[1] < pl.p[1] - .06 || p[1] > pl.p[1] + .4) continue;
      if (pl.stack.indexOf(it.k) >= 0) continue;
      pl.stack.push(it.k);
      delete s.items[id];
      return;
   }
};

const tickStations = (s, dt) => {
   let flour = itemAt(s, 'mixer', 0), water = itemAt(s, 'mixer', 1), out = itemAt(s, 'mixer', 2);
   if (flour && water && !out) {
      s.mixProg = Math.min(1, (s.mixProg || 0) + dt / STATIONS.mixer.time);
      if (s.mixProg >= 1) {
         for (let id in s.items) if (s.items[id] === flour || s.items[id] === water) delete s.items[id];
         let dough = newItem('dough', slotPos(STATIONS.mixer, 2));
         dough.s = 'mixer';
         dough.slot = 2;
         dough.r = 1;
         s.items['m' + (s.seq++)] = dough;
         s.mixProg = 0;
      }
   } else s.mixProg = 0;
   for (let sid of ['oven', 'pan']) {
      let st = STATIONS[sid], it = itemAt(s, sid, 0);
      if (!it || it.k !== st.from) continue;
      it.prog = Math.min(1, (it.prog || 0) + dt / st.time);
      if (it.prog >= 1) {
         it.k = st.to;
         it.prog = 0;
      }
   }
};

const tickOrders = (s, now) => {
   if (s.phase !== 'play') return;
   for (let i = s.orders.length - 1; i >= 0; i--)
      if (now > s.orders[i].at + s.orders[i].dur) {
         s.orders.splice(i, 1);
         loseHeart(s, now, 'ORDER LOST');
         if (s.phase !== 'play') return;
      }
   if ((s.spawned || 0) < ORDER_TOTAL && s.orders.length < MAX_ORDERS && now >= s.nextOrderAt) {
      s.orders.push({ id: s.seq++, r: pickRecipe(), at: now, dur: ORDER_MS });
      s.spawned = (s.spawned || 0) + 1;
      s.nextOrderAt = now + Math.random() * ORDER_GAP;
   }
   if (s.phase === 'play' && s.spawned >= ORDER_TOTAL && s.orders.length === 0 && s.hearts > 0) {
      s.lost = 0;
      s.phase = 'over';
      s.phaseAt = now;
   }
};

export const masterTick = (s, dt, now, clients) => {
   if (!valid(s)) return;
   for (let side in s.sides)
      if (s.sides[side] != null && clients.indexOf(s.sides[side]) < 0) s.sides[side] = null;
   for (let id in s.items) {
      let it = s.items[id];
      if (it.h && clients.indexOf(it.h.id) < 0) { it.h = null; it.r = 0; }
   }
   let players = (s.sides.A != null ? 1 : 0) + (s.sides.B != null ? 1 : 0);

   if (s.phase === 'lobby') {
      if (players === 2) { s.phase = 'count'; s.phaseAt = now; }
   } else if (s.phase === 'count') {
      if (players < 2) { s.phase = 'lobby'; s.phaseAt = now; }
      else if (now - s.phaseAt >= COUNT_MS) {
         s.phase = 'play';
         s.phaseAt = now;
         s.endsAt = now + ROUND_MS;
         s.hearts = HEARTS;
         s.lost = 0;
         s.spawned = 0;
         s.nextOrderAt = now;
      }
   } else if (s.phase === 'over') {
      if (now - s.phaseAt >= OVER_MS) {
         resetRound(s);
         s.phase = players === 2 ? 'count' : 'lobby';
         s.phaseAt = now;
      }
   }

   tickStations(s, dt);
   for (let id in s.items) {
      let it = s.items[id];
      if (!it || it.h || it.s) continue;
      capture(s, it, id, now);
   }
   tickOrders(s, now);
   s.t = now;
};

export const decide = (s, hp) => {
   if (!valid(s)) return null;
   let b = STATIONS.board;
   if (Math.hypot(hp[0] - b.p[0], hp[2] - b.p[2]) < .34 && hp[1] > DECK - .1 && hp[1] < DECK + .55) {
      let it = itemAt(s, 'board', 0);
      if (it && CHOP[it.k]) return { op: 'chop' };
   }
   let best = null, bd = GRAB_RADIUS;
   for (let id in s.items) {
      let it = s.items[id];
      if (it.h) continue;
      let d = Math.hypot(hp[0] - it.p[0], hp[1] - it.p[1], hp[2] - it.p[2]);
      if (d < bd) { bd = d; best = id; }
   }
   if (best) return { op: 'grab', id: best };
   for (let sid in STATIONS) {
      let st = STATIONS[sid];
      if (st.type !== 'dispenser') continue;
      if (Math.abs(hp[0] - st.p[0]) < .3 && Math.abs(hp[2] - st.p[2]) < .3 && hp[1] > st.p[1] - .2 && hp[1] < st.p[1] + .6)
         return { op: 'spawn', k: st.spawn, from: sid };
   }
   return null;
};

export const timeLeft = (s, now) => s.phase === 'play' ? Math.max(0, s.endsAt - now) : s.phase === 'count' ? ROUND_MS : 0;

export const fmt = ms => {
   let t = Math.max(0, Math.ceil(ms / 1000));
   let m = t / 60 | 0, sec = t % 60;
   return m + ':' + (sec < 10 ? '0' : '') + sec;
};
