#   python backend

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", "..", ".."))


def load_env(path: str):
   if not os.path.exists(path):
      return
   for line in open(path):
      line = line.strip()
      if line and not line.startswith("#") and "=" in line:
         k, v = line.split("=", 1)
         os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env(os.path.join(HERE, ".env"))
load_env(os.path.join(ROOT, ".env"))       # the same .env server/main.js reads OPENAI_API_KEY from

from brain import Brain                    # noqa: E402
from db import DB                          # noqa: E402
from faces import make_face_index          # noqa: E402
from vision import Tracker, face_crop      # noqa: E402

env = os.environ.get
DWELL_S          = float(env("ICSY_DWELL_S", 1.2))      # how long you must look at someone
LOCK_LOST_S      = float(env("ICSY_LOCK_LOST_S", 4))    # drop the lock after they leave view this long
CONV_IDLE_S      = float(env("ICSY_CONV_IDLE_S", 90))   # end a conversation after this much quiet + absence
PENDING_S        = 60                                   # speech heard before recognition still counts
ENROLL_SHOTS     = int(env("ICSY_ENROLL_SHOTS", 5))
ENROLL_TIMEOUT_S = 25
TRANSCRIPT_LINES = 8                                    # recent transcript lines sent to the headset
JARVIS_LINES     = 10                                   # recent Jarvis activity lines sent to the headset
LIVE_MIN_WORDS   = 18                                   # new words in a chunk before the profile is updated
RESEARCH_RETRY_S   = 90                                 # retry a failed / empty lookup after this long
RESEARCH_REFRESH_S = 120                                # rewrite FROM THE WEB even if we already have text
ENROLL_MIN_YAW   = 12                                   # degrees between kept enrollment angles
DATA = os.path.join(HERE, "data")


