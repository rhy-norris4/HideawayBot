import { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { renderTodoPanel } from '../../utils/todoPanel.js';
import { getFromDb } from '../../utils/database.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';

const todoPanelAdd = {
    name: 'todo_panel_add',
    async execute(interaction, client, args) {
        const modal = new ModalBuilder()
            .setCustomId('todo_panel_add_modal')
            .setTitle('Add a Task');

        const taskInput = new TextInputBuilder()
            .setCustomId('task_text')
            .setLabel('Task description')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(new ActionRowBuilder().addComponents(taskInput));
        await interaction.showModal(modal);
    },
};

const todoPanelComplete = {
    name: 'todo_panel_complete',
    async execute(interaction, client, args) {
        const userId = interaction.user.id;
        const userData = await getFromDb(`todo_${userId}`, { tasks: [], nextId: 1 });
        if (!userData.tasks) userData.tasks = [];

        const incomplete = userData.tasks.filter(t => !t.completed);
        if (incomplete.length === 0) {
            return await interaction.reply({
                embeds: [errorEmbed('No Pending Tasks', 'You have no pending tasks.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const options = incomplete.slice(0, 25).map(t => ({
            label: `#${t.id} ${t.text}`.substring(0, 100),
            value: String(t.id),
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('todo_panel_complete_select')
            .setPlaceholder('Select a task to mark as complete')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({
            embeds: [infoEmbed('Complete a Task', 'Select the task you want to mark as complete:')],
            components: [row],
        });
    },
};

const todoPanelRemove = {
    name: 'todo_panel_remove',
    async execute(interaction, client, args) {
        const userId = interaction.user.id;
        const userData = await getFromDb(`todo_${userId}`, { tasks: [], nextId: 1 });
        if (!userData.tasks) userData.tasks = [];

        if (userData.tasks.length === 0) {
            return await interaction.reply({
                embeds: [errorEmbed('No Tasks', 'You have no tasks to remove.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const options = userData.tasks.slice(0, 25).map(t => ({
            label: `${t.completed ? '✅' : '📝'} #${t.id} ${t.text}`.substring(0, 100),
            value: String(t.id),
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('todo_panel_remove_select')
            .setPlaceholder('Select a task to remove')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.update({
            embeds: [infoEmbed('Remove a Task', 'Select the task you want to remove:')],
            components: [row],
        });
    },
};

const todoPanelRefresh = {
    name: 'todo_panel_refresh',
    async execute(interaction, client, args) {
        const panel = await renderTodoPanel(interaction.user.id);
        await interaction.update(panel);
    },
};

const todoPanelSharedInfo = {
    name: 'todo_panel_shared_info',
    async execute(interaction, client, args) {
        await interaction.reply({
            embeds: [
                infoEmbed(
                    'Shared To-Do Lists',
                    'Use `/mysharedtodo create|add|view|addtask|remove` to manage shared to-do lists with others.\n\n' +
                    '• `/mysharedtodo create name:My List` — create a new shared list\n' +
                    '• `/mysharedtodo add list_id:<id> user:@user` — add a member\n' +
                    '• `/mysharedtodo view list_id:<id>` — view a shared list\n' +
                    '• `/mysharedtodo addtask list_id:<id> task:Do something` — add a task\n' +
                    '• `/mysharedtodo remove list_id:<id> number:<n>` — remove a task'
                )
            ],
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default [
    todoPanelAdd,
    todoPanelComplete,
    todoPanelRemove,
    todoPanelRefresh,
    todoPanelSharedInfo,
];
