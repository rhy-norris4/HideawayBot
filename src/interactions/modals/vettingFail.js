import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const VETTING_LOG_CHANNEL = '1515132847940440126';

async function sendVettingLog(guild, data, failReason) {
    try {
        const channel = guild.channels.cache.get(VETTING_LOG_CHANNEL)
            || await guild.channels.fetch(VETTING_LOG_CHANNEL).catch(() => null);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`Vetting Request – ${data.level}`)
            .addFields(
                { name: 'User', value: `<@${data.targetUserId}> ${data.targetUserId}` },
                { name: 'Vetting Standard', value: data.level },
                { name: 'Requesting Member', value: `<@${data.requestingMemberId}>` },
                { name: 'Reason', value: data.reason },
                { name: 'Result', value: '❌ FAIL' },
                { name: 'Fail Reason', value: failReason }
            )
            .setFooter({ text: `Vetting Number: ${data.vettingId}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (err) {
        logger.error('Failed to send vetting fail log:', err);
    }
}

export default {
    name: 'vetting_fail_reason',
    async execute(interaction) {
        try {
            const shortId = interaction.customId.split(':')[1];
            const failReason = interaction.fields.getTextInputValue('fail_reason');
            const data = await getFromDb(`vetting_${shortId}`, null);

            if (!data) {
                return interaction.reply({ content: '❌ Vetting data not found.', flags: MessageFlags.Ephemeral });
            }

            data.status = 'FAIL';
            data.failReason = failReason;
            data.processedBy = interaction.user.id;
            data.processedAt = new Date().toISOString();
            await setInDb(`vetting_${shortId}`, data);

            await sendVettingLog(interaction.guild, data, failReason);

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`vetting_pass:${shortId}`).setLabel('✅  PASS').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId(`vetting_fail:${shortId}`).setLabel('❌  FAILED').setStyle(ButtonStyle.Danger).setDisabled(true)
            );

            await interaction.message?.edit({ components: [disabledRow] }).catch(() => {});

            await interaction.reply({
                content: `❌ Vetting **FAILED** for <@${data.targetUserId}>. Reason logged.`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            logger.error('vetting_fail_reason modal error:', error);
            interaction.replied || interaction.deferred
                ? interaction.followUp({ content: '❌ Failed to process fail reason.', flags: MessageFlags.Ephemeral })
                : interaction.reply({ content: '❌ Failed to process fail reason.', flags: MessageFlags.Ephemeral });
        }
    }
};
