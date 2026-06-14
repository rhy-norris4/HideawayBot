import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const CATEGORY_ICONS = {
    Birthday: '🎂',
    Community: '🏘️',
    Economy: '💰',
    Fun: '🎉',
    Giveaway: '🎁',
    JoinToCreate: '🔊',
    Logging: '📋',
    Moderation: '🔨',
    Reaction_roles: '🏷️',
    ServerStats: '📊',
    Tools: '🔧',
    Utility: '🛠️',
    Voice: '🎙️',
};

function buildPages(client) {
    const categories = {};

    for (const [, command] of client.commands) {
        if (!command?.data) continue;
        const cat = command.category || 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push({
            name: command.data.name,
            description: command.data.description || 'No description'
        });
    }

    const pages = [];
    const catEntries = Object.entries(categories).sort(([a], [b]) => a.localeCompare(b));

    for (const [cat, cmds] of catEntries) {
        const icon = CATEGORY_ICONS[cat] || '📁';
        const lines = cmds
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(c => `\`/${c.name}\` — ${c.description.slice(0, 60)}${c.description.length > 60 ? '…' : ''}`);

        const chunks = [];
        let current = '';
        for (const line of lines) {
            if ((current + '\n' + line).length > 1024) {
                chunks.push(current);
                current = line;
            } else {
                current = current ? current + '\n' + line : line;
            }
        }
        if (current) chunks.push(current);

        chunks.forEach((chunk, i) => {
            const lastPage = pages[pages.length - 1];
            const fieldName = i === 0 ? `${icon} ${cat}` : `${icon} ${cat} (cont.)`;

            if (lastPage && lastPage.fields.length < 4 && lastPage.charCount + chunk.length < 3500) {
                lastPage.fields.push({ name: fieldName, value: chunk });
                lastPage.charCount += chunk.length;
            } else {
                pages.push({ fields: [{ name: fieldName, value: chunk }], charCount: chunk.length });
            }
        });
    }

    return pages;
}

function buildEmbed(pages, pageIndex, totalPages) {
    const page = pages[pageIndex];
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📖 Command List')
        .setDescription(`All available bot commands. Use \`/\` to run any of them.`)
        .setFooter({ text: `Page ${pageIndex + 1} of ${totalPages}` })
        .setTimestamp();

    for (const field of page.fields) {
        embed.addFields(field);
    }

    return embed;
}

function buildRow(pageIndex, totalPages) {
    if (totalPages <= 1) return null;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`commands_prev:${pageIndex}`)
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === 0),
        new ButtonBuilder()
            .setCustomId(`commands_next:${pageIndex}`)
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(pageIndex === totalPages - 1)
    );
}

export default {
    data: new SlashCommandBuilder()
        .setName('commands')
        .setDescription('View all available bot commands'),
    category: 'Utility',

    async execute(interaction, config, client) {
        try {
            const pages = buildPages(client);
            if (pages.length === 0) {
                return interaction.reply({ content: 'No commands found.', flags: MessageFlags.Ephemeral });
            }

            const totalPages = pages.length;
            const embed = buildEmbed(pages, 0, totalPages);
            const row = buildRow(0, totalPages);

            await interaction.reply({
                embeds: [embed],
                components: row ? [row] : [],
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('Commands command error:', error);
            await interaction.reply({ content: '❌ Failed to load command list.', flags: MessageFlags.Ephemeral });
        }
    }
};
