import {
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import {
    getFromDb,
    setInDb,
    getTicketKey,
    incrementTicketCounter
} from '../utils/database.js';
import { logger } from '../utils/logger.js';

export const TICKET_TYPES = {
    support: {
        label: 'Support',
        emoji: '🎫',
        color: 0x5865F2,
        categoryId: '1515869049886740682',
        webhookChannelId: '1511811210020917409',
        description: 'Need help? Our support team is here for you.'
    },
    community_report: {
        label: 'Community Report',
        emoji: '🚨',
        color: 0xED4245,
        categoryId: '1515869049886740682',
        webhookChannelId: '1511811210020917409',
        description: 'Report a community member for rule violations.'
    },
    staff_report: {
        label: 'Staff Report',
        emoji: '🛡️',
        color: 0xFEE75C,
        categoryId: '1516547251886096494',
        webhookChannelId: '1511811210020917409',
        description: 'Report a staff member confidentially.'
    },
    conflict: {
        label: 'Conflict of Interest',
        emoji: '⚖️',
        color: 0xEB459E,
        categoryId: '1515869176848191508',
        webhookChannelId: '1514313553803477084',
        description: 'Flag a potential conflict of interest involving staff.'
    }
};

export const ESCALATION_LEVELS = {
    moderation: {
        label: 'Moderation',
        categoryId: '1515869049886740682',
        roleId: '1511500082753830992',
        color: 0x5865F2
    },
    senior_moderation: {
        label: 'Senior Moderation',
        categoryId: '1516547251886096494',
        roleId: '1511500082053120020',
        color: 0xFEE75C
    },
    head_moderation: {
        label: 'Head Moderation',
        categoryId: '1516547331938324520',
        roleId: '1511500080031469790',
        color: 0x57F287
    },
    management: {
        label: 'Management',
        categoryId: '1516547415140991176',
        roleId: '1511500077137399928',
        color: 0xEB459E
    }
};

// TIER2 — full mod access to all tickets
const MOD_ROLES = ['1511500082053120020', '1511500077137399928', '1511500080031469790'];
// TIER1 — support staff, see Support + Community Report only
const SUPPORT_ROLE = '1511500082753830992';

export function getFieldLabels(type) {
    switch (type) {
        case 'support':
            return { subject: '📋 Subject', description: '📝 Description' };
        case 'community_report':
            return { reported_user: '👤 Reported User', description: '📝 Description', evidence: '🔗 Evidence' };
        case 'staff_report':
            return { staff_member: '🛡️ Staff Member', description: '📝 Description', evidence: '🔗 Evidence' };
        case 'conflict':
            return { person_involved: '👤 Person Involved', nature: '📝 Nature of Conflict', details: '📋 Additional Details' };
        default:
            return {};
    }
}

export async function getTicketData(guildId, channelId) {
    return getFromDb(getTicketKey(guildId, channelId));
}

export async function updateTicketData(guildId, channelId, updates) {
    const existing = await getFromDb(getTicketKey(guildId, channelId));
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    await setInDb(getTicketKey(guildId, channelId), updated);
    return updated;
}

function activeKey(guildId, userId, type) {
    return `ticket_active:${guildId}:${userId}:${type}`;
}

export async function getActiveTicket(guildId, userId, type) {
    return getFromDb(activeKey(guildId, userId, type));
}

async function setActiveTicket(guildId, userId, type, channelId) {
    await setInDb(activeKey(guildId, userId, type), channelId);
}

export async function clearActiveTicket(guildId, userId, type) {
    await setInDb(activeKey(guildId, userId, type), null);
}


export async function createTicketChannel(client, guild, user, type, fields) {
    const config = TICKET_TYPES[type];
    if (!config) throw new Error(`Unknown ticket type: ${type}`);

    const existing = await getActiveTicket(guild.id, user.id, type);
    if (existing) {
        const ch = guild.channels.cache.get(existing)
            || await guild.channels.fetch(existing).catch(() => null);
        if (ch) throw new Error(`You already have an open ticket: ${ch}`);
        await clearActiveTicket(guild.id, user.id, type);
    }

    const ticketNum = await incrementTicketCounter(guild.id);
    const safeUser = user.username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'user';
    const channelName = `${type.replace(/_/g, '-')}-${safeUser}-${ticketNum}`;

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];

    for (const roleId of MOD_ROLES) {
        permissionOverwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles
            ]
        });
    }

    if (type === 'support' || type === 'community_report') {
        permissionOverwrites.push({
            id: SUPPORT_ROLE,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        });
    }

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.categoryId,
        permissionOverwrites,
        topic: `${config.label} | Opened by ${user.tag} | Ticket #${ticketNum}`
    });

    const ticketData = {
        guildId: guild.id,
        channelId: channel.id,
        userId: user.id,
        userTag: user.tag,
        type,
        num: ticketNum,
        status: 'open',
        claimedBy: null,
        escalated: false,
        escalationLevel: null,
        escalationReason: null,
        escalatedBy: null,
        escalatedAt: null,
        addedUsers: [],
        addedRoles: [],
        createdAt: Date.now(),
        fields
    };

    await setInDb(getTicketKey(guild.id, channel.id), ticketData);
    await setActiveTicket(guild.id, user.id, type, channel.id);

    const embed = buildTicketEmbed(ticketData, user, config);

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('Claim')
            .setEmoji('🙋')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('ticket_transcript')
            .setLabel('Transcript')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Secondary)
    );

    const controlMsg = await channel.send({
        content: `<@${user.id}> Welcome! A staff member will be with you shortly.\n> Use \`/ticket close <reason>\` to close this ticket.`,
        embeds: [embed],
        components: [row1]
    });

    await controlMsg.pin().catch(() => {});

    return { channel, ticketData };
}

