#   models
#
#   transcribe               speech to text
#   live_profile             while talking: name / who / how you met / remember
#   summarize_conversation   one sentence about what you talked about
#   research                 public facts that were not in the conversation
#   who_they_are             two sentences for the card

from __future__ import annotations

import json
import os
import re
import tempfile

JUNK_TRANSCRIPTS = {"", "you", "thank you.", "thanks for watching!", "thank you for watching.", "bye."}

JARVIS_PREAMBLE = (
   "You are Jarvis, the user's in-headset assistant. "
   "The user is telling you, Jarvis, to do the following now.\n\n"
)

RESEARCH_INSTRUCTIONS = """\
Jarvis, look this person up on the public web.
Web-search for their LinkedIn, site, GitHub, talks, papers, current role.
Make sure every result is about the same individual.
Known here is only public-safe context (name, who they are, how you met, links, current card text).
Never search for or repeat private details.
The "web" field is the headset card line FROM THE WEB. Always fill it with 2-3 short
CURRENT public sentences (role, school, public projects, talks, headline).
If the card already has text, refresh it: keep what is still true, replace anything stale,
add anything newer or more specific. Do not leave web empty just because you have seen them before.
Return ONLY a JSON object:
{"who": "<exactly two sentences on who they are professionally, only if that is not already known>",
 "web": "<2-3 short sentences of current public facts>",
 "links": {"linkedin": "", "website": "", "github": "", "x": "", "other": []},
 "sources": ["<urls you relied on>"],
 "confidence": <number 0..1 that these results are about this exact person>}"""

CONTEXT_NOTE = """\
"Known" is what the user already knows about this person as a person: who they are, how they
met, things worth remembering next time, a longer story of shared experiences, facts from
earlier talks, and past conversations. Use them to understand references (projects, people,
places) and to fill in names. Never copy private details from the story into your answer."""

SUMMARY_INSTRUCTIONS = """\
Jarvis, the user just finished talking with {name}. Help them remember this person for next time.
Below is what is already known, and raw speech-to-text of everything the microphone heard
(unlabeled, possibly with errors).
""" + CONTEXT_NOTE + """
Return ONLY a JSON object:
{{"summary": "<one specific sentence, past tense, about what you two talked about>",
  "name": "<their full name if they or the user said it, else empty>",
  "who": "<at most two sentences: what they do, and who they are to the user; empty if unchanged>",
  "how_we_met": "<where or when you met, only if said and not already known, else empty>",
  "remember": "<one short sentence of something useful to bring up next time (a project, an offer, a plan); empty if nothing new>",
  "facts": "<one short sentence of NEW facts about them that are not already known, else empty>",
  "links": {{"linkedin": "", "website": ""}}}}"""

LIVE_INSTRUCTIONS = """\
Jarvis, the user is talking with {name} right now. Help them remember this person.
Below is what is already known, and raw speech-to-text of the conversation so far
(unlabeled, may mix both speakers, may mis-hear names: fix obvious mishearings of
well-known schools, companies and places).
They may introduce themselves, or the user may introduce them ("This is Alex, they...").
If the user corrects a name ("not Alex, Sam", "their name is Sam, S-A-M"),
return that corrected name. Do not put name-spelling drama into remember.
""" + CONTEXT_NOTE + """
Return ONLY a JSON object:
{{"name": "<their name if said or clearly corrected in this chunk, else empty>",
  "who": "<at most two sentences: what they do, and who they are to the user; empty if unchanged>",
  "how_we_met": "<where or when you met, only if said in this chunk and not already known, else empty>",
  "remember": "<one short sentence of something useful next time, replacing the old one; empty if nothing new>",
  "facts": "<one short sentence of NEW facts from this chunk that are not already known, else empty>",
  "links": {{"linkedin": "", "website": ""}}}}"""

WHO_INSTRUCTIONS = ("Jarvis, write exactly two sentences for a headset card the user will glance at "
                    "when they see this person again. Sentence 1: what they do. "
                    "Sentence 2: who they are to the user (how you met, a shared project, a plan). "
                    "Return only the two sentences.")

CONTEXT_CHARS = 9000

# JSON object out of model text
def parse_json(text: str) -> dict:
   if not text:
      return {}
   try:
      return json.loads(text)
   except ValueError:
      m = re.search(r"\{.*\}", text, re.S)
      if m:
         try:
            return json.loads(m.group(0))
         except ValueError:
            pass
   return {}


