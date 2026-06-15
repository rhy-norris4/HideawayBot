import { MessageFlags } from 'discord.js';
import { TICKET_TYPES, getFieldLabels, createTicketChannel } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

export default {
    name: 'ticket_open',
    async execute(interaction, client, args) {
        const type = args[0];
        if (!TICKET_TYPES[type]) {
            return interaction.reply({ content: '❌ Unknown ticket type.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const fieldLabels = getFieldLabels(type);
        const fields = {};
        for (const key of Object.keys(fieldLabels)) {
            try {
                fields[key] = interaction.fields.getTextInputValue(key)?.trim() || '';
            } catch {
                fields[key] = '';
            }
        }

        try {
            const { channel } = await createTicketChannel(client, interaction.guild, interaction.user, type, fields);
            const config = TICKET_TYPES[type];
            await interaction.editReply({
                content:
                    `✅ Your **${config.label}** ticket has been created: ${channel}\n\n` +
                    `Please head over to your ticket channel and a staff member will assist you shortly.`
            });
        } catch (err) {
            logger.error('[Tickets] createTicketChannel error:', err.message);
            await interaction.editReply({ content: `❌ Could not create ticket: ${err.message}` });
        }
    }
};
