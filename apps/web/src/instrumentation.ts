/**
 * On a long-running server (Render, a VPS, Docker) there is no platform cron: when
 * MODERATION_WORKER_INTERVAL_SECONDS is set, the server periodically calls its own cron endpoint to
 * pick up moderation jobs that were retried, postponed for quota, or interrupted by a restart.
 */
export async function register() {
  const seconds = Number(process.env.MODERATION_WORKER_INTERVAL_SECONDS);
  if (process.env.NEXT_RUNTIME !== "nodejs" || !seconds || !process.env.CRON_SECRET) return;

  const url = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/cron/moderation`;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
      if (!res.ok) console.error(`moderation worker: ${res.status}`);
    } catch (err) {
      console.error("moderation worker:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  setInterval(tick, seconds * 1000).unref();
}
