import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import { getTicketData, updateTicketData, escalateTicket, addUserToTicket, removeUserFromTicket, addRoleToTicket, removeRoleFromTicket, ESCALATION_LEVELS } from '../../services/ticketService.js';
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
                .setDescription('Escalate this ticket to a higher level')
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a user or role to this ticket')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User to add to ticket')
                        .setRequired(false)
                )
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('Role to add to ticket')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a user or role from this ticket')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('User to remove from ticket')
                        .setRequired(false)
                )
                .addRoleOption(opt =>
                    opt.setName('role')
                        .setDescription('Role to remove from ticket')
                        .setRequired(false)
                )
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

            const escalationMenu = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_escalate_select')
                    .setPlaceholder('Choose escalation level')
                    .addOptions([
                        {
                            label: 'Moderation',
                            value: 'moderation',
                            emoji: '🛡️',
                            description: 'Escalate to Moderation team'
                        },
                        {
                            label: 'Senior Moderation',
                            value: 'senior_moderation',
                            emoji: '⭐',
                            description: 'Escalate to Senior Moderation'
                        },
                        {
                            label: 'Head Moderation',
                            value: 'head_moderation',
                            emoji: '👑',
                            description: 'Escalate to Head of Moderation'
                        },
                        {
                            label: 'Management',
                            value: 'management',
                            emoji: '📋',
                            description: 'Escalate to Management'
                        }
                    ])
            );

            await interaction.reply({
                content: 'Select an escalation level:',
                components: [escalationMenu],
                flags: MessageFlags.Ephemeral
            });
        } else if (sub === 'add') {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only staff can manage ticket access.',
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

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            if (!user && !role) {
                return interaction.reply({
                    content: '❌ Please specify either a user or a role to add.',
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                if (user) {
                    const added = await addUserToTicket(interaction.guild, interaction.channel, ticket, user.id);
                    if (added) {
                        return interaction.reply({
                            content: `✅ Added ${user} to the ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return interaction.reply({
                            content: `⚠️ ${user} is already in this ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                if (role) {
                    const added = await addRoleToTicket(interaction.guild, interaction.channel, ticket, role.id);
                    if (added) {
                        return interaction.reply({
                            content: `✅ Added ${role} to the ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return interaction.reply({
                            content: `⚠️ ${role} already has access to this ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            } catch (err) {
                logger.error('[Tickets] Error adding user/role:', err.message);
                return interaction.reply({
                    content: '❌ Failed to add user/role to ticket.',
                    flags: MessageFlags.Ephemeral
                });
            }
        } else if (sub === 'remove') {
            if (!isSupportStaff(interaction.member)) {
                return interaction.reply({
                    content: '❌ Only staff can manage ticket access.',
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

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');

            if (!user && !role) {
                return interaction.reply({
                    content: '❌ Please specify either a user or a role to remove.',
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                if (user) {
                    const removed = await removeUserFromTicket(interaction.guild, interaction.channel, ticket, user.id);
                    if (removed) {
                        return interaction.reply({
                            content: `✅ Removed ${user} from the ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return interaction.reply({
                            content: `⚠️ ${user} is not in this ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }

                if (role) {
                    const removed = await removeRoleFromTicket(interaction.guild, interaction.channel, ticket, role.id);
                    if (removed) {
                        return interaction.reply({
                            content: `✅ Removed ${role} from the ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    } else {
                        return interaction.reply({
                            content: `⚠️ ${role} does not have access to this ticket.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                }
            } catch (err) {
                logger.error('[Tickets] Error removing user/role:', err.message);
                return interaction.reply({
                    content: '❌ Failed to remove user/role from ticket.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};
