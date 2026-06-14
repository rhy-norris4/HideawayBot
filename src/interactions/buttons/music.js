import { EmbedBuilder, MessageFlags } from 'discord.js';
import { getMusicPlayer } from '../../services/musicService.js';
import { logger } from '../../utils/logger.js';

function getPlayerOrDeny(interaction) {
    const player = getMusicPlayer(interaction.guildId);
    if (!player) {
        interaction.reply({
            content: '❌ No music player is active. Use `/music` to start one.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return null;
    }
    return player;
}

function buildQueueEmbed(player) {
    const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle('📋 Music Queue')
        .setTimestamp();

    if (!player.currentTrack && player.queue.length === 0) {
        embed.setDescription('The queue is empty.');
        return embed;
    }

    if (player.currentTrack) {
        const status = player.isPaused() ? '⏸ Paused' : '▶ Now Playing';
        embed.addFields({
            name: status,
            value: `**${player.currentTrack.title}** \`${player.currentTrack.durationStr}\`\nRequested by <@${player.currentTrack.requesterId}>`
        });
    }

    if (player.queue.length > 0) {
        const lines = player.queue.slice(0, 20).map((t, i) =>
            `\`${String(i + 1).padStart(2)}.\` ${t.title.length > 50 ? t.title.slice(0, 47) + '…' : t.title}  \`${t.durationStr}\`  — <@${t.requesterId}>`
        );
        if (player.queue.length > 20) lines.push(`*… and ${player.queue.length - 20} more*`);
        embed.addFields({ name: `Queue — ${player.queue.length} track${player.queue.length !== 1 ? 's' : ''}`, value: lines.join('\n') });
    }

    const loopLabel = player.loop === 'none' ? 'Off' : player.loop === 'song' ? '🔂 Song' : '🔁 Queue';
    embed.addFields({
        name: '\u200b',
        value: `🔊 Volume: **${player.volume}%**  ╎  🔁 Loop: **${loopLabel}**`
    });

    return embed;
}

export default [
    {
        name: 'music_play',
        async execute(interaction, client) {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = await import('discord.js');
            const modal = new ModalBuilder()
                .setCustomId('music_play_modal')
                .setTitle('Add to Queue');

            const input = new TextInputBuilder()
                .setCustomId('music_query')
                .setLabel('YouTube URL / Spotify URL / Search query')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. https://youtube.com/watch?v=... or Artist - Song Name')
                .setRequired(true)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
    },
    {
        name: 'music_pause',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;

            if (player.isPaused()) {
                const resumed = player.resume();
                await interaction.reply({
                    content: resumed ? '▶ Resumed playback.' : '⚠️ Nothing to resume.',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                const paused = player.pause();
                await interaction.reply({
                    content: paused ? '⏸ Paused.' : '⚠️ Nothing is playing.',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
    {
        name: 'music_skip',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            if (!player.currentTrack) {
                return interaction.reply({ content: '⚠️ Nothing is playing to skip.', flags: MessageFlags.Ephemeral });
            }
            const skipped = player.currentTrack.title;
            player.skip(client);
            await interaction.reply({ content: `⏭ Skipped **${skipped}**.`, flags: MessageFlags.Ephemeral });
        }
    },
    {
        name: 'music_prev',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            const went = player.previous(client);
            await interaction.reply({
                content: went ? '⏮ Going back to the previous track.' : '⚠️ No previous track in history.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
    {
        name: 'music_stop',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await player.stop(client);
            await interaction.editReply({ content: '⏹ Stopped playback and left the voice channel.' });
        }
    },
    {
        name: 'music_shuffle',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            if (player.queue.length < 2) {
                return interaction.reply({ content: '⚠️ Need at least 2 tracks in the queue to shuffle.', flags: MessageFlags.Ephemeral });
            }
            player.shuffle();
            await player.updateDashboard(client);
            await interaction.reply({ content: `🔀 Shuffled **${player.queue.length}** tracks.`, flags: MessageFlags.Ephemeral });
        }
    },
    {
        name: 'music_queue',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            await interaction.reply({ embeds: [buildQueueEmbed(player)], flags: MessageFlags.Ephemeral });
        }
    },
    {
        name: 'music_loop',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            const mode = player.cycleLoop(client);
            const labels = { none: 'Off ❌', song: 'Song 🔂', queue: 'Queue 🔁' };
            await interaction.reply({ content: `🔁 Loop set to **${labels[mode]}**`, flags: MessageFlags.Ephemeral });
        }
    },
    {
        name: 'music_vol_down',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            player.setVolume(player.volume - 10, client);
            await interaction.reply({ content: `🔉 Volume: **${player.volume}%**`, flags: MessageFlags.Ephemeral });
        }
    },
    {
        name: 'music_vol_up',
        async execute(interaction, client) {
            const player = getPlayerOrDeny(interaction);
            if (!player) return;
            player.setVolume(player.volume + 10, client);
            await interaction.reply({ content: `🔊 Volume: **${player.volume}%**`, flags: MessageFlags.Ephemeral });
        }
    }
];
