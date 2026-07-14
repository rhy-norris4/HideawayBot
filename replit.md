# TitanBot - Discord Community Bot

## Overview
TitanBot is a modular Discord bot (discord.js v14) with moderation, economy,
leveling, tickets, giveaways, birthdays, reaction roles, and verification
features. It uses PostgreSQL for persistent storage and runs a small Express
web server alongside the bot for health checks. Google Groups sync, music,
join-to-create voice channels, and server-stats counters have been removed.

## Stack
- Node.js (ESM), discord.js v14, @discordjs/voice, @discordjs/rest
- Express (health/status endpoints)
- PostgreSQL (Replit's built-in database, via `DATABASE_URL`)

## Running on Replit
- Workflow "Start application" runs `node src/app.js`.
- Required secrets (configured as Replit Secrets): `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
- Run `npm install` after importing/cloning before starting the workflow — dependencies are not vendored.
- Database: uses Replit's built-in PostgreSQL automatically (`pgConfig` in
  `src/config/postgres.js` falls back to `DATABASE_URL`). Tables/indexes are
  auto-created and migrated on startup.
- The bot registers slash commands to the guild in `GUILD_ID` for instant
  testing (guild commands update immediately, unlike global commands).
- Bot is confirmed online and connected to Discord + PostgreSQL as of 2026-07-14.
- Ticket logs (close/escalate) are posted directly by the bot's own client
  (`channel.send`), not via a webhook, so they appear as the main bot rather
  than a separate app identity.
- Logging is fully panel-driven: `/logging panel` lets admins assign a
  channel per log category interactively; there is no hardcoded/automated
  channel routing anymore.
- The bot only replies to @mentions/replies in channel `1511829483555000350`;
  leveling/XP and economy message handling still work in every channel.
- Personal to-dos live under `/my todo panel` (button/select panel UI);
  shared to-do lists moved to `/mysharedtodo`.
- `/collect` pays out economy income based on the admin-configured
  `/role income` role → amount mapping, on a 1-hour cooldown.

## User preferences
None recorded yet.
