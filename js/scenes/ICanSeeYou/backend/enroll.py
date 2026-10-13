from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import sys

import server
from brain import Brain
from db import DB
from faces import make_face_index
from vision import load_photo

IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".bmp")


def open_all():
   db = DB(os.path.join(server.DATA, "icsy.db"))
   faces = make_face_index(db)
   if not faces.ok:
      raise SystemExit(f"face matching ({faces.name}) unavailable: " + faces.error)
   return db, faces


def index_photos(db: DB, faces, pid: str, photos: list[str]) -> int:
   known = {os.path.basename(r) for r in glob.glob(os.path.join(server.DATA, "faces", pid, "src_*"))}
   added = 0
   for path in photos:
      tag = "src_" + os.path.basename(path)
      if tag in known:
         continue
      r = faces.index(load_photo(path), pid)
      if not r:
         print(f"   no usable face in {path}")
         continue
      d = os.path.join(server.DATA, "faces", pid)
      os.makedirs(d, exist_ok=True)
      dest = os.path.join(d, tag)
      shutil.copyfile(path, dest)
      db.add_face(r["face_id"], pid, dest, r["yaw"])
      added += 1
      print(f"   indexed {os.path.basename(path)} (yaw {r['yaw']:.0f})" if r["yaw"] is not None else
            f"   indexed {os.path.basename(path)}")
   return added


def fill_profile(db: DB, pid: str):
   brain = Brain()
   person = db.get(pid)
   if not brain.ok:
      return
   try:
      if not DB.is_placeholder(person):
         r = brain.research(person)
         db.add_research(pid, r)
         if r["confidence"] >= 0.5:
            fields = {}
            if r.get("who") and not person.get("who"):
               fields["who"] = r["who"]
            if r.get("web"):
               fields["news"] = r["web"]
            if fields:
               db.update(pid, **fields)
            db.merge_links(pid, r.get("links") or {})
      person = db.get(pid)
      if any(person.get(k) for k in ("story", "learned", "how_we_met", "remember")):
         who = brain.who_they_are(person, db.conversation_history(pid))
         if who:
            db.update(pid, who=who)
   except Exception as e:
      print("   lookup failed:", e)
   p = db.get(pid)
   print(f"   who:  {p['who']}\n   web:  {p['news']}")


def person_fields(src: dict) -> dict:
   links = dict(src.get("links") or {})
   if src.get("linkedin"):
      links["linkedin"] = src["linkedin"]
   if src.get("website"):
      links["website"] = src["website"]
   return {
      "how_we_met": src.get("how_we_met") or src.get("met") or "",
      "remember": src.get("remember") or "",
      "learned": src.get("learned") or src.get("notes") or "",
      "story": src.get("story") or src.get("context") or "",
      "links": links,
   }


def cmd_add(a):
   db, faces = open_all()
   pid = db.new_person(a.name, **person_fields({
      "how_we_met": a.met, "remember": a.remember, "linkedin": a.linkedin,
   }))
   print(f"{a.name} → {pid}")
   if not index_photos(db, faces, pid, a.photos):
      db.delete_person(pid)
      raise SystemExit("no faces indexed; person not added")
   fill_profile(db, pid)


def cmd_folder(a):
   db, faces = open_all()
   for sub in sorted(glob.glob(os.path.join(a.path, "*", ""))):
      prof_path = os.path.join(sub, "profile.json")
      if os.path.basename(os.path.normpath(sub)).startswith("_") or not os.path.exists(prof_path):
         continue
      prof = json.load(open(prof_path))
      photos = sorted(p for p in glob.glob(os.path.join(sub, "*")) if p.lower().endswith(IMAGE_EXT))
      pid = prof.get("id")
      if not pid or not db.get(pid):
         pid = db.new_person(prof["name"], **person_fields(prof))
         prof["id"] = pid
         json.dump(prof, open(prof_path, "w"), indent=2)
      print(f"{prof['name']} → {pid}")
      story = read_story(sub)
      changed = story is not None and story != db.get(pid)["story"]
      if changed:
         db.update(pid, story=story)
         print(f"   story: {len(story.split())} words")
      fields = person_fields(prof)
      db.update(pid, how_we_met=fields["how_we_met"] or db.get(pid)["how_we_met"],
                     remember=fields["remember"] or db.get(pid)["remember"])
      if fields["links"]:
         db.merge_links(pid, fields["links"])
      if index_photos(db, faces, pid, photos) or changed or not db.get(pid)["who"]:
         fill_profile(db, pid)


