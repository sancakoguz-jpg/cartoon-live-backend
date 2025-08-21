console.log("Server startet…");
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());              // In Produktion ggf. cors({ origin: ["https://DEINSHOP.de"] })
app.use(express.json());

// Ordner für Ausgaben
const OUTPUT_DIR = path.join(__dirname, 'outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/outputs', express.static(OUTPUT_DIR));

// Upload in Memory (max. 15 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Sehr einfache In-Memory Job-Map
const jobs = new Map(); // jobId -> { status, progress, resultUrl, error }

// DEMO: simuliert Fortschritt und speichert das Original als "Ergebnis".
// Später hier deine echte KI anschließen.
async function cartoonizeImage(buffer, outPath, onProgress) {
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  let p = 0;
  while (p < 95) {
    p += 15;                 // 15,30,45,60,75,90,95
    onProgress && onProgress(p);
    await wait(600);
  }
  fs.writeFileSync(outPath, buffer);   // Demo: Bild einfach abspeichern
  onProgress && onProgress(100);
}

app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Kein Bild erhalten' });

    const jobId = uuidv4();
    const outFile = path.join(OUTPUT_DIR, `${jobId}.png`);
    jobs.set(jobId, { status: 'processing', progress: 0, resultUrl: null });

    // Verarbeitung asynchron starten
    cartoonizeImage(req.file.buffer, outFile, (p) => {
      const j = jobs.get(jobId);
      if (j) { j.progress = p; jobs.set(jobId, j); }
    }).then(() => {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'done';
        j.progress = 100;
        j.resultUrl = `/outputs/${jobId}.png`;
        jobs.set(jobId, j);
      }
    }).catch(err => {
      const j = jobs.get(jobId) || {};
      j.status = 'error';
      j.error = err?.message || 'Processing failed';
      jobs.set(jobId, j);
    });

    // jobId sofort zurückgeben
    res.json({ jobId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  res.json(job);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
