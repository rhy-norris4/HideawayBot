import { MessageFlags } from 'discord.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';

const todoPanelAddModal = {
    name: 'todo_panel_add_modal',
    async execute(interaction, client, args) {
        const userId = interaction.user.id;
        const taskText = interaction.fields.getTextInputValue('task_text');

        if (!taskText || taskText.trim().length === 0) {
            return await interaction.reply({
                embeds: [errorEmbed('Error', 'Task description cannot be empty.')],
                flags: MessageFlags.Ephemeral,
            });
        }

        const dbKey = `todo_${userId}`;
        const userData = await getFromDb(dbKey, { tasks: [], nextId: 1 });
        if (!userData.tasks) userData.tasks = [];
        if (!userData.nextId) userData.nextId = 1;

        const newTask = {
            id: userData.nextId++,
            text: taskText.trim(),
            completed: false,
            createdAt: new Date().toISOString(),
        };

        userData.tasks.push(newTask);
        await setInDb(dbKey, userData);

        await interaction.reply({
            embeds: [successEmbed('Task Added', `✅ Added **"${newTask.text}"** to your to-do list.\n\nPress **Refresh** on the panel to see your updated list.`)],
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default [todoPanelAddModal];
