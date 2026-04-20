import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import { join, extname } from 'path'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = join(__dirname, '../../uploads')
const THUMBS_DIR = join(UPLOADS_DIR, 'thumbnails')

mkdirSync(UPLOADS_DIR, { recursive: true })
mkdirSync(THUMBS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => cb(null, uuidv4() + extname(file.originalname)),
})

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

const router = Router()

router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' })
  try {
    const { prisma } = req.app.locals
    const isImage = req.file.mimetype.startsWith('image/')
    if (isImage && req.file.size > 3 * 1024 * 1024) {
      unlinkSync(req.file.path)
      return res.status(400).json({ error: 'Images must be under 3 MB' })
    }
    let hasThumb = false
    if (isImage) {
      try {
        await sharp(req.file.path).resize(320, 240, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(join(THUMBS_DIR, req.file.filename))
        hasThumb = true
      } catch { /* thumbnail is non-fatal */ }
    }
    const attachment = await prisma.attachment.create({
      data: { originalName: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, sizeBytes: req.file.size, hasThumb, comment: req.body.comment || null, messageId: req.body.messageId || 'pending' },
    })
    res.status(201).json({ attachment })
  } catch (err) {
    if (req.file) { try { unlinkSync(req.file.path) } catch { /* ignore */ } }
    next(err)
  }
})

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id }, include: { message: { select: { roomId: true } } } })
    if (!attachment) return res.status(404).json({ error: 'File not found' })
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: req.session.userId, roomId: attachment.message.roomId } } })
    if (!member) return res.status(403).json({ error: 'Access denied' })
    const filePath = join(UPLOADS_DIR, attachment.storedName)
    if (!existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' })
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`)
    res.setHeader('Content-Type', attachment.mimeType)
    res.sendFile(filePath)
  } catch (err) { next(err) }
})

router.get('/:id/thumb', requireAuth, async (req, res, next) => {
  try {
    const { prisma } = req.app.locals
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id }, include: { message: { select: { roomId: true } } } })
    if (!attachment?.hasThumb) return res.status(404).json({ error: 'Thumbnail not available' })
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId: req.session.userId, roomId: attachment.message.roomId } } })
    if (!member) return res.status(403).json({ error: 'Access denied' })
    const thumbPath = join(THUMBS_DIR, attachment.storedName)
    if (!existsSync(thumbPath)) return res.status(404).json({ error: 'Thumbnail not found' })
    res.setHeader('Content-Type', 'image/jpeg')
    res.sendFile(thumbPath)
  } catch (err) { next(err) }
})

export default router
