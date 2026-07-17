import {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} from 'discord.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

const MEDALS_KEY   = guildId => `medals_${guildId}`;
const DISPLAY_KEY  = guildId => `medals_display_${guildId}`;

function medalKey(name) {
    return name.trim().toLowerCase();
}

function parseColor(str) {
    if (!str) return 0x5865F2;
    const hex = str.replace('#', '').trim();
    const n = parseInt(hex, 16);
    return isNaN(n) ? 0x5865F2 : n;
}

async function getMedals(guildId) {
    return getFromDb(MEDALS_KEY(guildId), {});
}

async function saveMedals(guildId, data) {
    return setInDb(MEDALS_KEY(guildId), data);
}

async function getDisplay(guildId) {
    return getFromDb(DISPLAY_KEY(guildId), {});
}

async function saveDisplay(guildId, data) {
    return setInDb(DISPLAY_KEY(guildId), data);
}

function sortedMedals(medals) {
    return Object.values(medals).sort((a, b) => {
        const pa = a.position ?? Infinity;
        const pb = b.position ?? Infinity;
        if (pa !== pb) return pa - pb;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

async function buildMedalEmbeds(guild, medals) {
    const medalList = sortedMedals(medals);
    if (medalList.length === 0) return [];

    await guild.members.fetch().catch(() => {});

    const embeds = [];
    for (const medal of medalList) {
        const role = guild.roles.cache.get(medal.roleId);
        const recipients = role
            ? [...guild.members.cache.values()].filter(m => m.roles.cache.has(medal.roleId))
            : [];

        const description = recipients.length > 0
            ? recipients.map(m => `• ${m.displayName}`).join('\n')
            : '*No recipients yet.*';

        const embed = new EmbedBuilder()
            .setTitle(medal.name)
            .setDescription(description)
            .setColor(medal.color || 0x5865F2);

        if (medal.imageUrl) {
            embed.setThumbnail(medal.imageUrl);
        }

        embeds.push(embed);
    }
    return embeds;
}

export async function refreshMedalDisplay(client, guildId) {
    try {
        const [medals, display] = await Promise.all([getMedals(guildId), getDisplay(guildId)]);

        if (!display?.channelId) return;

        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        const channel = guild.channels.cache.get(display.channelId)
            || await guild.channels.fetch(display.channelId).catch(() => null);
        if (!channel || channel.type !== ChannelType.GuildText) return;

        const medalEmbeds = await buildMedalEmbeds(guild, medals);
        const updatedEmbed = new EmbedBuilder()
            .setDescription(`-# Updated <t:${Math.floor(Date.now() / 1000)}:R>`)
            .setColor(0x2b2d31);

        const allEmbeds = medalEmbeds.length > 0
            ? [...medalEmbeds, updatedEmbed]
            : [new EmbedBuilder().setTitle('No medals configured yet.').setColor(0x2b2d31), updatedEmbed];

        const CHUNK = 10;
        const chunks = [];
        for (let i = 0; i < allEmbeds.length; i += CHUNK) {
            chunks.push(allEmbeds.slice(i, i + CHUNK));
        }

        const oldIds = display.messageIds || [];
        const newIds = [];

        for (let i = 0; i < chunks.length; i++) {
            if (oldIds[i]) {
                try {
                    const existing = await channel.messages.fetch(oldIds[i]);
                    await existing.edit({ embeds: chunks[i] });
                    newIds.push(oldIds[i]);
                } catch {
                    const msg = await channel.send({ embeds: chunks[i] });
                    newIds.push(msg.id);
                }
            } else {
                const msg = await channel.send({ embeds: chunks[i] });
                newIds.push(msg.id);
            }
        }

        for (let i = chunks.length; i < oldIds.length; i++) {
            await channel.messages.fetch(oldIds[i])
                .then(m => m.delete())
                .catch(() => {});
        }

        display.messageIds = newIds;
        await saveDisplay(guildId, display);
    } catch (err) {
        logger.error('[Medal] refreshMedalDisplay error:', err.message);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('medal')
        .setDescription('Server medals and honours management')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new medal')
                .addStringOption(o =>
                    o.setName('name').setDescription('Medal name').setRequired(true)
                )
                .addRoleOption(o =>
                    o.setName('role').setDescription('Discord role bound to this medal').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('color').setDescription('Embed accent colour (hex, e.g. 5865F2 or #FFD700)').setRequired(false)
                )
        )
        .addSubcommandGroup(group =>
            group.setName('image')
                .setDescription('Medal image management')
                .addSubcommand(sub =>
                    sub.setName('add')
                        .setDescription('Set the display image for a medal')
                        .addStringOption(o =>
                            o.setName('medal').setDescription('Medal name').setRequired(true).setAutocomplete(true)
                        )
                        .addStringOption(o =>
                            o.setName('url').setDescription('Direct image URL (e.g. an imgur or CDN link)').setRequired(true)
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Award a medal to a member')
                .addUserOption(o =>
                    o.setName('user').setDescription('Member to award').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('medal').setDescription('Medal name').setRequired(true).setAutocomplete(true)
                )
                .addStringOption(o =>
                    o.setName('reason').setDescription('Reason for awarding this medal').setRequired(false).setMaxLength(512)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a medal from a member')
                .addUserOption(o =>
                    o.setName('user').setDescription('Member').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('medal').setDescription('Medal name').setRequired(true).setAutocomplete(true)
                )
                .addStringOption(o =>
                    o.setName('reason').setDescription('Reason for removing this medal').setRequired(false).setMaxLength(512)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription("List all medals, or a member's medals")
                .addUserOption(o =>
                    o.setName('user').setDescription('Member to check (leave blank for all medals)').setRequired(false)
                )
        )
        .addSubcommandGroup(group =>
            group.setName('manage')
                .setDescription('Medal administration')
                .addSubcommand(sub =>
                    sub.setName('channel')
                        .setDescription('Set the channel for the medals display board')
                        .addChannelOption(o =>
                            o.setName('channel').setDescription('Text channel for the display').setRequired(true)
                                .addChannelTypes(ChannelType.GuildText)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('refresh')
                        .setDescription('Force-refresh the medals display board')
                )
                .addSubcommand(sub =>
                    sub.setName('delete')
                        .setDescription('Delete a medal entirely')
                        .addStringOption(o =>
                            o.setName('medal').setDescription('Medal name').setRequired(true).setAutocomplete(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('order')
                        .setDescription('Set the display position of a single medal (1 = first)')
                        .addStringOption(o =>
                            o.setName('medal').setDescription('Medal to reposition').setRequired(true).setAutocomplete(true)
                        )
                        .addIntegerOption(o =>
                            o.setName('position').setDescription('Position number (1 = first shown)').setRequired(true).setMinValue(1)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('reorder')
                        .setDescription('Set the order of ALL medals at once — list names separated by commas')
                        .addStringOption(o =>
                            o.setName('list')
                                .setDescription('Medal names in display order, comma-separated (e.g. Valor, Dedication, Leadership)')
                                .setRequired(true)
                                .setMaxLength(2000)
                        )
                )
        ),
    category: 'Utility',

    async execute(interaction, guildConfig, client) {
        const group = interaction.options.getSubcommandGroup(false);
        const sub   = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
        const canManageRoles = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);

        const ok = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!ok) return;

        try {
            if (sub === 'create') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const name  = interaction.options.getString('name').trim();
                const role  = interaction.options.getRole('role');
                const color = parseColor(interaction.options.getString('color'));
                const key   = medalKey(name);

                const medals = await getMedals(guildId);
                if (medals[key]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ A medal named **${name}** already exists.`
                    });
                }

                const nextPosition = Object.values(medals).length + 1;
                medals[key] = { name, roleId: role.id, imageUrl: null, color, position: nextPosition, createdAt: new Date().toISOString() };
                await saveMedals(guildId, medals);
                refreshMedalDisplay(client, guildId).catch(() => {});
                logEvent({ client, guildId, eventType: EVENT_TYPES.MEDAL_CREATE, data: {
                    userId: interaction.user.id,
                    fields: [
                        { name: 'Medal', value: name, inline: true },
                        { name: 'Bound Role', value: role.toString(), inline: true },
                        { name: 'Created By', value: `<@${interaction.user.id}>`, inline: true },
                    ]
                }}).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(color)
                        .setTitle('🏅 Medal Created')
                        .addFields(
                            { name: 'Name', value: name, inline: true },
                            { name: 'Bound Role', value: role.toString(), inline: true },
                            { name: 'Colour', value: `#${color.toString(16).padStart(6, '0').toUpperCase()}`, inline: true }
                        )
                        .setDescription('Use `/medal image add` to set an image, then `/medal manage channel` to set the display channel.')
                        .setTimestamp()
                    ]
                });
            }

            if (group === 'image' && sub === 'add') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const key = medalKey(interaction.options.getString('medal'));
                const url = interaction.options.getString('url').trim();
                const medals = await getMedals(guildId);

                if (!medals[key]) return notFound(interaction, key);

                if (!/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ Please provide a direct image URL (ending in `.png`, `.jpg`, `.gif`, `.webp`, etc.).'
                    });
                }

                medals[key].imageUrl = url;
                await saveMedals(guildId, medals);
                refreshMedalDisplay(client, guildId).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(medals[key].color || 0x5865F2)
                        .setTitle(`🖼️ Image Set — ${medals[key].name}`)
                        .setThumbnail(url)
                        .setDescription('The display board will update momentarily.')
                        .setTimestamp()
                    ]
                });
            }

            if (sub === 'add') {
                if (!canManageRoles) return deny(interaction, 'Manage Roles');

                const targetUser = interaction.options.getUser('user');
                const key = medalKey(interaction.options.getString('medal'));
                const medals = await getMedals(guildId);

                if (!medals[key]) return notFound(interaction, key);

                const medal  = medals[key];
                const role   = interaction.guild.roles.cache.get(medal.roleId);
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

                if (!member) return InteractionHelper.safeEditReply(interaction, { content: `❌ Could not find ${targetUser} in this server.` });
                if (!role)   return InteractionHelper.safeEditReply(interaction, { content: `❌ The role bound to **${medal.name}** no longer exists.` });

                if (member.roles.cache.has(role.id)) {
                    return InteractionHelper.safeEditReply(interaction, { content: `⚠️ ${targetUser} already holds the **${medal.name}** medal.` });
                }

                const reason = interaction.options.getString('reason') || null;
                await member.roles.add(role, `Medal "${medal.name}" awarded by ${interaction.user.tag}${reason ? `: ${reason}` : ''}`);
                refreshMedalDisplay(client, guildId).catch(() => {});
                logEvent({ client, guildId, eventType: EVENT_TYPES.MEDAL_AWARD, data: {
                    userId: targetUser.id,
                    fields: [
                        { name: 'Recipient', value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
                        { name: 'Medal', value: medal.name, inline: true },
                        { name: 'Awarded By', value: `<@${interaction.user.id}>`, inline: true },
                        ...(reason ? [{ name: 'Reason', value: reason, inline: false }] : []),
                    ]
                }}).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(medal.color || 0x57F287)
                        .setTitle('🏅 Medal Awarded')
                        .setDescription(`${targetUser} has been awarded the **${medal.name}** medal.`)
                        .setTimestamp()
                    ]
                });
            }

            if (sub === 'remove') {
                if (!canManageRoles) return deny(interaction, 'Manage Roles');

                const targetUser = interaction.options.getUser('user');
                const key = medalKey(interaction.options.getString('medal'));
                const medals = await getMedals(guildId);

                if (!medals[key]) return notFound(interaction, key);

                const medal  = medals[key];
                const role   = interaction.guild.roles.cache.get(medal.roleId);
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

                if (!member) return InteractionHelper.safeEditReply(interaction, { content: `❌ Could not find ${targetUser} in this server.` });

                if (!role || !member.roles.cache.has(role.id)) {
                    return InteractionHelper.safeEditReply(interaction, { content: `⚠️ ${targetUser} does not hold the **${medal.name}** medal.` });
                }

                const reason = interaction.options.getString('reason') || null;
                await member.roles.remove(role, `Medal "${medal.name}" removed by ${interaction.user.tag}${reason ? `: ${reason}` : ''}`);
                refreshMedalDisplay(client, guildId).catch(() => {});
                logEvent({ client, guildId, eventType: EVENT_TYPES.MEDAL_REMOVE, data: {
                    userId: targetUser.id,
                    fields: [
                        { name: 'Member', value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
                        { name: 'Medal', value: medal.name, inline: true },
                        { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                        ...(reason ? [{ name: 'Reason', value: reason, inline: false }] : []),
                    ]
                }}).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(0xED4245)
                        .setTitle('🗑️ Medal Removed')
                        .setDescription(`The **${medal.name}** medal has been removed from ${targetUser}.`)
                        .setTimestamp()
                    ]
                });
            }

            if (sub === 'list') {
                const targetUser = interaction.options.getUser('user');
                const medals = await getMedals(guildId);
                const medalList = sortedMedals(medals);

                if (targetUser) {
                    const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (!member) return InteractionHelper.safeEditReply(interaction, { content: `❌ Could not find ${targetUser} in this server.` });

                    const held = medalList.filter(m => member.roles.cache.has(m.roleId));

                    const embed = new EmbedBuilder()
                        .setTitle(`🏅 Medals — ${member.displayName}`)
                        .setColor(0x5865F2)
                        .setThumbnail(targetUser.displayAvatarURL())
                        .setDescription(
                            held.length > 0
                                ? held.map(m => `🏅 **${m.name}**`).join('\n')
                                : 'This member holds no medals.'
                        )
                        .setTimestamp();

                    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                }

                if (medalList.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, { content: '❌ No medals have been configured yet.' });
                }

                await interaction.guild.members.fetch().catch(() => {});

                const fields = medalList.map(m => {
                    const role = interaction.guild.roles.cache.get(m.roleId);
                    const count = role
                        ? interaction.guild.members.cache.filter(mb => mb.roles.cache.has(m.roleId)).size
                        : 0;
                    return {
                        name: `🏅 ${m.name}`,
                        value: `Role: ${role ? role.toString() : `\`${m.roleId}\``} • **${count}** holder${count !== 1 ? 's' : ''}`,
                        inline: false
                    };
                });

                const embed = new EmbedBuilder()
                    .setTitle(`🏅 Server Medals — ${interaction.guild.name}`)
                    .setColor(0x5865F2)
                    .addFields(fields)
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (group === 'manage' && sub === 'channel') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const channel = interaction.options.getChannel('channel');

                if (!channel.permissionsFor(interaction.guild.members.me).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ I need **Send Messages** and **Embed Links** in ${channel} to post the display board.`
                    });
                }

                const display = await getDisplay(guildId);
                display.channelId = channel.id;
                display.messageIds = [];
                await saveDisplay(guildId, display);

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Medal display board will post to ${channel}. Building it now…`
                });

                await refreshMedalDisplay(client, guildId);
                return;
            }

            if (group === 'manage' && sub === 'refresh') {
                if (!isAdmin) return deny(interaction, 'Manage Server');
                await InteractionHelper.safeEditReply(interaction, { content: '🔄 Refreshing the medal display board…' });
                await refreshMedalDisplay(client, guildId);
                return InteractionHelper.safeEditReply(interaction, { content: '✅ Medal display board refreshed.' });
            }

            if (group === 'manage' && sub === 'delete') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const key = medalKey(interaction.options.getString('medal'));
                const medals = await getMedals(guildId);

                if (!medals[key]) return notFound(interaction, key);

                const name = medals[key].name;
                delete medals[key];
                await saveMedals(guildId, medals);
                refreshMedalDisplay(client, guildId).catch(() => {});
                logEvent({ client, guildId, eventType: EVENT_TYPES.MEDAL_DELETE, data: {
                    userId: interaction.user.id,
                    fields: [
                        { name: 'Medal', value: name, inline: true },
                        { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true },
                    ]
                }}).catch(() => {});

                return InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Medal **${name}** deleted. The display board will update momentarily.`
                });
            }

            if (group === 'manage' && sub === 'reorder') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const medals  = await getMedals(guildId);
                const input   = interaction.options.getString('list');
                const entries = input.split(',').map(s => s.trim()).filter(Boolean);

                const unmatched = [];
                const matched   = [];

                for (const entry of entries) {
                    const key = medalKey(entry);
                    if (medals[key]) {
                        matched.push(key);
                    } else {
                        unmatched.push(entry);
                    }
                }

                if (matched.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ None of the names you provided matched any medal. Use \`/medal list\` to see exact names.`
                    });
                }

                // Assign positions in the order given
                matched.forEach((key, i) => { medals[key].position = i + 1; });

                // Any medals not in the list go after, keeping their relative order
                const unlistedKeys = Object.keys(medals).filter(k => !matched.includes(k));
                const unlistedSorted = unlistedKeys.sort((a, b) => {
                    const pa = medals[a].position ?? Infinity;
                    const pb = medals[b].position ?? Infinity;
                    return pa !== pb ? pa - pb : (medals[a].createdAt || '').localeCompare(medals[b].createdAt || '');
                });
                unlistedSorted.forEach((key, i) => { medals[key].position = matched.length + i + 1; });

                await saveMedals(guildId, medals);
                refreshMedalDisplay(client, guildId).catch(() => {});

                const ordered = sortedMedals(medals);
                const listStr = ordered.map((m, i) => `${i + 1}. **${m.name}**`).join('\n');

                const warnLine = unmatched.length
                    ? `\n\n⚠️ Not recognised (placed at end): ${unmatched.map(n => `\`${n}\``).join(', ')}`
                    : '';

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('🏅 Medal Order Updated')
                        .setDescription(`**New display order:**\n${listStr}${warnLine}`)
                        .setFooter({ text: 'The display board will update momentarily.' })
                        .setTimestamp()
                    ]
                });
            }

            if (group === 'manage' && sub === 'order') {
                if (!isAdmin) return deny(interaction, 'Manage Server');

                const key      = medalKey(interaction.options.getString('medal'));
                const position = interaction.options.getInteger('position');
                const medals   = await getMedals(guildId);

                if (!medals[key]) return notFound(interaction, key);

                medals[key].position = position;
                await saveMedals(guildId, medals);
                refreshMedalDisplay(client, guildId).catch(() => {});

                const ordered = sortedMedals(medals);
                const listStr = ordered.map((m, i) => `${i + 1}. **${m.name}**${m.position != null ? ` *(pos ${m.position})*` : ''}`).join('\n');

                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('🏅 Medal Order Updated')
                        .setDescription(`**${medals[key].name}** is now at position **${position}**.\n\n**Current display order:**\n${listStr}`)
                        .setFooter({ text: 'The display board will update momentarily.' })
                        .setTimestamp()
                    ]
                });
            }

        } catch (err) {
            logger.error('[Medal] command error:', err.message);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ An error occurred. Please try again.'
            });
        }
    }
};

function deny(interaction, perm) {
    return InteractionHelper.safeEditReply(interaction, {
        content: `❌ You need the **${perm}** permission to use this.`
    });
}

function notFound(interaction, key) {
    return InteractionHelper.safeEditReply(interaction, {
        content: `❌ No medal named **${key}** found. Use \`/medal list\` to see all medals.`
    });
}
