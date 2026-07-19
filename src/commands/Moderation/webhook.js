import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ChannelType
} from 'discord.js';
import { setInDb, getFromDb } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

async function getWebhooks(guildId) {
    return (await getFromDb(`webhooks_${guildId}`)) || {};
}

async function saveWebhooks(guildId, data) {
    await setInDb(`webhooks_${guildId}`, data);
}

function parseDiscohookJson(raw) {
    let parsed;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        throw new Error('Invalid JSON — could not parse the file.');
    }

    // Wrapped Discohook format: { messages: [{ data: {...} }] }
    if (parsed?.messages?.[0]?.data) {
        parsed = parsed.messages[0].data;
    }

    // Discohook components-v2 format: { webhookUrl, message: { components, ... } }
    if (parsed?.message && typeof parsed.message === 'object') {
        parsed = parsed.message;
    }

    return parsed;
}

export default {
    data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Create, manage and send custom webhook messages')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a webhook in a channel and save it for reuse')
                .addStringOption(o =>
                    o.setName('name')
                        .setDescription('Short name to identify this webhook (e.g. announcements)')
                        .setRequired(true)
                )
                .addChannelOption(o =>
                    o.setName('channel')
                        .setDescription('Channel to place the webhook in')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
                .addAttachmentOption(o =>
                    o.setName('json')
                        .setDescription('Optional Discohook JSON file to send immediately after creating the webhook')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('send')
                .setDescription('Send a message through a saved webhook (supports Discohook JSON)')
                .addStringOption(o =>
                    o.setName('name')
                        .setDescription('Webhook name to send through')
                        .setRequired(true)
                )
                .addAttachmentOption(o =>
                    o.setName('json')
                        .setDescription('Discohook JSON export file (.json)')
                        .setRequired(false)
                )
                .addStringOption(o =>
                    o.setName('content')
                        .setDescription('Plain text message (if not using a JSON file)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Show all saved webhooks for this server')
        )
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete a saved webhook')
                .addStringOption(o =>
                    o.setName('name')
                        .setDescription('Name of the webhook to delete')
                        .setRequired(true)
                )
        ),
    category: 'moderation',

    async execute(interaction, config, client) {
        const ALLOWED_ROLES = ['1511500077137399928', '1511500091544961045'];
        const hasRole = ALLOWED_ROLES.some(r => interaction.member.roles.cache.has(r));

        if (!hasRole) {
            const denyEmbed = new EmbedBuilder()
                .setColor(0xED4245)
                .setDescription(
                    '🚫 **You are missing the proper permissions to carry out this command.**\n\n' +
                    'Contact the Hideaway Community Owner if you believe this is a mistake.'
                );
            return interaction.reply({ embeds: [denyEmbed], flags: MessageFlags.Ephemeral });
        }

        const deferOk = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferOk) return;

        const guildId = interaction.guildId;
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'create') {
                const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-');
                const channel = interaction.options.getChannel('channel');
                const jsonAttachment = interaction.options.getAttachment('json');

                const webhooks = await getWebhooks(guildId);
                if (webhooks[name]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ A webhook named **${name}** already exists. Delete it first or choose a different name.`
                    });
                }

                if (jsonAttachment && !jsonAttachment.name.endsWith('.json') && !jsonAttachment.contentType?.includes('json')) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ The attached file must be a `.json` file exported from Discohook.'
                    });
                }

                webhooks[name] = {
                    channelId: channel.id,
                    channelName: channel.name,
                    createdBy: interaction.user.id,
                    createdAt: Date.now()
                };
                await saveWebhooks(guildId, webhooks);

                let initialSent = false;
                let initialError = null;

                if (jsonAttachment) {
                    try {
                        const res = await fetch(jsonAttachment.url);
                        if (!res.ok) throw new Error(`Could not download the file (HTTP ${res.status})`);
                        const raw = await res.text();
                        const payload = parseDiscohookJson(raw);

                        await channel.send({
                            ...(payload.content ? { content: payload.content } : {}),
                            ...(payload.embeds?.length ? { embeds: payload.embeds } : {}),
                            ...(payload.components?.length ? { components: payload.components } : {}),
                        });
                        initialSent = true;
                    } catch (err) {
                        logger.error('Webhook create — initial send error:', err);
                        initialError = err.message;
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Webhook Created')
                    .addFields(
                        { name: 'Name', value: `\`${name}\``, inline: true },
                        { name: 'Channel', value: channel.toString(), inline: true }
                    )
                    .setFooter({ text: 'Use /webhook send to post through it — messages send as the bot itself' })
                    .setTimestamp();

                if (jsonAttachment) {
                    embed.addFields({
                        name: 'Initial Message',
                        value: initialSent
                            ? '✅ JSON sent successfully'
                            : `❌ Failed to send: ${initialError ?? 'unknown error'}`
                    });
                }

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'list') {
                const webhooks = await getWebhooks(guildId);
                const entries = Object.entries(webhooks);

                if (entries.length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '📭 No webhooks have been configured yet. Use `/webhook create` to add one.'
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('🔗 Configured Webhooks')
                    .setDescription(
                        entries.map(([name, data]) => {
                            const ch = interaction.guild.channels.cache.get(data.channelId);
                            return `**${name}** → ${ch ? ch.toString() : `#${data.channelName}`}`;
                        }).join('\n')
                    )
                    .setFooter({ text: `${entries.length} webhook${entries.length === 1 ? '' : 's'} total` })
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'delete') {
                const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-');
                const webhooks = await getWebhooks(guildId);

                if (!webhooks[name]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ No webhook named **${name}** found. Use \`/webhook list\` to see existing webhooks.`
                    });
                }

                delete webhooks[name];
                await saveWebhooks(guildId, webhooks);

                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🗑️ Webhook Deleted')
                    .setDescription(`The webhook **${name}** has been removed.`)
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'send') {
                const name = interaction.options.getString('name').toLowerCase().replace(/\s+/g, '-');
                const webhooks = await getWebhooks(guildId);

                if (!webhooks[name]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ No webhook named **${name}** found. Use \`/webhook list\` to see existing webhooks.`
                    });
                }

                const jsonAttachment = interaction.options.getAttachment('json');
                const plainContent = interaction.options.getString('content');

                const entry = webhooks[name];
                const channel = interaction.guild.channels.cache.get(entry.channelId);

                if (!channel) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ The channel for **${name}** no longer exists. Delete this webhook and create a new one.`
                    });
                }

                try {
                    let payload = {};

                    if (jsonAttachment) {
                        if (!jsonAttachment.name.endsWith('.json') && !jsonAttachment.contentType?.includes('json')) {
                            return InteractionHelper.safeEditReply(interaction, {
                                content: '❌ The attached file must be a `.json` file exported from Discohook.'
                            });
                        }

                        const res = await fetch(jsonAttachment.url);
                        if (!res.ok) throw new Error(`Failed to download attachment (${res.status})`);
                        const raw = await res.text();

                        payload = parseDiscohookJson(raw);
                    }

                    if (plainContent) payload.content = plainContent;

                    const sendPayload = {
                        ...(payload.content ? { content: payload.content } : {}),
                        ...(payload.embeds?.length ? { embeds: payload.embeds } : {}),
                        ...(payload.components?.length ? { components: payload.components } : {}),
                    };

                    await channel.send(sendPayload);

                    const embed = new EmbedBuilder()
                        .setColor(0x57F287)
                        .setTitle('✅ Message Sent')
                        .addFields(
                            { name: 'Webhook', value: `\`${name}\``, inline: true },
                            { name: 'Channel', value: channel.toString(), inline: true }
                        )
                        .setTimestamp();

                    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                } catch (err) {
                    logger.error('Webhook send error:', err);
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ Failed to send: ${err.message}`
                    });
                }
            }
        } catch (err) {
            logger.error('Webhook command error:', err);
            return InteractionHelper.safeEditReply(interaction, {
                content: `❌ Something went wrong: ${err.message}`
            });
        }
    }
};
