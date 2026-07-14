import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    EmbedBuilder,
} from 'discord.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export const LOG_CATEGORIES = [
    { value: 'moderation',   label: '🔨 Moderation',     description: 'Bans, kicks, mutes, warns, purges' },
    { value: 'ticket',       label: '🎫 Tickets',         description: 'Ticket create, close, claim, delete' },
    { value: 'message',      label: '✉️ Messages',        description: 'Message delete, edit, bulk delete' },
    { value: 'role',         label: '🏷️ Roles',           description: 'Role create, delete, update, member changes' },
    { value: 'member',       label: '👥 Members',         description: 'Member join, leave, name changes' },
    { value: 'reactionrole', label: '🎭 Reaction Roles',  description: 'Reaction role add, remove, create, delete' },
    { value: 'giveaway',     label: '🎁 Giveaways',       description: 'Giveaway create, winner, reroll, delete' },
    { value: 'voice',        label: '🎙️ Voice',           description: 'Voice join, leave, move, status' },
    { value: 'channel',      label: '📢 Channels',        description: 'Channel create, delete, permission changes' },
];

export async function buildPanelMessage(client, guildId, guild) {
    const config = await getGuildConfig(client, guildId);
    const categoryChannels = config.logging?.categoryChannels || {};
    const loggingEnabled = config.logging?.enabled || false;

    const options = LOG_CATEGORIES.map(cat => {
        const chanId = categoryChannels[cat.value];
        let desc = cat.description;
        if (chanId) {
            const ch = guild.channels.cache.get(chanId);
            desc = ch ? `Currently: #${ch.name}` : `Currently: ID ${chanId}`;
        } else {
            desc = 'Currently: not set';
        }
        return {
            label: cat.label,
            value: cat.value,
            description: desc,
        };
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('logging_panel_category')
        .setPlaceholder('Select a category to configure its log channel…')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const configuredCount = Object.keys(categoryChannels).length;
    const embed = new EmbedBuilder()
        .setTitle('📋 Logging Panel')
        .setDescription(
            `Configure which channel each event category logs to.\n\n` +
            `**Status:** ${loggingEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
            `**Categories configured:** ${configuredCount} / ${LOG_CATEGORIES.length}\n\n` +
            `Select a category below to pick its log channel.`
        )
        .setColor(loggingEnabled ? getColor('success') : getColor('warning'))
        .setTimestamp();

    return { embeds: [embed], components: [row], ephemeral: true };
}

export default {
    data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Manage audit logging for this server.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub
                .setName('panel')
                .setDescription('Open the logging configuration panel to set per-category log channels.')
        ),

    async execute(interaction, config, client) {
        try {
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });
            const message = await buildPanelMessage(client, interaction.guildId, interaction.guild);
            await InteractionHelper.safeEditReply(interaction, message);
        } catch (error) {
            logger.error('logging panel error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Failed to open the logging panel. Please try again.',
            }).catch(() => {});
        }
    },
};
