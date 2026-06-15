import { MessageFlags } from 'discord.js';
import { getTicketData, closeTicket } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

const MOD_ROLES = ['1511500082053120020', '1511500077137399928', '1511500080031469790'];
const SUPPORT_ROLE = '1511500082753830992';

function isSupportStaff(member) {
    return MOD_ROLES.some(r => member.roles.cache.has(r)) || member.roles.cache.has(SUPPORT_ROLE);
}

export default {
    name: 'ticket_close_modal',
    async execute(interaction, client) {
        const ticket = await getTicketData(interaction.guildId, interaction.channelId);
        if (!ticket) {
            return interaction.reply({ content: '❌ No ticket found for this channel.', flags: MessageFlags.Ephemeral });
        }

        if (interaction.user.id !== ticket.userId && !isSupportStaff(interaction.member)) {
            return interaction.reply({ content: '❌ Permission denied.', flags: MessageFlags.Ephemeral });
        }

        const reason = interaction.fields.getTextInputValue('close_reason')?.trim() || 'No reason provided';

        await interaction.reply({ content: '🔒 Saving transcript and closing ticket...', flags: MessageFlags.Ephemeral });

        try {
            await closeTicket(client, interaction.guild, interaction.channel, interaction.user, reason);
        } catch (err) {
            logger.error('[Tickets] closeTicket error:', err.message);
        }
    }
};
