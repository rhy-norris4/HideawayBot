const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;

function numFmt(n) {
    if (!n && n !== 0) return '0';
    n = Number(n);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString();
}

function xpForLevel(level) {
    return 5 * level * level + 50 * level + 50;
}

function colorHex(int) {
    if (!int && int !== 0) return '#5865F2';
    return '#' + int.toString(16).padStart(6, '0').toUpperCase();
}

function uptimeStr() {
    const s = Math.floor(process.uptime());
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function avatarUrl(user) {
    if (!user) return `https://cdn.discordapp.com/embed/avatars/0.png`;
    if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    const disc = user.discriminator && user.discriminator !== '0'
        ? parseInt(user.discriminator) % 5
        : Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${disc}.png`;
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0c0d14;
    --surface: #13141d;
    --surface-2: #191b28;
    --border: #22253a;
    --text: #dde0f0;
    --muted: #7a7e9e;
    --accent: #5865F2;
    --accent-d: #4752c4;
    --gold: #e8a838;
    --silver: #a0a8c0;
    --bronze: #c08b5c;
    --green: #3ba55d;
    --red: #ed4245;
    --radius: 10px;
    --nav-h: 60px;
  }
  html { scroll-behavior: smooth; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 15px;
    line-height: 1.55;
    min-height: 100vh;
  }

  /* ── NAV ── */
  .topnav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    height: var(--nav-h);
    background: rgba(12,13,20,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 32px;
  }
  .nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .brand-icon { font-size: 22px; }
  .brand-name { color: var(--text); font-weight: 700; font-size: 17px; letter-spacing: -0.3px; }
  .brand-sub { color: var(--muted); font-size: 12px; font-weight: 500;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 2px 8px; border-radius: 20px; }
  .nav-links { display: flex; align-items: center; gap: 4px; }
  .nav-links a {
    color: var(--muted); text-decoration: none; font-size: 13.5px; font-weight: 500;
    padding: 6px 14px; border-radius: 6px; transition: all 0.15s;
  }
  .nav-links a:hover { background: var(--surface-2); color: var(--text); }
  .nav-links a.active { background: var(--surface-2); color: var(--text); }
  .nav-invite {
    background: var(--accent); color: #fff !important;
    padding: 7px 16px !important; border-radius: 7px !important;
  }
  .nav-invite:hover { background: var(--accent-d) !important; }

  /* ── LAYOUT ── */
  main { padding-top: calc(var(--nav-h) + 48px); padding-bottom: 80px; }
  .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* ── HERO ── */
  .hero { text-align: center; padding: 20px 0 64px; }
  /* ── BOT PRESENCE CARD ── */
  .bot-card {
    display: inline-flex; align-items: center; gap: 16px;
    background: var(--surface); border: 1px solid var(--border);
    padding: 14px 22px; border-radius: 16px; margin-bottom: 32px;
  }
  .bot-av-wrap { position: relative; flex-shrink: 0; }
  .bot-av {
    width: 64px; height: 64px; border-radius: 50%;
    border: 2px solid var(--border);
  }
  .bot-status-dot {
    position: absolute; bottom: 2px; right: 2px;
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--surface);
  }
  .bot-info { text-align: left; }
  .bot-info-name { font-size: 16px; font-weight: 700; color: #fff; }
  .bot-info-status {
    font-size: 12px; color: var(--muted); margin-top: 3px;
    display: flex; align-items: center; gap: 5px; text-transform: capitalize;
  }
  .status-online  { background: #3ba55d; }
  .status-idle    { background: #faa61a; }
  .status-dnd     { background: #ed4245; }
  .status-offline { background: #80848e; }

  .hero-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 5px 14px; border-radius: 20px;
    font-size: 12px; color: var(--muted); margin-bottom: 22px;
  }
  .hero-badge .dot { width: 7px; height: 7px; background: var(--green); border-radius: 50%; }
  .hero h1 {
    font-size: clamp(34px, 5vw, 56px); font-weight: 800; letter-spacing: -1.5px;
    color: #fff; line-height: 1.12; margin-bottom: 18px;
  }
  .hero h1 span { color: var(--accent); }
  .hero p {
    font-size: 17px; color: var(--muted); max-width: 520px;
    margin: 0 auto 32px; line-height: 1.6;
  }
  .hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .btn-primary {
    background: var(--accent); color: #fff; text-decoration: none;
    padding: 11px 26px; border-radius: 8px; font-weight: 600; font-size: 14px;
    transition: background 0.15s;
  }
  .btn-primary:hover { background: var(--accent-d); }
  .btn-secondary {
    background: var(--surface-2); color: var(--text); text-decoration: none;
    padding: 11px 26px; border-radius: 8px; font-weight: 600; font-size: 14px;
    border: 1px solid var(--border); transition: all 0.15s;
  }
  .btn-secondary:hover { background: var(--surface); border-color: #3a3e58; }

  /* ── STATS ROW ── */
  .stats-row {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px; margin-bottom: 56px;
  }
  .stat-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px 24px; text-align: center;
  }
  .stat-val { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -1px; }
  .stat-label { font-size: 12px; color: var(--muted); font-weight: 500; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

  /* ── FEATURES ── */
  .section-title {
    font-size: 11px; font-weight: 700; color: var(--muted); letter-spacing: 1.2px;
    text-transform: uppercase; margin-bottom: 20px;
  }
  .features-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px; margin-bottom: 56px;
  }
  .feature-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px 18px;
    transition: border-color 0.15s, transform 0.15s;
  }
  .feature-card:hover { border-color: #3a3e58; transform: translateY(-2px); }
  .feature-icon { font-size: 24px; margin-bottom: 10px; }
  .feature-name { font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 4px; }
  .feature-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }

  /* ── COMMANDS SECTION ── */
  .commands-grid {
    display: grid; gap: 8px; margin-bottom: 56px;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }
  .cmd-item {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px;
    display: flex; align-items: baseline; gap: 8px;
  }
  .cmd-name { font-family: 'Fira Code', 'Cascadia Code', monospace; font-size: 13px; color: var(--accent); font-weight: 600; }
  .cmd-desc { font-size: 12px; color: var(--muted); }

  /* ── MEDALS PAGE ── */
  .page-header { margin-bottom: 36px; }
  .page-header h1 { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; margin-bottom: 4px; }
  .page-header p { font-size: 14px; color: var(--muted); }
  .medals-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  .medal-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .medal-bar { height: 4px; }
  .medal-body { padding: 20px; }
  .medal-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
  .medal-thumb {
    width: 52px; height: 52px; border-radius: 8px; object-fit: cover;
    background: var(--surface-2); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 26px;
  }
  .medal-thumb img { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; }
  .medal-name { font-size: 16px; font-weight: 700; color: #fff; }
  .medal-count { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .recipient-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .recipient-item {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--text);
  }
  .recipient-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--surface-2); flex-shrink: 0;
  }
  .no-recipients { font-size: 13px; color: var(--muted); font-style: italic; }
  .empty-state {
    text-align: center; padding: 80px 24px;
    color: var(--muted); font-size: 14px;
  }
  .empty-state .icon { font-size: 40px; margin-bottom: 12px; }

  /* ── LEADERBOARD PAGE ── */
  .lb-tabs { display: flex; gap: 8px; margin-bottom: 24px; }
  .lb-tab {
    padding: 8px 20px; border-radius: 7px; font-size: 13px; font-weight: 600;
    cursor: pointer; border: 1px solid var(--border); background: var(--surface);
    color: var(--muted); transition: all 0.15s;
  }
  .lb-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  .lb-tab:hover:not(.active) { background: var(--surface-2); color: var(--text); }
  .lb-panel { display: none; }
  .lb-panel.active { display: block; }
  .lb-table { width: 100%; border-collapse: collapse; }
  .lb-table thead th {
    text-align: left; padding: 10px 14px;
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
    color: var(--muted); border-bottom: 1px solid var(--border);
  }
  .lb-table tbody tr {
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
  }
  .lb-table tbody tr:last-child { border-bottom: none; }
  .lb-table tbody tr:hover { background: var(--surface-2); }
  .lb-table td { padding: 12px 14px; }
  .lb-rank {
    font-size: 13px; font-weight: 700; width: 36px;
    color: var(--muted); text-align: center;
  }
  .lb-rank.gold   { color: var(--gold); }
  .lb-rank.silver { color: var(--silver); }
  .lb-rank.bronze { color: var(--bronze); }
  .lb-user { display: flex; align-items: center; gap: 10px; }
  .lb-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--surface-2); }
  .lb-username { font-weight: 600; font-size: 14px; color: var(--text); }
  .lb-val { font-size: 13px; font-weight: 700; color: #fff; }
  .lb-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
  .lb-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .lb-loading { text-align: center; padding: 48px; color: var(--muted); font-size: 14px; }

  /* ── MEMBERS PAGE ── */
  .members-search-wrap {
    display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
  }
  .members-search {
    flex: 1; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 10px 16px; color: var(--text);
    font-size: 14px; font-family: inherit; outline: none;
  }
  .members-search:focus { border-color: var(--accent); }
  .members-search::placeholder { color: var(--muted); }
  .members-count { font-size: 13px; color: var(--muted); white-space: nowrap; }
  .members-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
  }
  .member-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px 18px;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    text-decoration: none; color: inherit; transition: border-color .15s, transform .15s;
  }
  .member-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .member-card-av {
    width: 64px; height: 64px; border-radius: 50%;
    border: 2px solid var(--border); margin-bottom: 12px;
  }
  .member-card-name { font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px; word-break: break-word; }
  .member-card-level {
    display: inline-block; font-size: 11px; font-weight: 700;
    background: var(--accent); color: #fff; border-radius: 20px;
    padding: 2px 10px; margin-bottom: 10px;
  }
  .member-card-stats { font-size: 12px; color: var(--muted); line-height: 1.7; }

  /* ── PROFILE PAGE ── */
  .profile-hero {
    display: flex; align-items: center; gap: 24px;
    padding: 36px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); margin-bottom: 24px;
  }
  .profile-avatar {
    width: 88px; height: 88px; border-radius: 50%;
    border: 3px solid var(--border); flex-shrink: 0;
  }
  .profile-name { font-size: 26px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .profile-id { font-size: 12px; color: var(--muted); margin-top: 3px; font-family: monospace; }
  .profile-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px; margin-bottom: 24px;
  }
  .profile-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 22px;
  }
  .profile-card-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 1px; color: var(--muted); margin-bottom: 14px;
  }
  .profile-stat { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .profile-stat:last-child { margin-bottom: 0; }
  .profile-stat-label { font-size: 13px; color: var(--muted); }
  .profile-stat-val { font-size: 14px; font-weight: 700; color: var(--text); }
  .xp-bar-wrap { margin-top: 14px; }
  .xp-bar-label { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
  .xp-bar-bg { background: var(--surface-2); border-radius: 99px; height: 8px; overflow: hidden; }
  .xp-bar-fill { height: 100%; border-radius: 99px; background: var(--accent); }
  .profile-medals { display: flex; flex-direction: column; gap: 8px; }
  .profile-medal-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: var(--surface-2);
    border-radius: 8px; border: 1px solid var(--border);
  }
  .profile-medal-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .profile-medal-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .profile-back { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 13px; text-decoration: none; margin-bottom: 20px; }
  .profile-back:hover { color: var(--text); }

  /* ── FOOTER ── */
  footer {
    border-top: 1px solid var(--border); padding: 28px 24px;
    text-align: center; font-size: 12px; color: var(--muted);
  }
  footer a { color: var(--muted); text-decoration: none; }
  footer a:hover { color: var(--text); }

  /* ── RESPONSIVE ── */
  @media (max-width: 600px) {
    .topnav { padding: 0 16px; }
    .brand-sub { display: none; }
    .container { padding: 0 16px; }
    .features-grid { grid-template-columns: 1fr 1fr; }
    .stats-row { grid-template-columns: 1fr 1fr; }
  }
`;

function layout(title, body, activeNav) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — The Hideaway</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>">
<style>${CSS}</style>
</head>
<body>
<nav class="topnav">
  <a class="nav-brand" href="/">
    <span class="brand-icon">🛡️</span>
    <span class="brand-name">Hideaway</span>
    <span class="brand-sub">TitanBot</span>
  </a>
  <div class="nav-links">
    <a href="/" ${activeNav === 'home' ? 'class="active"' : ''}>Home</a>
    <a href="/medals" ${activeNav === 'medals' ? 'class="active"' : ''}>Medals</a>
    <a href="/leaderboard" ${activeNav === 'leaderboard' ? 'class="active"' : ''}>Leaderboard</a>
    <a href="/members" ${activeNav === 'members' ? 'class="active"' : ''}>Members</a>
    <a href="https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID || ''}&permissions=8&scope=bot%20applications.commands" target="_blank" class="nav-invite">+ Invite</a>
  </div>
</nav>
<main>${body}</main>
<footer>
  <p>TitanBot &nbsp;·&nbsp; Built for <strong>The Hideaway</strong> &nbsp;·&nbsp; <a href="/health">Status</a></p>
</footer>
</body>
</html>`;
}

function homePage(guild, client) {
    const commandCount = 65;

    const features = [
        { icon: '🛡️', name: 'Moderation', desc: 'Bans, kicks, warns, timeouts, mutes and case tracking.' },
        { icon: '💰', name: 'Economy', desc: 'Wallet, bank, shop, work, rob and investment system.' },
        { icon: '⭐', name: 'Leveling & XP', desc: 'Message XP, rank cards, level-up roles and leaderboards.' },
        { icon: '🎟️', name: 'Tickets', desc: 'Support tickets with staff assignment and transcripts.' },
        { icon: '🏅', name: 'Medals', desc: 'Achievement medals with a live display board.' },
        { icon: '🎓', name: 'Qualifications', desc: 'Role-based qualifications with audit logs.' },
        { icon: '🎁', name: 'Giveaways', desc: 'Timed giveaways with winner selection and rerolls.' },
        { icon: '🎂', name: 'Birthdays', desc: 'Birthday tracking with automated role and announcements.' },
        { icon: '🎭', name: 'Reaction Roles', desc: 'Self-assign roles via emoji reactions or buttons.' },
    ];

    const featureCards = features.map(f => `
      <div class="feature-card">
        <div class="feature-icon">${f.icon}</div>
        <div class="feature-name">${f.name}</div>
        <div class="feature-desc">${f.desc}</div>
      </div>`).join('');

    const commands = [
        { name: '/ban', desc: 'Ban a member' },
        { name: '/kick', desc: 'Kick a member' },
        { name: '/warn', desc: 'Issue a warning' },
        { name: '/timeout', desc: 'Mute for a duration' },
        { name: '/cases', desc: 'View moderation cases' },
        { name: '/balance', desc: 'Check your wallet & bank' },
        { name: '/work', desc: 'Earn economy coins' },
        { name: '/shop', desc: 'Browse the item shop' },
        { name: '/rank', desc: 'View your XP rank card' },
        { name: '/leaderboard', desc: 'Top members by XP' },
        { name: '/ticket', desc: 'Open a support ticket' },
        { name: '/medal', desc: 'Manage & view medals' },
        { name: '/qualification', desc: 'Grant qualifications' },
        { name: '/giveaway', desc: 'Create a giveaway' },
        { name: '/birthday', desc: 'Set your birthday' },
        { name: '/reactionrole', desc: 'Configure reaction roles' },
        { name: '/logging', desc: 'Configure log channels' },
        { name: '/collect', desc: 'Collect role income' },
    ];

    const cmdItems = commands.map(c => `
      <div class="cmd-item">
        <span class="cmd-name">${c.name}</span>
        <span class="cmd-desc">— ${c.desc}</span>
      </div>`).join('');

    return layout('Home', `
<div class="container">
  <div class="hero">
    <div class="bot-card" id="bot-card">
      <div class="bot-av-wrap">
        <img class="bot-av" id="bot-av" src="https://cdn.discordapp.com/embed/avatars/0.png" alt="TitanBot">
        <div class="bot-status-dot status-offline" id="bot-dot"></div>
      </div>
      <div class="bot-info">
        <div class="bot-info-name" id="bot-name">TitanBot</div>
        <div class="bot-info-status" id="bot-status">Connecting…</div>
      </div>
    </div>
    <h1>The bot behind<br><span>The Hideaway</span></h1>
    <p>TitanBot keeps The Hideaway running — moderation, economy, leveling, medals and more, all in one place.</p>
    <div class="hero-btns">
      <a class="btn-primary" href="/leaderboard">View Leaderboard</a>
      <a class="btn-secondary" href="/medals">Medal Board</a>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-val" id="stat-members">—</div>
      <div class="stat-label">Members</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${commandCount}</div>
      <div class="stat-label">Commands</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="stat-uptime">—</div>
      <div class="stat-label">Uptime</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">9</div>
      <div class="stat-label">Feature Modules</div>
    </div>
  </div>

  <div class="section-title">What TitanBot does</div>
  <div class="features-grid">${featureCards}</div>

  <div class="section-title">Popular commands</div>
  <div class="commands-grid">${cmdItems}</div>
</div>
<script>
  const STATUS_LABELS = { online:'Online', idle:'Idle', dnd:'Do Not Disturb', offline:'Offline', invisible:'Invisible' };
  async function loadStatus() {
    try {
      const d = await fetch('/api/status').then(r => r.json());
      const dot  = document.getElementById('bot-dot');
      const av   = document.getElementById('bot-av');
      const name = document.getElementById('bot-name');
      const stat = document.getElementById('bot-status');
      if (d.avatar) av.src = d.avatar;
      if (d.username) { av.alt = d.username; name.textContent = d.username; }
      dot.className = 'bot-status-dot status-' + (d.status || 'offline');
      stat.textContent = STATUS_LABELS[d.status] ?? d.status ?? 'Unknown';
      if (d.members != null) document.getElementById('stat-members').textContent = d.members.toLocaleString();
      if (d.uptime)  document.getElementById('stat-uptime').textContent  = d.uptime;
    } catch { /* keep placeholders */ }
  }
  loadStatus();
  setInterval(loadStatus, 30000);
</script>`, 'home');
}

async function medalsPage(client, db) {
    const guild = client?.guilds?.cache?.get(GUILD_ID);
    const medals = await db.get(`medals_${GUILD_ID}`, {});
    const medalList = Object.values(medals).sort((a, b) => {
        const pa = a.position ?? Infinity;
        const pb = b.position ?? Infinity;
        if (pa !== pb) return pa - pb;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    if (medalList.length === 0) {
        return layout('Medal Board', `
<div class="container">
  <div class="page-header">
    <h1>🏅 Medal Board</h1>
    <p>Achievement medals awarded to members of The Hideaway.</p>
  </div>
  <div class="empty-state">
    <div class="icon">🏅</div>
    <p>No medals have been configured yet.</p>
  </div>
</div>`, 'medals');
    }

    const cards = await Promise.all(medalList.map(async medal => {
        const color = colorHex(medal.color);
        const role = guild?.roles?.cache?.get(medal.roleId);
        let recipients = [];
        if (role && guild) {
            recipients = [...guild.members.cache.values()]
                .filter(m => m.roles.cache.has(medal.roleId));
        }
        const thumb = medal.imageUrl
            ? `<img src="${medal.imageUrl}" alt="${medal.name}" loading="lazy">`
            : `<span>🏅</span>`;
        const recipientHtml = recipients.length > 0
            ? `<ul class="recipient-list">
                ${recipients.slice(0, 10).map(m => `
                  <li class="recipient-item">
                    <img class="recipient-avatar" src="${avatarUrl(m.user)}" alt="" loading="lazy">
                    ${m.displayName}
                  </li>`).join('')}
                ${recipients.length > 10 ? `<li class="no-recipients" style="font-style:normal;margin-top:4px">+${recipients.length - 10} more</li>` : ''}
               </ul>`
            : `<p class="no-recipients">No recipients yet.</p>`;

        return `
<div class="medal-card">
  <div class="medal-bar" style="background:${color}"></div>
  <div class="medal-body">
    <div class="medal-header">
      <div class="medal-thumb">${thumb}</div>
      <div>
        <div class="medal-name">${medal.name}</div>
        <div class="medal-count">${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    ${recipientHtml}
  </div>
</div>`;
    }));

    return layout('Medal Board', `
<div class="container">
  <div class="page-header">
    <h1>🏅 Medal Board</h1>
    <p>Achievement medals awarded to members of The Hideaway.</p>
  </div>
  <div class="medals-grid">${cards.join('')}</div>
</div>`, 'medals');
}

function leaderboardPage() {
    return layout('Leaderboard', `
<div class="container">
  <div class="page-header">
    <h1>🏆 Leaderboard</h1>
    <p>Top members of The Hideaway by XP and economy balance.</p>
  </div>
  <div class="lb-tabs">
    <button class="lb-tab active" onclick="showTab('xp', this)">⭐ XP &amp; Levels</button>
    <button class="lb-tab" onclick="showTab('eco', this)">💰 Economy</button>
  </div>
  <div class="lb-card">
    <div id="panel-xp" class="lb-panel active">
      <div class="lb-loading" id="loading-xp">Loading…</div>
      <table class="lb-table" id="table-xp" style="display:none">
        <thead><tr>
          <th style="width:50px">#</th>
          <th>Member</th>
          <th>Level</th>
          <th>Total XP</th>
        </tr></thead>
        <tbody id="body-xp"></tbody>
      </table>
    </div>
    <div id="panel-eco" class="lb-panel">
      <div class="lb-loading" id="loading-eco">Loading…</div>
      <table class="lb-table" id="table-eco" style="display:none">
        <thead><tr>
          <th style="width:50px">#</th>
          <th>Member</th>
          <th>Wallet</th>
          <th>Total</th>
        </tr></thead>
        <tbody id="body-eco"></tbody>
      </table>
    </div>
  </div>
</div>
<script>
  const loaded = { xp: false, eco: false };

  function rankClass(i) {
    if (i === 0) return 'lb-rank gold';
    if (i === 1) return 'lb-rank silver';
    if (i === 2) return 'lb-rank bronze';
    return 'lb-rank';
  }
  function rankIcon(i) {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
    return i + 1;
  }
  function numFmt(n) {
    n = Number(n);
    if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return n.toLocaleString();
  }
  function userCell(u) {
    const av = u.avatar
      ? \`https://cdn.discordapp.com/avatars/\${u.id}/\${u.avatar}.png?size=64\`
      : \`https://cdn.discordapp.com/embed/avatars/0.png\`;
    return \`<a href="/profile/\${u.id}" style="text-decoration:none;color:inherit">
      <div class="lb-user">
        <img class="lb-avatar" src="\${av}" alt="" loading="lazy">
        <span class="lb-username">\${u.username}</span>
      </div>
    </a>\`;
  }

  async function loadXp() {
    if (loaded.xp) return;
    try {
      const r = await fetch('/api/leaderboard/xp');
      const data = await r.json();
      const tbody = document.getElementById('body-xp');
      tbody.innerHTML = data.map((u, i) => \`<tr>
        <td class="\${rankClass(i)}">\${rankIcon(i)}</td>
        <td>\${userCell(u)}</td>
        <td><div class="lb-val">Lv \${u.level}</div></td>
        <td><div class="lb-val">\${numFmt(u.total_xp)} XP</div></td>
      </tr>\`).join('');
      document.getElementById('loading-xp').style.display = 'none';
      document.getElementById('table-xp').style.display = 'table';
      loaded.xp = true;
    } catch(e) {
      document.getElementById('loading-xp').textContent = 'Failed to load leaderboard.';
    }
  }

  async function loadEco() {
    if (loaded.eco) return;
    try {
      const r = await fetch('/api/leaderboard/economy');
      const data = await r.json();
      const tbody = document.getElementById('body-eco');
      tbody.innerHTML = data.map((u, i) => \`<tr>
        <td class="\${rankClass(i)}">\${rankIcon(i)}</td>
        <td>\${userCell(u)}</td>
        <td><div class="lb-val">🪙 \${numFmt(u.balance)}</div></td>
        <td><div class="lb-val">🪙 \${numFmt(u.total)}</div></td>
      </tr>\`).join('');
      document.getElementById('loading-eco').style.display = 'none';
      document.getElementById('table-eco').style.display = 'table';
      loaded.eco = true;
    } catch(e) {
      document.getElementById('loading-eco').textContent = 'Failed to load leaderboard.';
    }
  }

  function showTab(id, btn) {
    document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.lb-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + id).classList.add('active');
    if (id === 'xp') loadXp();
    else loadEco();
  }

  loadXp();
</script>`, 'leaderboard');
}

async function profilePage(client, db, userId) {
    const guild = client?.guilds?.cache?.get(GUILD_ID);

    let user = client?.users?.cache?.get(userId);
    if (!user) {
        try { user = await client.users.fetch(userId); } catch { /* not found */ }
    }
    if (!user) return null;

    const member = guild?.members?.cache?.get(userId)
        ?? await guild?.members?.fetch(userId).catch(() => null);

    const displayName = member?.displayName ?? user.username;
    const av = avatarUrl(user);

    const pool = db?.db?.pool;
    let xpRow = null, ecoRow = null, xpRank = null, ecoRank = null;
    if (pool) {
        const [xpRes, ecoRes] = await Promise.all([
            pool.query(`SELECT xp, level, total_xp FROM user_levels WHERE guild_id=$1 AND user_id=$2`, [GUILD_ID, userId]).catch(() => null),
            pool.query(`SELECT balance, bank FROM economy WHERE guild_id=$1 AND user_id=$2`, [GUILD_ID, userId]).catch(() => null),
        ]);
        xpRow  = xpRes?.rows?.[0]  ?? null;
        ecoRow = ecoRes?.rows?.[0] ?? null;

        if (xpRow) {
            const rankRes = await pool.query(
                `SELECT COUNT(*)+1 AS rank FROM user_levels WHERE guild_id=$1 AND total_xp > $2`,
                [GUILD_ID, xpRow.total_xp]
            ).catch(() => null);
            xpRank = rankRes?.rows?.[0]?.rank ? Number(rankRes.rows[0].rank) : null;
        }
        if (ecoRow) {
            const ecoTotal = Number(ecoRow.balance) + Number(ecoRow.bank);
            const rankRes = await pool.query(
                `SELECT COUNT(*)+1 AS rank FROM economy WHERE guild_id=$1 AND (balance+bank) > $2`,
                [GUILD_ID, ecoTotal]
            ).catch(() => null);
            ecoRank = rankRes?.rows?.[0]?.rank ? Number(rankRes.rows[0].rank) : null;
        }
    }

    const level   = xpRow ? Number(xpRow.level) : 0;
    const xp      = xpRow ? Number(xpRow.xp) : 0;
    const totalXp = xpRow ? Number(xpRow.total_xp) : 0;
    const xpNeeded = xpForLevel(level);
    const pct = xpNeeded > 0 ? Math.min(100, Math.round((xp / xpNeeded) * 100)) : 0;

    const wallet = ecoRow ? Number(ecoRow.balance) : 0;
    const bank   = ecoRow ? Number(ecoRow.bank) : 0;

    const medals = await db.get(`medals_${GUILD_ID}`, {});
    const heldMedals = Object.values(medals).filter(m =>
        member?.roles?.cache?.has(m.roleId)
    );

    const qualConfig = await db.get(`qualification_config_${GUILD_ID}`, {});
    const heldQuals = Object.entries(qualConfig)
        .filter(([, roleId]) => member?.roles?.cache?.has(roleId))
        .map(([name]) => name);

    const medalHtml = heldMedals.length > 0
        ? heldMedals.map(m => `
            <div class="profile-medal-item">
              <div class="profile-medal-dot" style="background:${colorHex(m.color)}"></div>
              <span class="profile-medal-name">${m.name}</span>
            </div>`).join('')
        : `<p style="font-size:13px;color:var(--muted);font-style:italic">No medals yet.</p>`;

    const qualHtml = heldQuals.length > 0
        ? heldQuals.map(q => `
            <div class="profile-medal-item">
              <div class="profile-medal-dot" style="background:var(--accent)"></div>
              <span class="profile-medal-name">${q}</span>
            </div>`).join('')
        : `<p style="font-size:13px;color:var(--muted);font-style:italic">No qualifications yet.</p>`;

    return layout(`${displayName}'s Profile`, `
<div class="container">
  <a class="profile-back" href="/members">← Back to members</a>
  <div class="profile-hero">
    <img class="profile-avatar" src="${av}" alt="${displayName}">
    <div>
      <div class="profile-name">${displayName}</div>
      ${user.username !== displayName ? `<div style="font-size:13px;color:var(--muted);margin-top:2px">@${user.username}</div>` : ''}
      <div class="profile-id">${userId}</div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        ${xpRank  ? `<span style="font-size:12px;background:var(--surface-2);border:1px solid var(--border);padding:3px 10px;border-radius:20px;color:var(--text)">⭐ XP Rank #${xpRank}</span>` : ''}
        ${ecoRank ? `<span style="font-size:12px;background:var(--surface-2);border:1px solid var(--border);padding:3px 10px;border-radius:20px;color:var(--text)">💰 Eco Rank #${ecoRank}</span>` : ''}
      </div>
    </div>
  </div>
  <div class="profile-grid">
    <div class="profile-card">
      <div class="profile-card-title">⭐ XP &amp; Leveling</div>
      <div class="profile-stat">
        <span class="profile-stat-label">Level</span>
        <span class="profile-stat-val">${level}</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">Total XP</span>
        <span class="profile-stat-val">${numFmt(totalXp)}</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">Progress</span>
        <span class="profile-stat-val">${numFmt(xp)} / ${numFmt(xpNeeded)}</span>
      </div>
      <div class="xp-bar-wrap">
        <div class="xp-bar-label">
          <span>Lv ${level}</span><span>Lv ${level + 1}</span>
        </div>
        <div class="xp-bar-bg">
          <div class="xp-bar-fill" style="width:${pct}%"></div>
        </div>
      </div>
    </div>
    <div class="profile-card">
      <div class="profile-card-title">💰 Economy</div>
      <div class="profile-stat">
        <span class="profile-stat-label">Wallet</span>
        <span class="profile-stat-val">🪙 ${numFmt(wallet)}</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">Bank</span>
        <span class="profile-stat-val">🪙 ${numFmt(bank)}</span>
      </div>
      <div class="profile-stat">
        <span class="profile-stat-label">Total</span>
        <span class="profile-stat-val">🪙 ${numFmt(wallet + bank)}</span>
      </div>
    </div>
    <div class="profile-card">
      <div class="profile-card-title">🏅 Medals</div>
      <div class="profile-medals">${medalHtml}</div>
    </div>
    <div class="profile-card">
      <div class="profile-card-title">🎓 Qualifications</div>
      <div class="profile-medals">${qualHtml}</div>
    </div>
  </div>
</div>`, '');
}

async function membersPage(client, db) {
    const guild = client?.guilds?.cache?.get(GUILD_ID);
    const pool  = db?.db?.pool;
    if (!pool) return layout('Members', `<div class="container"><div class="empty-state"><div class="icon">👥</div><p>Database unavailable.</p></div></div>`, 'members');

    const rows = await pool.query(
        `SELECT ul.user_id, ul.level, ul.total_xp,
                COALESCE(e.balance,0) AS balance, COALESCE(e.bank,0) AS bank
         FROM user_levels ul
         LEFT JOIN economy e ON e.user_id = ul.user_id AND e.guild_id = ul.guild_id
         WHERE ul.guild_id = $1
         ORDER BY ul.total_xp DESC LIMIT 100`,
        [GUILD_ID]
    ).catch(() => null);

    if (!rows?.rows?.length) {
        return layout('Members', `<div class="container"><div class="page-header"><h1>👥 Members</h1></div><div class="empty-state"><div class="icon">👥</div><p>No member data yet.</p></div></div>`, 'members');
    }

    const cards = rows.rows.map(row => {
        const user   = client?.users?.cache?.get(row.user_id);
        const member = guild?.members?.cache?.get(row.user_id);
        const name   = member?.displayName ?? user?.username ?? `User …${row.user_id.slice(-4)}`;
        const av     = user?.avatar
            ? `https://cdn.discordapp.com/avatars/${row.user_id}/${user.avatar}.png?size=128`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;
        const level  = Number(row.level);
        const xp     = Number(row.total_xp);
        const coins  = Number(row.balance) + Number(row.bank);
        return `<a class="member-card" href="/profile/${row.user_id}" data-name="${name.toLowerCase()}">
  <img class="member-card-av" src="${av}" alt="${name}" loading="lazy">
  <div class="member-card-name">${name}</div>
  <div class="member-card-level">Level ${level}</div>
  <div class="member-card-stats">
    ⭐ ${numFmt(xp)} XP<br>
    🪙 ${numFmt(coins)} coins
  </div>
</a>`;
    }).join('\n');

    return layout('Members', `
<div class="container">
  <div class="page-header">
    <h1>👥 Members</h1>
    <p>Active members of The Hideaway, ranked by XP.</p>
  </div>
  <div class="members-search-wrap">
    <input class="members-search" id="msearch" type="search" placeholder="Search members…" autocomplete="off">
    <span class="members-count" id="mcount">${rows.rows.length} members</span>
  </div>
  <div class="members-grid" id="mgrid">
    ${cards}
  </div>
</div>
<script>
  const search = document.getElementById('msearch');
  const grid   = document.getElementById('mgrid');
  const count  = document.getElementById('mcount');
  const cards  = [...grid.querySelectorAll('.member-card')];
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    let visible = 0;
    cards.forEach(c => {
      const show = !q || c.dataset.name.includes(q);
      c.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    count.textContent = visible + ' member' + (visible !== 1 ? 's' : '');
  });
</script>`, 'members');
}

async function getXpLeaderboard(client, db) {
    try {
        const pool = db?.db?.pool;
        if (!pool) return [];
        const result = await pool.query(
            `SELECT user_id, level, total_xp FROM user_levels WHERE guild_id = $1 ORDER BY total_xp DESC LIMIT 25`,
            [GUILD_ID]
        );
        return result.rows.map(row => {
            const user = client?.users?.cache?.get(row.user_id);
            return {
                id: row.user_id,
                username: user?.username ?? `User ${row.user_id.slice(-4)}`,
                avatar: user?.avatar ?? null,
                level: row.level,
                total_xp: Number(row.total_xp),
            };
        });
    } catch { return []; }
}

async function getEconomyLeaderboard(client, db) {
    try {
        const pool = db?.db?.pool;
        if (!pool) return [];
        const result = await pool.query(
            `SELECT user_id, balance, bank FROM economy WHERE guild_id = $1 ORDER BY (balance + bank) DESC LIMIT 25`,
            [GUILD_ID]
        );
        return result.rows.map(row => {
            const user = client?.users?.cache?.get(row.user_id);
            return {
                id: row.user_id,
                username: user?.username ?? `User ${row.user_id.slice(-4)}`,
                avatar: user?.avatar ?? null,
                balance: Number(row.balance),
                bank: Number(row.bank),
                total: Number(row.balance) + Number(row.bank),
            };
        });
    } catch { return []; }
}

export function setupWebRoutes(app, client, db) {
    app.get('/', (req, res) => {
        const guild = client?.guilds?.cache?.get(GUILD_ID);
        res.setHeader('Content-Type', 'text/html');
        res.send(homePage(guild, client));
    });

    app.get('/medals', async (req, res) => {
        try {
            res.setHeader('Content-Type', 'text/html');
            res.send(await medalsPage(client, db));
        } catch (err) {
            res.status(500).send('Error loading medals page.');
        }
    });

    app.get('/leaderboard', (req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.send(leaderboardPage());
    });

    app.get('/api/status', (req, res) => {
        const botUser = client?.user;
        const guild   = client?.guilds?.cache?.get(GUILD_ID);
        const ready   = client?.isReady?.() ?? false;
        const rawStatus = ready ? (botUser?.presence?.status || 'online') : 'offline';
        res.json({
            ready,
            status:   rawStatus,
            username: botUser?.username ?? 'TitanBot',
            avatar:   botUser?.avatar
                ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=128`
                : null,
            members:  guild?.memberCount ?? null,
            uptime:   uptimeStr(),
            guilds:   client?.guilds?.cache?.size ?? 0,
        });
    });

    app.get('/members', async (req, res) => {
        try {
            res.setHeader('Content-Type', 'text/html');
            res.send(await membersPage(client, db));
        } catch (err) {
            res.status(500).send('Error loading members page.');
        }
    });

    app.get('/api/medals', async (req, res) => {
        try {
            const guild = client?.guilds?.cache?.get(GUILD_ID);
            const medals = await db.get(`medals_${GUILD_ID}`, {});
            const medalList = Object.values(medals).sort((a, b) => {
                const pa = a.position ?? Infinity;
                const pb = b.position ?? Infinity;
                return pa !== pb ? pa - pb : (a.createdAt || '').localeCompare(b.createdAt || '');
            });
            const out = medalList.map(m => {
                const role = guild?.roles?.cache?.get(m.roleId);
                const recipients = role && guild
                    ? [...guild.members.cache.values()]
                        .filter(mb => mb.roles.cache.has(m.roleId))
                        .map(mb => ({ id: mb.id, name: mb.displayName }))
                    : [];
                return { name: m.name, color: colorHex(m.color), imageUrl: m.imageUrl, recipients };
            });
            res.json(out);
        } catch { res.status(500).json({ error: 'Failed to load medals' }); }
    });

    app.get('/profile/:userId', async (req, res) => {
        const { userId } = req.params;
        if (!/^\d{17,20}$/.test(userId)) return res.status(404).send('Not found');
        try {
            const html = await profilePage(client, db, userId);
            if (!html) return res.status(404).send(layout('Not Found', `
<div class="container"><div class="empty-state">
  <div class="icon">❓</div>
  <p>That member wasn't found in The Hideaway.</p>
  <a href="/leaderboard" class="btn-primary" style="display:inline-block;margin-top:16px">Back to leaderboard</a>
</div></div>`, ''));
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (err) {
            res.status(500).send('Error loading profile.');
        }
    });

    app.get('/api/leaderboard/xp', async (req, res) => {
        try {
            res.json(await getXpLeaderboard(client, db));
        } catch { res.status(500).json({ error: 'Failed to load XP leaderboard' }); }
    });

    app.get('/api/leaderboard/economy', async (req, res) => {
        try {
            res.json(await getEconomyLeaderboard(client, db));
        } catch { res.status(500).json({ error: 'Failed to load economy leaderboard' }); }
    });
}
