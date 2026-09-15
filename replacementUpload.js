/**
 * Multer configuration and server-side validation for replacement-request evidence videos.
 * Videos are stored on backend-controlled storage (uploads/videos/replacements) — never a
 * public URL — so downloads can be access controlled and metered.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const sanitize = require('sanitize-filename');

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];
const ALLOWED_EXT = ['mp4', 'webm', 'mov'];

const UPLOAD_DIR = path.join(
  process.env.UPLOAD_PATH || path.join(__dirname, '..', 'uploads'),
  'videos',
  'replacements'
);

fs.ensureDirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 5);
    const base = sanitize(path.parse(file.originalname).name).substring(0, 40) || 'video';
    const unique = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${base}_${unique}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().slice(1);
  if (!ALLOWED_EXT.includes(ext)) {
    return cb(new Error('Only mp4, webm and mov videos are allowed'), false);
  }
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Invalid video mime type'), false);
  }
  cb(null, true);
};

const uploadVideo = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE,
    files: 1
  },
  fileFilter
}).single('video');

/**
 * Reads the leading bytes of a file and confirms they match a supported video container.
 * mp4/mov are ISO-BMFF ("ftyp" box at offset 4); webm is an EBML stream (0x1A45DFA3).
 *
 * @param {string} filePath - Absolute path to the stored upload.
 * @returns {Promise<boolean>} True when the magic bytes match an allowed container.
 */
const verifyVideoMagicBytes = async (filePath) => {
  const fd = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(12);
    await fs.read(fd, buffer, 0, 12, 0);

    // WebM / Matroska EBML header.
    if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
      return true;
    }

    // ISO Base Media (mp4/mov): bytes 4-7 spell "ftyp".
    if (buffer.slice(4, 8).toString('ascii') === 'ftyp') {
      return true;
    }

    return false;
  } finally {
    await fs.close(fd);
  }
};

/**
 * Express middleware: runs multer, translates its errors, and performs a magic-byte
 * re-check so the file's real content (not just its declared type) is validated.
 */
const handleVideoUpload = (req, res, next) => {
  uploadVideo(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Video exceeds the 50MB limit' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Video upload failed' });
    }

    if (!req.file) {
      return next();
    }

    try {
      const valid = await verifyVideoMagicBytes(req.file.path);
      if (!valid) {
        await fs.remove(req.file.path).catch(() => {});
        return res.status(400).json({ success: false, message: 'Uploaded file is not a valid video' });
      }
    } catch (verifyError) {
      await fs.remove(req.file.path).catch(() => {});
      return res.status(400).json({ success: false, message: 'Unable to validate uploaded video' });
    }

    next();
  });
};

module.exports = { handleVideoUpload, MAX_VIDEO_SIZE, ALLOWED_MIME, ALLOWED_EXT };
