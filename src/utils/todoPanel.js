import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { successEmbed } from './embeds.js';
import { getFromDb } from './database.js';

/**
 * Renders the personal to-do panel embed + components for a given userId.
 * @param {string} userId
 * @returns {Promise<{embeds: import('discord.js').EmbedBuilder[], components: ActionRowBuilder[]}>}
 */
export async function renderTodoPanel(userId) {
    const dbKey = `todo_${userId}`;
    const userData = await getFromDb(dbKey, { tasks: [], nextId: 1 });
    if (!userData.tasks) userData.tasks = [];
    if (!userData.nextId) userData.nextId = 1;

    let description;
    if (userData.tasks.length === 0) {
        description = '*Your to-do list is empty! Press **Add Task** to get started.*';
    } else {
        description = userData.tasks
            .map(task =>
                `${task.completed ? '✅' : '📝'} **#${task.id}** ${task.text} ` +
                `\`[${new Date(task.createdAt).toLocaleDateString()}]\``
            )
            .join('\n');
    }

    const embed = successEmbed(description, '📋 Your Personal To-Do List');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('todo_panel_add')
            .setLabel('Add Task')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId('todo_panel_complete')
            .setLabel('Complete Task')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('todo_panel_remove')
            .setLabel('Remove Task')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId('todo_panel_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('todo_panel_shared_info')
            .setLabel('Shared Lists')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👥'),
    );

    return { embeds: [embed], components: [row1, row2] };
}
