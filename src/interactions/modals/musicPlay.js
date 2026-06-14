import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getMusicPlayer, getOrCreateMusicPlayer, resolveTrack } from '../../services/musicService.js';
import { getVoiceConnection } from '@discordjs/voice';
import { logger } from '../../utils/logger.js';

export default {
    name: 'music_play_modal',
    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const query = interaction.fields.getTextInputValue('music_query').trim();
        const member = interaction.member;
        const voiceChannel = member.voice?.channel;

        if (!voiceChannel) {
            return interaction.editReply({ content: '❌ You need to be in a voice channel to add songs.' });
        }

        let player = getMusicPlayer(interaction.guildId);
        const existingConn = getVoiceConnection(interaction.guildId);

        if (existingConn && player?.voiceChannelId && player.voiceChannelId !== voiceChannel.id) {
            const ch = interaction.guild.channels.cache.get(player.voiceChannelId);
            return interaction.editReply({
                content: `❌ I'm in **${ch?.name ?? 'another channel'}**. Join that channel to add songs.`
            });
        }

        try {
            const tracks = await resolveTrack(query, interaction.user.id, interaction.user.tag);

            if (!player) {
                player = getOrCreateMusicPlayer(interaction.guildId);
            }

            player._client = client;

            if (!existingConn || !player.connection) {
                player.connectTo(voiceChannel, interaction.guild);
            }

            const wasIdle = !player.currentTrack && player.queue.length === 0 && player.isIdle();

            for (const track of tracks) {
                player.queue.push(track);
            }

            const firstTrack = tracks[0];
            const isPlaylist = tracks.length > 1;

            const embed = new EmbedBuilder()
                .setColor(0x1DB954)
                .setTitle(isPlaylist ? `📋 Playlist Added — ${tracks.length} tracks` : '🎵 Added to Queue')
                .setTimestamp();

            if (!isPlaylist && firstTrack.thumbnail) embed.setThumbnail(firstTrack.thumbnail);

            embed.addFields(
                { name: isPlaylist ? 'First Track' : 'Track', value: `**[${firstTrack.title}](${firstTrack.url})**\n\`${firstTrack.durationStr}\`` },
                { name: 'Position in Queue', value: wasIdle ? '▶ Playing now' : `#${player.queue.length}` }
            );

            if (isPlaylist) {
                const totalSec = tracks.reduce((s, t) => s + (t.duration || 0), 0);
                const h = Math.floor(totalSec / 3600);
                const m = Math.floor((totalSec % 3600) / 60);
                embed.addFields({ name: 'Total Duration', value: h > 0 ? `${h}h ${m}m` : `${m}m` });
            }

            await interaction.editReply({ embeds: [embed] });

            if (wasIdle) {
                await player.playNext(client);
            } else {
                await player.updateDashboard(client);
            }

        } catch (err) {
            logger.error('[Music] resolveTrack error:', err.message);
            await interaction.editReply({
                content: `❌ Could not find or play that: ${err.message}`
            });
        }
    }
};
