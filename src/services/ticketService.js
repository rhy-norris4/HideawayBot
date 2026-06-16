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

async function getOrCreateWebhook(client, guild, channelId) {
    const channel = guild.channels.cache.get(channelId)
        || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;

    const webhooks = await channel.fetchWebhooks().catch(() => null);
    const existing = webhooks?.find(w => w.owner?.id === client.user.id && w.name === 'TitanBot Tickets');
    if (existing) return existing;

    return channel.createWebhook({
        name: 'TitanBot Tickets',
        avatar: client.user.displayAvatarURL()
    }).catch(() => null);
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
            .setCustomId('ticket_close')
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_transcript')
            .setLabel('Transcript')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Secondary)
    );

    const controlMsg = await channel.send({
        content: `<@${user.id}> Welcome! A staff member will be with you shortly.`,
        embeds: [embed],
        components: [row1, row2]
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
        const webhook = await getOrCreateWebhook(client, guild, config.webhookChannelId);
        if (!webhook) return;

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

        await webhook.send({ embeds: [embed] });
    } catch (err) {
        logger.warn('[Tickets] Open log webhook error:', err.message);
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
        const webhook = await getOrCreateWebhook(client, guild, TICKET_LOG_CHANNEL);

        if (webhook) {
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
                        value: `\`${ticketData.guildId}${ticketData.createdAt}${ticketData.num}\`` 
                    },
                    { 
                        name: '📌 Ticket Ref', 
                        value: `\`${channel.name}\`` 
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
                        value: `\`\`\`${reason}\`\`\`` 
                    }
                )
                .setTimestamp();

            const { ButtonBuilder, ButtonStyle, ActionRowBuilder: AR } = await import('discord.js');
            const sentMsg = await webhook.send({ embeds: [closeEmbed], files: [file] });

            const attachmentUrl = sentMsg?.attachments?.first?.()?.url;
            if (attachmentUrl) {
                const row = new AR().addComponents(
                    new ButtonBuilder()
                        .setLabel('Download Transcript')
                        .setStyle(ButtonStyle.Link)
                        .setEmoji('📄')
                        .setURL(attachmentUrl)
                );
                await webhook.editMessage(sentMsg.id, { components: [row] }).catch(() => {});
            }
        }
    } catch (err) {
        logger.warn('[Tickets] Close transcript error:', err.message);
    }

    await channel.send({ content: '🔒 This ticket is now closed. The channel will be deleted in 5 seconds.' });
    await new Promise(r => setTimeout(r, 5000));
    await channel.delete(`Ticket closed by ${closedBy.tag}`).catch(() => {});
}

export async function addUserToTicket(guild, channel, ticketData, userId) {
    if (!ticketData.addedUsers) ticketData.addedUsers = [];
    if (ticketData.addedUsers.includes(userId)) return false;

    ticketData.addedUsers.push(userId);
    await updateTicketData(guild.id, channel.id, { addedUsers: ticketData.addedUsers });

    await channel.permissionOverwrites.edit(userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    }).catch(() => {});

    return true;
}

export async function removeUserFromTicket(guild, channel, ticketData, userId) {
    // Don't allow removing the ticket opener
    if (userId === ticketData.userId) return false;

    if (!ticketData.addedUsers || !ticketData.addedUsers.includes(userId)) return false;

    ticketData.addedUsers = ticketData.addedUsers.filter(id => id !== userId);
    await updateTicketData(guild.id, channel.id, { addedUsers: ticketData.addedUsers });

    await channel.permissionOverwrites.delete(userId).catch(() => {});

    return true;
}

export async function addRoleToTicket(guild, channel, ticketData, roleId) {
    if (!ticketData.addedRoles) ticketData.addedRoles = [];
    if (ticketData.addedRoles.includes(roleId)) return false;

    ticketData.addedRoles.push(roleId);
    await updateTicketData(guild.id, channel.id, { addedRoles: ticketData.addedRoles });

    await channel.permissionOverwrites.edit(roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    }).catch(() => {});

    return true;
}

export async function removeRoleFromTicket(guild, channel, ticketData, roleId) {
    if (!ticketData.addedRoles || !ticketData.addedRoles.includes(roleId)) return false;

    ticketData.addedRoles = ticketData.addedRoles.filter(id => id !== roleId);
    await updateTicketData(guild.id, channel.id, { addedRoles: ticketData.addedRoles });

    await channel.permissionOverwrites.delete(roleId).catch(() => {});

    return true;
}

export async function escalateTicket(client, guild, channel, ticketData, escalationLevel, reason, escalatedBy) {
    const config = ESCALATION_LEVELS[escalationLevel];
    if (!config) throw new Error(`Unknown escalation level: ${escalationLevel}`);

    const oldCategoryId = ticketData.type ? TICKET_TYPES[ticketData.type]?.categoryId : null;

    // Move to new category
    if (config.categoryId !== oldCategoryId) {
        await channel.setParent(config.categoryId).catch(() => {});
    }

    // Add escalation role permissions
    await channel.permissionOverwrites.edit(config.roleId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        ManageMessages: true,
        AttachFiles: true
    }).catch(() => {});

    // Ensure ticket opener still has access
    await channel.permissionOverwrites.edit(ticketData.userId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true
    }).catch(() => {});

    // Update ticket data
    await updateTicketData(guild.id, channel.id, {
        escalated: true,
        escalationLevel,
        escalationReason: reason,
        escalatedBy: escalatedBy.id,
        escalatedAt: Date.now()
    });
}
