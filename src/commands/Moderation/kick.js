import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { sendModerationDM } from '../../utils/moderationDM.js';

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a user from the server")
        .addUserOption(option =>
            option.setName("target").setDescription("The user to kick").setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason").setDescription("Reason for the kick")
        )
        .addStringOption(option =>
            option.setName("expiry_date")
                .setDescription("Expiry date / note for this action (e.g. 01/06/2026)")
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                throw new TitanBotError("User lacks permission", ErrorTypes.PERMISSION, "You do not have permission to kick members.");
            }

            const targetUser = interaction.options.getUser("target");
            const member = interaction.options.getMember("target");
            const reason = interaction.options.getString("reason") || "No reason provided";
            const expiryDate = interaction.options.getString("expiry_date") || null;

            if (targetUser.id === interaction.user.id) {
                throw new TitanBotError("Cannot kick self", ErrorTypes.VALIDATION, "You cannot kick yourself.");
            }
            if (targetUser.id === client.user.id) {
                throw new TitanBotError("Cannot kick bot", ErrorTypes.VALIDATION, "You cannot kick the bot.");
            }
            if (!member) {
                throw new TitanBotError("Target not found", ErrorTypes.USER_INPUT, "The target user is not currently in this server.", { subtype: 'user_not_found' });
            }
            if (interaction.member.roles.highest.position <= member.roles.highest.position) {
                throw new TitanBotError("Cannot kick user", ErrorTypes.PERMISSION, "You cannot kick a user with an equal or higher role than you.");
            }
            if (!member.kickable) {
                throw new TitanBotError("Bot cannot kick", ErrorTypes.PERMISSION, "I cannot kick this user. Please check my role position relative to the target user.");
            }

            await sendModerationDM({ user: targetUser, action: 'kick', reason });
            await member.kick(reason);

            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Kicked",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        expiryDate
                    }
                }
            });

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `👢 **Kicked** ${targetUser.tag}`,
                        `**Reason:** ${reason}\n**Case ID:** #${caseId}${expiryDate ? `\n**Expiry:** ${expiryDate}` : ''}`
                    )
                ]
            });
        } catch (error) {
            logger.error('Kick command error:', error);
            await InteractionHelper.universalReply(interaction, {
                embeds: [errorEmbed(error.userMessage || "An unexpected error occurred while trying to kick the user.", error.message || "Could not kick the user")]
            });
        }
    }
};
