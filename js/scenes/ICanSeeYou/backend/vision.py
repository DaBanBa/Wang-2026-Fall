# yolo

from __future__ import annotations

import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TRACKER_CFG = os.path.join(HERE, "botsort_icsy.yaml")
FALLBACK_MODELS = ["yolo11n.pt", "yolov8n.pt"]


def _pick_device(requested: str | None) -> str | None:
   if requested:
      return requested
   try:
      import torch
      if torch.cuda.is_available():
         return "cuda:0"
      if torch.backends.mps.is_available():
         return "mps"
   except Exception:
      pass
   return "cpu"


class Tracker:

   def __init__(self, model_name: str, device: str | None = None, conf: float = 0.35):
      from ultralytics import YOLO
      from ultralytics.utils import LOGGER
      # this warning spam on plain walls / dark rooms. it just falls back.
      LOGGER.addFilter(lambda r: "not enough matching points" not in r.getMessage())
      self.conf = conf
      self.device = _pick_device(device)
      self.model = None
      for name in [model_name] + [m for m in FALLBACK_MODELS if m != model_name]:
         try:
            self.model = YOLO(name)
            self.model_name = name
            break
         except Exception as e:
            print(f"[vision] could not load {name}: {e}")
      if self.model is None:
         raise RuntimeError("no YOLO model could be loaded")
      self.size = None
      self.prev = {}

   def reset(self):
      self.prev = {}
      try:
         for t in self.model.predictor.trackers:
            t.reset()
      except Exception:
         pass

   def update(self, frame: np.ndarray) -> list[tuple[int, list[float], float]]:
      if self.size != frame.shape[:2]:
         self.size = frame.shape[:2]
         self.prev = {}
         self.reset()
      res = self.model.track(frame, persist=True, tracker=TRACKER_CFG, classes=[0],
                             conf=self.conf, verbose=False, device=self.device)
      boxes = res[0].boxes
      if boxes is None or boxes.id is None:
         return []
      xyxy = boxes.xyxy.cpu().numpy().tolist()
      ids = boxes.id.int().cpu().tolist()
      confs = boxes.conf.cpu().numpy().tolist()
      out, seen = [], set()
      for tid, box, conf in zip(ids, xyxy, confs):
         seen.add(tid)
         old = self.prev.get(tid)
         if old:
            box = [0.45 * n + 0.55 * o for n, o in zip(box, old)]
         self.prev[tid] = box
         out.append((tid, box, conf))
      self.prev = {tid: b for tid, b in self.prev.items() if tid in seen}
      return out


def _head_for_match(box: list[float]) -> list[float]:
   x0, y0, x1, y1 = box
   bw, bh = x1 - x0, y1 - y0
   if bh <= 1.4 * bw:
      return box
   return [x0, y0, x1, y0 + 0.35 * bh]


def face_crop(frame: np.ndarray, box: list[float], min_side: int = 200) -> bytes | None:
   H, W = frame.shape[:2]
   x0, y0, x1, y1 = _head_for_match(box)
   bw, bh = x1 - x0, y1 - y0
   if bw < 16 or bh < 16:
      return None
   pad = 0.35
   cx0 = int(max(0, x0 - pad * bw))
   cx1 = int(min(W, x1 + pad * bw))
   cy0 = int(max(0, y0 - pad * bh))
   cy1 = int(min(H, y1 + pad * bh))
   region = frame[cy0:cy1, cx0:cx1]
   if region.size == 0:
      return None
   short = min(region.shape[:2])
   if short < min_side:
      s = min_side / max(1, short)
      region = cv2.resize(region, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
   ok, jpg = cv2.imencode(".jpg", region, [cv2.IMWRITE_JPEG_QUALITY, 92])
   return jpg.tobytes() if ok else None


def load_photo(path: str, max_side: int = 1600) -> bytes:
   img = cv2.imread(path)
   if img is None:
      raise ValueError(f"cannot read image {path}")
   s = max_side / max(img.shape[:2])
   if s < 1:
      img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
   return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()
