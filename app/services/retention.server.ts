import db from "../db.server";

// Deletes visit records older than VISIT_RETENTION_DAYS (default 90) once an
// hour, in batches so a large backlog never holds a long lock.

/* eslint-disable no-undef */
const RETENTION_DAYS = Math.max(7, Number(process.env.VISIT_RETENTION_DAYS) || 90);
/* eslint-enable no-undef */
const HOUR_MS = 60 * 60 * 1000;
const BATCH = 5000;

export async function deleteOldVisits(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * HOUR_MS);
  let total = 0;
  for (;;) {
    const old = await db.visit.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH,
    });
    if (old.length === 0) break;
    const { count } = await db.visit.deleteMany({ where: { id: { in: old.map((visit) => visit.id) } } });
    total += count;
    if (old.length < BATCH) break;
  }
  return total;
}

const globalForRetention = globalThis as unknown as { visitRetentionTimer?: NodeJS.Timeout };

export function startRetentionJob() {
  if (globalForRetention.visitRetentionTimer) return;
  const run = () =>
    deleteOldVisits().catch((error) => console.error("Visit retention cleanup failed", error));
  globalForRetention.visitRetentionTimer = setInterval(run, HOUR_MS);
  globalForRetention.visitRetentionTimer.unref();
  setTimeout(run, 60_000).unref();
}
