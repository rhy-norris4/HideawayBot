import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
    isGoogleGroupsConfigured,
    getMappings,
    addMapping,
    removeMapping,
    syncGuildGoogleGroups,
    getLastSyncInfo,
} from '../../services/googleGroupsService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('googlegroups')
        .setDescription('Link Google Groups to Discord roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('map')
                .setDescription('Map a Discord role to a Google Group')
                .addRoleOption(o =>
                    o.setName('role').setDescription('The Discord role to map (e.g. @Members)').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('group_email').setDescription('Google Group email (e.g. mygroupname@googlegroups.com)').setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('group_name').setDescription('Friendly display name for this group (e.g. Members Group)').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Link a Google Group to a Discord role')
                .addStringOption(o =>
                    o.setName('group').setDescription('Google Group email (e.g. staff@yourdomain.com)').setRequired(true)
                )
                .addRoleOption(o =>
                    o.setName('role').setDescription('Discord role to assign to group members').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Unlink a Google Group')
                .addStringOption(o =>
                    o.setName('group').setDescription('Google Group email to unlink').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all Google Group → Role mappings')
        )
        .addSubcommand(sub =>
            sub.setName('sync')
                .setDescription('Manually trigger a Google Groups sync now')
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Check sync configuration and last sync time')
        ),

    category: 'admin',

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'map') {
                const role = interaction.options.getRole('role');
                const groupEmail = interaction.options.getString('group_email').toLowerCase().trim();
                const groupName = interaction.options.getString('group_name').trim();

                if (!groupEmail.includes('@')) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '❌ Invalid Email',
                            description: 'Please provide a full Google Group email address (e.g. `mygroupname@googlegroups.com`).',
                            color: 'error',
                        })],
                    });
                }

                await addMapping(interaction.guildId, groupEmail, role.id, groupName);

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '✅ Group Mapped',
                        description: `**${groupName}** has been mapped. Members with the ${role} role will be directed to join this group when they use \`/google link\`.`,
                        color: 'success',
                        fields: [
                            { name: 'Group Name', value: groupName, inline: true },
                            { name: 'Group Email', value: `\`${groupEmail}\``, inline: true },
                            { name: 'Discord Role', value: role.toString(), inline: true },
                        ],
                    })],
                });
            }

            if (sub === 'add') {
                const groupEmail = interaction.options.getString('group').toLowerCase().trim();
                const role = interaction.options.getRole('role');

                if (!groupEmail.includes('@')) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '❌ Invalid Email',
                            description: 'Please provide a full Google Group email address (e.g. `staff@yourdomain.com`).',
                            color: 'error',
                        })],
                    });
                }

                await addMapping(interaction.guildId, groupEmail, role.id);

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '✅ Mapping Added',
                        description: `Members of **${groupEmail}** will be assigned the ${role} role.\n\nRun \`/googlegroups sync\` to apply immediately, or wait for the next automatic sync (every 30 min).`,
                        color: 'success',
                        fields: [
                            { name: 'Google Group', value: groupEmail, inline: true },
                            { name: 'Discord Role', value: role.toString(), inline: true },
                        ],
                    })],
                });
            }

            if (sub === 'remove') {
                const groupEmail = interaction.options.getString('group').toLowerCase().trim();
                const removed = await removeMapping(interaction.guildId, groupEmail);

                if (!removed) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '❌ Not Found',
                            description: `No mapping exists for \`${groupEmail}\`. Use \`/googlegroups list\` to see current mappings.`,
                            color: 'error',
                        })],
                    });
                }

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '✅ Mapping Removed',
                        description: `The mapping for **${groupEmail}** has been removed. Existing role assignments are not affected.`,
                        color: 'success',
                    })],
                });
            }

            if (sub === 'list') {
                const mappings = await getMappings(interaction.guildId);

                if (!mappings.length) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '📋 Google Group Mappings',
                            description: 'No mappings configured yet. Use `/googlegroups add` to link a Google Group to a role.',
                            color: 'primary',
                        })],
                    });
                }

                const fields = mappings.map((m, i) => {
                    const role = interaction.guild.roles.cache.get(m.roleId);
                    const displayName = m.groupName && m.groupName !== m.groupEmail ? m.groupName : null;
                    return {
                        name: `#${i + 1} — ${displayName || m.groupEmail}`,
                        value: [
                            role ? `**Role:** ${role.toString()}` : `**Role:** Unknown (${m.roleId})`,
                            `**Email:** \`${m.groupEmail}\``,
                        ].join('\n'),
                        inline: false,
                    };
                });

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '📋 Google Group Mappings',
                        description: `${mappings.length} mapping${mappings.length !== 1 ? 's' : ''} configured.\n\nMembers can run \`/google link\` to see which groups apply to them.`,
                        color: 'primary',
                        fields,
                    })],
                });
            }

            if (sub === 'sync') {
                const configured = await isGoogleGroupsConfigured();
                if (!configured) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '⚙️ Not Configured',
                            description: 'Google Groups sync requires two secrets to be set in your Replit environment:\n\n' +
                                '• `GOOGLE_SERVICE_ACCOUNT_JSON` — your service account key JSON\n' +
                                '• `GOOGLE_ADMIN_EMAIL` — your Google Workspace admin email\n\n' +
                                'See the bot documentation for setup instructions.',
                            color: 'warning',
                        })],
                    });
                }

                const mappings = await getMappings(interaction.guildId);
                if (!mappings.length) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '📋 No Mappings',
                            description: 'No Google Group mappings are configured. Use `/googlegroups add` first.',
                            color: 'warning',
                        })],
                    });
                }

                await interaction.editReply({
                    embeds: [createEmbed({
                        title: '🔄 Syncing...',
                        description: `Syncing ${mappings.length} Google Group mapping${mappings.length !== 1 ? 's' : ''}. This may take a moment.`,
                        color: 'primary',
                    })],
                });

                const result = await syncGuildGoogleGroups(client, interaction.guildId);

                const statusLines = [];
                if (result.synced > 0) statusLines.push(`✅ **${result.synced}** role assignment${result.synced !== 1 ? 's' : ''} updated`);
                if (result.skipped > 0) statusLines.push(`⏭️ **${result.skipped}** group${result.skipped !== 1 ? 's' : ''} skipped (role not found)`);
                if (result.errors.length > 0) {
                    statusLines.push(`❌ **${result.errors.length}** error${result.errors.length !== 1 ? 's' : ''}:\n${result.errors.slice(0, 3).map(e => `• ${e}`).join('\n')}`);
                }
                if (!statusLines.length) statusLines.push('✅ All members already up to date — no changes needed.');

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '✅ Sync Complete',
                        description: statusLines.join('\n'),
                        color: result.errors.length ? 'warning' : 'success',
                    })],
                });
            }

            if (sub === 'status') {
                const configured = await isGoogleGroupsConfigured();
                const mappings = await getMappings(interaction.guildId);
                const syncInfo = await getLastSyncInfo(interaction.guildId);

                const fields = [
                    {
                        name: 'Configuration',
                        value: configured ? '✅ Service account connected' : '❌ Not configured (missing secrets)',
                        inline: false,
                    },
                    {
                        name: 'Mapped Groups',
                        value: mappings.length > 0 ? `${mappings.length} group${mappings.length !== 1 ? 's' : ''}` : 'None',
                        inline: true,
                    },
                    {
                        name: 'Auto Sync',
                        value: 'Every 30 minutes',
                        inline: true,
                    },
                    {
                        name: 'Last Sync',
                        value: syncInfo?.lastSync
                            ? `<t:${Math.floor(new Date(syncInfo.lastSync).getTime() / 1000)}:R>\n${syncInfo.synced} update(s), ${syncInfo.errors?.length || 0} error(s)`
                            : 'Never run',
                        inline: false,
                    },
                ];

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '📊 Google Groups Status',
                        color: configured ? 'primary' : 'warning',
                        fields,
                    })],
                });
            }
        } catch (err) {
            return handleInteractionError(err, interaction);
        }
    },
};
