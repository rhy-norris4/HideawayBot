import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const COLLECT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function getCollectCooldownKey(guildId, userId) {
    return `collect_cooldown_${guildId}_${userId}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('collect')
        .setDescription('Collect your role-based income'),
    category: 'Economy',

    async execute(interaction, config, client) {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const now = Date.now();

            // Check cooldown
            const cooldownKey = getCollectCooldownKey(guildId, userId);
            const lastCollect = await getFromDb(cooldownKey, 0);

            if (now < lastCollect + COLLECT_COOLDOWN_MS) {
                const nextCollectAt = lastCollect + COLLECT_COOLDOWN_MS;
                const nextCollectSec = Math.floor(nextCollectAt / 1000);
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        errorEmbed(
                            '⏳ Cooldown Active',
                            `You already collected your income recently. You can collect again <t:${nextCollectSec}:R>.`
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Fetch guild role income config
            const cfg = await getGuildConfig(client, guildId);
            const roleIncome = cfg.roleIncome || {};

            if (Object.keys(roleIncome).length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        infoEmbed(
                            '💼 No Income Configured',
                            'This server has no role income configured yet. An admin can set it up with `/role income add`.'
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Fetch member roles and cross-reference against roleIncome map
            const member = interaction.member;
            const memberRoleIds = member.roles.cache.map(r => r.id);

            const breakdown = [];
            let totalIncome = 0;

            for (const roleId of memberRoleIds) {
                if (roleIncome[roleId] !== undefined) {
                    const amount = roleIncome[roleId];
                    const role = interaction.guild.roles.cache.get(roleId);
                    const roleName = role ? role.name : `<@&${roleId}>`;
                    breakdown.push({ roleName, amount });
                    totalIncome += amount;
                }
            }

            if (breakdown.length === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [
                        infoEmbed(
                            '💼 No Income Roles',
                            "You don't have any roles with configured income. An admin can add income to roles with `/role income add`."
                        )
                    ],
                    flags: MessageFlags.Ephemeral
                });
            }

            // Add income to wallet
            const userData = await getEconomyData(client, guildId, userId);
            userData.wallet = (userData.wallet || 0) + totalIncome;
            await setEconomyData(client, guildId, userId, userData);

            // Save cooldown timestamp
            await setInDb(cooldownKey, now);

            logger.info(`[ECONOMY_TRANSACTION] Collect claimed`, {
                userId,
                guildId,
                amount: totalIncome,
                newWallet: userData.wallet,
                roles: breakdown.map(b => b.roleName),
                timestamp: new Date().toISOString()
            });

            // Build breakdown text
            const breakdownLines = breakdown.map(b => `• **${b.roleName}**: $${b.amount.toLocaleString()}`).join('\n');
            const nextCollectSec = Math.floor((now + COLLECT_COOLDOWN_MS) / 1000);

            const embed = successEmbed(
                '💰 Income Collected!',
                `You collected **$${totalIncome.toLocaleString()}** from your roles!\n\n` +
                `**Role Breakdown:**\n${breakdownLines}`
            )
                .addFields(
                    { name: 'New Wallet Balance', value: `$${userData.wallet.toLocaleString()}`, inline: true },
                    { name: 'Next Collection', value: `<t:${nextCollectSec}:R>`, inline: true }
                );

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

        } catch (error) {
            logger.error('[ECONOMY] Error in collect command:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    errorEmbed(
                        'System Error',
                        'An error occurred while processing your request. Please try again later.'
                    )
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
