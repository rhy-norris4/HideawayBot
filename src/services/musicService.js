import {
    AudioPlayerStatus,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    entersState,
    getVoiceConnection,
    joinVoiceChannel,
    NoSubscriberBehavior
} from '@discordjs/voice';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from '../utils/logger.js';

const IDLE_DISCONNECT_MS = 5 * 60 * 1000;
const MAX_QUEUE_SIZE = 100;
const MAX_HISTORY = 15;

let _playdl = null;
async function getPlay() {
    if (!_playdl) _playdl = (await import('play-dl')).default;
    return _playdl;
}

const players = new Map();

export function getMusicPlayer(guildId) {
    return players.get(guildId) ?? null;
}

export function getOrCreateMusicPlayer(guildId) {
    if (!players.has(guildId)) players.set(guildId, new GuildMusicPlayer(guildId));
    return players.get(guildId);
}

export function deleteMusicPlayer(guildId) {
    players.delete(guildId);
}

function fmtDuration(sec) {
    if (!sec || sec <= 0) return '0:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

export async function resolveTrack(input, requesterId, requesterTag) {
    const play = await getPlay();

    const ytValidate = play.yt_validate(input);

    if (ytValidate === 'video') {
        const info = await play.video_info(input);
        const d = info.video_details;
        return [{
            title: d.title ?? 'Unknown',
            url: d.url,
            duration: d.durationInSec,
            durationStr: fmtDuration(d.durationInSec),
            thumbnail: d.thumbnails?.[d.thumbnails.length - 1]?.url ?? null,
            requesterId,
            requesterTag
        }];
    }

    if (ytValidate === 'playlist') {
        const pl = await play.playlist_info(input, { incomplete: true });
        const videos = await pl.all_videos();
        return videos.slice(0, MAX_QUEUE_SIZE).map(v => ({
            title: v.title ?? 'Unknown',
            url: v.url,
            duration: v.durationInSec,
            durationStr: fmtDuration(v.durationInSec),
            thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url ?? null,
            requesterId,
            requesterTag
        }));
    }

    if (input.includes('spotify.com')) {
        const spType = play.sp_validate(input);
        if (spType === 'track') {
            const sp = await play.spotify(input);
            const searchTerm = `${sp.name} ${sp.artists.map(a => a.name).join(' ')}`;
            const results = await play.search(searchTerm, { limit: 1, source: { youtube: 'video' } });
            if (!results.length) throw new Error('Could not find a YouTube equivalent for that Spotify track.');
            const v = results[0];
            return [{
                title: `${sp.name} — ${sp.artists.map(a => a.name).join(', ')}`,
                url: v.url,
                duration: v.durationInSec,
                durationStr: fmtDuration(v.durationInSec),
                thumbnail: sp.thumbnail?.url ?? v.thumbnails?.[0]?.url ?? null,
                requesterId,
                requesterTag
            }];
        }
        if (spType === 'album' || spType === 'playlist') {
            const sp = await play.spotify(input);
            await sp.fetch();
            const tracks = sp.page(1);
            const results = [];
            for (const t of tracks.slice(0, MAX_QUEUE_SIZE)) {
                try {
                    const searchTerm = `${t.name} ${t.artists.map(a => a.name).join(' ')}`;
                    const yt = await play.search(searchTerm, { limit: 1, source: { youtube: 'video' } });
                    if (yt.length) results.push({
                        title: `${t.name} — ${t.artists.map(a => a.name).join(', ')}`,
                        url: yt[0].url,
                        duration: yt[0].durationInSec,
                        durationStr: fmtDuration(yt[0].durationInSec),
                        thumbnail: yt[0].thumbnails?.[0]?.url ?? null,
                        requesterId,
                        requesterTag
                    });
                } catch { /* skip */ }
            }
            if (!results.length) throw new Error('No playable tracks found from that Spotify playlist/album.');
            return results;
        }
        throw new Error('Unsupported Spotify link type.');
    }

    // Plain search query
    const results = await play.search(input, { limit: 5, source: { youtube: 'video' } });
    if (!results.length) throw new Error(`No results found for: **${input}**`);
    const v = results[0];
    return [{
        title: v.title ?? 'Unknown',
        url: v.url,
        duration: v.durationInSec,
        durationStr: fmtDuration(v.durationInSec),
        thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url ?? null,
        requesterId,
        requesterTag
    }];
}

class GuildMusicPlayer {
    constructor(guildId) {
        this.guildId = guildId;
        this.queue = [];
        this.history = [];
        this.currentTrack = null;
        this.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
        this.connection = null;
        this.voiceChannelId = null;
        this.loop = 'none';
        this.volume = 80;
        this.startedAt = null;
        this.dashboardChannelId = null;
        this.dashboardMessageId = null;
        this.idleTimer = null;
        this._client = null;
        this._stopping = false;

        this.player.on(AudioPlayerStatus.Idle, () => {
            if (!this._stopping) this._onIdle();
        });
        this.player.on('error', err => {
            logger.error(`[Music:${guildId}] Player error: ${err.message}`);
            if (!this._stopping) this._onIdle();
        });
    }

    connectTo(voiceChannel, guild) {
        const existing = getVoiceConnection(guild.id);
        if (existing && this.voiceChannelId === voiceChannel.id) return existing;
        if (existing) existing.destroy();

        const conn = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        this.connection = conn;
        this.voiceChannelId = voiceChannel.id;
        conn.subscribe(this.player);

        conn.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
                    entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
                ]);
            } catch {
                this._softDestroy();
                players.delete(this.guildId);
            }
        });

        return conn;
    }

    async playNext(client) {
        this._client = client;
        this._clearIdleTimer();

        let track;
        if (this.loop === 'song' && this.currentTrack) {
            track = this.currentTrack;
        } else {
            track = this.queue.shift() ?? null;
        }

        if (!track) {
            if (this.loop === 'queue' && this.history.length > 0 && !this.currentTrack) {
                // queue loop with empty queue — all done
            }
            this.currentTrack = null;
            await this.updateDashboard(client);
            this._startIdleTimer(client);
            return;
        }

        if (this.loop === 'queue' && this.currentTrack) {
            this.queue.push(this.currentTrack);
        }

        if (this.currentTrack && this.loop !== 'song') {
            this.history.unshift(this.currentTrack);
            if (this.history.length > MAX_HISTORY) this.history.pop();
        }

        this.currentTrack = track;
        this.startedAt = Date.now();

        try {
            const play = await getPlay();
            const stream = await play.stream(track.url, { quality: 2 });
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
                inlineVolume: true
            });
            resource.volume?.setVolumeLogarithmic(this.volume / 100);
            this._stopping = false;
            this.player.play(resource);
        } catch (err) {
            logger.error(`[Music:${this.guildId}] Stream error for "${track.title}": ${err.message}`);
            await this.playNext(client);
            return;
        }

        await this.updateDashboard(client);
    }

    _onIdle() {
        if (this._client) {
            this.playNext(this._client).catch(err =>
                logger.error('[Music] _onIdle error:', err.message)
            );
        }
    }

    pause() {
        if (this.player.state.status === AudioPlayerStatus.Playing) {
            this.player.pause(true);
            if (this._client) this.updateDashboard(this._client);
            return true;
        }
        return false;
    }

    resume() {
        if (this.player.state.status === AudioPlayerStatus.Paused) {
            this.player.unpause();
            if (this._client) this.updateDashboard(this._client);
            return true;
        }
        return false;
    }

    isPaused() { return this.player.state.status === AudioPlayerStatus.Paused; }
    isPlaying() { return this.player.state.status === AudioPlayerStatus.Playing; }
    isIdle() { return this.player.state.status === AudioPlayerStatus.Idle; }

    skip(client) {
        this._client = client;
        this._stopping = false;
        this.player.stop();
    }

    previous(client) {
        const prev = this.history.shift();
        if (!prev) return false;
        if (this.currentTrack) this.queue.unshift(this.currentTrack);
        this.queue.unshift(prev);
        this.currentTrack = null;
        this._client = client;
        this._stopping = false;
        this.player.stop();
        return true;
    }

    async stop(client) {
        this._stopping = true;
        this.queue = [];
        this.currentTrack = null;
        this._clearIdleTimer();
        this.player.stop(true);

        if (this.connection) {
            try { this.connection.destroy(); } catch {}
            this.connection = null;
        }

        await this.updateDashboard(client, true);
        players.delete(this.guildId);
    }

    shuffle() {
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    }

    setVolume(vol, client) {
        this.volume = Math.max(0, Math.min(100, vol));
        const state = this.player.state;
        if (state.status === AudioPlayerStatus.Playing || state.status === AudioPlayerStatus.Paused) {
            state.resource?.volume?.setVolumeLogarithmic(this.volume / 100);
        }
        if (client) this.updateDashboard(client);
    }

    cycleLoop(client) {
        const modes = ['none', 'song', 'queue'];
        this.loop = modes[(modes.indexOf(this.loop) + 1) % modes.length];
        if (client) this.updateDashboard(client);
        return this.loop;
    }

    _softDestroy() {
        this._clearIdleTimer();
        this._stopping = true;
        try { this.player.stop(true); } catch {}
        this.connection = null;
    }

    destroy() {
        this._softDestroy();
        if (this.connection) {
            try { this.connection.destroy(); } catch {}
            this.connection = null;
        }
    }

    _clearIdleTimer() {
        if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
    }

    _startIdleTimer(client) {
        this._clearIdleTimer();
        this.idleTimer = setTimeout(async () => {
            this.destroy();
            players.delete(this.guildId);
            if (this.dashboardChannelId && client) {
                try {
                    const ch = await client.channels.fetch(this.dashboardChannelId).catch(() => null);
                    if (!ch) return;
                    const msg = await ch.messages.fetch(this.dashboardMessageId).catch(() => null);
                    if (msg) await msg.edit({ embeds: [this._idleEmbed('Disconnected after 5 minutes of inactivity.')], components: [] }).catch(() => {});
                } catch {}
            }
        }, IDLE_DISCONNECT_MS);
    }

    _idleEmbed(reason = 'Nothing is playing right now.\nUse ➕ **Add Song** to get started!') {
        return new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎵 Music Player')
            .setDescription(reason)
            .setTimestamp();
    }

    buildNowPlayingEmbed() {
        const track = this.currentTrack;
        if (!track) return this._idleEmbed();

        const paused = this.isPaused();
        const status = paused ? '⏸ Paused' : '▶ Now Playing';
        const color = paused ? 0xFEE75C : 0x1DB954;
        const startTs = this.startedAt ? Math.floor(this.startedAt / 1000) : null;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🎵 Music Player');

        if (track.thumbnail) embed.setThumbnail(track.thumbnail);

        embed.addFields({
            name: status,
            value: [
                `**[${track.title}](${track.url})**`,
                `\`${track.durationStr}\`${startTs ? `  •  Started <t:${startTs}:R>` : ''}`,
                `Requested by <@${track.requesterId}>`
            ].join('\n')
        });

        if (this.queue.length > 0) {
            const preview = this.queue.slice(0, 5).map((t, i) =>
                `\`${String(i + 1).padStart(2)}\` ${t.title.length > 45 ? t.title.slice(0, 42) + '…' : t.title} \`${t.durationStr}\``
            ).join('\n');
            const more = this.queue.length > 5 ? `\n*+ ${this.queue.length - 5} more*` : '';
            embed.addFields({
                name: `📋 Up Next — ${this.queue.length} track${this.queue.length !== 1 ? 's' : ''}`,
                value: preview + more
            });
        }

        const loopLabel = this.loop === 'none' ? 'Off' : this.loop === 'song' ? '🔂 Song' : '🔁 Queue';
        embed.addFields({
            name: '\u200b',
            value: `🔊 Volume: **${this.volume}%**  ╎  🔁 Loop: **${loopLabel}**`
        });

        return embed;
    }

    buildComponents() {
        const hasTrack = !!this.currentTrack;
        const paused = this.isPaused();
        const loopLabel = this.loop === 'none' ? '🔁 Loop: Off' : this.loop === 'song' ? '🔂 Loop: Song' : '🔁 Loop: Queue';

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_prev').setLabel('⏮ Prev').setStyle(ButtonStyle.Secondary).setDisabled(!this.history.length),
            new ButtonBuilder().setCustomId('music_pause').setLabel(paused ? '▶ Resume' : '⏸ Pause').setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary).setDisabled(!hasTrack),
            new ButtonBuilder().setCustomId('music_skip').setLabel('⏭ Skip').setStyle(ButtonStyle.Secondary).setDisabled(!hasTrack),
            new ButtonBuilder().setCustomId('music_stop').setLabel('⏹ Stop').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_play').setLabel('➕ Add Song').setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_shuffle').setLabel('🔀 Shuffle').setStyle(ButtonStyle.Secondary).setDisabled(this.queue.length < 2),
            new ButtonBuilder().setCustomId('music_queue').setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_loop').setLabel(loopLabel).setStyle(this.loop !== 'none' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_vol_down').setLabel('🔉 Vol−').setStyle(ButtonStyle.Secondary).setDisabled(this.volume <= 0),
            new ButtonBuilder().setCustomId('music_vol_up').setLabel('🔊 Vol+').setStyle(ButtonStyle.Secondary).setDisabled(this.volume >= 100)
        );

        return [row1, row2];
    }

    async updateDashboard(client, stopped = false) {
        if (!this.dashboardChannelId || !this.dashboardMessageId || !client) return;
        try {
            const ch = await client.channels.fetch(this.dashboardChannelId).catch(() => null);
            if (!ch) return;
            const msg = await ch.messages.fetch(this.dashboardMessageId).catch(() => null);
            if (!msg) return;
            await msg.edit({
                embeds: [stopped ? this._idleEmbed('Playback stopped.') : this.buildNowPlayingEmbed()],
                components: stopped ? [] : this.buildComponents()
            }).catch(() => {});
        } catch (err) {
            logger.warn('[Music] updateDashboard failed:', err.message);
        }
    }
}
