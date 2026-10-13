#   sqlite

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid

PLACEHOLDER = "NEW PERSON"

SCHEMA = """
CREATE TABLE IF NOT EXISTS people (
   id                   TEXT PRIMARY KEY,
   name                 TEXT NOT NULL,
   who                  TEXT DEFAULT '',
   news                 TEXT DEFAULT '',
   last_conversation    TEXT DEFAULT '',
   last_conversation_at REAL,
   how_we_met           TEXT DEFAULT '',
   remember             TEXT DEFAULT '',
   learned              TEXT DEFAULT '',
   story                TEXT DEFAULT '',
   links                TEXT DEFAULT '{}',
   news_updated_at      REAL,
   last_seen_at         REAL,
   name_locked          INTEGER DEFAULT 0,
   created_at           REAL,
   updated_at           REAL
);
CREATE TABLE IF NOT EXISTS faces (
   face_id    TEXT PRIMARY KEY,
   person_id  TEXT NOT NULL,
   image_path TEXT,
   yaw        REAL,
   created_at REAL,
   embedding  BLOB
);
CREATE TABLE IF NOT EXISTS conversations (
   id         INTEGER PRIMARY KEY AUTOINCREMENT,
   person_id  TEXT NOT NULL,
   started_at REAL,
   ended_at   REAL,
   transcript TEXT,
   summary    TEXT
);
CREATE TABLE IF NOT EXISTS research (
   id        INTEGER PRIMARY KEY AUTOINCREMENT,
   person_id TEXT NOT NULL,
   at        REAL,
   result    TEXT
);
"""

EDITABLE = {"name", "who", "news", "last_conversation", "last_conversation_at",
            "how_we_met", "remember", "learned", "story",
            "links", "last_seen_at", "name_locked"}
ALIASES = {"notes": "learned", "context": "story"}  # old field names still accepted on write