def read_story(folder: str) -> str | None:
   for name in ("story.md", "story.txt", "context.md", "context.txt"):
      path = os.path.join(folder, name)
      if os.path.exists(path):
         return open(path, encoding="utf-8").read().strip()
   return None


def find_person(db: DB, name_or_id: str) -> dict:
   p = db.find(name_or_id)
   if not p:
      matches = [q["name"] for q in db.list_people() if name_or_id.lower() in q["name"].lower()]
      raise SystemExit(f"no single person called {name_or_id!r}" + (f"; did you mean: {', '.join(matches)}" if matches else ""))
   return p


def cmd_story(a):
   db = DB(os.path.join(server.DATA, "icsy.db"))
   p = find_person(db, a.person)
   text = (sys.stdin.read() if a.file == "-" else open(a.file, encoding="utf-8").read()).strip()
   db.update(p["id"], story=text)
   print(f"{p['name']} ({p['id']}): story set, {len(text.split())} words")
   fill_profile(db, p["id"])


def cmd_show(a):
   db = DB(os.path.join(server.DATA, "icsy.db"))
   p = find_person(db, a.person)
   print(f"{p['name']} ({p['id']})\n")
   print("ON THE CARD")
   print(f"   who:       {p['who'] or '-'}")
   print(f"   from web:  {p['news'] or '-'}")
   print(f"   last time: {p['last_conversation'] or '-'}\n")
   print("WHAT HELPS NEXT TIME (not shown)")
   print(f"   how you met:  {p['how_we_met'] or '-'}")
   print(f"   remember:     {p['remember'] or '-'}")
   print(f"   learned:      {p['learned'] or '-'}")
   print(f"   story:        {len((p['story'] or '').split())} words")
   print(f"   linkedin:     {(p['links'] or {}).get('linkedin') or '-'}")
   for h in db.conversation_history(p["id"]):
      print(f"   talk  {h}")


def cmd_list(a):
   db = DB(os.path.join(server.DATA, "icsy.db"))
   for p in db.list_people():
      extra = p["how_we_met"] or p["remember"] or ""
      print(f"{p['id']}  {p['name']:<28} faces={p['n_faces']}" + (f"  {extra}" if extra else ""))


def cmd_remove(a):
   db, faces = open_all()
   ids = db.delete_person(a.id)
   if ids:
      faces.delete(ids)
   shutil.rmtree(os.path.join(server.DATA, "faces", a.id), ignore_errors=True)
   print(f"removed {a.id} ({len(ids)} faces)")


def main():
   ap = argparse.ArgumentParser(description="remember a person ahead of time")
   sp = ap.add_subparsers(dest="cmd", required=True)
   p = sp.add_parser("add"); p.add_argument("name"); p.add_argument("photos", nargs="+")
   p.add_argument("--met", default="", help="where or when you met")
   p.add_argument("--remember", default="", help="something useful next time")
   p.add_argument("--linkedin")
   p.set_defaults(fn=cmd_add)
   p = sp.add_parser("folder"); p.add_argument("path"); p.set_defaults(fn=cmd_folder)
   p = sp.add_parser("story"); p.add_argument("person"); p.add_argument("file", help="text file, or - for stdin")
   p.set_defaults(fn=cmd_story)
   p = sp.add_parser("show"); p.add_argument("person"); p.set_defaults(fn=cmd_show)
   p = sp.add_parser("list"); p.set_defaults(fn=cmd_list)
   p = sp.add_parser("remove"); p.add_argument("id"); p.set_defaults(fn=cmd_remove)
   a = ap.parse_args()
   a.fn(a)


if __name__ == "__main__":
   main()