function buildTicketEmbed(ticketData, user, config) {
    const embed = new EmbedBuilder()
        .setColor(config.color)
        .setTitle(`${config.emoji} ${config.label} — #${ticketData.num}`)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `User ID: ${user.id}` })
        .setTimestamp();

    const fieldLabels = getFieldLabels(ticketData.type);
    for (const [key, label] of Object.entries(fieldLabels)) {
        const value = ticketData.fields[key]?.trim() || '*Not provided*';
        embed.addFields({ name: label, value: value.slice(0, 1024) });
    }

    embed.addFields(
        { name: 'Status', value: '🟢 Open', inline: true },
        { name: 'Claimed By', value: '*Unclaimed*', inline: true },
        { name: 'Opened', value: `<t:${Math.floor(ticketData.createdAt / 1000)}:R>`, inline: true }
    );

    return embed;
}

async function sendOpenLog(client, guild, type, user, ticketData, channel, ticketNum) {
    try {
        const config = TICKET_TYPES[type];

        const embed = new EmbedBuilder()
            .setColor(config.color)
            .setTitle(`${config.emoji} New ${config.label} — #${ticketNum}`)
            .setDescription(`**User:** ${user} (${user.tag})\n**Channel:** ${channel}`)
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: `User ID: ${user.id}` });

        const fieldLabels = getFieldLabels(type);
        for (const [key, label] of Object.entries(fieldLabels)) {
            const value = ticketData.fields[key]?.trim() || '*Not provided*';
            embed.addFields({ name: label, value: value.slice(0, 1024) });
        }

        const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL)
            || await guild.channels.fetch(TICKET_LOG_CHANNEL).catch(() => null);
        if (logChannel) await logChannel.send({ embeds: [embed] });
    } catch (err) {
        logger.warn('[Tickets] Open log error:', err.message);
    }
}

