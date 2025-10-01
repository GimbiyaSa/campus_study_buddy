// workers/notificationsWorker.js
// Run with: node workers/notificationsWorker.js
// Add a script:  "worker:notifications": "node workers/notificationsWorker.js"

const sql = require('mssql');
require('dotenv').config();

// Make sure userService initializes the pool (adjust path if needed)
const userService = require('../services/userService');
const { scheduleDaily24hReminders, sendSessionReminders } = require('../services/notificationService');

const getPool = () => sql.globalPool || userService.pool;

async function deliverScheduledNotifications() {
  try {
    const request = getPool().request();
    const result = await request.query(`
      SELECT notification_id, user_id, notification_type, title, message, metadata, scheduled_for
      FROM notifications
      WHERE scheduled_for <= GETUTCDATE()
        AND sent_at IS NULL
        AND scheduled_for IS NOT NULL
      ORDER BY scheduled_for ASC
    `);

    const due = result.recordset || [];
    if (!due.length) return;

    // --- Deliver (stub) ---
    // Replace this block with push/email/SMS integration as needed.
    for (const n of due) {
      const meta = n.metadata ? JSON.parse(n.metadata) : null;
      console.log(
        `[deliver] -> user:${n.user_id} type:${n.notification_type} title:"${n.title}" meta:`,
        meta
      );
    }

    // Mark sent
    const ids = due.map((n) => `(${parseInt(n.notification_id)})`).join(',');
    await request.query(`
      UPDATE notifications
      SET sent_at = GETUTCDATE()
      WHERE notification_id IN (${ids})
    `);
    console.log(`[worker] marked ${due.length} scheduled notifications as sent`);
  } catch (e) {
    console.error('[worker] deliverScheduledNotifications error:', e);
  }
}

async function runHourlyScheduling() {
  try {
    // Enqueue 24h-out reminders for tomorrow's sessions
    await scheduleDaily24hReminders();
    // Also enqueue your existing 1-hour reminders
    await sendSessionReminders();
  } catch (e) {
    console.error('[worker] runHourlyScheduling error:', e);
  }
}

async function main() {
  try {
    if (!getPool()) {
      // Ensure pool is created if your userService expects an explicit init
      if (userService.init && typeof userService.init === 'function') {
        await userService.init();
      }
    }
  } catch (e) {
    console.error('[worker] DB init error:', e);
  }

  console.log('[worker] notifications worker started');

  // Kick off immediately
  await deliverScheduledNotifications();
  await runHourlyScheduling();

  // Then loop
  const deliverTimer = setInterval(deliverScheduledNotifications, 60 * 1000); // every 60s
  const scheduleTimer = setInterval(runHourlyScheduling, 15 * 60 * 1000); // every 15m

  // Graceful shutdown
  const shutdown = async () => {
    clearInterval(deliverTimer);
    clearInterval(scheduleTimer);
    try {
      if (sql.globalPool) await sql.globalPool.close();
    } catch {}
    console.log('[worker] notifications worker stopped');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