# Whisper + OpenAI
class Brain:
   def __init__(self):
      self.model = os.environ.get("OPENAI_MODEL", "gpt-5.1")
      self.client = None
      self.error = ""
      if os.environ.get("OPENAI_API_KEY"):
         try:
            from openai import OpenAI
            self.client = OpenAI()
         except Exception as e:
            self.error = f"{type(e).__name__}: {e}"
      else:
         self.error = "OPENAI_API_KEY not set"

      self.whisper = os.environ.get("WHISPER_BACKEND", "").lower()
      self._names = []
      self._local = None
      if self.whisper in ("", "local"):
         try:
            import faster_whisper  # noqa: F401
            self.whisper = "local"
         except ImportError:
            self.whisper = "openai" if self.client else "off"
      if self.whisper == "openai" and not self.client:
         self.whisper = "off"

   @property
   def ok(self) -> bool:
      return self.client is not None

   def set_names(self, names: list[str]):
      self._names = names

   def transcribe(self, data: bytes, mime: str) -> str:
      if self.whisper == "off" or not data:
         return ""
      suffix = ".webm" if "webm" in mime else ".ogg" if "ogg" in mime else ".mp4" if "mp4" in mime else ".wav"
      lang = os.environ.get("WHISPER_LANGUAGE") or None
      names = [n for n in self._names if n and not n.upper().startswith("NEW PERSON")]
      prompt = os.environ.get("WHISPER_PROMPT") or (
         "People you may hear: " + ", ".join(names[:20]) if names else None)
      if self.whisper == "local":
         if self._local is None:
            from faster_whisper import WhisperModel
            self._local = WhisperModel(os.environ.get("WHISPER_MODEL", "small.en"),
                                       device="cpu", compute_type="int8")
         with tempfile.NamedTemporaryFile(suffix=suffix) as f:
            f.write(data)
            f.flush()
            segments, _ = self._local.transcribe(f.name, vad_filter=True, beam_size=5, language=lang,
                                                 initial_prompt=prompt)
            text = " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6)
      else:
         r = self.client.audio.transcriptions.create(
            model=os.environ.get("WHISPER_API_MODEL", "whisper-1"),
            file=("chunk" + suffix, data, mime.split(";")[0] or "audio/webm"),
            **{k: v for k, v in (("language", lang), ("prompt", prompt)) if v})
         text = r.text
      text = (text or "").strip()
      return "" if text.lower() in JUNK_TRANSCRIPTS else text

   def _ask(self, instructions: str, user: str, web: bool = False, as_json: bool = True) -> str:
      kwargs = {"model": self.model, "instructions": JARVIS_PREAMBLE + instructions, "input": user}
      if web:
         kwargs["tools"] = [{"type": "web_search"}]
      if as_json:
         kwargs["text"] = {"format": {"type": "json_object"}}
      try:
         return self.client.responses.create(**kwargs).output_text
      except Exception:
         if web and as_json:
            kwargs.pop("text", None)
            return self.client.responses.create(**kwargs).output_text
         raise

   @staticmethod
   def known(person: dict, history: list[str] | None = None, story_chars: int = CONTEXT_CHARS) -> dict:
      k = {
         "name": person["name"],
         "who_they_are": person.get("who") or "",
         "how_you_met": person.get("how_we_met") or "",
         "things_to_remember": person.get("remember") or "",
         "what_youve_learned": person.get("learned") or "",
         "your_story": (person.get("story") or "")[:story_chars],
      }
      if history:
         k["past_conversations"] = history[-10:]
      return {key: v for key, v in k.items() if v}

   @staticmethod
   def _person_fields(out: dict, *extra: str) -> dict:
      keys = ("name", "who", "how_we_met", "remember", "facts", "links") + extra
      return {k: out.get(k) or ("" if k != "links" else {}) for k in keys}

   def summarize_conversation(self, person: dict, transcript: str, history: list[str] | None = None) -> dict:
      name = person["name"]
      out = parse_json(self._ask(SUMMARY_INSTRUCTIONS.format(name=name),
                                 "Known (json):\n" + json.dumps(self.known(person, history)) +
                                 "\n\nTranscript (json):\n" + json.dumps({"transcript": transcript[-12000:]})))
      return self._person_fields(out, "summary")

   def live_profile(self, person: dict, transcript: str, history: list[str] | None = None) -> dict:
      name = "this person" if person["name"].upper().startswith("NEW PERSON") else person["name"]
      out = parse_json(self._ask(LIVE_INSTRUCTIONS.format(name=name),
                                 "Known (json):\n" + json.dumps(self.known(person, history)) +
                                 "\n\nNew speech since the last update (json):\n" +
                                 json.dumps({"chunk": transcript[-4000:]})))
      return self._person_fields(out)

   def research(self, person: dict) -> dict:
      known = {k: v for k, v in {
         "name": person["name"],
         "who_they_are": person.get("who") or "",
         "how_you_met": person.get("how_we_met") or "",
         "on_the_card": person.get("news") or "",
         "public_links": person.get("links") or {},
      }.items() if v}
      out = parse_json(self._ask(RESEARCH_INSTRUCTIONS, "Known about this person (json):\n" + json.dumps(known),
                                 web=True))
      try:
         out["confidence"] = float(out.get("confidence", 0))
      except (TypeError, ValueError):
         out["confidence"] = 0.0
      return out

   def who_they_are(self, person: dict, history: list[str] | None = None) -> str:
      if not any(person.get(k) for k in ("story", "learned", "how_we_met", "remember")) and not history:
         return ""
      return self._ask(WHO_INSTRUCTIONS, json.dumps(self.known(person, history)), as_json=False).strip()
