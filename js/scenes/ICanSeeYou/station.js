// pc side (station.html)
//
// open this on the computer that gets the quest cast, hit start capture,
// pick the cast window. it posts frames to the python backend and relays
// state / buttons / mic between the headset and that backend.

import { b64ToBlob } from './mic.js';

window.server = new Server(2024);
server.neverLoadOrSave();
server.init('icsyState', {});
server.init('icsyCtl', {});

const BACKEND = 'http://localhost:5051';
const FPS_ON = 8, FPS_OFF = 2;
const MAX_W = 1280;

// getElementById
const $ = id => document.getElementById(id);

// worker timers so chrome doesnt throttle us when this tab is in the background
const ticker = new Worker(URL.createObjectURL(new Blob([
   `onmessage = e => setTimeout(() => postMessage(e.data), e.data.ms);`], { type: 'text/javascript' })));
const waiting = {};
let tickId = 0;
ticker.onmessage = e => { const r = waiting[e.data.id]; delete waiting[e.data.id]; r && r(); };

// sleep using the worker ticker
const sleep = ms => new Promise(r => { const id = ++tickId; waiting[id] = r; ticker.postMessage({ id, ms }); });

const st = {
   fl   : +(localStorage.getItem('icsyFl') || .34),   // focal length
   lat  : +(localStorage.getItem('icsyLat') || 250),  // cast delay ms
   state: null,
   video: null,
   frames: [],
   age  : 0,
   headsetAt: 0,
};

// talk to python on :5051
const api = async (method, path, body, type = 'application/json') => {
   const res = await fetch(BACKEND + path, {
      method,
      headers: body ? { 'Content-Type': type } : undefined,
      body: body && type === 'application/json' ? JSON.stringify(body) : body,
   });
   if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
   return res.json();
};

// status line under the button
const setStatus = text => $('status').textContent = text;

// save cal (headset can tweak this too)
const setCal = (fl, lat) => {
   if (fl  !== undefined) localStorage.setItem('icsyFl',  st.fl  = Math.max(.25, Math.min(.6, +fl)));
   if (lat !== undefined) localStorage.setItem('icsyLat', st.lat = Math.max(0, Math.min(1500, Math.round(lat))));
};

// relay

// backend state → headset
const relay = (s, age) => {
   server.send('icsyState', {
      ai: s.ai, fr: s.frame, tracks: s.tracks, cand: s.cand, lock: s.lock,
      profile: s.profile && { pid: s.profile.pid, name: s.profile.name, who: s.profile.who,
                              last: s.profile.last, last_at: s.profile.last_at,
                              how: s.profile.how, remember: s.profile.remember,
                              web: s.profile.web, researching: s.profile.researching },
      enroll: s.enroll, conv: s.conv && s.conv.name, transcript: s.transcript,
      jarvis: s.jarvis, msg: s.msg,
      fl: st.fl, lat: st.lat, mic: 'headset', age: Math.round(age),
   });
   pump();
};

// headset button → /control
const control = async m => {
   try { onState(await api('POST', '/control', m), performance.now()); }
   catch (e) { console.warn('[ICanSeeYou] control failed', e); }
};

// headset messages: ping, cal, edit, audio, buttons
const onCtl = (msgs, from) => {
   if (from == window.clientID) return;
   st.headsetAt = Date.now();
   for (const i in msgs) {
      const m = msgs[i];
      if (m.op === 'ping') continue;
      if (m.op === 'cal') setCal(m.fl, m.lat);
      else if (m.op === 'edit') { api('POST', '/person', m).catch(e => console.warn('[ICanSeeYou] edit', e)); continue; }
      else if (m.op === 'audio')
         api('POST', '/audio', b64ToBlob(m.b64, m.mime), m.mime).catch(e => console.warn('[ICanSeeYou] audio', e));
      else control(m);
   }
};

// keep the clay socket moving
const pump = () => {
   server.sync('icsyState', () => {});
   server.sync('icsyCtl', onCtl);
};
// pump even while /frame is slow
(async () => { for (;;) { pump(); await sleep(100); } })();

// status + preview

