import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export const ALL_MANAGED_RANK_IDS = [
    '1511500077137399928',
    '1511500080031469790',
    '1511500082053120020',
    '1511500082753830992',
    '1511500083407884338',
    '1511500092404666459',
    '1511500090165039264',
];

export const RANK_HIERARCHY = [
    '1511500077137399928',
    '1511500080031469790',
    '1511500082053120020',
    '1511500082753830992',
    '1511500083407884338',
];

export const EXEMPT_RANKS = [
    '1511500092404666459',
    '1511500090165039264',
];

export default {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription("Set a user's rank by assigning a role")
        .addUserOption(o =>
            o.setName('user')
             .setDescription('The user to set the rank for')
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('reason')
             .setDescription('Reason / message shown on the panel')
             .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                throw new Error("You need the `Manage Roles` permission to use this command.");
            }

            const target = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || "Reason was not inputted. Consult the Issuing Moderator for further details.";

            const roleOptions = ALL_MANAGED_RANK_IDS
                .map(id => {
                    const role = interaction.guild.roles.cache.get(id);
                    return role ? { label: role.name, value: id } : null;
                })
                .filter(Boolean);

            if (roleOptions.length === 0) {
                throw new Error("Could not find any of the managed rank roles in this server.");
            }

            const embed = new EmbedBuilder()
                .setColor(0x062F77)
                .addFields(
                    { name: '👤 User', value: `${target.toString()} (${target.id})` },
                    { name: '🌐 Group', value: interaction.guild.name },
                    { name: '📋 Message', value: reason }
                );

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`rank_role_select:${target.id}`)
                .setPlaceholder('Select a rank to assign...')
                .addOptions(roleOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            logger.error('Rank command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'rank_failed' });
        }
    }
};
