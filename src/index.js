require('dotenv').config()
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const session = require('express-session')
const connectPgSimple = require('connect-pg-simple')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PgSession = connectPgSimple(session)

const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    tableName: 'user_sessions',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    // maxAge set per-login based on "keep me signed in"
  },
})

app.use(sessionMiddleware)
app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')))

// Share session middleware with Socket.io
io.engine.use(sessionMiddleware)

// Make shared instances available to routes via app.locals
app.locals.prisma = prisma
app.locals.io = io

// REST routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/rooms', require('./routes/rooms'))
app.use('/api/messages', require('./routes/messages'))
app.use('/api/files', require('./routes/files'))
app.use('/api/users', require('./routes/users'))
app.use('/api/notifications', require('./routes/notifications'))

// Socket.io handlers
require('./socket')(io, prisma)

// Background cleanup job (expired notifications)
require('./jobs/cleanup')(prisma)

// SPA fallback — serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Global error handler
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Webchat running on http://localhost:${PORT}`)
})
