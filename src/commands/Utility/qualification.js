import {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} from 'discord.js';
import { getFromDb, setInDb } from '../../utils/database.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { logEvent, EVENT_TYPES } from '../../services/loggingService.js';

const DB_KEY = guildId => `qualification_config_${guildId}`;

export default {
    data: new SlashCommandBuilder()
        .setName('qualification')
        .setDescription('Qualification role management')
        .addSubcommandGroup(group =>
            group.setName('manage')
                .setDescription('Configure qualifications (Admin only)')
                .addSubcommand(sub =>
                    sub.setName('add')
                        .setDescription('Bind a qualification name to a role')
                        .addStringOption(o =>
                            o.setName('name').setDescription('Qualification name').setRequired(true)
                        )
                        .addRoleOption(o =>
                            o.setName('role').setDescription('Role to assign for this qualification').setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('remove')
                        .setDescription('Remove a qualification binding')
                        .addStringOption(o =>
                            o.setName('name').setDescription('Qualification name to remove').setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('list')
                        .setDescription('List all configured qualifications')
                )
        )
        .addSubcommand(sub =>
            sub.setName('give')
                .setDescription('Give a user a qualification')
                .addUserOption(o =>
                    o.setName('user').setDescription('User to qualify').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('name').setDescription('Qualification name').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('reason').setDescription('Reason for granting this qualification').setRequired(false).setMaxLength(512)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a qualification from a user')
                .addUserOption(o =>
                    o.setName('user').setDescription('User to remove qualification from').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('name').setDescription('Qualification name').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('reason').setDescription('Reason for removing this qualification').setRequired(false).setMaxLength(512)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List qualifications for a user')
                .addUserOption(o =>
                    o.setName('user').setDescription('User to check (defaults to yourself)').setRequired(false)
                )
        ),
    category: 'Utility',

    async execute(interaction, guildConfig, client) {
        const ok = await InteractionHelper.safeDefer(interaction, { ephemeral: true });
        if (!ok) return;

        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        try {
            if (group === 'manage') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ You need **Manage Server** permission to configure qualifications.'
                    });
                }

                const config = await getFromDb(DB_KEY(guildId), {});

                if (sub === 'add') {
                    const name = interaction.options.getString('name').trim().toLowerCase();
                    const role = interaction.options.getRole('role');
                    config[name] = role.id;
                    await setInDb(DB_KEY(guildId), config);
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `✅ Qualification **${name}** is now linked to ${role}.`
                    });
                }

                if (sub === 'remove') {
                    const name = interaction.options.getString('name').trim().toLowerCase();
                    if (!config[name]) {
                        return InteractionHelper.safeEditReply(interaction, {
                            content: `❌ No qualification named **${name}** found.`
                        });
                    }
                    delete config[name];
                    await setInDb(DB_KEY(guildId), config);
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `✅ Qualification **${name}** removed.`
                    });
                }

                if (sub === 'list') {
                    const entries = Object.entries(config);
                    if (entries.length === 0) {
                        return InteractionHelper.safeEditReply(interaction, {
                            content: '❌ No qualifications configured yet. Use `/qualification manage add` to add one.'
                        });
                    }
                    const embed = new EmbedBuilder()
                        .setTitle('📋 Configured Qualifications')
                        .setColor(0x5865F2)
                        .setDescription(
                            entries.map(([name, roleId]) => {
                                const role = interaction.guild.roles.cache.get(roleId);
                                return `• **${name}** → ${role ? role.toString() : `<@&${roleId}>`}`;
                            }).join('\n')
                        )
                        .setTimestamp();
                    return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
                }
            }

            if (sub === 'give') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ You need **Manage Roles** permission to give qualifications.'
                    });
                }

                const targetUser = interaction.options.getUser('user');
                const name = interaction.options.getString('name').trim().toLowerCase();
                const config = await getFromDb(DB_KEY(guildId), {});

                if (!config[name]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ No qualification named **${name}** found. Use \`/qualification manage list\` to see available qualifications.`
                    });
                }

                const role = interaction.guild.roles.cache.get(config[name]);
                if (!role) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ The role linked to **${name}** no longer exists. Please reconfigure it.`
                    });
                }

                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!member) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ Could not find ${targetUser} in this server.`
                    });
                }

                if (member.roles.cache.has(role.id)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `⚠️ ${targetUser} already has the **${name}** qualification.`
                    });
                }

                const reason = interaction.options.getString('reason') || null;
                await member.roles.add(role, `Qualification "${name}" given by ${interaction.user.tag}${reason ? `: ${reason}` : ''}`);
                logEvent({ client, guildId, eventType: EVENT_TYPES.QUALIFICATION_GIVE, data: {
                    userId: targetUser.id,
                    fields: [
                        { name: 'Recipient', value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
                        { name: 'Qualification', value: name, inline: true },
                        { name: 'Given By', value: `<@${interaction.user.id}>`, inline: true },
                        ...(reason ? [{ name: 'Reason', value: reason, inline: false }] : []),
                    ]
                }}).catch(() => {});

                const embed = new EmbedBuilder()
                    .setColor(0x57F287)
                    .setTitle('✅ Qualification Granted')
                    .setDescription(`${targetUser} has been given the **${name}** qualification.`)
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'remove') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ You need **Manage Roles** permission to remove qualifications.'
                    });
                }

                const targetUser = interaction.options.getUser('user');
                const name = interaction.options.getString('name').trim().toLowerCase();
                const config = await getFromDb(DB_KEY(guildId), {});

                if (!config[name]) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ No qualification named **${name}** found.`
                    });
                }

                const role = interaction.guild.roles.cache.get(config[name]);
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!member) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ Could not find ${targetUser} in this server.`
                    });
                }

                if (!role || !member.roles.cache.has(role.id)) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `⚠️ ${targetUser} does not have the **${name}** qualification.`
                    });
                }

                const reason = interaction.options.getString('reason') || null;
                await member.roles.remove(role, `Qualification "${name}" removed by ${interaction.user.tag}${reason ? `: ${reason}` : ''}`);
                logEvent({ client, guildId, eventType: EVENT_TYPES.QUALIFICATION_REMOVE, data: {
                    userId: targetUser.id,
                    fields: [
                        { name: 'Member', value: `<@${targetUser.id}> \`${targetUser.tag}\``, inline: true },
                        { name: 'Qualification', value: name, inline: true },
                        { name: 'Removed By', value: `<@${interaction.user.id}>`, inline: true },
                        ...(reason ? [{ name: 'Reason', value: reason, inline: false }] : []),
                    ]
                }}).catch(() => {});

                const embed = new EmbedBuilder()
                    .setColor(0xED4245)
                    .setTitle('🗑️ Qualification Removed')
                    .setDescription(`**${name}** qualification has been removed from ${targetUser}.`)
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

            if (sub === 'list') {
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const config = await getFromDb(DB_KEY(guildId), {});

                if (Object.keys(config).length === 0) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: '❌ No qualifications have been configured for this server yet.'
                    });
                }

                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!member) {
                    return InteractionHelper.safeEditReply(interaction, {
                        content: `❌ Could not find ${targetUser} in this server.`
                    });
                }

                const held = Object.entries(config)
                    .filter(([, roleId]) => member.roles.cache.has(roleId))
                    .map(([name]) => `✅ **${name}**`);

                const notHeld = Object.entries(config)
                    .filter(([, roleId]) => !member.roles.cache.has(roleId))
                    .map(([name]) => `❌ **${name}**`);

                const embed = new EmbedBuilder()
                    .setTitle(`🎓 Qualifications — ${member.displayName}`)
                    .setColor(0x5865F2)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .setDescription(
                        [...held, ...notHeld].join('\n') || 'No qualifications found.'
                    )
                    .setTimestamp();

                return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
            }

        } catch (err) {
            logger.error('[Qualification] error:', err.message);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ An error occurred. Please try again.'
            });
        }
    }
};
