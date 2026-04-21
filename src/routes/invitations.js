import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { ROOM_ERROR_CODES } from '../services/roomErrors.js'
import * as membership from '../services/roomMembership.js'

const router = Router()

function errorStatus(code) { return ROOM_ERROR_CODES[code] ?? 500 }
function sendError(res, err, next) {
  if (err?.code && err.message) return res.status(errorStatus(err.code)).json({ error: err.message, code: err.code })
  return next(err)
}

router.use(requireAuth)

router.post('/:id/accept', async (req, res, next) => {
  try {
    await membership.acceptInvitation(req.app.locals.prisma, req.app.locals.io, req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

router.post('/:id/decline', async (req, res, next) => {
  try {
    await membership.declineInvitation(req.app.locals.prisma, req.session.userId, req.params.id)
    res.status(204).end()
  } catch (err) { sendError(res, err, next) }
})

export default router
