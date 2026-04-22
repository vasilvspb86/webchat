import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { MESSAGE_ERROR_CODES } from '../services/messageErrors.js'
import * as messages from '../services/messages.js'

const router = Router()
router.use(requireAuth)

function sendError(res, err, next) {
  if (err?.code && err.message) {
    return res.status(MESSAGE_ERROR_CODES[err.code] ?? 500).json({ error: err.message, code: err.code })
  }
  return next(err)
}

router.get('/:roomId', async (req, res, next) => {
  try {
    const page = await messages.listMessages(
      req.app.locals.prisma,
      req.session.userId,
      req.params.roomId,
      { before: req.query.before || null },
    )
    res.json(page)
  } catch (err) { sendError(res, err, next) }
})

export default router