export async function generateTranscript(channel) {
    const messages = [];
    let lastId;

    for (let i = 0; i < 5; i++) {
        const opts = { limit: 100 };
        if (lastId) opts.before = lastId;
        const batch = await channel.messages.fetch(opts).catch(() => null);
        if (!batch || batch.size === 0) break;
        messages.push(...batch.values());
        lastId = batch.last()?.id;
        if (batch.size < 100) break;
    }

    messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = [
        `=== Transcript: #${channel.name} ===`,
        `Generated: ${new Date().toISOString()}`,
        `Total messages: ${messages.length}`,
        ''
    ];

    for (const msg of messages) {
        const time = new Date(msg.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
        let content = msg.content || '';
        if (msg.embeds.length) content += content ? ' [+embed]' : '[embed]';
        if (msg.attachments.size) content += ` [${msg.attachments.size} attachment(s)]`;
        if (!content) content = '[no content]';
        lines.push(`[${time}] ${msg.author.tag}: ${content}`);
    }

    return lines.join('\n');
}

function msToHuman(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
}

const TICKET_LOG_CHANNEL = '1514063621712515213';

export async function closeTicket(client, guild, channel, closedBy, reason = 'No reason provided') {
    const ticketData = await getTicketData(guild.id, channel.id);
    if (!ticketData) return;

    await updateTicketData(guild.id, channel.id, {
        status: 'closed',
        closedAt: Date.now(),
        closedBy: closedBy.id,
        closeReason: reason
    });
    await clearActiveTicket(guild.id, ticketData.userId, ticketData.type);

    try {
        const transcript = await generateTranscript(channel);
        const config = TICKET_TYPES[ticketData.type];
        const buffer = Buffer.from(transcript, 'utf-8');
        const file = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });

        const openedUser = await client.users.fetch(ticketData.userId).catch(() => null);
        const closedByUser = await client.users.fetch(closedBy.id).catch(() => null);

        const closeEmbed = new EmbedBuilder()
            .setColor(config.color)
            .setTitle(`🔒 ${config.label} Closed`)
            .addFields(
                {
                    name: '🆔 Ticket ID',
                    value: `\`${channel.name}\``
                },
                {
                    name: '🔢 Channel ID',
                    value: `\`${channel.id}\``
                },
                {
                    name: '🌐 Server',
                    value: `\`${ticketData.guildId}\``
                },
                {
                    name: '👤 Opened by',
                    value: `${openedUser || `User#${ticketData.userId}`} at <t:${Math.floor(ticketData.createdAt / 1000)}:f>`
                },
                {
                    name: '⏰ Closed by',
                    value: `${closedByUser || `User#${closedBy.id}`} at <t:${Math.floor(Date.now() / 1000)}:f>`
                },
                {
                    name: '📋 Reason',
                    value: `${reason}`
                }
            )
            .setTimestamp();

        // Try to upload transcript to log channel and capture a URL
        let transcriptUrl = null;
        try {
            const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL)
                || await guild.channels.fetch(TICKET_LOG_CHANNEL).catch(() => null);
            if (logChannel) {
                const msg = await logChannel.send({ content: `Transcript for ${channel.name}`, files: [file] }).catch(() => null);
                if (msg) transcriptUrl = (msg.attachments?.first()?.url) || msg.url || null;
            }
        } catch (err) {
            logger.warn('[Tickets] Failed to upload transcript to log channel:', err?.message || err);
        }

        // Build DM components
        const components = [];
        if (transcriptUrl) {
            const linkRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View Online Transcript')
                    .setStyle(ButtonStyle.Link)
                    .setURL(transcriptUrl)
            );
            components.push(linkRow);
        }

        const ratingRow = new ActionRowBuilder();
        for (let r = 1; r <= 5; r++) {
            ratingRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_rate:${guild.id}:${channel.id}:${r}`)
                    .setLabel(`${r}`)
                    .setStyle(r >= 4 ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        }
        components.push(ratingRow);

        // Attempt to DM the ticket opener
        try {
            if (openedUser) {
                await openedUser.send({
                    content: `Your ticket **#${ticketData.num}** has been closed by ${closedByUser?.tag || closedBy.id}.`,
                    embeds: [closeEmbed],
                    components
                }).catch(err => {
                    logger.warn(`[Tickets] Could not DM user ${ticketData.userId}: ${err?.message || err}`);
                });
            }
        } catch (err) {
            logger.warn('[Tickets] DM send error:', err?.message || err);
        }

        // Send close embed to log channel directly
        try {
            const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL)
                || await guild.channels.fetch(TICKET_LOG_CHANNEL).catch(() => null);
            if (logChannel) await logChannel.send({ embeds: [closeEmbed] });
        } catch (err) {
            logger.warn('[Tickets] Failed to post close embed to log channel:', err?.message || err);
        }

        // Optionally: notify the ticket channel
        try {
            await channel.send({ content: `🔒 This ticket has been closed by ${closedByUser ? `<@${closedByUser.id}>` : closedBy.id}.` }).catch(() => {});
        } catch (err) {}

    } catch (err) {
        logger.error('[Tickets] Error closing ticket:', err?.message || err);
    }
}

