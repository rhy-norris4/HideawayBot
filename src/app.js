import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase, setInDb } from './utils/database.js';
import { getGuildConfig } from './services/guildConfig.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways } from './services/giveawayService.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/commandLoader.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        
        GatewayIntentBits.Guilds,                        
        GatewayIntentBits.GuildMembers,                 
        
        
        GatewayIntentBits.GuildMessages,                
        GatewayIntentBits.GuildMessageReactions,        
        GatewayIntentBits.MessageContent,               
        
        GatewayIntentBits.GuildVoiceStates,             
        
        
        GatewayIntentBits.GuildBans,                    
      ],
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  async start() {
    try {
      startupLog('Starting TitanBot...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;
      
      // Check database status and report
      const dbStatus = this.db.getStatus();
      if (dbStatus.isDegraded) {
        logger.warn('');
        logger.warn('╔═══════════════════════════════════════════════════════╗');
        logger.warn('║ ⚠️  DATABASE RUNNING IN DEGRADED MODE                 ║');
        logger.warn('║                                                       ║');
        logger.warn('║ Connection: In-Memory Storage (PostgreSQL unavailable)║');
        logger.warn('║ Data Persistence: DISABLED - data lost on restart    ║');
        logger.warn('║ Action Required: Fix PostgreSQL and restart bot      ║');
        logger.warn('╚═══════════════════════════════════════════════════════╝');
        logger.warn('');
      } else {
        startupLog(`✅ Database Status: ${dbStatus.connectionType} (fully operational)`);
      }
      
      startupLog('Starting web server...');
      this.startWebServer();
      
      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Commands loaded: ${this.commands.size}`);
      
      startupLog('Loading handlers...');
      await this.loadHandlers();
      startupLog('Handlers loaded');
      
      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');
      
      startupLog('Registering slash commands...');
      await this.registerCommands();
      startupLog('Slash commands registration complete');
      
      const databaseMode = dbStatus.isDegraded
        ? 'Optional in-memory mode (data resets after restart)'
        : 'Connected (persistent data enabled)';
      const handlerSummary = `${this.buttons.size} buttons, ${this.selectMenus.size} menus, ${this.modals.size} modals`;
      startupLog(
        `ONLINE ✅ | ${this.commands.size} commands loaded | ${handlerSummary} | Database: ${databaseMode}`
      );
      
      this.setupCronJobs();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    const requestCounts = new Map();
    const windowMs = 60000; 
    const maxRequests = this.config.api?.rateLimit?.max || 100;
    
    app.use((req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }
      
      const times = requestCounts.get(ip).filter(t => t > windowStart);
      
      if (times.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      times.push(now);
      requestCounts.set(ip, times);
      next();
    });

    app.get('/health', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: 'unknown' };
      const status = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbStatus.connectionType !== 'none',
          degraded: dbStatus.isDegraded,
          type: dbStatus.connectionType
        }
      };
      res.status(200).json(status);
    });

    app.get('/ready', (req, res) => {
      const dbStatus = this.db?.getStatus?.() || { isDegraded: true };
      const isReady = this.isReady() && !dbStatus.isDegraded;

      if (isReady) {
        return res.status(200).json({
          ready: true,
          message: 'Bot is ready'
        });
      }

      res.status(503).json({
        ready: false,
        reason: !this.isReady() ? 'Bot not Ready' : 'Database degraded'
      });
    });

    app.get('/', (req, res) => {
      res.status(200).json({ 
        message: 'TitanBot System Online',
        version: '2.0.0',
        timestamp: new Date().toISOString()
      });
    });

    app.get('/embeds', (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.send(getEmbedsPage());
    });

    const startServer = (port, attempt = 0) => {
      let hasStartedListening = false;
      const server = app.listen(port, host, () => {
        hasStartedListening = true;
        this.webServer = server;
        startupLog(`✅ Web Server running on ${host}:${port}`);
        startupLog(`Health endpoint: http://localhost:${port}/health`);
        startupLog(`Ready endpoint: http://localhost:${port}/ready`);
      });

      server.on('error', (error) => {
        const errorCode = error?.code || 'UNKNOWN_ERROR';
        const errorMessage = error?.message || 'Unknown server error';

        if (!hasStartedListening && errorCode === 'EADDRINUSE' && attempt < maxPortRetryAttempts) {
          const nextPort = port + 1;
          startupLog(`Port ${port} is already in use. Trying port ${nextPort}...`);
          setTimeout(() => startServer(nextPort, attempt + 1), 250);
          return;
        }

        if (hasStartedListening && errorCode === 'EADDRINUSE') {
          logger.warn(`Web server reported a duplicate bind warning on ${host}:${port}, but the bot remains online.`);
          return;
        }

        logger.error(`❌ Web server error on port ${port} (${errorCode}): ${errorMessage}`);

        if (!hasStartedListening) {
          process.exit(1);
        }
      });
    };

    startServer(configuredPort, 0);
  }

  setupCronJobs() {
    cron.schedule('0 6 * * *', () => checkBirthdays(this));
    cron.schedule('* * * * *', () => checkGiveaways(this));
  }

  async loadHandlers() {
    const handlers = [
      { path: 'events', type: 'default', required: true },
      { path: 'interactions', type: 'default', required: true }
    ];

    for (const handler of handlers) {
      try {
        const module = await import(`./handlers/${handler.path}.js`);
        const loaderFn = handler.type.startsWith('named:') 
          ? module[handler.type.split(':')[1]] 
          : module.default;
        
        if (typeof loaderFn === 'function') {
          await loaderFn(this);
          logger.info(`✅ Loaded ${handler.path}`);
        } else {
          throw new Error(`Invalid loader export from ${handler.path}`);
        }
      } catch (error) {
        if (handler.required) {
          logger.error(`❌ Failed to load required handler ${handler.path}:`, error.message);
          throw error;
        } else if (error.code !== 'MODULE_NOT_FOUND') {
          logger.warn(`⚠️  Failed to load optional handler ${handler.path}:`, error.message);
        }
      }
    }
  }

  async registerCommands() {
    try {
      await registerSlashCommands(this, this.config.bot.guildId);
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }

  async sendOfflineNotice() {
    try {
      const OFFLINE_NOTICE_CHANNEL = '1515733941124993104';
      const STAFF_ROLE = '1513318632871170068';
      const PING_ROLE = '1515735068012974164';
      const offlineAt = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);

      for (const [, guild] of this.guilds.cache) {
        const channel = guild.channels.cache.get(OFFLINE_NOTICE_CHANNEL)
          || await guild.channels.fetch(OFFLINE_NOTICE_CHANNEL).catch(() => null);
        if (channel?.isTextBased?.()) {
          const msg = await channel.send(
            `<@&${STAFF_ROLE}> is going offline <t:${offlineAt}:R>\n<@&${PING_ROLE}>`
          ).catch(() => null);
          if (msg) {
            await setInDb(`offline_notice_${guild.id}`, {
              channelId: channel.id,
              messageId: msg.id,
              expiresAt: offlineAt
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      logger.warn('Failed to send offline notice:', err.message);
    }
  }

  async shutdown(reason = 'UNKNOWN') {
    shutdownLog(`Bot is shutting down (${reason})...`);
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`🛑 Graceful Shutdown Initiated (${reason})`);
    logger.info(`${'='.repeat(60)}`);

    if (this.isReady()) {
      await this.sendOfflineNotice();
    }

    try {
      
      logger.info('Stopping cron jobs...');
      cron.getTasks().forEach(task => task.stop());
      logger.info('✅ Cron jobs stopped');

      // Close database connection
      if (this.db && this.db.db) {
        logger.info('Closing database connection...');
        try {
          if (this.db.db.pool) {
            await this.db.db.pool.end();
            logger.info('✅ Database connection closed');
          }
        } catch (error) {
          logger.warn('Error closing database pool:', error.message);
        }
      }

      
      logger.info('Destroying Discord client...');
      if (this.isReady()) {
        try {
          this.destroy();
          logger.info('✅ Discord client destroyed');
        } catch (error) {
          
          
          logger.warn('Discord client destroy warning (non-critical):', error.message);
        }
      }

      logger.info('✅ Graceful shutdown complete');
  shutdownLog('Bot stopped successfully.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

try {
  const bot = new TitanBot();
  
  const setupShutdown = () => {
    process.on('SIGTERM', () => bot.shutdown('SIGTERM'));
    process.on('SIGINT', () => bot.shutdown('SIGINT'));
    
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      bot.shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      bot.shutdown('UNHANDLED_REJECTION');
    });
  };
  
  setupShutdown();
  bot.start();
} catch (error) {
  logger.error('Fatal error during bot startup:', error);
  process.exit(1);
}

function getEmbedsPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TitanBot — Webhook & Embed Formats</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1e1f22; color: #dbdee1; font-family: 'gg sans', 'Noto Sans', Whitney, 'Helvetica Neue', Helvetica, Roboto, Arial, sans-serif; padding: 24px; min-height: 100vh; }
  h1 { color: #f2f3f5; font-size: 22px; font-weight: 700; margin-bottom: 6px; }
  .subtitle { color: #949ba4; font-size: 13px; margin-bottom: 32px; }
  .section { margin-bottom: 48px; }
  .section-label { color: #b5bac1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #3f4147; }
  .row { display: flex; gap: 20px; flex-wrap: wrap; }
  .channel-ctx { color: #949ba4; font-size: 12px; margin-bottom: 6px; padding-left: 4px; }
  .msg { display: flex; gap: 16px; max-width: 540px; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .av-blue { background: linear-gradient(135deg,#5865F2,#4752C4); }
  .av-green { background: linear-gradient(135deg,#57F287,#2d7a4b); }
  .av-red { background: linear-gradient(135deg,#ED4245,#8b1c1e); }
  .av-yellow { background: linear-gradient(135deg,#FEE75C,#b8a000); }
  .meta { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .username { color: #f2f3f5; font-weight: 500; font-size: 15px; }
  .bot-badge { background: #5865F2; color: white; font-size: 10px; font-weight: 700; padding: 1px 4px; border-radius: 3px; letter-spacing: 0.3px; }
  .ts { color: #949ba4; font-size: 12px; }
  .embed { border-radius: 0 4px 4px 0; padding: 12px 16px; background: #2b2d31; margin-top: 2px; }
  .embed-title { color: #f2f3f5; font-weight: 700; font-size: 15px; margin-bottom: 8px; }
  .embed-author { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .embed-author-icon { width: 18px; height: 18px; border-radius: 50%; background: #5865F2; display: flex; align-items: center; justify-content: center; font-size: 10px; }
  .embed-author-name { color: #b5bac1; font-size: 12px; font-weight: 600; }
  .fields { display: grid; gap: 8px 14px; margin-bottom: 8px; }
  .fields-2 { grid-template-columns: 1fr 1fr; }
  .fields-3 { grid-template-columns: 1fr 1fr 1fr; }
  .fields-1 { grid-template-columns: 1fr; }
  .field-label { color: #b5bac1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
  .field-value { color: #dbdee1; font-size: 13px; line-height: 1.4; }
  .mention { color: #5865F2; }
  .muted { color: #949ba4; font-size: 11px; }
  .embed-footer { color: #949ba4; font-size: 11px; border-top: 1px solid #3f4147; padding-top: 8px; margin-top: 8px; }
  .blockquote { border-left: 3px solid #4e5058; padding-left: 10px; margin-bottom: 10px; line-height: 1.6; font-size: 13px; }
  .inset { background: #1e1f22; border-radius: 4px; padding: 6px 8px; font-size: 12px; margin-bottom: 6px; }
  .inset-bl { border-left: 3px solid #ed4245; }
  .tag { display: inline-flex; align-items: center; gap: 5px; background: #1e1f22; border-radius: 4px; padding: 3px 8px; font-size: 13px; }
  .green { color: #57f287; } .red { color: #ed4245; } .yellow { color: #fee75c; } .gold { color: #faa81a; } .blue { color: #00a8fc; }
  .fw700 { font-weight: 700; }
  .divider { border-top: 1px solid #3f4147; margin: 10px 0; }
  code { background: #1e1f22; padding: 2px 5px; border-radius: 3px; font-size: 11px; font-family: Consolas, monospace; color: #dbdee1; }
  .case-card { background: #1e1f22; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
  .case-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .case-type { display: flex; align-items: center; gap: 5px; }
  .pagination { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
  .btn { background: #4f545c; border: none; color: #dbdee1; padding: 5px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .evt { margin-bottom: 16px; }
  .evt-time { color: #949ba4; font-size: 11px; margin-bottom: 4px; padding-left: 56px; }
  .ticket-avatar { border-radius: 50%; width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid; }
  nav { display: flex; gap: 6px; margin-bottom: 28px; flex-wrap: wrap; }
  .nav-btn { background: #2b2d31; border: 1px solid #3f4147; color: #b5bac1; padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer; text-decoration: none; transition: background 0.15s; }
  .nav-btn:hover { background: #35373c; color: #f2f3f5; }
</style>
</head>
<body>
<h1>🛡️ TitanBot — Webhook & Embed Formats</h1>
<p class="subtitle">Visual reference for all Discord embed/webhook formats used in The Hideaway</p>

<nav>
  <a class="nav-btn" href="#mod-log">Moderation Log</a>
  <a class="nav-btn" href="#vetting-check">Vetting Check</a>
  <a class="nav-btn" href="#vetting-pass">Vetting Pass</a>
  <a class="nav-btn" href="#vetting-fail">Vetting Fail</a>
  <a class="nav-btn" href="#rank-log">Rank Log</a>
  <a class="nav-btn" href="#cases">Cases View</a>
  <a class="nav-btn" href="#ticket-log">Ticket Log</a>
</nav>

<!-- ── 1. MODERATION LOG ── -->
<div class="section" id="mod-log">
  <div class="section-label">1 · Moderation Action Log</div>
  <div class="channel-ctx">#mod-logs &nbsp;·&nbsp; Today at 14:32</div>
  <div class="msg">
    <div class="avatar av-blue">🛡️</div>
    <div style="flex:1">
      <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">Today at 14:32</span></div>
      <div class="embed" style="border-left:4px solid #e74c3c; max-width:480px">
        <div class="embed-title">Moderation Action</div>
        <div class="fields fields-2" style="margin-bottom:8px">
          <div><div class="field-label">User</div><div class="field-value"><span class="mention">@ShadyUser</span><br><span class="muted">314159265358979323</span></div></div>
          <div><div class="field-label">Moderator</div><div class="field-value"><span class="mention">@Titan_Mod</span><br><span class="muted">271828182845904523</span></div></div>
          <div><div class="field-label">Action</div><div class="field-value fw700 red">🔨 Ban</div></div>
          <div><div class="field-label">Duration</div><div class="field-value">Permanent</div></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">Reason</div><div class="field-value">Repeated violations of community guidelines after multiple warnings. Harassment of members in DMs.</div></div>
        <div style="margin-bottom:10px"><div class="field-label">Evidence</div><div class="field-value blue" style="text-decoration:underline;cursor:pointer">#mod-evidence › Screenshot 2026-06-24</div></div>
        <div class="embed-footer" style="display:flex;justify-content:space-between"><span>Case ID: #0042</span><span>June 24, 2026 at 14:32</span></div>
      </div>
    </div>
  </div>
</div>

<!-- ── 2. VETTING CHECK ── -->
<div class="section" id="vetting-check">
  <div class="section-label">2 · Vetting Check Embed</div>
  <div class="channel-ctx">#vetting &nbsp;·&nbsp; Today at 09:15</div>
  <div class="msg">
    <div class="avatar av-blue">🛡️</div>
    <div style="flex:1">
      <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">Today at 09:15</span></div>
      <div class="embed" style="border-left:4px solid #5865F2; max-width:500px">
        <div class="embed-author"><div class="embed-author-icon">🛡</div><span class="embed-author-name">Hideaway Moderation Team</span></div>
        <div class="embed-title">Level 2 Vetting Check</div>
        <div class="blockquote">
          Vetting Level: <strong>Level 2 — Community</strong><br>
          Authorisation: <span class="mention">@Sr_Moderator</span> — <span class="muted">271828182845904523</span><br>
          Reason: Requested after 30-day activity review and vouches from 3 members.
        </div>
        <div class="fields fields-3" style="margin-bottom:10px">
          <div><div class="field-label">Member Information</div><div class="field-value"><span class="mention">@NewMember</span><br><span class="muted">👤 314159265358979323</span></div></div>
          <div><div class="field-label">Server Join Date</div><div class="field-value">📅 Jan 15, 2026<br><span class="muted">161 days ago</span></div></div>
          <div><div class="field-label">Account Creation</div><div class="field-value">📅 Mar 22, 2023<br><span class="muted">3 yrs ago</span></div></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">⚠️ Active Moderation Sanctions</div>
          <div class="inset"><span class="gold">• </span><span class="field-value">Warn #001</span> — <span class="muted">Spam in #general</span> · expires <span class="mention">&lt;t:1751234567:R&gt;</span><br><span class="muted" style="font-style:italic">• No active bans or mutes</span></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">🥇 Rank History</div>
          <div class="inset"><span class="green">➕</span> <span class="field-value">Community Member</span> added by <span class="mention">@Mod_Alpha</span> · <span class="muted">Mar 1, 2026</span><br><span class="green">➕</span> <span class="field-value">Level 1 Verified</span> added by <span class="mention">@Mod_Beta</span> · <span class="muted">Feb 10, 2026</span></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">📋 Google Groups</div>
          <div class="inset">Linked: <span class="green">✅</span> <span class="blue">member@gmail.com</span><br>community-announcements@hideaway.gg <span class="green">✅</span><br>level2-resources@hideaway.gg <span class="red">❌</span></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">🗒️ Internal Notes</div>
          <div class="inset"><span class="mention">@Sr_Moderator</span> <span class="muted">(Jun 1, 2026):</span> Good standing, active in events. Recommend approval.</div>
        </div>
        <div class="embed-footer">Vetting ID: LEV//USR//0023//314159265358979323</div>
      </div>
    </div>
  </div>
</div>

<!-- ── 3. VETTING PASS ── -->
<div class="section" id="vetting-pass">
  <div class="section-label">3 · Vetting Pass Log</div>
  <div class="channel-ctx">#vetting-log &nbsp;·&nbsp; Today at 10:44</div>
  <div class="msg">
    <div class="avatar av-green">✅</div>
    <div style="flex:1">
      <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">Today at 10:44</span></div>
      <div class="embed" style="border-left:4px solid #57F287; max-width:480px">
        <div class="embed-title">Vetting Request – Level 2</div>
        <div class="fields fields-2" style="margin-bottom:8px">
          <div><div class="field-label">User</div><div class="field-value"><span class="mention">@NewMember</span> <span class="muted">314159265358979323</span></div></div>
          <div><div class="field-label">Vetting Standard</div><div class="field-value">Level 2 — Community</div></div>
          <div><div class="field-label">Requesting Member</div><div class="field-value"><span class="mention">@Sr_Moderator</span></div></div>
          <div><div class="field-label">Reason</div><div class="field-value">30-day review, 3 vouches.</div></div>
        </div>
        <div style="margin-bottom:10px"><div class="field-label">Result</div><div class="tag"><span style="font-size:16px">✅</span><span class="green fw700">PASS</span></div></div>
        <div class="inset" style="margin-bottom:10px"><span class="green fw700">✅ Actions Taken</span><br>• Role <strong>Level 2 Verified</strong> assigned<br>• Google Group <code>level2-resources@hideaway.gg</code> enrolled<br>• DM notification sent to member</div>
        <div class="embed-footer">Vetting Number: LEV//USR//0023//314159265358979323</div>
      </div>
    </div>
  </div>
</div>

<!-- ── 4. VETTING FAIL ── -->
<div class="section" id="vetting-fail">
  <div class="section-label">4 · Vetting Fail Log</div>
  <div class="channel-ctx">#vetting-log &nbsp;·&nbsp; Today at 11:02</div>
  <div class="msg">
    <div class="avatar av-red">❌</div>
    <div style="flex:1">
      <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">Today at 11:02</span></div>
      <div class="embed" style="border-left:4px solid #ED4245; max-width:480px">
        <div class="embed-title">Vetting Request – Level 2</div>
        <div class="fields fields-2" style="margin-bottom:8px">
          <div><div class="field-label">User</div><div class="field-value"><span class="mention">@AnotherUser</span> <span class="muted">271828182845904000</span></div></div>
          <div><div class="field-label">Vetting Standard</div><div class="field-value">Level 2 — Community</div></div>
          <div><div class="field-label">Requesting Member</div><div class="field-value"><span class="mention">@Moderator_X</span></div></div>
          <div><div class="field-label">Reason</div><div class="field-value">Insufficient activity period.</div></div>
        </div>
        <div style="margin-bottom:8px"><div class="field-label">Result</div><div class="tag"><span style="font-size:16px">❌</span><span class="red fw700">FAIL</span></div></div>
        <div style="margin-bottom:10px"><div class="field-label">Fail Reason</div>
          <div class="inset inset-bl">Member has only been in the server for 12 days. Minimum is 30 days. Additionally, two of the three vouch members do not meet eligibility criteria (Level 3+ required).</div>
        </div>
        <div class="inset" style="margin-bottom:10px"><span class="red fw700">ℹ️ No Actions Taken</span><br><span class="muted">Member roles unchanged. May reapply after 30-day minimum is met.</span></div>
        <div class="embed-footer">Vetting Number: LEV//USR//0024//271828182845904000</div>
      </div>
    </div>
  </div>
</div>

<!-- ── 5. RANK LOG ── -->
<div class="section" id="rank-log">
  <div class="section-label">5 · Rank Change Log</div>
  <div class="row">
    <div>
      <div class="channel-ctx">#rank-log &nbsp;·&nbsp; Addition · 13:20</div>
      <div class="msg">
        <div class="avatar av-green">🎖️</div>
        <div style="flex:1">
          <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">13:20</span></div>
          <div class="embed" style="border-left:4px solid #57F287; max-width:460px">
            <div class="embed-title">Rank Changed — Addition</div>
            <div class="fields fields-3" style="margin-bottom:8px">
              <div><div class="field-label">👤 User</div><div class="field-value">CoolMember<br><span class="muted">314159265358979323</span></div></div>
              <div><div class="field-label">🎖️ Role Added</div><div class="field-value green fw700">Level 2 Verified</div></div>
              <div><div class="field-label">🛡️ Issued By</div><div class="field-value">Sr_Moderator<br><span class="muted">→ mod_sr</span></div></div>
            </div>
            <div class="fields fields-2" style="margin-bottom:8px">
              <div><div class="field-label">🗑️ Roles Removed</div><div class="field-value yellow">Level 1 Verified</div></div>
              <div><div class="field-label">📋 Reason</div><div class="field-value">Passed Level 2 vetting process.</div></div>
            </div>
            <div><div class="field-label">📊 Status</div><div class="tag green fw700">✅ SUCCESS</div></div>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="channel-ctx">#rank-log &nbsp;·&nbsp; Removal · 13:45</div>
      <div class="msg">
        <div class="avatar av-yellow">🔴</div>
        <div style="flex:1">
          <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">13:45</span></div>
          <div class="embed" style="border-left:4px solid #FEE75C; max-width:460px">
            <div class="embed-title">🔴 Rank Changed — Removal</div>
            <div class="fields fields-3" style="margin-bottom:8px">
              <div><div class="field-label">👤 User</div><div class="field-value">ProblematicUser<br><span class="muted">271828182845904000</span></div></div>
              <div><div class="field-label">🎖️ Role Removed</div><div class="field-value red fw700">Level 2 Verified</div></div>
              <div><div class="field-label">🛡️ Issued By</div><div class="field-value">Admin_Lead<br><span class="muted">→ admin_lead</span></div></div>
            </div>
            <div class="fields fields-2" style="margin-bottom:8px">
              <div><div class="field-label">✅ Authorisation</div><div class="field-value">Council vote #2026-06-24</div></div>
              <div><div class="field-label">📋 Reason</div><div class="field-value">Repeated conduct violations in Level 2 channels.</div></div>
            </div>
            <div><div class="field-label">📊 Status</div><div class="tag green fw700">✅ SUCCESS</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- ── 6. CASES VIEW ── -->
<div class="section" id="cases">
  <div class="section-label">6 · Cases View (Paginated)</div>
  <div class="channel-ctx">#mod-logs &nbsp;·&nbsp; Today at 15:00</div>
  <div class="msg">
    <div class="avatar av-blue">📋</div>
    <div style="flex:1">
      <div class="meta"><span class="username">TitanBot</span><span class="bot-badge">APP</span><span class="ts">Today at 15:00</span></div>
      <div class="embed" style="border-left:4px solid #5865F2; max-width:500px">
        <div class="embed-title">📋 Cases — The Hideaway</div>
        <div class="muted" style="margin-bottom:12px;font-size:12px">Showing 5 of 42 total cases · Filter: All types</div>
        <div class="case-card" style="border-left:3px solid #faa81a"><div class="case-head"><div class="case-type"><span>⚠️</span><span class="gold fw700" style="font-size:13px">Warn</span><span class="muted" style="font-size:12px">#0001</span></div><span class="muted" style="font-size:11px">Jan 5, 2026</span></div><div class="field-value" style="font-size:12px;margin-bottom:3px">Spam in #general — multiple rapid messages.</div><div style="display:flex;gap:12px;font-size:11px"><span><span class="muted">User:</span> <span class="mention">@OffenderA</span></span><span><span class="muted">Mod:</span> <span class="mention">@Mod_Alpha</span></span></div></div>
        <div class="case-card" style="border-left:3px solid #fee75c"><div class="case-head"><div class="case-type"><span>🔇</span><span class="yellow fw700" style="font-size:13px">Mute</span><span class="muted" style="font-size:12px">#0012</span></div><span class="muted" style="font-size:11px">Feb 14, 2026</span></div><div class="field-value" style="font-size:12px;margin-bottom:3px">Heated argument in #debate — 2h mute.</div><div style="display:flex;gap:12px;font-size:11px"><span><span class="muted">User:</span> <span class="mention">@OffenderB</span></span><span><span class="muted">Mod:</span> <span class="mention">@Mod_Beta</span></span></div></div>
        <div class="case-card" style="border-left:3px solid #ed4245"><div class="case-head"><div class="case-type"><span>👢</span><span class="red fw700" style="font-size:13px">Kick</span><span class="muted" style="font-size:12px">#0028</span></div><span class="muted" style="font-size:11px">Mar 30, 2026</span></div><div class="field-value" style="font-size:12px;margin-bottom:3px">Alt account confirmed by IP check.</div><div style="display:flex;gap:12px;font-size:11px"><span><span class="muted">User:</span> <span class="mention">@OffenderC</span></span><span><span class="muted">Mod:</span> <span class="mention">@Mod_Alpha</span></span></div></div>
        <div class="case-card" style="border-left:3px solid #e74c3c"><div class="case-head"><div class="case-type"><span>🔨</span><span class="red fw700" style="font-size:13px">Ban</span><span class="muted" style="font-size:12px">#0041</span></div><span class="muted" style="font-size:11px">May 2, 2026</span></div><div class="field-value" style="font-size:12px;margin-bottom:3px">NSFW content posted in main channels. No prior warnings.</div><div style="display:flex;gap:12px;font-size:11px"><span><span class="muted">User:</span> <span class="mention">@OffenderD</span></span><span><span class="muted">Mod:</span> <span class="mention">@Admin_Lead</span></span></div></div>
        <div class="case-card" style="border-left:3px solid #faa81a"><div class="case-head"><div class="case-type"><span>⚠️</span><span class="gold fw700" style="font-size:13px">Warn</span><span class="muted" style="font-size:12px">#0042</span></div><span class="muted" style="font-size:11px">Jun 20, 2026</span></div><div class="field-value" style="font-size:12px;margin-bottom:3px">Minor rule violation — first offence.</div><div style="display:flex;gap:12px;font-size:11px"><span><span class="muted">User:</span> <span class="mention">@OffenderE</span></span><span><span class="muted">Mod:</span> <span class="mention">@Mod_Beta</span></span></div></div>
        <div class="pagination"><div style="display:flex;gap:6px"><button class="btn">◀ Prev</button><button class="btn">Next ▶</button></div><span class="muted">Page 1 / 9</span></div>
        <div class="embed-footer" style="margin-top:10px">Use /case &lt;id&gt; for full details of a specific case</div>
      </div>
    </div>
  </div>
</div>

<!-- ── 7. TICKET LOG ── -->
<div class="section" id="ticket-log">
  <div class="section-label">7 · Ticket Event Log</div>
  <div class="channel-ctx">#ticket-log &nbsp;·&nbsp; Today</div>
  <div style="max-width:520px">

    <div class="evt">
      <div class="evt-time">09:00</div>
      <div class="msg">
        <div class="ticket-avatar" style="background:#2ecc7133;border-color:#2ecc71">🎫</div>
        <div style="flex:1"><div class="meta"><span class="username" style="font-size:14px">TitanBot</span><span class="bot-badge" style="font-size:9px">APP</span></div>
        <div class="embed" style="border-left:4px solid #2ecc71;max-width:440px">
          <div class="embed-title" style="font-size:14px">🎫 Report Ticket Opened</div>
          <div class="fields fields-2" style="gap:4px 12px">
            <div><div class="field-label" style="font-size:10px">🪪 Ticket ID</div><div class="field-value" style="font-size:12px">1234567890-001-1</div></div>
            <div><div class="field-label" style="font-size:10px">🔢 Ticket Ref</div><div class="field-value" style="font-size:12px">report-001</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">🌐 Server</div><div class="field-value" style="font-size:12px">1234567890</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">👤 Opened by</div><div class="field-value" style="font-size:12px"><span class="mention">@Reporter</span> at Jun 24, 2026 09:00</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">📋 Reason</div><div class="field-value" style="font-size:12px"><code>Harassment from user @Problematic in #general — screenshots attached.</code></div></div>
          </div>
        </div></div>
      </div>
    </div>

    <div class="evt">
      <div class="evt-time">09:07</div>
      <div class="msg">
        <div class="ticket-avatar" style="background:#3498db33;border-color:#3498db">🙋</div>
        <div style="flex:1"><div class="meta"><span class="username" style="font-size:14px">TitanBot</span><span class="bot-badge" style="font-size:9px">APP</span></div>
        <div class="embed" style="border-left:4px solid #3498db;max-width:440px">
          <div class="embed-title" style="font-size:14px">🙋 Ticket Claimed</div>
          <div class="fields fields-2" style="gap:4px 12px">
            <div><div class="field-label" style="font-size:10px">🪪 Ticket ID</div><div class="field-value" style="font-size:12px">1234567890-001-1</div></div>
            <div><div class="field-label" style="font-size:10px">🔢 Ticket Ref</div><div class="field-value" style="font-size:12px">report-001</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">🙋 Claimed by</div><div class="field-value" style="font-size:12px"><span class="mention">@Sr_Moderator</span> at Jun 24, 2026 09:07</div></div>
          </div>
        </div></div>
      </div>
    </div>

    <div class="evt">
      <div class="evt-time">09:10</div>
      <div class="msg">
        <div class="ticket-avatar" style="background:#9b59b633;border-color:#9b59b6">🎯</div>
        <div style="flex:1"><div class="meta"><span class="username" style="font-size:14px">TitanBot</span><span class="bot-badge" style="font-size:9px">APP</span></div>
        <div class="embed" style="border-left:4px solid #9b59b6;max-width:440px">
          <div class="embed-title" style="font-size:14px">🎯 Priority Updated</div>
          <div class="fields fields-2" style="gap:4px 12px">
            <div><div class="field-label" style="font-size:10px">🪪 Ticket ID</div><div class="field-value" style="font-size:12px">1234567890-001-1</div></div>
            <div><div class="field-label" style="font-size:10px">🔢 Ticket Ref</div><div class="field-value" style="font-size:12px">report-001</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">📋 Reason</div><div class="field-value" style="font-size:12px"><code>Escalated — involves banned alt account.</code></div></div>
          </div>
        </div></div>
      </div>
    </div>

    <div class="evt">
      <div class="evt-time">09:22</div>
      <div class="msg">
        <div class="ticket-avatar" style="background:#1abc9c33;border-color:#1abc9c">📜</div>
        <div style="flex:1"><div class="meta"><span class="username" style="font-size:14px">TitanBot</span><span class="bot-badge" style="font-size:9px">APP</span></div>
        <div class="embed" style="border-left:4px solid #1abc9c;max-width:440px">
          <div class="embed-title" style="font-size:14px">📜 Transcript Created</div>
          <div class="fields fields-2" style="gap:4px 12px">
            <div><div class="field-label" style="font-size:10px">🪪 Ticket ID</div><div class="field-value" style="font-size:12px">1234567890-001-1</div></div>
            <div><div class="field-label" style="font-size:10px">🔢 Ticket Ref</div><div class="field-value" style="font-size:12px">report-001</div></div>
          </div>
        </div></div>
      </div>
    </div>

    <div class="evt">
      <div class="evt-time">09:25</div>
      <div class="msg">
        <div class="ticket-avatar" style="background:#e74c3c33;border-color:#e74c3c">🔓</div>
        <div style="flex:1"><div class="meta"><span class="username" style="font-size:14px">TitanBot</span><span class="bot-badge" style="font-size:9px">APP</span></div>
        <div class="embed" style="border-left:4px solid #e74c3c;max-width:440px">
          <div class="embed-title" style="font-size:14px">🔓 Report Ticket Closed</div>
          <div class="fields fields-2" style="gap:4px 12px">
            <div><div class="field-label" style="font-size:10px">🪪 Ticket ID</div><div class="field-value" style="font-size:12px">1234567890-001-1</div></div>
            <div><div class="field-label" style="font-size:10px">🔢 Ticket Ref</div><div class="field-value" style="font-size:12px">report-001</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">🕐 Closed by</div><div class="field-value" style="font-size:12px"><span class="mention">@Sr_Moderator</span> at Jun 24, 2026 09:25</div></div>
            <div style="grid-column:span 2"><div class="field-label" style="font-size:10px">📋 Reason</div><div class="field-value" style="font-size:12px"><code>Resolved. User issued 7-day ban. Evidence archived.</code></div></div>
          </div>
        </div></div>
      </div>
    </div>

  </div>
</div>

</body>
</html>`;
}

export default TitanBot;



