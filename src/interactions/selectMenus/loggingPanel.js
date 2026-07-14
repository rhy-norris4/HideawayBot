import {
    ChannelSelectMenuBuilder,
    ActionRowBuilder,
    ChannelType,
    EmbedBuilder,
} from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { setLoggingCategoryChannel } from '../../services/loggingService.js';
import { buildPanelMessage, LOG_CATEGORIES } from '../../commands/Logging/logging.js';
import { logger } from '../../utils/logger.js';

// Handler for logging_panel_category — shows a channel select for the chosen category
async function handleCategorySelect(interaction, client) {
    try {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ You need **Manage Server** permissions to use this.',
                ephemeral: true,
            });
        }

        const category = interaction.values[0];
        const catMeta = LOG_CATEGORIES.find(c => c.value === category);
        const label = catMeta ? catMeta.label : category;

        const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId(`logging_panel_channel:${category}`)
            .setPlaceholder(`Pick a text channel for ${label} logs…`)
            .addChannelTypes(ChannelType.GuildText);

        const row = new ActionRowBuilder().addComponents(channelSelect);

        const embed = new EmbedBuilder()
            .setTitle(`📢 Configure: ${label}`)
            .setDescription(
                `Select the text channel where **${label}** events should be logged.\n\n` +
                `After picking a channel, you'll be returned to the panel to configure more categories.`
            )
            .setColor(0x3498db)
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [row] });
    } catch (error) {
        logger.error('loggingPanel: handleCategorySelect error:', error);
        await interaction.reply({ content: '❌ An error occurred. Please try again.', ephemeral: true }).catch(() => {});
    }
}

// Handler for logging_panel_channel:<category> — saves the chosen channel and re-shows the panel
async function handleChannelSelect(interaction, client, args) {
    try {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ You need **Manage Server** permissions to use this.',
                ephemeral: true,
            });
        }

        const category = args[0];
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);
        const catMeta = LOG_CATEGORIES.find(c => c.value === category);
        const label = catMeta ? catMeta.label : category;

        const success = await setLoggingCategoryChannel(client, interaction.guildId, category, channelId);

        if (!success) {
            return interaction.reply({
                content: '❌ Failed to save the channel. Please try again.',
                ephemeral: true,
            }).catch(() => {});
        }

        // Re-build the panel so the admin can configure another category
        const panelMessage = await buildPanelMessage(client, interaction.guildId, interaction.guild);

        // Prepend a confirmation note to the embed description
        const confirmLine = `✅ **${label}** logs will now be sent to ${channel ? channel.toString() : `<#${channelId}>`}\n\n`;
        if (panelMessage.embeds && panelMessage.embeds[0]) {
            const original = panelMessage.embeds[0];
            const updated = EmbedBuilder.from(original).setDescription(
                confirmLine + (original.data.description || '')
            );
            panelMessage.embeds = [updated];
        }

        await interaction.update(panelMessage);
    } catch (error) {
        logger.error('loggingPanel: handleChannelSelect error:', error);
        await interaction.reply({ content: '❌ An error occurred. Please try again.', ephemeral: true }).catch(() => {});
    }
}

// Export two named handlers — the interactions loader will register each by its `name`
export const categorySelectHandler = {
    name: 'logging_panel_category',
    async execute(interaction, client, args) {
        return handleCategorySelect(interaction, client);
    },
};

export const channelSelectHandler = {
    name: 'logging_panel_channel',
    async execute(interaction, client, args) {
        return handleChannelSelect(interaction, client, args);
    },
};

// Default export is an array so the interactions loader can register both
export default [categorySelectHandler, channelSelectHandler];
