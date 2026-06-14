import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

function getContextualReply(message, clientUser) {
  const content = message.content.toLowerCase().trim();

  if (!content || content === `<@${clientUser.id}>` || content === `<@!${clientUser.id}>`) {
    return `Hey there, ${message.author.displayName ?? message.author.username}! 👋 How's your day going?`;
  }

  if (/\b(hi|hello|hey|sup|what'?s up|howdy|yo)\b/.test(content)) {
    return `Hey ${message.author.displayName ?? message.author.username}! 😊 Hope you're doing well!`;
  }

  if (/\b(how are you|how r u|you okay|you good|you alright)\b/.test(content)) {
    return `I'm doing great, thanks for asking! 😄 How about yourself?`;
  }

  if (/\b(help|can you|could you|please|assist)\b/.test(content)) {
    return `Happy to help! Try using one of my slash commands — type \`/\` to see what's available. 😊`;
  }

  if (/\b(good morning|morning|gm)\b/.test(content)) {
    return `Good morning! ☀️ Hope you have a great day, ${message.author.displayName ?? message.author.username}!`;
  }

  if (/\b(good night|goodnight|gn|night)\b/.test(content)) {
    return `Good night! 🌙 Sleep well, ${message.author.displayName ?? message.author.username}!`;
  }

  if (/\b(thank|thanks|thx|ty)\b/.test(content)) {
    return `You're welcome! 😊 Always happy to help.`;
  }

  if (/\b(bye|cya|see ya|farewell|later)\b/.test(content)) {
    return `See you later, ${message.author.displayName ?? message.author.username}! Take care 👋`;
  }

  if (/\?/.test(content)) {
    return `That's a good question! I'm not sure I can answer that one, but you can try one of my slash commands with \`/\`. 😅`;
  }

  const fallbacks = [
    `Hey ${message.author.displayName ?? message.author.username}! 👋 Anything I can help with?`,
    `Hey there! Feel free to use my slash commands — just type \`/\` to see what I can do! 😊`,
    `I'm here if you need anything! Try \`/\` to see my available commands. 😄`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      const isMentioned = message.mentions.has(client.user.id);

      let isReplyToBot = false;
      if (!isMentioned && message.reference) {
        const ref = await message.fetchReference().catch(() => null);
        isReplyToBot = ref?.author?.id === client.user.id;
      }

      if (isMentioned || isReplyToBot) {
        const reply = getContextualReply(message, client.user);
        await message.reply({ content: reply });
        return;
      }

      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) return;

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    if (!levelingConfig?.enabled) return;
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) return;

    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) return;
    }

    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) return;
    if (!message.content || message.content.trim().length === 0) return;

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);
    if (timeSinceLastMessage < cooldownTime * 1000) return;

    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;
    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);
    let finalXP = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    const result = await addXp(client, message.guild, message.member, finalXP);
    if (result.success && result.leveledUp) {
      logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}
