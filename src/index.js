import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { PrismaClient } from '@prisma/client'
import authRouter from './routes/auth.js'
import roomsRouter from './routes/rooms.js'
import messagesRouter from './routes/messages.js'
import filesRouter from './routes/files.js'
import usersRouter from './routes/users.js'
import notificationsRouter from './routes/notifications.js'
import { initSocket } from './socket/index.js'
import { startCleanupJob } from './jobs/cleanup.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const prisma = new PrismaClient()
const app = express()
const server = createServer(app)
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
  cookie: { httpOnly: true, sameSite: 'lax' },
})

app.use(sessionMiddleware)
app.use(express.json())
app.use(express.static(join(__dirname, '../public')))
io.engine.use(sessionMiddleware)

app.locals.prisma = prisma
app.locals.io = io

app.use('/api/auth', authRouter)
app.use('/api/rooms', roomsRouter)
app.use('/api/messages', messagesRouter)
app.use('/api/files', filesRouter)
app.use('/api/users', usersRouter)
app.use('/api/notifications', notificationsRouter)

initSocket(io, prisma)
startCleanupJob(prisma)

app.get('*', (_req, res) => res.sendFile(join(__dirname, '../public/index.html')))

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Webchat running on http://localhost:${PORT}`))
