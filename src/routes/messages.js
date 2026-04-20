const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/messages/:roomId — paginated history (cursor-based, 50 per page)
router.get('/:roomId', async (req, res, next) => {
  const { before } = req.query // message ID cursor
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId

    // Verify membership
    const member = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: req.params.roomId } },
    })
    if (!member) return res.status(403).json({ error: 'Not a member of this room' })

    const messages = await prisma.message.findMany({
      where: {
        roomId: req.params.roomId,
        ...(before && { createdAt: { lt: (await prisma.message.findUnique({ where: { id: before } }))?.createdAt } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        author: { select: { id: true, username: true } },
        attachments: true,
        replyTo: {
          select: {
            id: true, content: true, deleted: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    })

    // Mark as read — update last read to most recent message
    if (messages.length > 0) {
      const latest = messages[0] // desc order, so first is newest
      await prisma.roomMember.update({
        where: { userId_roomId: { userId, roomId: req.params.roomId } },
        data: { lastReadMessageId: latest.id },
      })
    }

    res.json({ messages: messages.reverse() }) // return chronological
  } catch (err) { next(err) }
})

// PATCH /api/messages/:id — edit own message
router.patch('/:id', async (req, res, next) => {
  const { content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Content is required' })
  if (Buffer.byteLength(content, 'utf8') > 3072) return res.status(400).json({ error: 'Message exceeds 3KB limit' })
  try {
    const prisma = req.app.locals.prisma
    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' })
    if (message.authorId !== req.session.userId) return res.status(403).json({ error: 'Can only edit your own messages' })
    const updated = await prisma.message.update({
      where: { id: req.params.id },
      data: { content, edited: true },
    })
    req.app.locals.io.to(message.roomId).emit('message_edited', { messageId: updated.id, content: updated.content })
    res.json({ message: updated })
  } catch (err) { next(err) }
})

// DELETE /api/messages/:id — delete message (author or room admin)
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const userId = req.session.userId
    const message = await prisma.message.findUnique({ where: { id: req.params.id } })
    if (!message || message.deleted) return res.status(404).json({ error: 'Message not found' })

    const isAuthor = message.authorId === userId
    const membership = await prisma.roomMember.findUnique({
      where: { userId_roomId: { userId, roomId: message.roomId } },
    })
    const isAdmin = membership?.isAdmin
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: 'Not allowed' })

    await prisma.message.update({
      where: { id: req.params.id },
      data: { deleted: true, content: null },
    })
    req.app.locals.io.to(message.roomId).emit('message_deleted', { messageId: req.params.id })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