class Engine:

   def __init__(self):
      self.db = DB(os.path.join(DATA, "icsy.db"))
      self.faces = make_face_index(self.db)
      self.brain = Brain()
      self.brain.set_names([p["name"] for p in self.db.list_people()])
      self.tracker = Tracker(env("YOLO_MODEL", "yolo26n.pt"), env("YOLO_DEVICE"), conf=0.4)
      self.jobs = ThreadPoolExecutor(max_workers=4)
      self.speech = ThreadPoolExecutor(max_workers=1)   # keeps transcripts in order
      self.frame_lock = threading.Lock()
      self.lock = threading.RLock()

      self.ai = False
      self.size = (0, 0)
      self.tracks = {}            # tid → box (pixels) in the latest frame
      self.last_frame_t = 0
      self.cand = None            # {tid, p, seen}: who you are looking at, dwell progress 0..1
      self.lock_ = None           # {tid, status, pid, tries, next_try, busy, seen}
      self.track_people = {}      # tid → pid, so a tracked person is only searched once
      self.enroll = None          # {pid, tid, kept: [yaw], started, next_shot, busy}
      self.conv = None            # {pid, started, lines: [(t, text)], active}
      self.pending = []           # [(t, text)] heard while nobody was recognized
      self.researching = set()
      self.research_at = {}       # pid → last research attempt
      self.jarvis = []              # [(t, text)] Jarvis activity for the headset tab
      self.msg = None             # (text, until) overrides the status line briefly
      self._jarvis_no_key = False
      threading.Thread(target=self._idle_loop, daemon=True).start()

   def _jarvis(self, text: str):
      text = (text or "").strip()
      if not text:
         return
      now = time.time()
      with self.lock:
         self.jarvis = (self.jarvis + [(now, text)])[-JARVIS_LINES:]
      print(f"[jarvis] {text}")

   @staticmethod
   def _link_notes(links: dict | None) -> list[str]:
      if not isinstance(links, dict):
         return []
      notes = []
      if (links.get("linkedin") or "").strip():
         notes.append("found LinkedIn, merged into profile")
      if (links.get("website") or "").strip():
         notes.append("found their website")
      if (links.get("github") or "").strip():
         notes.append("found GitHub")
      return notes

   def process_frame(self, jpg: bytes) -> dict:
      frame = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
      if frame is None:
         raise ValueError("could not decode frame")
      if not self.ai:
         return self.snapshot()
      with self.frame_lock:
         tracks = self.tracker.update(frame)
      now = time.time()
      with self.lock:
         dt = min(0.5, now - self.last_frame_t) if self.last_frame_t else 0.1
         self.last_frame_t = now
         self.size = (frame.shape[1], frame.shape[0])
         self.tracks = {tid: box for tid, box, _ in tracks}
         self._select(now, dt)
         self._recognize(frame, now)
         self._enroll_step(frame, now)
         return self.snapshot()

   def _pick(self):
      W, H = self.size
      cx, cy = W / 2, H / 2
      best, best_score = None, 1e9
      for tid, (x0, y0, x1, y1) in self.tracks.items():
         mx, my = max(0.35 * (x1 - x0), 0.03 * W), max(0.35 * (y1 - y0), 0.04 * H)
         if x0 - mx <= cx <= x1 + mx and y0 - my <= cy <= y1 + my:
            score = abs((x0 + x1) / 2 - cx) / max(1, x1 - x0)
            if score < best_score:
               best, best_score = tid, score
      return best

   def _select(self, now: float, dt: float):
      tid = self._pick()
      lock = self.lock_
      if lock and lock["tid"] in self.tracks:
         lock["seen"] = now

      if tid is not None and not (lock and tid == lock["tid"]):
         if self.cand and self.cand["tid"] == tid:
            self.cand["p"] += dt / DWELL_S
         else:
            self.cand = {"tid": tid, "p": dt / DWELL_S}
         self.cand["seen"] = now
         if self.cand["p"] >= 1:
            self._lock(tid, now)
      elif self.cand:
         if tid is not None or now - self.cand["seen"] > 0.4:
            self.cand["p"] -= 2 * dt / DWELL_S
            if self.cand["p"] <= 0:
               self.cand = None

      lock = self.lock_
      if lock and now - lock["seen"] > LOCK_LOST_S and not self.enroll:
         self.lock_ = None

   def _lock(self, tid: int, now: float):
      self.cand = None
      if self.enroll:
         self._cancel_enroll()
      pid = self.track_people.get(tid)
      if pid and not self.db.get(pid):
         pid = None
      self.lock_ = {"tid": tid, "status": "matched" if pid else "searching", "pid": pid,
                    "tries": 0, "next_try": now, "busy": False, "seen": now}
      if pid:
         self._recognized(pid, now)
      elif not self.faces.ok:
         self.lock_["status"] = "offline"

   def _recognize(self, frame, now: float):
      lock = self.lock_
      if not lock or lock["busy"] or lock["status"] not in ("searching", "noface") or now < lock["next_try"]:
         return
      box = self.tracks.get(lock["tid"])
      if box is None:
         return
      crop = face_crop(frame, box)
      if crop is None:
         lock["next_try"] = now + 0.5
         return
      lock["busy"] = True
      self.jobs.submit(self._search_job, lock, crop)

   def _search_job(self, lock: dict, crop: bytes):
      try:
         r = self.faces.search(crop)
      except Exception as e:
         r = {"status": "error", "error": str(e)}
      now = time.time()
      with self.lock:
         lock["busy"] = False
         lock["tries"] += 1
         if lock is not self.lock_:
            return
         if r["status"] == "match" and self.db.get(r["person_id"]):
            lock.update(status="matched", pid=r["person_id"])
            self.track_people[lock["tid"]] = r["person_id"]
            self._recognized(r["person_id"], now)
         elif r["status"] == "unknown":
            # one more look from a slightly different angle before calling them unknown
            if lock["tries"] < 2:
               lock["next_try"] = now + 0.6
            else:
               lock["status"] = "unknown"
         elif r["status"] == "error":
            print("[faces]", r["error"])
            lock.update(status="noface", next_try=now + 2)
         else:
            lock.update(status="noface" if lock["tries"] >= 4 else "searching",
                        next_try=now + (0.6 if lock["tries"] < 4 else 1.5))

   def _recognized(self, pid: str, now: float):
      self.db.update(pid, last_seen_at=now)
      if self.conv and self.conv["pid"] != pid:
         self._finish_conv()
      if not self.conv:
         recent = [l for l in self.pending if now - l[0] < PENDING_S]
         self.conv = {"pid": pid, "started": recent[0][0] if recent else now,
                      "lines": recent, "live_at": 0}
         self.pending = []
         self._maybe_live()
      person = self.db.get(pid)
      if person and not DB.is_placeholder(person):
         self._maybe_research(pid)

   def start_enroll(self):
      lock = self.lock_
      if not lock or lock["status"] != "unknown" or self.enroll:
         return
      pid = self.db.new_person()
      self.enroll = {"pid": pid, "tid": lock["tid"], "kept": [], "started": time.time(),
                     "next_shot": 0, "busy": False}
      lock["status"] = "enrolling"

   def _cancel_enroll(self):
      e, self.enroll = self.enroll, None
      self.jobs.submit(self._delete_person, e["pid"])
      if self.lock_ and self.lock_["status"] == "enrolling":
         self.lock_["status"] = "unknown"

   def _enroll_step(self, frame, now: float):
      e = self.enroll
      if not e:
         return
      if now - e["started"] > ENROLL_TIMEOUT_S and not e["busy"]:
         if e["kept"]:
            self._finish_enroll(now)
         else:
            self._cancel_enroll()
            self.msg = ("Could not get a clear face. Get closer and press B again.", now + 4)
         return
      box = self.tracks.get(e["tid"])
      if e["busy"] or box is None or now < e["next_shot"]:
         return
      crop = face_crop(frame, box)
      if crop is None:
         return
      e["busy"] = True
      self.jobs.submit(self._enroll_job, e, crop)

   def _enroll_job(self, e: dict, crop: bytes):
      try:
         r = self.faces.index(crop, e["pid"])
      except Exception as ex:
         print("[faces] index:", ex)
         r = None
      now = time.time()
      if r and r["yaw"] is not None and any(abs(r["yaw"] - y) < ENROLL_MIN_YAW for y in e["kept"]):
         self.faces.delete([r["face_id"]])          # same angle as one we already have
         r = None
      with self.lock:
         e["busy"] = False
         e["next_shot"] = now + 0.35
         if e is not self.enroll:
            if r:
               self.faces.delete([r["face_id"]])
            return
         if r:
            d = os.path.join(DATA, "faces", e["pid"])
            os.makedirs(d, exist_ok=True)
            path = os.path.join(d, r["face_id"] + ".jpg")
            open(path, "wb").write(crop)
            self.db.add_face(r["face_id"], e["pid"], path, r["yaw"])
            e["kept"].append(r["yaw"] if r["yaw"] is not None else 0)
            if len(e["kept"]) >= ENROLL_SHOTS:
               self._finish_enroll(now)

   def _finish_enroll(self, now: float):
      e, self.enroll = self.enroll, None
      self.track_people[e["tid"]] = e["pid"]
      if self.lock_ and self.lock_["tid"] == e["tid"]:
         self.lock_.update(status="matched", pid=e["pid"])
      self._jarvis("Saved a new person. Talk and Jarvis will fill in who they are.")
      self._recognized(e["pid"], now)

   def _delete_person(self, pid: str):
      ids = self.db.delete_person(pid)
      if ids and self.faces.ok:
         self.faces.delete(ids)

   # conversation

   # Queue a mic chunk for Whisper
   def add_audio(self, data: bytes, mime: str):
      self.speech.submit(self._audio_job, data, mime)

   # Transcribe and append
   def _audio_job(self, data: bytes, mime: str):
      try:
         text = self.brain.transcribe(data, mime)
      except Exception as e:
         print("[whisper]", e)
         return
      if not text:
         return
      now = time.time()
      with self.lock:
         if self.conv:
            self.conv["lines"].append((now, text))
            self._maybe_live()
         else:
            self.pending = [l for l in self.pending if now - l[0] < PENDING_S] + [(now, text)]

   # Write name / who / how you met / remember / facts / links from Jarvis
   def _merge_model(self, pid: str, person: dict, r: dict, extra: dict | None = None) -> tuple[dict, bool]:
      fields = dict(extra or {})
      renamed = False
      new_name = (r.get("name") or "").strip()
      if new_name and new_name != person["name"] and (DB.is_placeholder(person) or not person.get("name_locked")):
         fields["name"] = new_name
         renamed = True
      if r.get("who"):
         fields["who"] = r["who"]
      if r.get("how_we_met") and not person.get("how_we_met"):
         fields["how_we_met"] = r["how_we_met"]
      if r.get("remember"):
         fields["remember"] = r["remember"]
      self.db.update(pid, **fields)
      self.db.append_learned(pid, r.get("facts") or "")
      self.db.merge_links(pid, r.get("links") or {})
      self.brain.set_names([p["name"] for p in self.db.list_people()])
      return fields, renamed

   # After enough new speech, update the profile
   def _maybe_live(self):
      c = self.conv
      if not c or not self.brain.ok or c.get("live_busy"):
         return
      chunk = [(t, text) for t, text in c["lines"] if t > c.get("live_at", 0)]
      if sum(len(text.split()) for _, text in chunk) < LIVE_MIN_WORDS:
         return
      c["live_busy"] = True
      name = (self.db.get(c["pid"]) or {}).get("name") or "them"
      self._jarvis(f"Reading what you just said with {name}...")
      self.jobs.submit(self._live_job, c, chunk)

   # Jarvis updates the profile from this chunk
   def _live_job(self, c: dict, chunk: list):
      person, r = self.db.get(c["pid"]), None
      try:
         if person and chunk:
            r = self.brain.live_profile(person, "\n".join(t for _, t in chunk),
                                        self.db.conversation_history(c["pid"]))
      except Exception as e:
         print("[live]", e)
         self._jarvis("Could not update the profile from that chunk")
      renamed = False
      if r:
         fields, renamed = self._merge_model(c["pid"], person, r)
         bits = []
         if renamed:
            bits.append(f"heard the name {fields['name']}")
         if fields.get("who"):
            bits.append("updated who they are")
         if fields.get("how_we_met"):
            bits.append("noted how you met")
         if fields.get("remember"):
            bits.append("updated something to remember")
         if r.get("facts"):
            bits.append("saved a new fact")
         bits.extend(self._link_notes(r.get("links")))
         who = fields.get("name") or person["name"]
         if bits:
            self._jarvis("; ".join(bits) + f" for {who}")
         else:
            self._jarvis(f"Nothing new to add for {who} from that chunk")
      with self.lock:
         c["live_busy"] = False
         c["live_at"] = chunk[-1][0] if chunk else c.get("live_at", 0)
         person = self.db.get(c["pid"])
         if person and not DB.is_placeholder(person) and (renamed or not (person.get("news") or "").strip()):
            self._maybe_research(c["pid"], force=renamed)
         if c is self.conv:
            self._maybe_live()

   # End a conversation after theyve been quiet + gone
   def _idle_loop(self):
      while True:
         time.sleep(5)
         pid = None
         with self.lock:
            c = self.conv
            if c:
               person = self.db.get(c["pid"]) or {}
               last_talk = c["lines"][-1][0] if c["lines"] else c["started"]
               last_seen = person.get("last_seen_at") or 0
               if self.lock_ and self.lock_["pid"] == c["pid"]:
                  last_seen = max(last_seen, self.lock_["seen"])
               if time.time() - max(last_talk, last_seen) > CONV_IDLE_S:
                  self._finish_conv()
            if self.lock_ and self.lock_.get("pid"):
               pid = self.lock_["pid"]
         if pid:
            self._maybe_research(pid)

   # Close the current conversation
   def _finish_conv(self):
      c, self.conv = self.conv, None
      if c and sum(len(t.split()) for _, t in c["lines"]) >= 8:
         name = (self.db.get(c["pid"]) or {}).get("name") or "them"
         self._jarvis(f"Wrapping up. Saving a summary of the talk with {name}...")
         self.jobs.submit(self._summarize_job, c)

   # One-line last-time summary
   def _summarize_job(self, c: dict):
      person = self.db.get(c["pid"])
      if not person or not self.brain.ok:
         return
      transcript = "\n".join(t for _, t in c["lines"])
      ended = c["lines"][-1][0]
      try:
         s = self.brain.summarize_conversation(person, transcript, self.db.conversation_history(c["pid"]))
      except Exception as e:
         print("[summary]", e)
         return
      self.db.add_conversation(c["pid"], c["started"], ended, transcript, s["summary"])
      fields, renamed = self._merge_model(c["pid"], person, s, {
         "last_conversation": s["summary"], "last_conversation_at": ended,
      })
      bits = [f"saved last-time summary for {fields.get('name', person['name'])}"]
      bits.extend(self._link_notes(s.get("links")))
      self._jarvis("; ".join(bits))
      if renamed or s.get("facts") or s.get("who"):
         self._maybe_research(c["pid"], force=renamed)

   # research

   # Queue a public lookup for facts the conversation did not already give us
   def _maybe_research(self, pid: str, force: bool = False):
      person = self.db.get(pid)
      if not person or pid in self.researching:
         return
      if DB.is_placeholder(person):
         return
      if not self.brain.ok:
         if not self._jarvis_no_key:
            self._jarvis_no_key = True
            self._jarvis("Cannot look people up - OPENAI_API_KEY missing")
         return
      now = time.time()
      has_web = bool((person.get("news") or "").strip())
      last = self.research_at.get(pid, 0)
      wait = RESEARCH_RETRY_S if not has_web else RESEARCH_REFRESH_S
      if not force and now - last < wait:
         return
      self.researching.add(pid)
      self.research_at[pid] = now
      self._jarvis(f"Looking up {person['name']} online...")
      self.jobs.submit(self._research_job, pid)

   # Web-search for NEW public facts, LinkedIn, then refresh who from what you know
   def _research_job(self, pid: str):
      try:
         person = self.db.get(pid)
         if not person:
            return
         if not DB.is_placeholder(person):
            r = self.brain.research(person)
            self.db.add_research(pid, r)
            conf = float(r.get("confidence") or 0)
            links = r.get("links") or {}
            web = (r.get("web") or "").strip()
            fields = {}
            bits = []
            if conf >= 0.4:
               if web:
                  fields["news"] = web
                  bits.append("found new public info")
               elif not (person.get("news") or "").strip():
                  bits.append("no extra public facts beyond what you already know")
               if r.get("who") and not person.get("who"):
                  fields["who"] = r["who"]
                  bits.append("wrote who they are from public info")
               before = person.get("links") or {}
               self.db.merge_links(pid, links)
               bits.extend(self._link_notes({
                  k: v for k, v in links.items()
                  if k != "other" and v and v != (before.get(k) or "")
               }))
               if not self._link_notes(links) and not (before.get("linkedin") or "").strip():
                  bits.append("no LinkedIn found")
            else:
               bits.append(f"could not confirm {person['name']} online (confidence {conf:.2f})")
            if fields:
               self.db.update(pid, **fields)
            if bits:
               self._jarvis("; ".join(bits) + f" for {person['name']}")
         person = self.db.get(pid)
         if any(person.get(k) for k in ("story", "learned", "how_we_met", "remember")):
            who = self.brain.who_they_are(person, self.db.conversation_history(pid))
            if who and who != person.get("who"):
               self.db.update(pid, who=who)
               self._jarvis(f"Rewrote who they are for {person['name']} from what you know")
      except Exception as e:
         print("[research]", e)
         self._jarvis(f"Lookup failed: {e}")
      finally:
         self.researching.discard(pid)

   # control / state

   # Headset buttons: ai, enroll, cancel, end
   def control(self, body: dict) -> dict:
      op = body.get("op")
      with self.lock:
         if op == "ai":
            self.ai = bool(body.get("on"))
            if not self.ai:
               if self.enroll:
                  self._cancel_enroll()
               self.cand = self.lock_ = None
               self.tracks = {}
               self._finish_conv()
         elif op == "enroll":
            self.start_enroll()
         elif op == "cancel":
            if self.enroll:
               self._cancel_enroll()
            else:
               self.lock_ = None
         elif op == "end":
            self._finish_conv()
         return self.snapshot()

   # One-line HUD status
   def _message(self) -> str:
      lock, e = self.lock_, self.enroll
      if not self.ai:
         return "AI mode off. Press A to start."
      if e:
         return f"Adding new person: ask them to turn their head slowly ({len(e['kept'])}/{ENROLL_SHOTS})"
      if self.cand:
         return "Hold your gaze..."
      if lock:
         return {"searching": "Recognizing...",
                 "noface": "Can't see their face clearly",
                 "unknown": "Not in your collection. B = add them (only with their consent)",
                 "offline": "Face matching unavailable (see the backend console)",
                 "matched": ""}.get(lock["status"], "")
      return "Look at someone to identify them"

   # Card payload for the headset
   def _profile(self, pid: str | None) -> dict | None:
      p = self.db.get(pid) if pid else None
      if not p:
         return None
      return {"pid": p["id"], "name": p["name"], "who": p["who"],
              "last": p["last_conversation"], "last_at": p["last_conversation_at"],
              "how": p["how_we_met"], "remember": p["remember"],
              "web": p.get("news") or "",
              "researching": pid in self.researching}

   # State blob the station relays to the Quest
   def snapshot(self) -> dict:
      with self.lock:
         W, H = self.size
         now = time.time()
         msg = self.msg[0] if self.msg and now < self.msg[1] else self._message()
         lock = self.lock_
         conv_p = self.db.get(self.conv["pid"]) if self.conv else None
         return {
            "t": now,
            "ai": self.ai,
            "frame": [W, H],
            "tracks": [[tid, round(b[0] / W, 4), round(b[1] / H, 4), round(b[2] / W, 4), round(b[3] / H, 4)]
                       for tid, b in self.tracks.items()] if W else [],
            "cand": [self.cand["tid"], round(min(1, self.cand["p"]), 3)] if self.cand else None,
            "lock": {"tid": lock["tid"], "status": lock["status"], "pid": lock["pid"],
                     "visible": lock["tid"] in self.tracks} if lock else None,
            "profile": self._profile(lock["pid"] if lock else None),
            "enroll": [len(self.enroll["kept"]), ENROLL_SHOTS] if self.enroll else None,
            "conv": {"pid": self.conv["pid"], "name": conv_p["name"] if conv_p else "",
                     "lines": len(self.conv["lines"])} if self.conv else None,
            "transcript": [[round(t), text] for t, text in
                           (self.conv["lines"] if self.conv else self.pending)[-TRANSCRIPT_LINES:]],
            "jarvis": [text for _, text in self.jarvis],
            "msg": msg,
         }

   def caps(self) -> dict:
      return {"faces": self.faces.ok, "faces_backend": self.faces.name, "faces_error": self.faces.error,
              "openai": self.brain.ok, "openai_error": self.brain.error,
              "whisper": self.brain.whisper, "yolo": self.tracker.model_name, "device": self.tracker.device}

   def edit_person(self, body: dict) -> dict:
      pid = body.get("id")
      before = self.db.get(pid)
      if not before:
         raise KeyError(pid)
      fields = {k: body[k] for k in ("name", "who", "how_we_met", "remember", "learned", "story",
                                      "last_conversation", "news") if k in body}
      if "web" in body and "news" not in fields:
         fields["news"] = body["web"]
      if "name" in fields and fields["name"] and fields["name"] != before["name"]:
         fields["name_locked"] = 1
      self.db.update(pid, **fields)
      if isinstance(body.get("links"), dict):
         self.db.merge_links(pid, body["links"])
      self.brain.set_names([p["name"] for p in self.db.list_people()])
      if "name" in fields and not DB.is_placeholder(self.db.get(pid)):
         self._maybe_research(pid, force=True)
      p = self.db.get(pid)
      return {k: p[k] for k in ("id", "name", "who", "how_we_met", "remember",
                                "n_faces") if k in p}


