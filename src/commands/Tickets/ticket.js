import {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';
import { getTicketData, updateTicketData } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

const MOD_ROLES = ['1511500082053120020', '1511500077137399928', '1511500080031469790'];
const SUPPORT_ROLE = '1511500082753830992';

function isSupportStaff(member) {
    return MOD_ROLES.some(r => member.roles.cache.has(r)) || member.roles.cache.has(SUPPORT_ROLE);
}

export default {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket management commands')
        .addSubcommand(sub =>
            sub.setName('escalate')
                .setDescription('Escalate this support ticket to senior staff')
        ),
    category: 'Tickets',

    async execute(interaction, guildConfig, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'escalate') {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only staff can escalate tickets.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const ticket = await getTicketData(interaction.guildId, interaction.channelId);
            if (!ticket) {
                return interaction.reply({
                    content: '❌ This command must be used inside a ticket channel.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (ticket.type !== 'support') {
                return interaction.reply({
                    content: '❌ Only General Support tickets can be escalated.',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (ticket.escalated) {
                return interaction.reply({
                    content: '❌ This ticket has already been escalated.',
                    flags: MessageFlags.Ephemeral
                });
            }

            for (const roleId of MOD_ROLES) {
                await interaction.channel.permissionOverwrites.edit(roleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    ManageMessages: true,
                    AttachFiles: true
                }).catch(() => {});
            }

            await updateTicketData(interaction.guildId, interaction.channelId, {
                escalated: true,
                escalatedBy: interaction.user.id,
                escalatedAt: Date.now()
            });

            const embed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('⬆️ Ticket Escalated to Senior Staff')
                .setDescription(
                    `This ticket has been escalated by **${interaction.user.tag}**.\n` +
                    `Senior staff have been notified and will review this shortly.`
                )
                .setTimestamp();

            const modPing = MOD_ROLES.map(r => `<@&${r}>`).join(' ');
            await interaction.reply({ content: modPing, embeds: [embed] });
        }
    }
};
