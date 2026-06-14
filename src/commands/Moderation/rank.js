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
        .setDescription("Assign or remove a rank role from a user")
        .addUserOption(o =>
            o.setName('user')
             .setDescription('The user to rank or derank')
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('action')
             .setDescription('Whether to add or remove a rank')
             .setRequired(true)
             .addChoices(
                 { name: 'Add Rank', value: 'add' },
                 { name: 'Remove Rank', value: 'remove' }
             )
        )
        .addStringOption(o =>
            o.setName('reason')
             .setDescription('Reason / message shown on the panel')
             .setRequired(false)
        )
        .addStringOption(o =>
            o.setName('authorisation')
             .setDescription('Authorisation reference (required for Remove Rank)')
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
            const action = interaction.options.getString('action');
            const reason = interaction.options.getString('reason') || "Reason was not inputted. Consult the Issuing Moderator for further details.";
            const authorisation = interaction.options.getString('authorisation') || null;

            if (action === 'remove' && !authorisation) {
                return InteractionHelper.safeEditReply(interaction, {
                    content: '❌ **Authorisation** is required when removing a rank. Please re-run the command and fill in the `authorisation` field.'
                });
            }

            const roleOptions = ALL_MANAGED_RANK_IDS
                .map(id => {
                    const role = interaction.guild.roles.cache.get(id);
                    return role ? { label: role.name, value: id } : null;
                })
                .filter(Boolean);

            if (roleOptions.length === 0) {
                throw new Error("Could not find any of the managed rank roles in this server.");
            }

            const isAdd = action === 'add';

            const embed = new EmbedBuilder()
                .setColor(isAdd ? 0x062F77 : 0xFEE75C)
                .setTitle(isAdd ? 'Assign Rank' : 'Remove Rank')
                .addFields(
                    { name: '👤 User', value: `${target.toString()} (${target.id})` },
                    { name: '🌐 Group', value: interaction.guild.name },
                    ...(isAdd ? [] : [{
                        name: '🛡️ Authorised By',
                        value: `${interaction.member.displayName} (${interaction.user.username})`
                    }, {
                        name: '✅ Authorisation',
                        value: authorisation
                    }]),
                    { name: '📋 Message', value: reason }
                );

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`rank_role_select:${target.id}:${action}`)
                .setPlaceholder(isAdd ? 'Select a rank to assign...' : 'Select a rank to remove...')
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
