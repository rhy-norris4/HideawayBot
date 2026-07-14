import { Events, ChannelType, AuditLogEvent } from 'discord.js';
import { logger } from '../utils/logger.js';
import { logEvent } from '../services/loggingService.js';

export default {
    name: Events.ChannelUpdate,
    async execute(oldChannel, newChannel, client) {
        if (!newChannel.guild) return;
        const guildId = newChannel.guild.id;

        // ── Voice channel status changes ──────────────────────────────────────
        try {
            if (
                (newChannel.type === ChannelType.GuildVoice || newChannel.type === ChannelType.GuildStageVoice)
            ) {
                const oldStatus = oldChannel.status ?? null;
                const newStatus = newChannel.status ?? null;

                if (oldStatus !== newStatus) {
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
                }
            }
        } catch (error) {
            logger.warn('Failed to log voice channel status update:', error);
        }

        // ── Permission overwrite changes ──────────────────────────────────────
        try {
            const oldOverwrites = oldChannel.permissionOverwrites?.cache;
            const newOverwrites = newChannel.permissionOverwrites?.cache;

            if (!oldOverwrites || !newOverwrites) return;

            // Detect any difference in permission overwrites
            let hasPermissionChange = false;
            let changeDescription = null;

            // Check added or changed overwrites
            for (const [id, newOverwrite] of newOverwrites) {
                const oldOverwrite = oldOverwrites.get(id);
                if (!oldOverwrite) {
                    hasPermissionChange = true;
                    changeDescription = `Permission overwrite **added** for <@${newOverwrite.type === 0 ? '&' : ''}${id}>`;
                    break;
                }
                if (
                    oldOverwrite.allow.bitfield !== newOverwrite.allow.bitfield ||
                    oldOverwrite.deny.bitfield !== newOverwrite.deny.bitfield
                ) {
                    hasPermissionChange = true;
                    changeDescription = `Permissions for <@${newOverwrite.type === 0 ? '&' : ''}${id}> updated in ${newChannel.toString()}`;
                    break;
                }
            }

            // Check removed overwrites
            if (!hasPermissionChange) {
                for (const [id] of oldOverwrites) {
                    if (!newOverwrites.has(id)) {
                        hasPermissionChange = true;
                        changeDescription = `Permission overwrite **removed** for \`${id}\` in ${newChannel.toString()}`;
                        break;
                    }
                }
            }

            if (!hasPermissionChange) return;

            // Try multiple audit log types to find the executor
            const auditTypes = [
                AuditLogEvent.ChannelOverwriteUpdate,
                AuditLogEvent.ChannelOverwriteCreate,
                AuditLogEvent.ChannelOverwriteDelete,
            ];

            let executor = null;
            for (const auditType of auditTypes) {
                const entry = await newChannel.guild
                    .fetchAuditLogs({ type: auditType, limit: 1 })
                    .then(logs => logs.entries.first())
                    .catch(() => null);
                if (entry && entry.target?.id === newChannel.id) {
                    executor = entry.executor;
                    break;
                }
            }

            const userMention = executor ? `<@${executor.id}>` : 'Unknown User';
            const userId = executor?.id ?? 'Unknown';
            const now = Math.floor(Date.now() / 1000);

            await logEvent({
                client,
                guildId,
                eventType: 'channel.permissions',
                data: {
                    title: '🔐 Channel Permissions Updated',
                    description: [
                        `**Channel:** ${newChannel.toString()} (\`${newChannel.name}\`)`,
                        `**Change:** ${changeDescription}`,
                        `**By:** ${userMention} (\`${userId}\`)`,
                        `**Time:** <t:${now}:F>`,
                    ].join('\n'),
                    userId,
                },
            });
        } catch (error) {
            logger.warn('Failed to log channel permission update:', error);
        }
    }
};
