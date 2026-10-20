const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const fetch = require("node-fetch");

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, ".env");
const MODEL_DIR = path.join(ROOT, "models");
const TRIPO_MODEL = "P2-20260801";
const FACE_LIMIT = 1200;
const OPENAI_MODEL = "gpt-5.1";

const jobs = new Map();

function loadEnv(file) {
   const out = {};
   if (!fs.existsSync(file)) return out;
   for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
         v = v.slice(1, -1);
      out[m[1]] = v;
   }
   return out;
}

function keys() {
   const env = loadEnv(ENV_PATH);
   return {
      openai: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
      tripo: env.TRIPO_API_KEY || process.env.TRIPO_API_KEY || ""
   };
}

function sleep(ms) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

function messageText(message) {
   if (!message) return "";
   if (typeof message.content === "string") return message.content;
   if (Array.isArray(message.content))
      return message.content.map(part => (part && (part.text || part.content)) || "").join("");
   return "";
}

function parseJson(text) {
   if (!text) throw new Error("The model returned an empty answer");
   const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
   const raw = fenced ? fenced[1] : text;
   try {
      return JSON.parse(raw);
   } catch (err) {
      const a = raw.indexOf("{");
      const b = raw.lastIndexOf("}");
      if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1));
      throw new Error("The model did not return JSON");
   }
}

function scrubPrompt(prompt) {
   return String(prompt || "")
      .replace(/\d+(?:\.\d+)?\s*(?:m|meter|meters|metre|metres)\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
}

const SYSTEM = [
   "You choose the specific object that should be sculpted so it naturally fills a box.",
   "The player's words are the concept. Keep that concept, including color, material, and style when those still make sense.",
   "The box chooses the subtype. Real things have real proportions. Pick the subtype a person would expect to find in a box of this width, height, and depth.",
   "Height is vertical. A short box cannot hold a tall object. A long box should not hold a compact one.",
   "Example: concept \"car\". A box 12m wide, 4m tall, and 4m deep is a city bus or coach. A box about 4m long and only 1.2m tall is a low sports car. A box about 3m long and 2m tall is a compact car.",
   "If the player already named a subtype that cannot fit, choose the nearest subtype of the same idea that can.",
   "prompt is one or two sentences for a text-to-3D model. Name the subtype, its silhouette, and material. Call it a single low-poly game asset. No numbers, no units, no measurements, no ground and no pedestal.",
   "label is two to four words naming only the subtype.",
   "Reply with JSON: {\"label\":\"...\",\"prompt\":\"...\"}."
].join(" ");

async function interpret(prompt, size, apiKey) {
   const [x, y, z] = size;
   const longest = Math.max(x, y, z);
   const user = [
      `Concept: ${JSON.stringify(prompt)}`,
      `Box: ${x.toFixed(2)} m along X (width), ${y.toFixed(2)} m along Y (height, up), ${z.toFixed(2)} m along Z (depth).`,
      `Height is ${(y / longest).toFixed(2)} of the longest side. Width is ${(x / longest).toFixed(2)}. Depth is ${(z / longest).toFixed(2)}.`
   ].join("\n");

   const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         Authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
         model: OPENAI_MODEL,
         messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user }
         ],
         response_format: { type: "json_object" }
      })
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      throw new Error("OpenAI: " + msg);
   }
   const parsed = parseJson(messageText(data.choices && data.choices[0] && data.choices[0].message));
   let label = String(parsed.label || "").replace(/\s+/g, " ").trim();
   let generated = scrubPrompt(parsed.prompt);
   if (!generated) generated = scrubPrompt(label);
   if (!generated) throw new Error("The model did not name an object");
   if (!/low-?poly/i.test(generated))
      generated = "A single low-poly game asset. " + generated;
   if (generated.length > 1000) generated = generated.slice(0, 1000);
   if (!label) label = generated.split(".").shift().slice(0, 42);
   return { label: label.slice(0, 48), prompt: generated };
}

