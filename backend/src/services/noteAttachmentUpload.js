// backend/src/services/noteAttachmentUpload.js
// at top of noteAttachmentUpload.js
const mod = require('./azureStorageService');
const azureStorage = mod.default || mod.azureStorage;
const express = require('express');
const multer = require('multer');
const sql = require('mssql');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// --------------- DB pool bootstrap (matches your services’ pattern) ---------------
let pool;
async function initializeDatabase() {
  try {
    try {
      const { azureConfig } = require('../config/azureConfig');
      const dbConfig = await azureConfig.getDatabaseConfig();
      pool = await sql.connect(dbConfig);
    } catch (azureErr) {
      if (process.env.DATABASE_CONNECTION_STRING) {
        pool = await sql.connect(process.env.DATABASE_CONNECTION_STRING);
      } else {
        throw new Error('DATABASE_CONNECTION_STRING not found');
      }
    }
  } catch (err) {
    console.error('❌ Database connection failed (noteAttachmentUpload):', err);
    throw err;
  }
}
async function getPool() {
  if (!pool) await initializeDatabase();
  return pool;
}

// --------------- Multer (in-memory) ---------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25MB each, up to 10 files
});

// --------------- Helpers ---------------
function sanitize(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function noteExists(noteId) {
  const p = await getPool();
  const r = p.request();
  r.input('noteId', sql.Int, noteId);
  const q = await r.query(`
    SELECT note_id, attachments
    FROM dbo.shared_notes
    WHERE note_id = @noteId
  `);
  if (!q.recordset.length) return { ok: false };
  return { ok: true, attachments: q.recordset[0].attachments };
}

async function updateAttachments(noteId, attachmentsArr) {
  const p = await getPool();
  const r = p.request();
  r.input('noteId', sql.Int, noteId);
  r.input('atts', sql.NVarChar(sql.MAX), JSON.stringify(attachmentsArr));
  await r.query(`
    UPDATE dbo.shared_notes
    SET attachments = @atts, updated_at = SYSUTCDATETIME()
    WHERE note_id = @noteId
  `);
}

// ---- place this BELOW updateAttachments(...) and ABOVE the routes ----
async function readNoteRow(noteId) {
  const p = await getPool();
  const r = p.request();
  r.input('noteId', sql.Int, noteId);

  const q = `
    SELECT
      n.note_id,
      n.group_id,
      n.author_id,
      n.topic_id,
      n.note_title,
      n.note_content,
      n.attachments,
      n.visibility,
      n.is_active,
      n.created_at,
      n.updated_at,
      COALESCE(u.first_name + ' ' + u.last_name, u.email) AS author_name,
      -- adjust "name" below if your groups table uses group_name/title
      g.name AS group_name
    FROM dbo.shared_notes n
    LEFT JOIN dbo.users u        ON u.user_id  = n.author_id
    LEFT JOIN dbo.study_groups g ON g.group_id = n.group_id
    WHERE n.note_id = @noteId
  `;
  const { recordset } = await r.query(q);
  return recordset[0] || null;
}

// --------------- Routes ---------------

// POST /api/v1/notes/:noteId/attachments
// form-data: files: File[]
router.post('/:noteId/attachments', authenticateToken, upload.array('files'), async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

    // Verify note exists (and optionally enforce ownership/visibility)
    const exists = await noteExists(noteId);
    if (!exists.ok) return res.status(404).json({ error: 'Note not found' });

    // Container choice: reuse 'user-files' (you already use it for profile images)
    const containerName = 'user-files';

    const uploaded = [];
    for (const f of req.files) {
      const original = sanitize(f.originalname || 'file');
      const blobName = `notes/${req.user.id}/${noteId}/${Date.now()}-${original}`;

      const result = await azureStorage.uploadFile(f.buffer, {
        containerName,
        fileName: blobName,
        contentType: f.mimetype || 'application/octet-stream',
        metadata: {
          userId: String(req.user.id),
          noteId: String(noteId),
          originalFileName: original,
          uploadType: 'note-attachment',
          uploadedAt: new Date().toISOString(),
        },
        tags: {
          type: 'note-attachment',
          userId: String(req.user.id),
          noteId: String(noteId),
        },
      });

      uploaded.push({
        container: containerName,
        blob: blobName,
        filename: f.originalname || original,
        size: f.size,
        contentType: f.mimetype || 'application/octet-stream',
        uploadedAt: new Date().toISOString(),
        // For convenience only; don’t rely on public ACL in prod:
        url: result.url,
      });
    }

    // Merge with existing attachments (if any)
    let existing = [];
    try {
      if (exists.attachments) existing = JSON.parse(exists.attachments);
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }
    const merged = [...existing, ...uploaded];

    await updateAttachments(noteId, merged);

    // After: await updateAttachments(noteId, merged);
    const full = await readNoteRow(noteId);
    return res.status(201).json(full || { attachments: merged, added: uploaded.length });

    res.status(201).json({ attachments: merged, added: uploaded.length });
  } catch (e) {
    console.error('note attachment upload error:', e);
    // Helpful hints for common errors
    if (String(e?.message || '').includes('RequestEntityTooLarge')) {
      return res.status(413).json({ error: 'File too large' });
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --- add near the other routes in noteAttachmentUpload.js ---

// GET /api/v1/notes/:noteId/attachments/url?container=...&blob=...
router.get('/:noteId/attachments/url', authenticateToken, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });

    const container = String(req.query.container || 'user-files');
    const blobRaw = String(req.query.blob || '');
    if (!blobRaw) return res.status(400).json({ error: 'blob is required' });

    // Important: frontend sends URL-encoded paths (notes%2F...%2Ffile.pdf)
    const blob = decodeURIComponent(blobRaw);

    // Verify the note exists (and optionally authorize user to view it)
    const exists = await noteExists(noteId);
    if (!exists.ok) return res.status(404).json({ error: 'Note not found' });

    // Mint a short-lived read URL
    // Try whichever helper your azureStorage wrapper exposes.
    let url;
    if (azureStorage.getFileSASUrl) {
      url = await azureStorage.getFileSASUrl(container, blob, {
        permissions: 'r',
        expiresInMinutes: 5,
      });
    } else if (azureStorage.getSignedUrl) {
      url = await azureStorage.getSignedUrl(container, blob, {
        permissions: 'r',
        expiresInMinutes: 5,
      });
    } else if (azureStorage.getFileUrl) {
      // fallback (public container scenarios)
      url = await azureStorage.getFileUrl(container, blob);
    }

    if (!url) return res.status(500).json({ error: 'Failed to mint SAS URL' });
    return res.json({ url });
  } catch (e) {
    console.error('GET attachments/url error:', e);
    return res.status(500).json({ error: 'Failed to mint SAS URL' });
  }
});

// (Optional) DELETE attachment
// body: { container, blob }
router.delete('/:noteId/attachments', authenticateToken, express.json(), async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    if (Number.isNaN(noteId)) return res.status(400).json({ error: 'Invalid note id' });
    const { container, blob } = req.body || {};
    if (!container || !blob) return res.status(400).json({ error: 'container, blob required' });

    const exists = await noteExists(noteId);
    if (!exists.ok) return res.status(404).json({ error: 'Note not found' });

    // Remove file in storage (ignore errors to avoid dangling DB state on transient errors)
    try {
      await azureStorage.deleteFile(String(container), String(blob));
    } catch (e) {
      console.warn('blob delete failed (continuing):', e?.message || e);
    }

    // Remove from JSON
    let current = [];
    try {
      current = exists.attachments ? JSON.parse(exists.attachments) : [];
      if (!Array.isArray(current)) current = [];
    } catch {
      current = [];
    }
    const next = current.filter((a) => !(a.container === container && a.blob === blob));
    await updateAttachments(noteId, next);

    // After: await updateAttachments(noteId, next);
    const full = await readNoteRow(noteId);
    return res.json(full || { attachments: next });

    res.json({ attachments: next });
  } catch (e) {
    console.error('note attachment delete error:', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;
