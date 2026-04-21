export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

export function requireSocketAuth(socket, next) {
  const userId = socket.request.session?.userId
  if (!userId) return next(new Error('Not authenticated'))
  socket.userId = userId
  next()
}
