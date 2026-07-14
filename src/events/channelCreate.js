import { AuditLogEvent, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { logEvent } from '../services/loggingService.js';

const CHANNEL_TYPE_NAMES = {
    [ChannelType.GuildText]: 'Text Channel',
    [ChannelType.GuildVoice]: 'Voice Channel',
    [ChannelType.GuildCategory]: 'Category',
    [ChannelType.GuildAnnouncement]: 'Announcement Channel',
    [ChannelType.GuildStageVoice]: 'Stage Channel',
    [ChannelType.GuildForum]: 'Forum Channel',
    [ChannelType.GuildMedia]: 'Media Channel',
    [ChannelType.GuildDirectory]: 'Directory Channel',
};

export default {
    name: 'channelCreate',
    async execute(channel, client) {
        try {
            if (!channel.guild) return;

            const guildId = channel.guild.id;
            const typeName = CHANNEL_TYPE_NAMES[channel.type] ?? `Type ${channel.type}`;

            const auditEntry = await channel.guild
                .fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 })
                .then(logs => logs.entries.first())
                .catch(() => null);

            const executor = auditEntry?.executor ?? null;
            const userMention = executor ? `<@${executor.id}>` : 'Unknown User';
            const userId = executor?.id ?? 'Unknown';
            const now = Math.floor(Date.now() / 1000);

            await logEvent({
                client,
                guildId,
                eventType: 'channel.create',
                data: {
                    title: '📢 Channel Created',
                    description: [
                        `**Channel:** ${channel.toString()} (\`${channel.name}\`)`,
                        `**Type:** ${typeName}`,
                        `**ID:** \`${channel.id}\``,
                        `**Created by:** ${userMention} (\`${userId}\`)`,
                        `**Time:** <t:${now}:F>`,
                    ].join('\n'),
                    userId,
                },
            });
        } catch (error) {
            logger.warn('Failed to log channelCreate event:', error);
        }
    },
};
