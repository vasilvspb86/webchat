export function startCleanupJob(prisma) {
  const INTERVAL_MS = 60 * 60 * 1000

  async function run() {
    try {
      const { count } = await prisma.notification.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      if (count > 0) console.log(`[cleanup] Deleted ${count} expired notifications`)
    } catch (err) {
      console.error('[cleanup] Failed:', err.message)
    }
  }

  run()
  setInterval(run, INTERVAL_MS)
}
