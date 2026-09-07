/**
 * Next.js instrumentation — runs ONCE when the server process boots
 * (both `next dev` and the production standalone server).
 *
 * Used here for restart recovery: the agent queue is in-memory, so after a
 * restart any task that was mid-flight is dead in the water. We reconcile
 * the database with the fresh process (mark interrupted tasks failed,
 * re-enqueue never-started pending tasks).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { recoverOrphanedTasks } = await import('@/lib/agent/runner')
    await recoverOrphanedTasks()
  } catch (e) {
    // recovery must never prevent server startup
    console.error('[startup] orphan task recovery failed:', (e as Error).message)
  }
}
