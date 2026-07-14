---
name: TitanBot ticket-log "second bot" identity
description: Why ticket/log messages sent via a Discord webhook look like a separate bot even with the same avatar/name.
---

Discord renders webhook-sent messages as a distinct app/integration identity, separate from the bot user, even when the webhook uses the bot's own avatar and a similar name. If a user reports "a different bot" posting logs when only one bot exists, check for `channel.createWebhook`/webhook-based sends in the log/notification code path.

**Why:** discord.js `Webhook.send()` posts under the webhook's own identity, not the client's bot user — this is a platform rendering behavior, not a bug in the bot's code.

**How to apply:** Replace webhook sends with direct `guild.channels.cache.get(id) / .fetch(id)` + `channel.send()` from the actual bot client whenever messages must visibly come from the bot itself (e.g. ticket transcripts/escalation logs).
