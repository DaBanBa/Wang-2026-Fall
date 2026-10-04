// linefont2.js had an issue where there be small lil black trangles floating around

// I think it's because linefont2.js calls clay.defineTextMesh which reads the paths in linefont.js 
// and turns each path into one connected stroke mesh.

//ink.js, on the other hand, reads the same linefont.hs path but keep every stroke seperated. 

import { linefont } from "../../render/core/linefont.js";

export const defineInk = (name, text) => {
   const verts = [];
   const put = (x, y, nz) => {
      const v = clay.vertexArray([x, y, 0], [0, 0, nz], [1, 0, 0], [0, 0]);
      for (let i = 0; i < v.length; i++) verts.push(v[i]);
   };
   const tri = (ax, ay, bx, by, cx, cy, nz) => {
      put(ax, ay, nz); put(bx, by, nz); put(cx, cy, nz);
   };
   const stroke = (ax, ay, bx, by) => {
      let dx = bx - ax, dy = by - ay;
      let len = Math.hypot(dx, dy);
      if (len < 1e-5) return;
      let ex = -dy / len * 0.0018, ey = dx / len * 0.0018;
      tri(ax - ex, ay - ey, bx - ex, by - ey, bx + ex, by + ey, 1);
      tri(ax - ex, ay - ey, bx + ex, by + ey, ax + ex, ay + ey, 1);
   };
   String(text || '').split('\n').forEach((line, row) => {
      let y0 = -row * 0.0375;
      for (let col = 0; col < line.length; col++) {
         let c = line.charCodeAt(col) & 127;
         if (c <= 32 || !linefont[c - 32]) continue;
         let ox = col * 0.019;
         for (let path of linefont[c - 32].paths)
            for (let i = 1; i < path.length; i++)
               stroke(ox + path[i - 1][0] / 4000, y0 - path[i - 1][1] / 4000,
                      ox + path[i][0] / 4000, y0 - path[i][1] / 4000);
      }
   });
   const mesh = new Float32Array(verts);
   mesh.isTriangles = true;
   clay.defineMesh(name, mesh);
};
