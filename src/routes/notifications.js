const router = require('express').Router()
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// GET /api/notifications — unread notifications for current user
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.session.userId,
        read: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ notifications })
  } catch (err) { next(err) }
})

// POST /api/notifications/:id/read — mark as read
router.post('/:id/read', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.session.userId },
      data: { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// POST /api/notifications/read-all
router.post('/read-all', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma
    await prisma.notification.updateMany({
      where: { userId: req.session.userId, read: false },
      data: { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

module.exports = router
