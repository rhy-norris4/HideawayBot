import { EmbedBuilder } from 'discord.js';
import { logger } from './logger.js';
import { getFromDb, setInDb } from './database.js';
import { getColor } from '../config/bot.js';

const MOD_LOG_CHANNEL_ID = '1514063528603160666';

const SANCTION_MAP = {
  'Member Banned': 'Ban',
  'Member Kicked': 'Kick',
  'Member Timed Out': 'Timeout',
  'User Warned': 'Warning',
  'Member Untimeouted': 'Timeout Removed',
  'Member Unbanned': 'Unban',
  'Messages Purged': 'Purge',
  'Channel Locked': 'Channel Lock',
  'Channel Unlocked': 'Channel Unlock',
  'DM Sent': 'Direct Message',
  'Warnings Viewed': 'Warnings Viewed',
};

export async function logEvent({ client, guild, guildId, event }) {
  try {
    if (!guild && guildId) {
      guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      logger.warn('logEvent invoked without valid guild or guildId');
      return;
    }

    const logChannel = guild.channels.cache.get(MOD_LOG_CHANNEL_ID)
      || await guild.channels.fetch(MOD_LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) {
      logger.warn(`Mod log channel ${MOD_LOG_CHANNEL_ID} not found in guild ${guild.id}`);
      return;
    }

    const sanction = SANCTION_MAP[event.action] || event.action;
    const moderatorId = event.metadata?.moderatorId;
    const moderatorMention = moderatorId
      ? `<@${moderatorId}> (${moderatorId})`
      : (event.executor || 'Unknown');

    const now = Math.floor(Date.now() / 1000);

    let expiry = 'Permanent / N/A';
    if (event.metadata?.expiryDate) {
      expiry = event.metadata.expiryDate;
    } else if (event.metadata?.timeoutEnds) {
      const expiryTs = Math.floor(new Date(event.metadata.timeoutEnds).getTime() / 1000);
      expiry = `<t:${expiryTs}:F>`;
    }

    const embed = new EmbedBuilder()
      .setColor(getColor('moderation') || 0xe74c3c)
      .setTitle('Moderation Action')
      .setDescription(
        `**Sanction Issued:** ${sanction}\n` +
        `**Reason:** ${event.reason || 'No reason provided'}\n` +
        `**Date of Sanction:** <t:${now}:F>\n` +
        `**Date of Expiry:** ${expiry}\n` +
        `**Issuing Moderator:** ${moderatorMention}`
      )
      .setTimestamp();

    if (event.caseId) {
      embed.setFooter({ text: `Case ID: #${event.caseId}` });
    }

    await logChannel.send({ embeds: [embed] });
    logger.info(`Moderation action logged: ${event.action} in guild ${guild.id}`);

  } catch (error) {
    logger.error("Error logging moderation event:", error);
  }
}

export async function generateCaseId(client, guildId) {
  try {
    const caseKey = `moderation_cases_${guildId}`;
    const currentCase = await getFromDb(caseKey, 0);
    const nextCase = currentCase + 1;
    await setInDb(caseKey, nextCase);
    return nextCase;
  } catch (error) {
    logger.error("Error generating case ID:", error);
    return Date.now();
  }
}

export async function storeModerationCase({ guildId, caseId, caseData }) {
  try {
    const caseKey = `moderation_case_${guildId}_${caseId}`;
    const caseDataWithTimestamp = {
      ...caseData,
      createdAt: new Date().toISOString(),
      caseId
    };

    await setInDb(caseKey, caseDataWithTimestamp);

    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    caseList.push(caseDataWithTimestamp);

    if (caseList.length > 1000) {
      caseList.splice(0, caseList.length - 1000);
    }

    await setInDb(caseListKey, caseList);
    return true;
  } catch (error) {
    logger.error("Error storing moderation case:", error);
    return false;
  }
}

export async function getModerationCases(guildId, filters = {}) {
  try {
    const { userId, moderatorId, action, limit = 50, offset = 0 } = filters;

    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);

    let filteredCases = caseList;

    if (userId) {
      filteredCases = filteredCases.filter(c => c.targetUserId === userId);
    }
    if (moderatorId) {
      filteredCases = filteredCases.filter(c => c.moderatorId === moderatorId);
    }
    if (action) {
      filteredCases = filteredCases.filter(c => c.action === action);
    }

    filteredCases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return filteredCases.slice(offset, offset + limit);
  } catch (error) {
    logger.error("Error getting moderation cases:", error);
    return [];
  }
}

export async function logModerationAction({ client, guild, event }) {
  const caseId = await generateCaseId(client, guild.id);

  await storeModerationCase({
    guildId: guild.id,
    caseId,
    caseData: {
      action: event.action,
      target: event.target,
      executor: event.executor,
      reason: event.reason,
      duration: event.duration,
      metadata: event.metadata,
      targetUserId: event.metadata?.userId,
      moderatorId: event.metadata?.moderatorId
    }
  });

  await logEvent({
    client,
    guild,
    event: {
      ...event,
      caseId
    }
  });

  return caseId;
}