async function tripo(urlPath, apiKey, body) {
   const res = await fetch("https://openapi.tripo3d.ai/v3" + urlPath, {
      method: body ? "POST" : "GET",
      headers: {
         Authorization: "Bearer " + apiKey,
         "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
   });
   const data = await res.json().catch(() => ({}));
   if (!res.ok || (data.code !== undefined && data.code !== 0)) {
      const msg = data.message || data.msg || (data.error && data.error.message) || res.statusText;
      throw new Error("Tripo " + (data.code || res.status) + ": " + msg);
   }
   return data.data || data;
}

function matMul(a, b) {
   const m = new Array(16);
   for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) {
         let v = 0;
         for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
         m[c * 4 + r] = v;
      }
   return m;
}

function trs(t, q, s) {
   const x = q[0], y = q[1], z = q[2], w = q[3];
   const x2 = x + x, y2 = y + y, z2 = z + z;
   const xx = x * x2, xy = x * y2, xz = x * z2;
   const yy = y * y2, yz = y * z2, zz = z * z2;
   const wx = w * x2, wy = w * y2, wz = w * z2;
   return [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1
   ];
}

function boundsOfJson(json) {
   const scene = json.scenes[json.scene || 0];
   const min = [Infinity, Infinity, Infinity];
   const max = [-Infinity, -Infinity, -Infinity];
   let any = false;
   const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
   const visit = (node, parent) => {
      const local = node.matrix
         ? node.matrix
         : trs(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
      const world = matMul(parent, local);
      if (node.mesh !== undefined && json.meshes[node.mesh]) {
         for (const prim of json.meshes[node.mesh].primitives) {
            const attr = prim.attributes && prim.attributes.POSITION;
            const acc = attr !== undefined ? json.accessors[attr] : null;
            if (!acc || !acc.min || !acc.max) continue;
            any = true;
            for (let i = 0; i < 8; i++) {
               const p = [
                  (i & 1) ? acc.max[0] : acc.min[0],
                  (i & 2) ? acc.max[1] : acc.min[1],
                  (i & 4) ? acc.max[2] : acc.min[2]
               ];
               const x = world[0] * p[0] + world[4] * p[1] + world[8] * p[2] + world[12];
               const y = world[1] * p[0] + world[5] * p[1] + world[9] * p[2] + world[13];
               const z = world[2] * p[0] + world[6] * p[1] + world[10] * p[2] + world[14];
               if (x < min[0]) min[0] = x;
               if (y < min[1]) min[1] = y;
               if (z < min[2]) min[2] = z;
               if (x > max[0]) max[0] = x;
               if (y > max[1]) max[1] = y;
               if (z > max[2]) max[2] = z;
            }
         }
      }
      for (const id of node.children || []) visit(json.nodes[id], world);
   };
   for (const id of scene.nodes || []) visit(json.nodes[id], I);
   if (!any) throw new Error("Model has no mesh bounds");
   return { min, max };
}

function boundsOfGlb(buf) {
   if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("Downloaded file is not a GLB");
   const length = buf.readUInt32LE(8);
   let offset = 12;
   let json = null;
   while (offset + 8 <= length && offset + 8 <= buf.length) {
      const chunkLen = buf.readUInt32LE(offset);
      const chunkType = buf.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (chunkType === 0x4e4f534a) {
         const text = buf.slice(start, start + chunkLen).toString("utf8").replace(/\0+$/g, "").trim();
         json = JSON.parse(text);
      }
      offset = start + chunkLen;
   }
   if (!json) throw new Error("GLB has no JSON chunk");
   return boundsOfJson(json);
}

function unzipGlb(buf) {
   let o = 0;
   while (o + 30 <= buf.length && buf.readUInt32LE(o) === 0x04034b50) {
      const method = buf.readUInt16LE(o + 8);
      const compSize = buf.readUInt32LE(o + 18);
      const nameLen = buf.readUInt16LE(o + 26);
      const extraLen = buf.readUInt16LE(o + 28);
      const name = buf.slice(o + 30, o + 30 + nameLen).toString("utf8");
      const start = o + 30 + nameLen + extraLen;
      if (!compSize || start + compSize > buf.length) break;
      const data = buf.slice(start, start + compSize);
      o = start + compSize;
      if (!/\.glb$/i.test(name)) continue;
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
   }
   throw new Error("Tripo zip did not contain a GLB");
}

async function downloadModel(url, apiKey) {
   let res = await fetch(url);
   if (!res.ok)
      res = await fetch(url, { headers: { Authorization: "Bearer " + apiKey } });
   if (!res.ok) throw new Error("Model download failed: " + res.status);
   let buf = Buffer.from(await res.arrayBuffer());
   if (buf.length > 60 * 1024 * 1024) throw new Error("Model file is too large");
   if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) buf = unzipGlb(buf);
   const bounds = boundsOfGlb(buf);
   return { buf, bounds };
}