// new backend snapshot
const onState = (s, t0) => {
   st.state = s;
   relay(s, performance.now() - t0);

   const relayOk = server.socket && server.socket.readyState === 1;
   const headsetOk = st.headsetAt && Date.now() - st.headsetAt < 5000;
   const fps = st.frames.filter(f => performance.now() - f < 2000).length / 2;
   if (!relayOk)       setStatus('App server restarted: reload this page.');
   else if (!st.video) setStatus('Press Start capture and pick the Quest cast window.');
   else if (!headsetOk) setStatus('Capturing. Waiting for the headset: open ICanSeeYou on the Quest (reload it if needed).');
   else if (!s.ai)     setStatus('Capturing. Headset connected. Press A on the right controller for AI mode.');
   else                setStatus(`Capturing. Headset connected. ${fps.toFixed(1)} fps, ${Math.round(st.age)} ms` +
                                 (fps < 4 || st.age > 400 ? ' (slow)' : ''));
   drawPreview(s);
   fillPerson(s);
};

const pv = $('preview').getContext('2d');
// draw the cast + boxes
const drawPreview = s => {
   if (!st.video || st.video.readyState < 2) return;
   const W = $('preview').width, H = $('preview').height;
   pv.drawImage(st.video, 0, 0, W, H);
   pv.font = 'bold 16px monospace';
   for (const [id, x0, y0, x1, y1] of s.ai ? s.tracks || [] : []) {
      const isLock = s.lock && s.lock.tid === id;
      pv.lineWidth = isLock ? 4 : 2;
      pv.strokeStyle = pv.fillStyle = isLock ? '#2f6' : '#fff';
      pv.strokeRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
      if (isLock && s.profile) pv.fillText((s.profile.name || '').toUpperCase(), x0 * W + 5, y0 * H + 20);
   }
};

// capture loop

const grab = document.createElement('canvas');
const grabCtx = grab.getContext('2d');

// jpeg one frame and POST /frame
const sendFrame = async () => {
   const v = st.video, s = Math.min(1, MAX_W / v.videoWidth);
   grab.width = v.videoWidth * s >> 0;
   grab.height = v.videoHeight * s >> 0;
   const t0 = performance.now();
   grabCtx.drawImage(v, 0, 0, grab.width, grab.height);
   const blob = await new Promise(r => grab.toBlob(r, 'image/jpeg', .8));
   return { s: await api('POST', '/frame', blob, 'image/jpeg'), t0 };
};

// post frames when capturing + AI on, otherwise poll /state
const loop = async () => {
   for (;;) {
      const start = performance.now();
      try {
         const live = st.state && st.state.ai && st.video && st.video.readyState >= 2;
         const r = live ? await sendFrame() : { s: await api('GET', '/state'), t0: start };
         if (live) {
            const t = performance.now();
            st.frames = st.frames.filter(f => t - f < 2000).concat(t);
            st.age = t - r.t0;
         }
         onState(r.s, r.t0);
      } catch (e) {
         st.state = null;
         setStatus('Backend not running: start it with js/scenes/ICanSeeYou/backend/run.sh');
         await sleep(1000);
      }
      const fps = st.state && st.state.ai ? FPS_ON : FPS_OFF;
      await sleep(Math.max(0, 1000 / fps - (performance.now() - start)));
   }
};

// pick the quest cast window
$('capture').onclick = async () => {
   try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      st.video = video;
      $('preview').height = $('preview').width * video.videoHeight / video.videoWidth >> 0;
      $('preview').hidden = false;
      $('capture').textContent = 'Change window';
      stream.getVideoTracks()[0].onended = () => {
         st.video = null;
         $('preview').hidden = true;
         $('capture').textContent = 'Start capture';
      };
   } catch (e) {
      setStatus('Capture failed: ' + e.message);
   }
};

let lastPid = null;

// true if theyre typing in the form
const editing = () => {
   const a = document.activeElement;
   return a && ['pname', 'pwho', 'pmet', 'prem'].includes(a.id);
};
// fill the form for whoever is locked (dont clobber typing)
const fillPerson = async s => {
   const pid = s.profile && s.profile.pid;
   $('person').hidden = !pid;
   if (!pid || editing()) return;
   if (pid === lastPid && $('pname').value === (s.profile.name || '')) return;
   lastPid = pid;
   $('pname').value = (s.profile.name || '').toUpperCase();
   $('pwho').value = s.profile.who || '';
   $('pmet').value = s.profile.how || '';
   $('prem').value = s.profile.remember || '';
};
// save. name change locks the name so speech cant overwrite it
$('psave').onclick = async () => {
   if (!lastPid) return;
   await api('POST', '/person', {
      id: lastPid,
      name: $('pname').value.trim().toUpperCase(),
      who: $('pwho').value.trim(),
      how_we_met: $('pmet').value.trim(),
      remember: $('prem').value.trim(),
   });
   $('psaved').textContent = 'Saved.';
   setTimeout(() => $('psaved').textContent = '', 2000);
};

loop();
