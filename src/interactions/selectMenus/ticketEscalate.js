import {
    StringSelectMenuInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import { getTicketData, updateTicketData, escalateTicket, ESCALATION_LEVELS } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

const MOD_ROLES = ['1511500082053120020', '1511500077137399928', '1511500080031469790'];
const SUPPORT_ROLE = '1511500082753830992';

function isSupportStaff(member) {
    return MOD_ROLES.some(r => member.roles.cache.has(r)) || member.roles.cache.has(SUPPORT_ROLE);
}

export default [
    {
        name: 'ticket_escalate_select',
        async execute(interaction, client) {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only staff can escalate tickets.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const escalationLevel = interaction.values[0];
            
            const modal = new ModalBuilder()
                .setCustomId(`ticket_escalate_modal:${escalationLevel}`)
                .setTitle('Escalate Ticket');

            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('escalation_reason')
                        .setLabel('Reason for Escalation')
                        .setStyle(TextInputStyle.Paragraph)
                        .setPlaceholder('Provide a reason for escalating this ticket...')
                        .setRequired(true)
                        .setMaxLength(500)
                )
            );

            await interaction.showModal(modal);
        }
    }
];