async function runJob(job, prompt, size) {
   const { openai, tripo: tripoKey } = keys();
   if (!openai) throw new Error("Add OPENAI_API_KEY to js/scenes/inception/.env");
   if (!tripoKey) throw new Error("Add TRIPO_API_KEY to js/scenes/inception/.env");

   job.status = "reading";
   const named = await interpret(prompt, size, openai);
   job.label = named.label;
   job.prompt = named.prompt;
   console.log(`[inception] ${job.id} "${prompt}" ${size.map(n => n.toFixed(2)).join("x")} -> ${named.label}`);

   job.status = "sculpting";
   job.progress = 0;
   const created = await tripo("/generation/text-to-model", tripoKey, {
      prompt: named.prompt,
      negative_prompt: "high poly, micro detail, text, letters, logo, watermark, ground, pedestal, base, multiple objects",
      model: TRIPO_MODEL,
      face_limit: FACE_LIMIT,
      quad: false,
      texture: true,
      pbr: true,
      texture_quality: "standard",
      auto_size: false
   });
   const taskId = created.task_id;
   if (!taskId) throw new Error("Tripo did not return a task id");
   console.log(`[inception] ${job.id} tripo ${taskId}`);

   const started = Date.now();
   let task = null;
   while (Date.now() - started < 180000) {
      await sleep(2000);
      task = await tripo("/tasks/" + taskId, tripoKey);
      job.progress = task.progress || job.progress;
      if (task.status === "success") break;
      if (task.status === "failed" || task.status === "banned" || task.status === "cancelled" || task.status === "expired")
         throw new Error(task.error_message || ("Tripo " + task.status));
   }
   if (!task || task.status !== "success") throw new Error("Tripo timed out");

   const modelUrl = task.output && (task.output.model_url || task.output.pbr_model || task.output.model || task.output.base_model);
   if (!modelUrl || String(modelUrl).indexOf("https://") !== 0)
      throw new Error("Tripo did not return a model url");

   job.status = "saving";
   const file = await downloadModel(modelUrl, tripoKey);
   fs.mkdirSync(MODEL_DIR, { recursive: true });
   const name = job.id + ".glb";
   fs.writeFileSync(path.join(MODEL_DIR, name), file.buf);
   job.url = "/js/scenes/inception/models/" + name;
   job.min = file.bounds.min;
   job.max = file.bounds.max;
   job.status = "ready";
   job.progress = 100;
   console.log(`[inception] ${job.id} ready ${(file.buf.length / 1024).toFixed(0)} KB`);
}

function publicJob(job) {
   return {
      id: job.id,
      status: job.status,
      progress: job.progress || 0,
      label: job.label || "",
      prompt: job.prompt || "",
      url: job.url || "",
      min: job.min || null,
      max: job.max || null,
      error: job.error || ""
   };
}

function mount(app) {
   app.post("/api/inception/generate", (req, res) => {
      const prompt = String((req.body && req.body.prompt) || "").trim().slice(0, 280);
      const size = req.body && req.body.size;
      if (!prompt) return res.status(400).json({ error: "Type a prompt first" });
      if (!Array.isArray(size) || size.length !== 3) return res.status(400).json({ error: "Size must be width, height, depth" });
      const box = size.map(Number);
      if (box.some(n => !Number.isFinite(n))) return res.status(400).json({ error: "Size must be numbers" });
      const clamped = box.map(n => Math.max(0.1, Math.min(80, n)));

      const id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const job = { id, status: "reading", progress: 0, error: "" };
      jobs.set(id, job);
      res.json({ id });

      runJob(job, prompt, clamped).catch(err => {
         job.status = "error";
         job.error = err.message || String(err);
         console.error(`[inception] ${id} ${job.error}`);
      });
   });

   app.get("/api/inception/job/:id", (req, res) => {
      const job = jobs.get(req.params.id);
      if (!job) return res.status(404).json({ error: "Unknown job" });
      res.json(publicJob(job));
   });

   console.log("[inception] /api/inception/generate");
}

mount.boundsOfGlb = boundsOfGlb;
module.exports = mount;
