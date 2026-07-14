import { 
    getTicketData,
    saveTicketData
} from '../utils/database.js';
import { AuditLogEvent } from 'discord.js';
import { logger } from '../utils/logger.js';
import { logEvent } from '../services/loggingService.js';

export default {
    name: 'channelDelete',
    async execute(channel, client) {
        // Log the channel deletion
        if (channel.guild) {
            try {
                const auditEntry = await channel.guild
                    .fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 })
                    .then(logs => logs.entries.first())
                    .catch(() => null);

                const executor = auditEntry?.executor ?? null;
                const userMention = executor ? `<@${executor.id}>` : 'Unknown User';
                const userId = executor?.id ?? 'Unknown';
                const now = Math.floor(Date.now() / 1000);

                await logEvent({
                    client,
                    guildId: channel.guild.id,
                    eventType: 'channel.delete',
                    data: {
                        title: '🗑️ Channel Deleted',
                        description: [
                            `**Channel:** \`${channel.name}\``,
                            `**ID:** \`${channel.id}\``,
                            `**Deleted by:** ${userMention} (\`${userId}\`)`,
                            `**Time:** <t:${now}:F>`,
                        ].join('\n'),
                        userId,
                    },
                });
            } catch (err) {
                logger.warn(`Failed to log channelDelete event for ${channel.id}:`, err);
            }
        }

        // Handle ticket text channel deletion
        if (channel.type === 0 && channel.guild) {
            try {
                const ticketData = await getTicketData(channel.guild.id, channel.id);
                if (ticketData && ticketData.status === 'open') {
                    ticketData.status = 'deleted';
                    ticketData.closedAt = new Date().toISOString();
                    await saveTicketData(channel.guild.id, channel.id, ticketData);
                    logger.info(`Ticket channel ${channel.id} was manually deleted in guild ${channel.guild.id}, marked as deleted`);
                }
            } catch (err) {
                logger.warn(`Could not clean up ticket record for deleted channel ${channel.id}:`, err);
            }
        }
    }
};
