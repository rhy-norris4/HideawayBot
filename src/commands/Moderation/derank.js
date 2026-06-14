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
import { ALL_MANAGED_RANK_IDS } from './rank.js';

export default {
    data: new SlashCommandBuilder()
        .setName('derank')
        .setDescription("Remove a rank role from a user")
        .addUserOption(o =>
            o.setName('user')
             .setDescription('The user to remove the rank from')
             .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('authorisation')
             .setDescription('Authorisation reference or note for this demotion')
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
            const authorisation = interaction.options.getString('authorisation');
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
                .setColor(0xFEE75C)
                .addFields(
                    { name: '👤 User', value: `${target.toString()} (${target.id})` },
                    { name: '🌐 Group', value: interaction.guild.name },
                    { name: '🛡️ Authorised By', value: `${interaction.member.displayName} (${interaction.user.username})` },
                    { name: '✅ Authorisation', value: authorisation },
                    { name: '📋 Message', value: reason }
                );

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`derank_role_select:${target.id}`)
                .setPlaceholder('Select a rank to remove...')
                .addOptions(roleOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            logger.error('Derank command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'derank_failed' });
        }
    }
};
