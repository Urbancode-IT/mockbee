/**
 * Lightweight audit trail for admin and interview actions.
 */
const db = require('../config/db');

async function writeAudit(entry) {
  const doc = {
    action: String(entry.action || 'unknown'),
    actor: entry.actor || null,
    target_type: entry.target_type || null,
    target_id: entry.target_id || null,
    metadata: entry.metadata || {},
    created_at: db.now(),
  };
  try {
    await (await db.col('audit_logs')).insertOne(doc);
  } catch (_) {
    /* never break primary flows for audit */
  }
  return doc;
}

async function listAudit({ limit = 100, action } = {}) {
  const query = action ? { action } : {};
  try {
    return await (await db.col('audit_logs'))
      .find(query)
      .sort({ created_at: -1 })
      .limit(Math.min(Number(limit) || 100, 500))
      .toArray();
  } catch (_) {
    return [];
  }
}

module.exports = { writeAudit, listAudit };
