import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { getMusicPlayer, getOrCreateMusicPlayer } from '../../services/musicService.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Open the music player and join your voice channel'),
    category: 'Music',

    async execute(interaction, config, client) {
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You need to be in a voice channel first.',
                flags: MessageFlags.Ephemeral
            });
        }

        const existingPlayer = getMusicPlayer(interaction.guildId);
        const existingConn = getVoiceConnection(interaction.guildId);

        if (existingConn && existingPlayer?.voiceChannelId && existingPlayer.voiceChannelId !== voiceChannel.id) {
            const botChannel = interaction.guild.channels.cache.get(existingPlayer.voiceChannelId);
            return interaction.reply({
                content: `❌ I'm already playing in **${botChannel?.name ?? 'another channel'}**. Join that channel, or use ⏹ **Stop** in the existing player to move me.`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply();

        try {
            const musicPlayer = getOrCreateMusicPlayer(interaction.guildId);
            musicPlayer._client = client;
            musicPlayer.connectTo(voiceChannel, interaction.guild);

            const embed = musicPlayer.buildNowPlayingEmbed()
                .setFooter({ text: `${voiceChannel.name}  •  Use the buttons below to control playback` });

            const msg = await interaction.editReply({
                embeds: [embed],
                components: musicPlayer.buildComponents()
            });

            musicPlayer.dashboardChannelId = interaction.channelId;
            musicPlayer.dashboardMessageId = msg.id;

        } catch (err) {
            logger.error('[Music] /music command error:', err);
            await interaction.editReply({ content: '❌ Failed to start the music player. Please try again.' });
        }
    }
};
