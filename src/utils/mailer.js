import nodemailer from 'nodemailer'

let transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mailhog',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: false,
})

export function setTransport(t) { transport = t }
export async function sendMail(opts) {
  const from = opts.from || process.env.SMTP_FROM || 'noreply@webchat.local'
  return transport.sendMail({ from, ...opts })
}
