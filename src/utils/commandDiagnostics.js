---
# Debug: command loading diagnostics
# This is a tiny helper file that will log command load failures and counts during startup.
# It won't change behavior except to add clearer logs.
---

import { logger } from '../utils/logger.js';

export function logCommandLoadSummary(client) {
  try {
    if (!client || !client.commands) {
      logger.warn('logCommandLoadSummary: client.commands missing');
      return;
    }

    const total = client.commands.size;
    logger.info(`[Diagnostics] Command registry contains ${total} commands.`);

    const errors = [];
    for (const [name, cmd] of client.commands) {
      if (!cmd || !cmd.data || !cmd.execute) {
        errors.push(name);
      }
    }

    if (errors.length > 0) {
      logger.warn(`[Diagnostics] Found ${errors.length} invalid command entries: ${errors.join(', ')}`);
    }
  } catch (err) {
    logger.error('logCommandLoadSummary error:', err);
  }
}
