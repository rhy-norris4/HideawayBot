import { SlashCommandBuilder, MessageFlags, EmbedBuilder } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave-vc')
        .setDescription('Make the bot leave its current voice channel'),
    category: 'Voice',

    async execute(interaction) {
        try {
            const connection = getVoiceConnection(interaction.guild.id);

            if (!connection) {
                return interaction.reply({
                    content: '⚠️ I am not currently in any voice channel.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const channelId = connection.joinConfig?.channelId;
            const channel = channelId
                ? interaction.guild.channels.cache.get(channelId)
                : null;

            connection.destroy();

            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setDescription(
                    `🔇 Left ${channel ? channel.toString() : 'the voice channel'} successfully.`
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('Leave-vc command error:', error);
            await interaction.reply({
                content: '❌ Failed to leave the voice channel.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