# People / faces / conversations / research
class DB:

   # Open (or create) the db
   def __init__(self, path: str):
      os.makedirs(os.path.dirname(path), exist_ok=True)
      self.lock = threading.Lock()
      self.conn = sqlite3.connect(path, check_same_thread=False)
      self.conn.row_factory = sqlite3.Row
      self.conn.executescript(SCHEMA)
      self._migrate()
      self.conn.commit()

   # Columns older icsy.db files are missing. notes → learned, context → story
   def _migrate(self):
      face_cols = {r[1] for r in self.conn.execute("PRAGMA table_info(faces)")}
      if "embedding" not in face_cols:
         self.conn.execute("ALTER TABLE faces ADD COLUMN embedding BLOB")
      cols = {r[1] for r in self.conn.execute("PRAGMA table_info(people)")}
      for col, copy_from in (("how_we_met", None), ("remember", None),
                             ("learned", "notes"), ("story", "context")):
         if col not in cols:
            self.conn.execute(f"ALTER TABLE people ADD COLUMN {col} TEXT DEFAULT ''")
            if copy_from and copy_from in cols:
               self.conn.execute(f"UPDATE people SET {col}={copy_from} WHERE {col}='' OR {col} IS NULL")
      if "name_locked" not in {r[1] for r in self.conn.execute("PRAGMA table_info(people)")}:
         self.conn.execute("ALTER TABLE people ADD COLUMN name_locked INTEGER DEFAULT 0")

   # sqlite row → dict
   def _row(self, r) -> dict | None:
      if r is None:
         return None
      d = dict(r)
      try:
         d["links"] = json.loads(d.get("links") or "{}")
      except ValueError:
         d["links"] = {}
      d["learned"] = d.get("learned") or d.get("notes") or ""
      d["story"] = d.get("story") or d.get("context") or ""
      d["how_we_met"] = d.get("how_we_met") or ""
      d["remember"] = d.get("remember") or ""
      d["name_locked"] = 1 if d.get("name_locked") else 0
      return d

   # people

   # New person. Nameless ones get NEW PERSON N
   def new_person(self, name: str | None = None, **fields) -> str:
      pid = "p_" + uuid.uuid4().hex[:10]
      now = time.time()
      with self.lock:
         if not name:
            n = self.conn.execute("SELECT COUNT(*) FROM people WHERE upper(name) LIKE ?",
                                  (PLACEHOLDER + "%",)).fetchone()[0]
            name = f"{PLACEHOLDER} {n + 1}"
         else:
            name = name.strip().upper()
         self.conn.execute("INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)",
                           (pid, name, now, now))
         self.conn.commit()
      if fields:
         self.update(pid, **fields)
      return pid

   # One person by id
   def get(self, pid: str) -> dict | None:
      with self.lock:
         return self._row(self.conn.execute("SELECT * FROM people WHERE id=?", (pid,)).fetchone())

   # Everyone, newest last-seen first
   def list_people(self) -> list[dict]:
      with self.lock:
         rows = self.conn.execute("SELECT * FROM people ORDER BY COALESCE(last_seen_at, created_at) DESC").fetchall()
         counts = dict(self.conn.execute("SELECT person_id, COUNT(*) FROM faces GROUP BY person_id").fetchall())
      out = []
      for r in rows:
         d = self._row(r)
         d["n_faces"] = counts.get(d["id"], 0)
         out.append(d)
      return out

   # Write editable fields
   def update(self, pid: str, **fields):
      fields = {ALIASES.get(k, k): v for k, v in fields.items()}
      fields = {k: v for k, v in fields.items() if k in EDITABLE}
      if not fields:
         return
      if "name" in fields and isinstance(fields["name"], str):
         fields["name"] = fields["name"].strip().upper()
      if "links" in fields and not isinstance(fields["links"], str):
         fields["links"] = json.dumps(fields["links"] or {})
      fields["updated_at"] = time.time()
      cols = ", ".join(f"{k}=?" for k in fields)
      with self.lock:
         self.conn.execute(f"UPDATE people SET {cols} WHERE id=?", (*fields.values(), pid))
         self.conn.commit()

   # Merge new public links without dropping existing ones
   def merge_links(self, pid: str, found: dict):
      person = self.get(pid)
      if not person or not isinstance(found, dict):
         return
      links = dict(person["links"])
      for k, v in found.items():
         if k == "other":
            others = set(links.get("other") or []) | {u for u in (v or []) if isinstance(u, str) and u}
            links["other"] = sorted(others)
         elif isinstance(v, str) and v.strip():
            links[k] = v.strip()
      self.update(pid, links=links)

   # Append a fact if we dont already have it
   def append_learned(self, pid: str, fact: str):
      person = self.get(pid)
      if not person or not fact or fact in (person["learned"] or ""):
         return
      self.update(pid, learned=(person["learned"] + "\n" if person["learned"] else "") + fact)

   # Remove a person and their rows
   def delete_person(self, pid: str) -> list[str]:
      with self.lock:
         face_ids = [r[0] for r in self.conn.execute("SELECT face_id FROM faces WHERE person_id=?", (pid,))]
         for table, col in (("faces", "person_id"), ("conversations", "person_id"),
                            ("research", "person_id"), ("people", "id")):
            self.conn.execute(f"DELETE FROM {table} WHERE {col}=?", (pid,))
         self.conn.commit()
      return face_ids

   # Still NEW PERSON N
   @staticmethod
   def is_placeholder(person: dict | None) -> bool:
      return not person or person["name"].upper().startswith(PLACEHOLDER)

   # faces / conversations / research

   # One reference face
   def add_face(self, face_id: str, pid: str, image_path: str | None, yaw: float | None,
                embedding: bytes | None = None):
      with self.lock:
         self.conn.execute(
            "INSERT INTO faces (face_id, person_id, image_path, yaw, created_at, embedding) VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(face_id) DO UPDATE SET person_id=excluded.person_id, yaw=excluded.yaw, "
            "image_path=COALESCE(excluded.image_path, image_path), embedding=COALESCE(excluded.embedding, embedding)",
            (face_id, pid, image_path, yaw, time.time(), embedding))
         self.conn.commit()

   # Delete those face rows
   def delete_faces(self, face_ids: list[str]):
      with self.lock:
         self.conn.executemany("DELETE FROM faces WHERE face_id=?", [(f,) for f in face_ids])
         self.conn.commit()

   # (count, max rowid) of stored embeddings. Rebuild the match matrix when this moves
   def faces_version(self) -> tuple:
      with self.lock:
         return tuple(self.conn.execute(
            "SELECT COUNT(*), COALESCE(MAX(rowid), 0) FROM faces WHERE embedding IS NOT NULL").fetchone())

   # Every locally indexed face embedding
   def embeddings(self) -> list[tuple[str, bytes]]:
      with self.lock:
         return [tuple(r) for r in self.conn.execute(
            "SELECT person_id, embedding FROM faces WHERE embedding IS NOT NULL")]

   # Finished conversation
   def add_conversation(self, pid: str, started: float, ended: float, transcript: str, summary: str):
      with self.lock:
         self.conn.execute("INSERT INTO conversations (person_id, started_at, ended_at, transcript, summary) "
                           "VALUES (?,?,?,?,?)", (pid, started, ended, transcript, summary))
         self.conn.commit()

   # Last n talk summaries, oldest first
   def conversation_history(self, pid: str, n: int = 10) -> list[str]:
      with self.lock:
         rows = self.conn.execute("SELECT ended_at, summary FROM conversations WHERE person_id=? AND summary != '' "
                                  "ORDER BY ended_at DESC LIMIT ?", (pid, n)).fetchall()
      return [time.strftime("%b %d %Y", time.localtime(t or 0)) + ": " + s for t, s in reversed(rows)]

   # By id, or exact name if unique
   def find(self, name_or_id: str) -> dict | None:
      p = self.get(name_or_id)
      if p:
         return p
      with self.lock:
         rows = self.conn.execute("SELECT * FROM people WHERE lower(name)=lower(?)", (name_or_id.strip(),)).fetchall()
      return self._row(rows[0]) if len(rows) == 1 else None

   # Raw research JSON, for history
   def add_research(self, pid: str, result: dict):
      with self.lock:
         self.conn.execute("INSERT INTO research (person_id, at, result) VALUES (?,?,?)",
                           (pid, time.time(), json.dumps(result)))
         self.conn.commit()
