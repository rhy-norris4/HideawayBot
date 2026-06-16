import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';
import { TICKET_TYPES } from '../../services/ticketService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('show')
        .setDescription('Post a panel or dashboard in this channel.')
        .addSubcommand(sub =>
            sub.setName('ticket-panel')
                .setDescription('Post a ticket panel so members can open tickets.')
                .addStringOption(opt =>
                    opt.setName('panel')
                        .setDescription('Which ticket panel to display')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Support', value: 'support' },
                            { name: 'Community Report', value: 'community_report' },
                            { name: 'Staff Report', value: 'staff_report' },
                            { name: 'Conflict of Interest', value: 'conflict' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('verify-panel')
                .setDescription('Post the verification panel so members can verify themselves.')
        ),
    category: 'Tickets',

    async execute(interaction, guildConfig, client) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                content: '❌ You need **Manage Server** permission to post ticket panels.',
                flags: MessageFlags.Ephemeral
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'ticket-panel') {
            const type = interaction.options.getString('panel');
            const config = TICKET_TYPES[type];

            const descriptions = {
                support: [
                    '• Questions about the server or community',
                    '• Account or role issues',
                    '• General help requests'
                ],
                community_report: [
                    '• Report a member breaking rules',
                    '• Harassment or toxic behaviour',
                    '• Suspected alt accounts or ban evasion'
                ],
                staff_report: [
                    '• Report a staff member for misconduct',
                    '• Abuse of moderation powers',
                    '• All reports are handled confidentially'
                ],
                conflict: [
                    '• Flag a potential conflict of interest',
                    '• Situations involving staff impartiality',
                    '• Handled by senior staff only'
                ]
            };

            const embed = new EmbedBuilder()
                .setColor(config.color)
                .setTitle(`${config.emoji} ${config.label}`)
                .setDescription(
                    `${config.description}\n\n**Use this ticket for:**\n${descriptions[type].join('\n')}\n\n` +
                    `Click the button below to open a ticket. Please provide as much detail as possible.`
                )
                .setFooter({ text: 'The Hideaway • Ticket System' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_create:${type}`)
                    .setLabel(`Open a ${config.label} Ticket`)
                    .setEmoji(config.emoji)
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: '✅ Panel posted.', flags: MessageFlags.Ephemeral });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }

        if (sub === 'verify-panel') {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔐 Verification')
                .setDescription(
                    `Welcome to **The Hideaway**!\n\n` +
                    `To gain full access to the server, you'll need to verify your account.\n\n` +
                    `Press **Verify** below to receive the Member role and unlock the rest of the server.`
                )
                .setFooter({ text: 'The Hideaway • Verification' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('verify')
                    .setLabel('Verify')
                    .setEmoji('☑️')
                    .setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ content: '✅ Verification panel posted.', flags: MessageFlags.Ephemeral });
            await interaction.channel.send({ embeds: [embed], components: [row] });
        }
    }
};
