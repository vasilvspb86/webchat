// Reusable middleware — attach to any route that requires a logged-in user
function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  next()
}

// For Socket.io — call inside connection handler
function requireSocketAuth(socket, next) {
  const userId = socket.request.session?.userId
  if (!userId) {
    return next(new Error('Not authenticated'))
  }
  socket.userId = userId
  next()
}

module.exports = { requireAuth, requireSocketAuth }
