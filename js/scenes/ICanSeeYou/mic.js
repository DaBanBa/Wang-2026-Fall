// microphone chunk recording

const SILENCE_RMS = .01;

// Read a Blob as a base64 string
export const blobToB64 = blob => new Promise(res => {
   const fr = new FileReader();
   fr.onload = () => res(fr.result.split(',')[1]);
   fr.readAsDataURL(blob);
});

// Rebuild a Blob from the said base64 string
export const b64ToBlob = (b64, type) =>
   new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type });

// Record the microphone in chunks. Each chunk is a file, so Whisper can decode it alone
// Chunks below SILENCE_RMS are trashed.
export const makeChunkRecorder = (onChunk, chunkMs = 10000) => {
   const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
                .find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
   const r = { running: false, starting: false, failed: false, level: 0 };
   let stream, ctx, analyser, meter, timer;
   const cycle = () => {
      if (!r.running) return;
      const parts = [], chunk = { peak: 0 };
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      r.rec = rec;
      r.chunk = chunk;
      rec.ondataavailable = e => e.data && e.data.size && parts.push(e.data);
      rec.onstop = () => {
         const metered = ctx && ctx.state === 'running';
         if (parts.length && (!metered || chunk.peak > SILENCE_RMS)) {
            const type = rec.mimeType || mime || 'audio/webm';
            onChunk(new Blob(parts, { type }), type);
         }
      };
      rec.start();
      timer = setTimeout(() => { rec.stop(); cycle(); }, chunkMs);
   };

   // Start the recording
   r.start = async () => {
      if (r.running || r.starting) return;
      r.starting = true;
      try {
         stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true } });
         ctx = new (window.AudioContext || window.webkitAudioContext)();
         if (ctx.state === 'suspended') ctx.resume().catch(() => {});
         analyser = ctx.createAnalyser();
         analyser.fftSize = 1024;
         ctx.createMediaStreamSource(stream).connect(analyser);
         const buf = new Float32Array(analyser.fftSize);
         meter = setInterval(() => {
            analyser.getFloatTimeDomainData(buf);
            let s = 0;
            for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
            r.level = Math.sqrt(s / buf.length);
            if (r.chunk) r.chunk.peak = Math.max(r.chunk.peak, r.level);
         }, 100);
         r.running = true;
         cycle();
      } catch (e) {
         r.failed = true;
         console.warn('[ICanSeeYou] microphone unavailable:', e);
      }
      r.starting = false;
   };

   // Stop recording
   r.stop = () => {
      if (!r.running) return;
      r.running = false;
      clearTimeout(timer);
      clearInterval(meter);
      if (r.rec && r.rec.state === 'recording') r.rec.stop();
      stream.getTracks().forEach(t => t.stop());
      ctx.close();
   };
   return r;
};
