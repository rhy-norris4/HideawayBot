import { Events, ChannelType } from 'discord.js';
import { logger } from '../utils/logger.js';
import { logEvent } from '../services/loggingService.js';

export default {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel, client) {
        try {
            if (!newChannel.guild) return;
            if (newChannel.type !== ChannelType.GuildVoice && newChannel.type !== ChannelType.GuildStageVoice) return;

            const oldStatus = oldChannel.status ?? null;
            const newStatus = newChannel.status ?? null;

            if (oldStatus === newStatus) return;

            const guildId = newChannel.guild.id;

            const updatedBy = await newChannel.guild.fetchAuditLogs({ type: 192, limit: 1 })
                .then(logs => logs.entries.first())
                .catch(() => null);

            const executor = updatedBy?.executor ?? null;
            const userMention = executor ? `<@${executor.id}>` : 'Unknown User';
            const userId = executor?.id ?? 'Unknown';
            const now = Math.floor(Date.now() / 1000);

            await logEvent({
                client,
                guildId,
                eventType: 'voice.status',
                data: {
                    title: 'Channel Status Log',
                    description: [
                        `${userMention} — ${userId}`,
                        `${newChannel.toString()} Status changed to: ${newStatus || '*(cleared)*'}`,
                        `<t:${now}:F>`
                    ].join('\n'),
                    userId
                }
            });
        } catch (error) {
            logger.warn('Failed to log voice channel status update:', error);
        }
    }
};
