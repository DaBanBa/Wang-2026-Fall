#   YuNet + SFace on this machine. Each face is a 128-number embedding in
#   sqlite. No cloud.

from __future__ import annotations

import os
import threading
import urllib.request
import uuid

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "models")
YUNET_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_detection_yunet/face_detection_yunet_2023mar.onnx")
SFACE_URL = ("https://github.com/opencv/opencv_zoo/raw/main/models/"
             "face_recognition_sface/face_recognition_sface_2021dec.onnx")
MIN_FACE_PX = 36

def make_face_index(db):
   return LocalFaceIndex(db, float(os.environ.get("FACE_MATCH_THRESHOLD", 0.36)))


def _fetch(url: str) -> str:
   path = os.path.join(MODELS, os.path.basename(url))
   if not os.path.exists(path):
      os.makedirs(MODELS, exist_ok=True)
      print(f"[faces] downloading {os.path.basename(url)} ...")
      urllib.request.urlretrieve(url, path + ".part")
      os.replace(path + ".part", path)
   return path


def _yaw(face) -> float:
   rx, lx, nx = face[4], face[6], face[8]
   r = (nx - (rx + lx) / 2) / (abs(lx - rx) + 1e-6)
   return float(np.clip(r, -1, 1) * 70)


class LocalFaceIndex:
   name = "local"

   def __init__(self, db, threshold: float):
      self.db = db
      self.threshold = threshold
      self.ok = False
      self.error = ""
      self.lock = threading.Lock()         # OpenCV dnn objects are not thread-safe
      self._version = None
      self._pids, self._mat = [], np.zeros((0, 128), np.float32)
      try:
         self.detector = cv2.FaceDetectorYN.create(_fetch(YUNET_URL), "", (320, 320), 0.7, 0.3, 5000)
         self.recognizer = cv2.FaceRecognizerSF.create(_fetch(SFACE_URL), "")
         self.ok = True
      except Exception as e:
         self.error = f"{type(e).__name__}: {e}"

   def _embed(self, jpg: bytes):
      img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
      if img is None:
         return None
      with self.lock:
         self.detector.setInputSize((img.shape[1], img.shape[0]))
         _, faces = self.detector.detect(img)
         if faces is None or not len(faces):
            return None
         face = max(faces, key=lambda f: f[2] * f[3])
         if min(face[2], face[3]) < MIN_FACE_PX:
            return None
         feat = self.recognizer.feature(self.recognizer.alignCrop(img, face)).flatten().astype(np.float32)
      return feat / (np.linalg.norm(feat) + 1e-9), _yaw(face)

   def _matrix(self):
      v = self.db.faces_version()
      with self.lock:
         if v != self._version:
            rows = self.db.embeddings()
            self._pids = [pid for pid, _ in rows]
            self._mat = (np.stack([np.frombuffer(b, np.float32) for _, b in rows]) if rows
                         else np.zeros((0, 128), np.float32))
            self._version = v
         return self._pids, self._mat

   def search(self, jpg: bytes) -> dict:
      e = self._embed(jpg)
      if e is None:
         return {"status": "noface"}
      pids, mat = self._matrix()
      if not pids:
         return {"status": "unknown"}
      sims = mat @ e[0]
      i = int(np.argmax(sims))
      if sims[i] < self.threshold:
         return {"status": "unknown"}
      return {"status": "match", "person_id": pids[i], "similarity": round(float(sims[i]) * 100, 1)}

   def index(self, jpg: bytes, person_id: str) -> dict | None:
      e = self._embed(jpg)
      if e is None:
         return None
      face_id = "lf_" + uuid.uuid4().hex[:12]
      self.db.add_face(face_id, person_id, None, e[1], e[0].tobytes())
      return {"face_id": face_id, "yaw": e[1]}

   def delete(self, face_ids: list[str]):
      self.db.delete_faces(face_ids)