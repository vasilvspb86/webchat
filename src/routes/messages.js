import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/:roomId', async (req, res, next) => {
  const { before } = req.query
  try {
    const { prisma } = req.app.locals
    const { userId } = req.session
    const member = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId: req.params.roomId } } })
    if (!member) return res.status(403).json({ error: 'Not a member of this room' })

    let cursor = null
    if (before) {
      const ref = await prisma.message.findUnique({ where: { id: before } })
      cursor = ref?.createdAt
    }

    const messages = await prisma.message.findMany({
      where: { roomId: req.params.roomId, ...(cursor && { createdAt: { lt: cursor } }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: { id: true, username: true } },
        attachments: true,
        replyTo: { select: { id: true, content: true, deleted: true, author: { select: { id: true, username: true } } } },
      },
    })

    if (messages.length > 0) {
      await prisma.roomMember.update({
        where: { userId_roomId: { userId, roomId: req.params.roomId } },
        data: { lastReadMessageId: messages[0].id },
      })
    }
    res.json({ messages: messages.reverse() })
  } catch (err) { next(err) }
})

router.patch('/:id', async (req, res, next) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required' })
  if (Buffer.byteLength(content, 'utf8') > 3072) return res.status(400).json({ error: 'Message exceeds 3 KB limit' })
  try {
    const { prisma, io } = req.app.locals
    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' })
    if (message.authorId !== req.session.userId) return res.status(403).json({ error: 'Can only edit your own messages' })
    const updated = await prisma.message.update({ where: { id: req.params.id }, data: { content, edited: true } })
    io.to(message.roomId).emit('message_edited', { messageId: updated.id, content: updated.content })
    res.json({ message: updated })
  } catch (err) { next(err) }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { prisma, io } = req.app.locals
    const { userId } = req.session
    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' })
    const membership = await prisma.roomMember.findUnique({ where: { userId_roomId: { userId, roomId: message.roomId } } })
    if (message.authorId !== userId && !membership?.isAdmin) return res.status(403).json({ error: 'Not allowed' })
    await prisma.message.update({ where: { id: req.params.id }, data: { deleted: true, content: null } })
    io.to(message.roomId).emit('message_deleted', { messageId: req.params.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
