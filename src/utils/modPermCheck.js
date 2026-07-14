const TIER2_ROLES = [
  '1511500082053120020',
  '1511500077137399928',
  '1511500080031469790',
];

const TIER1_ROLES = [
  '1511500082753830992',
];

const RANK_ROLES = [
  '1511500080031469790',
  '1511500077137399928',
];

const TIER1_COMMANDS = new Set(['timeout', 'untimeout', 'warn']);

export function checkModPermission(member, commandName, subcommandName = null) {
  if (!member) return { allowed: false, message: '❌ Unable to verify your roles.' };

  if (commandName === 'rank') {
    const ok = member.roles.cache.some(r => RANK_ROLES.includes(r.id));
    return ok
      ? { allowed: true }
      : { allowed: false, message: '❌ You do not have permission to use the rank command.' };
  }

  if (member.roles.cache.some(r => TIER2_ROLES.includes(r.id))) {
    return { allowed: true };
  }

  if (member.roles.cache.some(r => TIER1_ROLES.includes(r.id))) {
    if (TIER1_COMMANDS.has(commandName)) return { allowed: true };
    if (commandName === 'internalnotes' && subcommandName === 'add') return { allowed: true };
    return { allowed: false, message: '❌ You do not have permission to use this moderation command.' };
  }

  return { allowed: false, message: '❌ You do not have the required role to use moderation commands.' };
}

export function hasModPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(r => [...TIER2_ROLES, ...TIER1_ROLES].includes(r.id));
}
