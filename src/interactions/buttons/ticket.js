import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder,
    AttachmentBuilder,
    MessageFlags
} from 'discord.js';
import {
    TICKET_TYPES,
    getTicketData,
    updateTicketData,
    generateTranscript,
    closeTicket
} from '../../services/ticketService.js';
import { logger } from '../../utils/logger.js';

const MOD_ROLES = ['1511500082053120020', '1511500077137399928', '1511500080031469790'];
const SUPPORT_ROLE = '1511500082753830992';

function isStaff(member) {
    return MOD_ROLES.some(r => member.roles.cache.has(r));
}

function isSupportStaff(member) {
    return isStaff(member) || member.roles.cache.has(SUPPORT_ROLE);
}

function buildModal(type) {
    const config = TICKET_TYPES[type];
    const modal = new ModalBuilder()
        .setCustomId(`ticket_open:${type}`)
        .setTitle(`${config.emoji} ${config.label}`);

    switch (type) {
        case 'support':
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('subject')
                        .setLabel('Subject')
                        .setPlaceholder('Briefly describe your issue')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('description')
                        .setLabel('Description')
                        .setPlaceholder('Describe your issue in detail...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                )
            );
            break;

        case 'community_report':
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reported_user')
                        .setLabel('Reported User')
                        .setPlaceholder('Username, tag or user ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('description')
                        .setLabel('Description of Incident')
                        .setPlaceholder('Describe what happened...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('evidence')
                        .setLabel('Evidence')
                        .setPlaceholder('Screenshot links, message links, etc. (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );
            break;

        case 'staff_report':
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('staff_member')
                        .setLabel('Staff Member')
                        .setPlaceholder('Username, tag or user ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('description')
                        .setLabel('Description of Incident')
                        .setPlaceholder('Describe what happened...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('evidence')
                        .setLabel('Evidence')
                        .setPlaceholder('Screenshot links, message links, etc. (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );
            break;

        case 'conflict':
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('person_involved')
                        .setLabel('Person Involved')
                        .setPlaceholder('Username, tag or user ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('nature')
                        .setLabel('Nature of Conflict')
                        .setPlaceholder('Describe the conflict of interest...')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('details')
                        .setLabel('Additional Details')
                        .setPlaceholder('Any other relevant information (optional)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setMaxLength(500)
                )
            );
            break;
    }

    return modal;
}

export default [
    {
        name: 'ticket_create',
        async execute(interaction, client, args) {
            const type = args[0];
            if (!TICKET_TYPES[type]) {
                return interaction.reply({ content: '❌ Unknown ticket type.', flags: MessageFlags.Ephemeral });
            }
            await interaction.showModal(buildModal(type));
        }
    },

    {
        name: 'ticket_close',
        async execute(interaction, client) {
            const ticket = await getTicketData(interaction.guildId, interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ This channel is not a ticket.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.user.id !== ticket.userId && !isSupportStaff(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only the ticket owner or staff can close this ticket.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close_confirm')
                    .setLabel('Yes, Close Ticket')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('ticket_close_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                content: '🔒 Are you sure you want to close this ticket? A transcript will be saved to the log channel.',
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }
    },

    {
        name: 'ticket_close_confirm',
        async execute(interaction, client) {
            const ticket = await getTicketData(interaction.guildId, interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ No ticket found for this channel.', flags: MessageFlags.Ephemeral });
            }

            if (interaction.user.id !== ticket.userId && !isSupportStaff(interaction.member)) {
                return interaction.reply({ content: '❌ Permission denied.', flags: MessageFlags.Ephemeral });
            }

            await interaction.reply({ content: '🔒 Saving transcript and closing ticket...', flags: MessageFlags.Ephemeral });

            try {
                await closeTicket(client, interaction.guild, interaction.channel, interaction.user);
            } catch (err) {
                logger.error('[Tickets] closeTicket error:', err.message);
            }
        }
    },

    {
        name: 'ticket_close_cancel',
        async execute(interaction, client) {
            await interaction.reply({ content: '✅ Close cancelled.', flags: MessageFlags.Ephemeral });
        }
    },

    {
        name: 'ticket_claim',
        async execute(interaction, client) {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({ content: '❌ Only staff can claim tickets.', flags: MessageFlags.Ephemeral });
            }

            const ticket = await getTicketData(interaction.guildId, interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ This channel is not a ticket.', flags: MessageFlags.Ephemeral });
            }

            if (ticket.status !== 'open') {
                return interaction.reply({ content: '❌ This ticket is already closed.', flags: MessageFlags.Ephemeral });
            }

            if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
                return interaction.reply({
                    content: `❌ This ticket is already claimed by <@${ticket.claimedBy}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            if (ticket.claimedBy === interaction.user.id) {
                await updateTicketData(interaction.guildId, interaction.channelId, { claimedBy: null });
                const embed = new EmbedBuilder()
                    .setColor(0xFEE75C)
                    .setDescription(`🙋 **${interaction.user.tag}** unclaimed this ticket.`)
                    .setTimestamp();
                return interaction.reply({ embeds: [embed] });
            }

            await updateTicketData(interaction.guildId, interaction.channelId, { claimedBy: interaction.user.id });

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setDescription(`🙋 **${interaction.user.tag}** has claimed this ticket and will be assisting you.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },

    {
        name: 'ticket_escalate',
        async execute(interaction, client) {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({ content: '❌ Only staff can escalate tickets.', flags: MessageFlags.Ephemeral });
            }

            const ticket = await getTicketData(interaction.guildId, interaction.channelId);
            if (!ticket) {
                return interaction.reply({ content: '❌ This channel is not a ticket.', flags: MessageFlags.Ephemeral });
            }
            if (ticket.type !== 'support') {
                return interaction.reply({ content: '❌ Only General Support tickets can be escalated.', flags: MessageFlags.Ephemeral });
            }
            if (ticket.escalated) {
                return interaction.reply({ content: '❌ This ticket has already been escalated.', flags: MessageFlags.Ephemeral });
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
    },

    {
        name: 'ticket_transcript',
        async execute(interaction, client) {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({ content: '❌ Only staff can generate transcripts.', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
                const ticket = await getTicketData(interaction.guildId, interaction.channelId);
                const transcript = await generateTranscript(interaction.channel);
                const buffer = Buffer.from(transcript, 'utf-8');
                const file = new AttachmentBuilder(buffer, { name: `transcript-${interaction.channel.name}.txt` });

                const typeName = ticket ? (TICKET_TYPES[ticket.type]?.label ?? ticket.type) : 'Unknown';

                await interaction.editReply({
                    content: `📄 Transcript for **#${interaction.channel.name}** (${typeName})`,
                    files: [file]
                });
            } catch (err) {
                logger.error('[Tickets] transcript button error:', err.message);
                await interaction.editReply({ content: '❌ Failed to generate transcript.' });
            }
        }
    }
];
