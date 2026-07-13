import { MessageFlags } from 'discord.js';
import { getTicketData, updateTicketData } from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

export default [
  {
    name: 'ticket_rate',
    async execute(interaction, client) {
      try {
        // expected customId: ticket_rate:<channelId>:<rating>
        const parts = interaction.customId.split(':');
        const channelId = parts[1];
        const rating = Number(parts[2]);

        if (!channelId || !rating || rating < 1 || rating > 5) {
          return interaction.reply({ content: '⚠️ Invalid rating.', flags: MessageFlags.Ephemeral });
        }

        const ticket = await getTicketData(interaction.guildId, interaction.channelId);
        if (!ticket) {
          return interaction.reply({ content: '⚠️ Ticket data not found.', flags: MessageFlags.Ephemeral });
        }

        const ratings = ticket.ratings || [];
        const existing = ratings.find(r => r.userId === interaction.user.id);
        if (existing) {
          existing.rating = rating;
          existing.at = Date.now();
        } else {
          ratings.push({ userId: interaction.user.id, rating, at: Date.now() });
        }

        await updateTicketData(interaction.guildId, interaction.channelId, { ratings });

        await interaction.reply({ content: `Thanks — your ${rating}-star rating has been recorded.`, flags: MessageFlags.Ephemeral });

        // Optional: log to staff channel if env var set
        const LOG_CHANNEL = process.env.TICKET_RATING_LOG_CHANNEL;
        if (LOG_CHANNEL) {
          const logCh = interaction.guild.channels.cache.get(LOG_CHANNEL) || await interaction.guild.channels.fetch(LOG_CHANNEL).catch(() => null);
          if (logCh && typeof logCh.send === 'function') {
            await logCh.send(`Ticket #${ticket.num} (<#${interaction.channelId}>) got ${rating}⭐ from <@${interaction.user.id}>`);
          }
        }
      } catch (err) {
        logger.error('[Tickets] Rating handler error:', err);
        const msg = { content: '❌ Failed to record rating.', flags: MessageFlags.Ephemeral };
        interaction.replied || interaction.deferred ? interaction.followUp(msg) : interaction.reply(msg);
      }
    }
  }
];