export async function escalateTicket(client, guild, channel, ticket, escalationLevel, reason, escalatedByUser) {
    const escalationConfig = ESCALATION_LEVELS[escalationLevel];
    if (!escalationConfig) throw new Error(`Unknown escalation level: ${escalationLevel}`);

    // Step 1: Move channel to the new category and sync its permissions to the category
    if (escalationConfig.categoryId) {
        await channel.setParent(escalationConfig.categoryId, { lockPermissions: true }).catch(err => {
            logger.warn('[Tickets] Failed to move ticket to escalation category:', err?.message || err);
        });
    }

    // Step 2: After category sync, explicitly re-apply overwrites so they are never lost

    // Re-apply ticket opener access
    await channel.permissionOverwrites.edit(ticket.userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    }).catch(err => logger.warn('[Tickets] Failed to re-grant opener access after escalation:', err?.message || err));

    // Re-apply escalation role access
    await channel.permissionOverwrites.edit(escalationConfig.roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    }).catch(err => logger.warn('[Tickets] Failed to grant escalation role access:', err?.message || err));

    // Re-apply any users added to the ticket before escalation
    for (const userId of (ticket.addedUsers || [])) {
        await channel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        }).catch(err => logger.warn(`[Tickets] Failed to re-grant added user ${userId} access after escalation:`, err?.message || err));
    }

    // Re-apply any roles added to the ticket before escalation
    for (const roleId of (ticket.addedRoles || [])) {
        await channel.permissionOverwrites.edit(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        }).catch(err => logger.warn(`[Tickets] Failed to re-grant added role ${roleId} access after escalation:`, err?.message || err));
    }

    const updated = await updateTicketData(guild.id, channel.id, {
        escalated: true,
        escalationLevel,
        escalationReason: reason,
        escalatedBy: escalatedByUser.id,
        escalatedAt: Date.now()
    });

    // Step 3: Log escalation as plain text directly via the bot (no webhook)
    try {
        const logChannel = guild.channels.cache.get(TICKET_LOG_CHANNEL)
            || await guild.channels.fetch(TICKET_LOG_CHANNEL).catch(() => null);
        if (logChannel) {
            await logChannel.send({
                content:
                    `⬆️ **Ticket Escalated — #${ticket.num}**\n` +
                    `Channel: ${channel}\n` +
                    `Escalated by: ${escalatedByUser.tag || escalatedByUser.id}\n` +
                    `Level: ${escalationConfig.label}\n` +
                    `Reason: ${reason}`
            });
        }
    } catch (err) {
        logger.warn('[Tickets] Failed to log escalation:', err?.message || err);
    }

    return updated;
}

export async function addUserToTicket(guild, channel, ticket, userId) {
    const addedUsers = ticket.addedUsers || [];
    if (addedUsers.includes(userId)) return false;

    await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    });

    await updateTicketData(guild.id, channel.id, {
        addedUsers: [...addedUsers, userId]
    });

    return true;
}

export async function removeUserFromTicket(guild, channel, ticket, userId) {
    const addedUsers = ticket.addedUsers || [];
    if (!addedUsers.includes(userId)) return false;

    await channel.permissionOverwrites.delete(userId).catch(err => {
        logger.warn('[Tickets] Failed to delete user permission overwrite:', err?.message || err);
    });

    await updateTicketData(guild.id, channel.id, {
        addedUsers: addedUsers.filter(id => id !== userId)
    });

    return true;
}

export async function addRoleToTicket(guild, channel, ticket, roleId) {
    const addedRoles = ticket.addedRoles || [];
    if (addedRoles.includes(roleId)) return false;

    await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    });

    await updateTicketData(guild.id, channel.id, {
        addedRoles: [...addedRoles, roleId]
    });

    return true;
}

export async function removeRoleFromTicket(guild, channel, ticket, roleId) {
    const addedRoles = ticket.addedRoles || [];
    if (!addedRoles.includes(roleId)) return false;

    await channel.permissionOverwrites.delete(roleId).catch(err => {
        logger.warn('[Tickets] Failed to delete role permission overwrite:', err?.message || err);
    });

    await updateTicketData(guild.id, channel.id, {
        addedRoles: addedRoles.filter(id => id !== roleId)
    });

    return true;
}
