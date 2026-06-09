import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';

const LOG_CHANNEL_ID = '1513670232911122482';

async function sendRankLog(guild, { targetMember, targetUser, role, issuer, reason, status, failReason = null }) {
    try {
        const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!logChannel) return;

        const issuerHighestRole = issuer.roles?.highest?.name ?? 'Unknown';

        const statusText = status === 'SUCCESS'
            ? '✅ SUCCESS'
            : `❌ FAILED — ${failReason ?? 'Unknown error'}`;

        const userName = targetUser?.username ?? targetMember?.user?.username ?? 'Unknown';
        const userId = targetUser?.id ?? targetMember?.id ?? 'Unknown';

        const embed = new EmbedBuilder()
            .setTitle('Rank Changed')
            .setColor(status === 'SUCCESS' ? 0x57F287 : 0xED4245)
            .addFields(
                {
                    name: '👤 User',
                    value: `${userName}\n${userId}`,
                    inline: true
                },
                {
                    name: '🎖️ Role Added',
                    value: role ? `${role.toString()}\n${role.name}` : 'Unknown',
                    inline: true
                },
                {
                    name: '🛡️ Issued By',
                    value: `${issuer.user.tag}\n${issuerHighestRole}`,
                    inline: true
                },
                {
                    name: '📋 Reason',
                    value: reason || 'No reason provided'
                },
                {
                    name: '📊 Status',
                    value: statusText
                }
            )
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        logger.warn(`Failed to send rank log: ${err.message}`);
    }
}

export default {
    name: 'rank_role_select',
    async execute(interaction, client, args) {
        await interaction.deferUpdate();

        const guild = interaction.guild;
        const userId = args[0];
        const roleId = interaction.values[0];

        const member = await guild.members.fetch(userId).catch(() => null);
        const role = guild.roles.cache.get(roleId);
        const issuer = interaction.member;

        const originalEmbed = interaction.message.embeds[0];
        const reason = originalEmbed?.fields?.find(f => f.name.includes('Message'))?.value
            ?? 'No reason provided';

        if (!member) {
            await sendRankLog(guild, {
                targetUser: { id: userId, username: userId },
                role,
                issuer,
                reason,
                status: 'FAILED',
                failReason: 'User not found in server'
            });
            return interaction.followUp({ content: '❌ Could not find that user in this server.', ephemeral: true });
        }

        if (!role) {
            await sendRankLog(guild, {
                targetMember: member,
                targetUser: member.user,
                role: null,
                issuer,
                reason,
                status: 'FAILED',
                failReason: 'Role not found'
            });
            return interaction.followUp({ content: '❌ Could not find that role.', ephemeral: true });
        }

        if (!issuer.permissions.has(PermissionFlagsBits.ManageRoles)) {
            await sendRankLog(guild, {
                targetMember: member,
                targetUser: member.user,
                role,
                issuer,
                reason,
                status: 'FAILED',
                failReason: 'Issuer lacks Manage Roles permission'
            });
            return interaction.followUp({ content: '❌ You do not have permission to manage roles.', ephemeral: true });
        }

        try {
            await member.roles.add(role, `Rank set by ${interaction.user.tag}`);

            await sendRankLog(guild, {
                targetMember: member,
                targetUser: member.user,
                role,
                issuer,
                reason,
                status: 'SUCCESS'
            });

            await interaction.editReply({ embeds: [originalEmbed], components: [] });

            await interaction.followUp({
                content: `${member.toString()} has been issued ${role.toString()}`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Rank select error:', error);

            await sendRankLog(guild, {
                targetMember: member,
                targetUser: member.user,
                role,
                issuer,
                reason,
                status: 'FAILED',
                failReason: error.message ?? 'Bot role may be below the target role'
            });

            await interaction.followUp({
                content: '❌ Failed to assign role. Make sure my role is above the target role.',
                ephemeral: true
            });
        }
    }
};
