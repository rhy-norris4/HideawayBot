import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const VETTING_LOG_CHANNEL = '1515132847940440126';

async function sendVettingLog(guild, data, result, failReason = null) {
    try {
        const channel = guild.channels.cache.get(VETTING_LOG_CHANNEL)
            || await guild.channels.fetch(VETTING_LOG_CHANNEL).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(result === 'PASS' ? 0x57F287 : 0xED4245)
            .setTitle(`Vetting Request – ${data.level}`)
            .addFields(
                { name: 'User', value: `<@${data.targetUserId}> ${data.targetUserId}` },
                { name: 'Vetting Standard', value: data.level },
                { name: 'Requesting Member', value: `<@${data.requestingMemberId}>` },
                { name: 'Reason', value: data.reason },
                { name: 'Result', value: result === 'PASS' ? '✅ PASS' : '❌ FAIL' }
            )
            .setTimestamp();

        if (result === 'FAIL' && failReason) {
            embed.addFields({ name: 'Fail Reason', value: failReason });
        }

        embed.setFooter({ text: `Vetting Number: ${data.vettingId}` });

        await channel.send({ embeds: [embed] });
    } catch (err) {
        logger.error('Failed to send vetting log:', err);
    }
}

export default [
    {
        name: 'vetting_pass',
        async execute(interaction) {
            try {
                const shortId = interaction.customId.split(':')[1];
                const data = await getFromDb(`vetting_${shortId}`, null);

                if (!data) {
                    return interaction.reply({ content: '❌ Vetting data not found.', flags: MessageFlags.Ephemeral });
                }
                if (data.status !== 'PENDING') {
                    return interaction.reply({ content: '⚠️ This vetting has already been processed.', flags: MessageFlags.Ephemeral });
                }

                data.status = 'PASS';
                data.processedBy = interaction.user.id;
                data.processedAt = new Date().toISOString();
                await setInDb(`vetting_${shortId}`, data);

                await sendVettingLog(interaction.guild, data, 'PASS');

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`vetting_pass:${shortId}`).setLabel('✅  PASSED').setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId(`vetting_fail:${shortId}`).setLabel('❌  FAIL').setStyle(ButtonStyle.Danger).setDisabled(true)
                );

                await interaction.update({ components: [disabledRow] });
                await interaction.followUp({
                    content: `✅ Vetting **PASSED** for <@${data.targetUserId}>. Log sent.`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                logger.error('vetting_pass button error:', error);
                interaction.replied || interaction.deferred
                    ? interaction.followUp({ content: '❌ Failed to process vetting.', flags: MessageFlags.Ephemeral })
                    : interaction.reply({ content: '❌ Failed to process vetting.', flags: MessageFlags.Ephemeral });
            }
        }
    },
    {
        name: 'vetting_fail',
        async execute(interaction) {
            try {
                const shortId = interaction.customId.split(':')[1];
                const data = await getFromDb(`vetting_${shortId}`, null);

                if (!data) {
                    return interaction.reply({ content: '❌ Vetting data not found.', flags: MessageFlags.Ephemeral });
                }
                if (data.status !== 'PENDING') {
                    return interaction.reply({ content: '⚠️ This vetting has already been processed.', flags: MessageFlags.Ephemeral });
                }

                const modal = new ModalBuilder()
                    .setCustomId(`vetting_fail_reason:${shortId}`)
                    .setTitle('Vetting Fail Reason');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('fail_reason')
                    .setLabel('Reason for failing this vetting')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
            } catch (error) {
                logger.error('vetting_fail button error:', error);
                interaction.replied || interaction.deferred
                    ? interaction.followUp({ content: '❌ Failed to open modal.', flags: MessageFlags.Ephemeral })
                    : interaction.reply({ content: '❌ Failed to open modal.', flags: MessageFlags.Ephemeral });
            }
        }
    }
];
