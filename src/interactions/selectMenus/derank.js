import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { ALL_MANAGED_RANK_IDS } from '../../commands/Moderation/rank.js';

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

async function sendDerankLog(guild, client, { targetUser, role, issuer, authorisation, reason, status, failReason = null }) {
    try {
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const issuerName = issuer.displayName ?? issuer.user.username;
        const userName = targetUser?.username ?? 'Unknown';
        const userId = targetUser?.id ?? 'Unknown';
        const statusText = status === 'SUCCESS' ? '✅ SUCCESS' : `❌ FAILED — ${failReason ?? 'Unknown error'}`;

        const embed = new EmbedBuilder()
            .setTitle('🔴 Rank Change - Demotion')
            .setColor(0xFEE75C)
            .addFields(
                { name: '👤 User\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003', value: `${userName}\n\`${userId}\``, inline: true },
                { name: '🎖️ Role Removed\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003\u2003', value: role ? role.name : 'Unknown', inline: true },
                { name: '🛡️ Issued By', value: `${issuerName} → ${issuer.user.username}`, inline: true },
                { name: '✅ Authorisation', value: authorisation || 'Not provided' },
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
        logger.warn(`Failed to send derank log: ${err.message}`);
    }
}

function noticeEmbed(success, userStr, roleStr) {
    const phrase = success
        ? `${userStr} has successfully been removed from ${roleStr}`
        : `${userStr} has unsuccessfully been removed from ${roleStr}`;
    return new EmbedBuilder().setColor(success ? 0x57F287 : 0xED4245).setDescription(phrase);
}

export default {
    name: 'derank_role_select',
    async execute(interaction, client, args) {
        await interaction.deferUpdate();

        const guild = interaction.guild;
        const userId = args[0];
        const roleId = interaction.values[0];

        if (!ALL_MANAGED_RANK_IDS.includes(roleId)) {
            return interaction.followUp({ content: '❌ That role is not in the allowed rank list.', ephemeral: true });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        const role = guild.roles.cache.get(roleId);
        const issuer = interaction.member;

        const originalEmbed = interaction.message.embeds[0];
        const authorisation = originalEmbed?.fields?.find(f => f.name.includes('Authorisation'))?.value ?? 'Not provided';
        const reason = originalEmbed?.fields?.find(f => f.name.includes('Message'))?.value ?? 'Reason was not inputted. Consult the Issuing Moderator for further details.';

        if (!member) {
            await sendDerankLog(guild, client, { targetUser: { id: userId, username: userId }, role, issuer, authorisation, reason, status: 'FAILED', failReason: 'User not found in server' });
            return interaction.followUp({ embeds: [noticeEmbed(false, `<@${userId}>`, role ? role.toString() : 'Unknown Role')], ephemeral: true });
        }
        if (!role) {
            await sendDerankLog(guild, client, { targetUser: member.user, role: null, issuer, authorisation, reason, status: 'FAILED', failReason: 'Role not found' });
            return interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), 'Unknown Role')], ephemeral: true });
        }
        if (!issuer.permissions.has(PermissionFlagsBits.ManageRoles)) {
            await sendDerankLog(guild, client, { targetUser: member.user, role, issuer, authorisation, reason, status: 'FAILED', failReason: 'Issuer lacks Manage Roles permission' });
            return interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), role.toString())], ephemeral: true });
        }

        if (!member.roles.cache.has(roleId)) {
            return interaction.followUp({ content: `⚠️ ${member.toString()} does not have the ${role.toString()} role.`, ephemeral: true });
        }

        try {
            await member.roles.remove(role, `Derank by ${interaction.user.tag}`);
            await sendDerankLog(guild, client, { targetUser: member.user, role, issuer, authorisation, reason, status: 'SUCCESS' });
            await interaction.editReply({ embeds: [originalEmbed], components: [] });
            await interaction.followUp({ embeds: [noticeEmbed(true, member.toString(), role.toString())], ephemeral: true });
        } catch (error) {
            logger.error('Derank select error:', error);
            await sendDerankLog(guild, client, { targetUser: member.user, role, issuer, authorisation, reason, status: 'FAILED', failReason: error.message ?? 'Bot role may be below the target role' });
            await interaction.followUp({ embeds: [noticeEmbed(false, member.toString(), role.toString())], ephemeral: true });
        }
    }
};
