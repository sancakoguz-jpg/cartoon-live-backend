console.log("Server startet…");

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;
require('dotenv').config(); // liest .env lokal ein

// --- Cloudinary Konfiguration aus .env ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();

// CORS: zunächst offen – später auf deine Shop-Domain(en) einschränken
app.use(cors());
// Beispiel für Produktion:
// app.use(cors({ origin: ['https://deinshop.myshopify.com','https://deine-domain.de'] }));

app.use(express.json());

// (Optional) lokaler Output-Ordner – wird für Cloudinary nicht benötigt,
// aber wir lassen ihn da, falls du später Dateien lokal ablegen willst.
const OUTPUT_DIR = path.join(__dirname, 'outputs');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
app.use('/outputs', express.static(OUTPUT_DIR));

// Upload (max 15 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Minimaler Job-Store
const jobs = new Map(); // jobId -> { status, progress, resultUrl, error }

// --- Cartoon-Umwandlung über Cloudinary ---
async function cartoonizeImage(buffer, onProgress) {
  try {
    onProgress && onProgress(30);

    // Bild als Data-URI senden (kein Temp-File nötig)
    const base64Image = `data:image/png;base64,${buffer.toString('base64')}`;

    // Cloudinary Upload + Cartoon-Transformation
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: 'cartoon-uploads',
      transformation: [
        { effect: 'cartoonify' },   // Cartoon-Effekt
        { effect: 'outline:100' }   // leichte Kontur
      ]
    });

    onProgress && onProgress(90);

    // Ergebnis-URL zurückgeben (CDN)
    onProgress && onProgress(100);
    return result.secure_url;
  } catch (err) {
    throw new Error(`Cloudinary-Fehler: ${err.message}`);
  }
}

// --- API: Start der Umwandlung ---
app.post('/api/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Kein Bild erhalten' });

    const jobId = uuidv4();
    jobs.set(jobId, { status: 'processing', progress: 0, resultUrl: null });

    // asynchron verarbeiten
    cartoonizeImage(req.file.buffer, (p) => {
      const j = jobs.get(jobId);
      if (j) { j.progress = p; jobs.set(jobId, j); }
    })
    .then((cloudUrl) => {
      const j = jobs.get(jobId);
      if (j) {
        j.status = 'done';
        j.progress = 100;
        j.resultUrl = cloudUrl; // <-- Cartoon-URL von Cloudinary
        jobs.set(jobId, j);
      }
    })
    .catch((err) => {
      const j = jobs.get(jobId) || {};
      j.status = 'error';
      j.error  = err?.message || 'Processing failed';
      jobs.set(jobId, j);
    });

    // jobId sofort zurück
    res.json({ jobId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// --- API: Status abfragen ---
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });
  res.json(job);
});

// --- Start ---
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend läuft auf http://localhost:${PORT}`);
});
