const router = require('express').Router()
const multer = require('multer')
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { requireAuth } = require('../middleware/auth')

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbnails')

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true })
fs.mkdirSync(THUMBS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB hard limit
  fileFilter: (req, file, cb) => {
    // Images get a tighter limit applied after upload via sharp
    cb(null, true)
  },
})

// POST /api/files/upload — upload attachment, returns attachment metadata
router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  try {
    const prisma = req.app.locals.prisma
    const isImage = req.file.mimetype.startsWith('image/')

    // Enforce 3MB limit for images
    if (isImage && req.file.size > 3 * 1024 * 1024) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'Images must be under 3MB' })
    }

    let hasThumb = false
    if (isImage) {
      try {
        await sharp(req.file.path)
          .resize(320, 240, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(path.join(THUMBS_DIR, req.file.filename))
        hasThumb = true
      } catch {
        // Non-fatal — thumbnail optional
      }
    }

    const attachment = await prisma.attachment.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        hasThumb,
        comment: req.body.comment || null,
        // messageId linked when message is saved
        messageId: req.body.messageId || 'pending',
      },
    })

    res.status(201).json({ attachment })
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {})
    next(err)
  }
})

// GET /api/files/:id — authenticated file download
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId

    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: { message: { select: { roomId: true } } },
    })
    if (!attachment) return res.status(404).json({ error: 'File not found' })

    // Check room membership
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: attachment.message.roomId } },
    })
    if (!member) return res.status(403).json({ error: 'Access denied' })

    const filePath = path.join(UPLOADS_DIR, attachment.storedName)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })

    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`)
    res.setHeader('Content-Type', attachment.mimeType)
    res.sendFile(filePath)
  } catch (err) { next(err) }
})

// GET /api/files/:id/thumb — thumbnail (images only)
router.get('/:id/thumb', requireAuth, async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId

    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: { message: { select: { roomId: true } } },
    })
    if (!attachment?.hasThumb) return res.status(404).json({ error: 'Thumbnail not available' })

    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: attachment.message.roomId } },
    })
    if (!member) return res.status(403).json({ error: 'Access denied' })

    const thumbPath = path.join(THUMBS_DIR, attachment.storedName)
    if (!fs.existsSync(thumbPath)) return res.status(404).json({ error: 'Thumbnail not found' })

    res.setHeader('Content-Type', 'image/jpeg')
    res.sendFile(thumbPath)
  } catch (err) { next(err) }
})

module.exports = router
