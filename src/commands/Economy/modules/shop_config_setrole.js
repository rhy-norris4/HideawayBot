import { PermissionsBitField } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

const ALLOWED_ROLES = ['1514043331267530752', '1511500077137399928'];

export default {
    async execute(interaction, config, client) {
        const hasPermission =
            interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
            ALLOWED_ROLES.some(id => interaction.member.roles.cache.has(id));

        if (!hasPermission) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** permissions (or the CET Lead / Rhy role) to set the premium role.')],
                ephemeral: true,
            });
        }

        const role = interaction.options.getRole('role');
        const guildId = interaction.guildId;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('✅ Premium Role Set', `The **Premium Shop Role** has been set to ${role.toString()}. Members who purchase the Premium Role item will be granted this role.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed('System Error', 'Could not save the guild configuration.')],
                ephemeral: true,
            });
        }
    },
};
