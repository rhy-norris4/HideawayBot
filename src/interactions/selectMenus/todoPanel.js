import { getFromDb, setInDb } from '../../utils/database.js';
import { renderTodoPanel } from '../../utils/todoPanel.js';
import { errorEmbed } from '../../utils/embeds.js';
import { MessageFlags } from 'discord.js';

const todoPanelCompleteSelect = {
    name: 'todo_panel_complete_select',
    async execute(interaction, client, args) {
        const userId = interaction.user.id;
        const taskId = parseInt(interaction.values[0], 10);

        const userData = await getFromDb(`todo_${userId}`, { tasks: [], nextId: 1 });
        if (!userData.tasks) userData.tasks = [];

        const task = userData.tasks.find(t => t.id === taskId);
        if (!task) {
            return await interaction.reply({
                embeds: [errorEmbed('Error', 'Task not found.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        if (task.completed) {
            return await interaction.reply({
                embeds: [errorEmbed('Already Completed', `Task #${task.id} is already marked as complete.`)],
                flags: MessageFlags.Ephemeral,
            });
        }

        task.completed = true;
        await setInDb(`todo_${userId}`, userData);

        const panel = await renderTodoPanel(userId);
        await interaction.update(panel);
    },
};

const todoPanelRemoveSelect = {
    name: 'todo_panel_remove_select',
    async execute(interaction, client, args) {
        const userId = interaction.user.id;
        const taskId = parseInt(interaction.values[0], 10);

        const userData = await getFromDb(`todo_${userId}`, { tasks: [], nextId: 1 });
        if (!userData.tasks) userData.tasks = [];

        const taskIndex = userData.tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            return await interaction.reply({
                embeds: [errorEmbed('Error', 'Task not found.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        userData.tasks.splice(taskIndex, 1);
        await setInDb(`todo_${userId}`, userData);

        const panel = await renderTodoPanel(userId);
        await interaction.update(panel);
    },
};

export default [
    todoPanelCompleteSelect,
    todoPanelRemoveSelect,
];
