import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import authRouter from '../../routes/auth.js'
import { testPrisma } from './db.js'

const PgSession = connectPgSimple(session)

export function buildTestApp() {
  const app = express()
  app.use(express.json())
  app.use(session({
    store: new PgSession({ conString: process.env.DATABASE_URL, tableName: 'user_sessions', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    rolling: true,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false },
  }))
  app.locals.prisma = testPrisma
  app.use('/api/auth', authRouter)
  return app
}
