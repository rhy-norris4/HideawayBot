import { logger } from '../utils/logger.js';
import { logEvent } from '../services/loggingService.js';

export default {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        const guildId = newState.guild.id;
        const userId = newState.member.id;
        const member = newState.member;
        const isBot = member.user.bot;

        // Voice join/leave/move logging — runs for ALL users including bots
        try {
            const now = Math.floor(Date.now() / 1000);
            const userMention = member.toString();
            const botTag = isBot ? ' 🤖' : '';

            if (!oldState.channel && newState.channel) {
                await logEvent({
                    client,
                    guildId,
                    eventType: 'voice.join',
                    data: {
                        title: `Voice Joined${botTag}`,
                        description: [
                            `User: ${userMention} — ${userId}`,
                            `Channel: ${newState.channel.toString()}`,
                            `<t:${now}:F>`
                        ].join('\n'),
                        userId
                    }
                });
            } else if (oldState.channel && !newState.channel) {
                await logEvent({
                    client,
                    guildId,
                    eventType: 'voice.leave',
                    data: {
                        title: `Voice Left${botTag}`,
                        description: [
                            `User: ${userMention} — ${userId}`,
                            `Channel: ${oldState.channel.toString()}`,
                            `<t:${now}:F>`
                        ].join('\n'),
                        userId
                    }
                });
            } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
                await logEvent({
                    client,
                    guildId,
                    eventType: 'voice.move',
                    data: {
                        title: `Voice Moved${botTag}`,
                        description: [
                            `User: ${userMention} — ${userId}`,
                            `From: ${oldState.channel.toString()} → ${newState.channel.toString()}`,
                            `<t:${now}:F>`
                        ].join('\n'),
                        userId
                    }
                });
            }
        } catch (voiceLogError) {
            logger.warn('Failed to log voice event:', voiceLogError);
        }
    }
};
