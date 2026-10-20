const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function submit(cube) {
   const prompt = cube.prompt.trim();
   if (!prompt) {
      cube.note = "type a prompt first";
      return;
   }
   if (cube.status === "reading" || cube.status === "sculpting" || cube.status === "saving")
      return;
   const token = ++cube.job;
   cube.status = "reading";
   cube.progress = 0;
   cube.error = "";
   cube.note = "";
   try {
      const res = await fetch("/api/inception/generate", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ prompt, size: cube.size.slice() })
      });
      const data = await res.json().catch(() => ({}));
      if (cube.job !== token) return;
      if (!res.ok) throw new Error(data.error || ("Request failed (" + res.status + ")"));
      for (;;) {
         await sleep(1200);
         if (cube.job !== token) return;
         const poll = await fetch("/api/inception/job/" + data.id);
         const job = await poll.json().catch(() => ({}));
         if (cube.job !== token) return;
         if (!poll.ok) throw new Error(job.error || "Lost the sculpt job");
         cube.label = job.label || cube.label;
         cube.progress = job.progress || 0;
         if (job.status === "ready") {
            cube.url = job.url;
            cube.bounds = { min: job.min, max: job.max };
            cube.status = "ready";
            cube.progress = 100;
            return;
         }
         if (job.status === "error") throw new Error(job.error || "Sculpt failed");
         cube.status = job.status || "sculpting";
      }
   } catch (err) {
      if (cube.job !== token) return;
      cube.status = "error";
      cube.error = String(err.message || err).slice(0, 160);
   }
}
