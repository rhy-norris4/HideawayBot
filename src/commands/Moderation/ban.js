import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { ModerationService } from '../../services/moderationService.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { sendModerationDM } from '../../utils/moderationDM.js';

export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption(option =>
            option.setName("target").setDescription("The user to ban").setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason").setDescription("Reason for the ban")
        )
        .addStringOption(option =>
            option.setName("expiry_date")
                .setDescription("Expiry date of the ban (e.g. 01/06/2026 or 'Permanent')")
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "No reason provided";
            const expiryDate = interaction.options.getString("expiry_date") || null;

            if (user.id === interaction.user.id) throw new Error("You cannot ban yourself.");
            if (user.id === client.user.id) throw new Error("You cannot ban the bot.");

            await sendModerationDM({ user, action: 'ban', reason });

            const result = await ModerationService.banUser({
                guild: interaction.guild,
                user,
                moderator: interaction.member,
                reason
            });

            await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Banned",
                    target: `${user.tag} (${user.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        userId: user.id,
                        moderatorId: interaction.user.id,
                        expiryDate
                    }
                }
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${user.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${result.caseId}${expiryDate ? `\n**Expiry:** ${expiryDate}` : ''}`
                    )
                ]
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'ban_failed' });
        }
    }
};
