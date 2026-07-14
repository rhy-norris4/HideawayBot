import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { renderTodoPanel } from '../../utils/todoPanel.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('my')
        .setDescription('Personal management commands')
        .addSubcommandGroup(group =>
            group
                .setName('todo')
                .setDescription('Manage your personal to-do list')
                .addSubcommand(sub =>
                    sub
                        .setName('panel')
                        .setDescription('Open your personal to-do list panel')
                )
        )
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
    category: 'Utility',

    async execute(interaction, config, client) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
            if (!deferSuccess) {
                logger.warn('mytodo panel defer failed', {
                    userId: interaction.user.id,
                    guildId: interaction.guildId,
                });
                return;
            }

            const panel = await renderTodoPanel(interaction.user.id);
            await InteractionHelper.safeEditReply(interaction, panel);
        } catch (error) {
            logger.error('mytodo panel command failed', {
                error: error.message,
                stack: error.stack,
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            await handleInteractionError(interaction, error, {
                commandName: 'my todo panel',
                source: 'mytodo_command',
            });
        }
    },
};
