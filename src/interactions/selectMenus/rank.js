import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { setInDb } from '../../utils/database.js';
import { RANK_HIERARCHY, EXEMPT_RANKS, ALL_MANAGED_RANK_IDS } from '../../commands/Moderation/rank.js';

const LOG_CHANNEL_ID = '1513670232911122482';

async function getOrCreateWebhook(channel, client) {
    try {
        const webhooks = await channel.fetchWebhooks();
        const existing = webhooks.find(wh => wh.owner?.id === client.user.id);
        if (existing) return existing;
        return await channel.createWebhook({ name: 'Rank Logs', avatar: client.user.displayAvatarURL() });
    } catch (err) {
        logger.warn(`Could not fetch/create webhook: ${err.message}`);
        return null;
    }
}

async function sendRankLog(guild, client, { targetUser, role, removedRoles, issuer, reason, authorisation, action, status, failReason = null }) {
    try {
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const issuerName = issuer.displayName ?? issuer.user.username;
        const userName = targetUser?.username ?? 'Unknown';
        const userId = targetUser?.id ?? 'Unknown';
        const statusText = status === 'SUCCESS' ? '✅ SUCCESS' : `❌ FAILED — ${failReason ?? 'Unknown error'}`;
        const isAdd = action === 'add';

        const embed = new EmbedBuilder()
            .setTitle(isAdd ? 'Rank Changed — Addition' : '🔴 Rank Changed — Removal')
            .setColor(isAdd ? 0x57F287 : 0xFEE75C)
            .addFields(
                { name: '👤 User', value: `${userName}\n\`${userId}\``, inline: true },
                { name: isAdd ? '🎖️ Role Added' : '🎖️ Role Removed', value: role ? role.name : 'Unknown', inline: true },
                { name: '🛡️ Issued By', value: `${issuerName} → ${issuer.user.username}`, inline: true },
                ...(isAdd && removedRoles?.length ? [{ name: '🗑️ Roles Removed', value: removedRoles.map(r => r.name).join(', ') }] : []),
                ...(!isAdd && authorisation ? [{ name: '✅ Authorisation', value: authorisation }] : []),
                { name: '📋 Reason', value: reason || 'No reason provided' },
                { name: '📊 Status', value: statusText }
            )
            .setTimestamp();

        const webhook = await getOrCreateWebhook(logChannel, client);
        if (webhook) {
            await webhook.send({ username: 'Rank Logs', avatarURL: client.user.displayAvatarURL(), embeds: [embed] });
        } else {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (err) {
        logger.warn(`Failed to send rank log: ${err.message}`);
    }
}

function noticeEmbed(success, userStr, roleStr, action) {
    const verb = action === 'add'
        ? (success ? 'successfully been issued' : 'unsuccessfully been issued')
        : (success ? 'successfully been removed from' : 'unsuccessfully been removed from');
    return new EmbedBuilder()
        .setColor(success ? 0x57F287 : 0xED4245)
        .setDescription(`${userStr} has ${verb} ${roleStr}`);
}

export default {
    name: 'rank_role_select',
    async execute(interaction, client, args) {
        await interaction.deferUpdate();

        const guild = interaction.guild;
        const userId = args[0];
        const action = args[1] || 'add';
        const roleId = interaction.values[0];

        if (!ALL_MANAGED_RANK_IDS.includes(roleId)) {
            return interaction.followUp({ content: '❌ That role is not in the allowed rank list.', ephemeral: true });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        const role = guild.roles.cache.get(roleId);
        const issuer = interaction.member;

        const originalEmbed = interaction.message.embeds[0];
        const reason = originalEmbed?.fields?.find(f => f.name.includes('Message'))?.value
            ?? 'Reason was not inputted. Consult the Issuing Moderator for further details.';
        const authorisation = originalEmbed?.fields?.find(f => f.name.includes('Authorisation'))?.value ?? null;

        if (!member) {
            await sendRankLog(guild, client, { targetUser: { id: userId, username: userId }, role, issuer, reason, action, status: 'FAILED', failReason: 'User not found in server' });
            return interaction.followUp({ embeds: [noticeEmbed(false, `<@${userId}>`, role ? role.toString() : 'Unknown Role', action)], ephemeral: true });
        }
        if (!role) {
            await sendRankLog(guild, client, { targetUser: member.user, role: null, issuer, reason, action, status: 'FAILED', failReason: 'Role not found' });
            return interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), 'Unknown Role', action)], ephemeral: true });
        }
        if (!issuer.permissions.has(PermissionFlagsBits.ManageRoles)) {
            await sendRankLog(guild, client, { targetUser: member.user, role, issuer, reason, action, status: 'FAILED', failReason: 'Issuer lacks Manage Roles permission' });
            return interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), role.toString(), action)], ephemeral: true });
        }

        try {
            const removedRoles = [];

            if (action === 'add') {
                if (RANK_HIERARCHY.includes(roleId)) {
                    for (const hRoleId of RANK_HIERARCHY) {
                        if (hRoleId !== roleId && member.roles.cache.has(hRoleId)) {
                            const hRole = guild.roles.cache.get(hRoleId);
                            if (hRole) {
                                await member.roles.remove(hRole, `Hierarchy replacement by ${interaction.user.tag}`);
                                removedRoles.push(hRole);
                            }
                        }
                    }
                }
                await member.roles.add(role, `Rank set by ${interaction.user.tag}`);

                await setInDb(`rank_last_change_${guild.id}_${userId}`, {
                    roleName: role.name,
                    roleId: role.id,
                    issuerId: interaction.user.id,
                    issuerName: interaction.user.tag,
                    timestamp: Date.now(),
                    reason,
                    action: 'add'
                });
            } else {
                if (!member.roles.cache.has(roleId)) {
                    return interaction.followUp({ content: `⚠️ ${member.toString()} does not have the ${role.toString()} role.`, ephemeral: true });
                }
                await member.roles.remove(role, `Derank by ${interaction.user.tag}`);

                await setInDb(`rank_last_change_${guild.id}_${userId}`, {
                    roleName: role.name,
                    roleId: role.id,
                    issuerId: interaction.user.id,
                    issuerName: interaction.user.tag,
                    timestamp: Date.now(),
                    reason,
                    action: 'remove'
                });
            }

            await sendRankLog(guild, client, { targetUser: member.user, role, removedRoles, issuer, reason, authorisation, action, status: 'SUCCESS' });
            await interaction.editReply({ embeds: [originalEmbed], components: [] });
            await interaction.followUp({ embeds: [noticeEmbed(true, member.toString(), role.toString(), action)], ephemeral: true });

        } catch (error) {
            logger.error('Rank select error:', error);
            await sendRankLog(guild, client, { targetUser: member.user, role, issuer, reason, action, status: 'FAILED', failReason: error.message ?? 'Bot role may be below the target role' });
            await interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), role.toString(), action)], ephemeral: true });
        }
    }
};
