import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'

const PgSession = connectPgSimple(session)

export function buildSessionMiddleware({ conString, secret, store }) {
  return session({
    store: store || new PgSession({
      conString,
      createTableIfMissing: true,
      tableName: 'user_sessions',
    }),
    secret,
    rolling: true,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' defers to req.secure (which respects `trust proxy` +
      // X-Forwarded-Proto). Behind an HTTPS proxy the cookie is sent with
      // the Secure flag; over plain HTTP (local Docker, dev) it isn't —
      // so the browser actually stores it.
      secure: 'auto',
    },
  })
}
