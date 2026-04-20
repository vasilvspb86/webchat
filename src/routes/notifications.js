import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', async (req, res, next) => {
  try {
    const notifications = await req.app.locals.prisma.notification.findMany({
      where: { userId: req.session.userId, read: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ notifications })
  } catch (err) { next(err) }
})

router.post('/:id/read', async (req, res, next) => {
  try {
    await req.app.locals.prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.session.userId },
      data: { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/read-all', async (req, res, next) => {
  try {
    await req.app.locals.prisma.notification.updateMany({
      where: { userId: req.session.userId, read: false },
      data: { read: true },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
