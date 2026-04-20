// Runs every hour — deletes expired notifications from the Postgres queue
module.exports = function startCleanupJob(prisma) {
  const INTERVAL_MS = 60 * 60 * 1000 // 1 hour

  async function run() {
    try {
      const { count } = await prisma.notification.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      })
      if (count > 0) console.log(`[cleanup] Deleted ${count} expired notifications`)
    } catch (err) {
      console.error('[cleanup] Failed:', err.message)
    }
  }

  run() // Run immediately on startup
  setInterval(run, INTERVAL_MS)
}
