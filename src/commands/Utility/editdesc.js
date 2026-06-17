import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('editdesc')
        .setDescription('Change the description of a slash command')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt =>
            opt.setName('command')
                .setDescription('Name of the command to edit')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('description')
                .setDescription('New description (max 100 characters)')
                .setRequired(true)
                .setMaxLength(100)
        ),
    category: 'Utility',

    async execute(interaction, guildConfig, client) {
        const commandName = interaction.options.getString('command').toLowerCase().trim();
        const newDescription = interaction.options.getString('description').trim();

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const guildCommands = await interaction.guild.commands.fetch();
            const target = guildCommands.find(c => c.name === commandName);

            if (!target) {
                return interaction.editReply({
                    content: `❌ No command named \`${commandName}\` found. Check the name and try again.`
                });
            }

            const oldDescription = target.description;

            await interaction.guild.commands.edit(target.id, {
                description: newDescription
            });

            logger.info(`[EditDesc] /${commandName} description updated by ${interaction.user.tag}: "${oldDescription}" → "${newDescription}"`);

            await interaction.editReply({
                content:
                    `✅ Updated \`/${commandName}\`\n` +
                    `**Before:** ${oldDescription}\n` +
                    `**After:** ${newDescription}`
            });
        } catch (err) {
            logger.error('[EditDesc] Failed to update command description:', err.message);
            await interaction.editReply({
                content: `❌ Failed to update command: ${err.message}`
            });
        }
    }
};