engine: Engine | None = None


class Handler(BaseHTTPRequestHandler):

   def log_message(self, *args):
      pass

   def _send(self, code: int, obj):
      data = json.dumps(obj).encode()
      self.send_response(code)
      self._cors()
      self.send_header("Content-Type", "application/json")
      self.send_header("Content-Length", str(len(data)))
      self.end_headers()
      self.wfile.write(data)

   def _local_origin(self):
      o = self.headers.get("Origin") or ""
      if o.startswith(("http://localhost", "http://127.0.0.1",
                       "https://localhost", "https://127.0.0.1")):
         return o
      return None

   def _cors(self):
      origin = self._local_origin()
      if origin:
         self.send_header("Access-Control-Allow-Origin", origin)
         self.send_header("Vary", "Origin")
         self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
         self.send_header("Access-Control-Allow-Headers", "Content-Type")
         self.send_header("Access-Control-Allow-Private-Network", "true")

   def _forbid_remote(self):
      origin = self.headers.get("Origin")
      if origin and not self._local_origin():
         self._send(403, {"error": "local only"})
         return True
      return False

   def _body(self) -> bytes:
      n = int(self.headers.get("Content-Length") or 0)
      return self.rfile.read(n) if n else b""

   def do_OPTIONS(self):
      self.send_response(204)
      self._cors()
      self.end_headers()

   def do_GET(self):
      try:
         if self._forbid_remote():
            return
         if self.path == "/ping":
            return self._send(200, {"ok": True, "caps": engine.caps()})
         if self.path == "/state":
            return self._send(200, engine.snapshot())
         if self.path == "/people":
            public = []
            for p in engine.db.list_people():
               public.append({k: p[k] for k in ("id", "name", "who", "how_we_met", "remember",
                                                "n_faces") if k in p})
            return self._send(200, public)
         self._send(404, {"error": "not found"})
      except Exception as e:
         traceback.print_exc()
         self._send(500, {"error": str(e)})

   def do_POST(self):
      try:
         if self._forbid_remote():
            return
         body = self._body()
         if self.path == "/frame":
            return self._send(200, engine.process_frame(body))
         if self.path == "/audio":
            engine.add_audio(body, self.headers.get("Content-Type") or "audio/webm")
            return self._send(200, {"ok": True})
         req = json.loads(body or b"{}")
         if self.path == "/control":
            return self._send(200, engine.control(req))
         if self.path == "/person":
            return self._send(200, engine.edit_person(req))
         if self.path == "/person/research":
            engine._maybe_research(req["id"], force=True)
            return self._send(200, {"ok": True})
         if self.path == "/person/delete":
            engine._delete_person(req["id"])
            return self._send(200, {"ok": True})
         self._send(404, {"error": "not found"})
      except Exception as e:
         traceback.print_exc()
         self._send(500, {"error": str(e)})


# Start Engine and listen
def main():
   global engine
   port = int(sys.argv[1]) if len(sys.argv) > 1 else int(env("ICSY_PORT", 5051))
   engine = Engine()
   caps = engine.caps()
   print(f"[icsy] YOLO {caps['yolo']} on {caps['device']} | Faces ({caps['faces_backend']}) "
         f"{'ok' if caps['faces'] else 'OFF: ' + caps['faces_error']} | OpenAI "
         f"{'ok' if caps['openai'] else 'OFF: ' + caps['openai_error']} | Whisper {caps['whisper']}")
   print(f"[icsy] listening on http://127.0.0.1:{port}")
   ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
   main()
