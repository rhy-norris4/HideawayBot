import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from 'discord.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { createEmbed } from '../../utils/embeds.js';
import {
    getUserGoogleEmail,
    removeUserGoogleEmail,
    getMappings,
    syncGuildGoogleGroups,
    isGoogleGroupsConfigured,
    canUseGoogleUpdate,
    getStaffRoles,
    addStaffRole,
    removeStaffRole,
} from '../../services/googleGroupsService.js';

export default {
    data: new SlashCommandBuilder()
        .setName('google')
        .setDescription('Manage Google email linking and role sync')
        .addSubcommand(sub =>
            sub.setName('link')
                .setDescription('See which Google Groups you should join based on your roles')
        )
        .addSubcommand(sub =>
            sub.setName('update')
                .setDescription('Sync a member\'s Discord roles based on their linked Google email')
                .addUserOption(o =>
                    o.setName('member').setDescription('The member to update').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View a member\'s linked Google email')
                .addUserOption(o =>
                    o.setName('member').setDescription('The member to check').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Remove a member\'s linked Google email')
                .addUserOption(o =>
                    o.setName('member').setDescription('The member to clear').setRequired(true)
                )
        )
        .addSubcommandGroup(group =>
            group.setName('config')
                .setDescription('Configure who can use /google update')
                .addSubcommand(sub =>
                    sub.setName('role-add')
                        .setDescription('Allow a role to use /google update')
                        .addRoleOption(o =>
                            o.setName('role').setDescription('Role to add').setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('role-remove')
                        .setDescription('Remove a role from /google update access')
                        .addRoleOption(o =>
                            o.setName('role').setDescription('Role to remove').setRequired(true)
                        )
                )
                .addSubcommand(sub =>
                    sub.setName('role-list')
                        .setDescription('List roles allowed to use /google update')
                )
        ),

    category: 'admin',

    async execute(interaction, config, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const group = interaction.options.getSubcommandGroup(false);

        try {
            if (group === 'config') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '❌ No Permission',
                            description: 'Only administrators can configure Google update access.',
                            color: 'error',
                        })],
                    });
                }

                if (sub === 'role-add') {
                    const role = interaction.options.getRole('role');
                    await addStaffRole(interaction.guildId, role.id);
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '✅ Role Added',
                            description: `${role} can now use \`/google update\`.`,
                            color: 'success',
                        })],
                    });
                }

                if (sub === 'role-remove') {
                    const role = interaction.options.getRole('role');
                    await removeStaffRole(interaction.guildId, role.id);
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '✅ Role Removed',
                            description: `${role} can no longer use \`/google update\` (unless they have Manage Roles permission).`,
                            color: 'success',
                        })],
                    });
                }

                if (sub === 'role-list') {
                    const staffRoles = await getStaffRoles(interaction.guildId);
                    const roleLines = staffRoles.length
                        ? staffRoles.map(id => {
                            const r = interaction.guild.roles.cache.get(id);
                            return r ? r.toString() : `Unknown role (${id})`;
                        }).join('\n')
                        : 'None configured — only members with **Manage Roles** permission can use `/google update`.';

                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '📋 Google Update Roles',
                            description: roleLines,
                            color: 'primary',
                        })],
                    });
                }
            }

            if (sub === 'link') {
                const mappings = await getMappings(interaction.guildId);

                if (!mappings.length) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '📋 Google Groups',
                            description: 'No Google Group mappings have been configured for this server yet.',
                            color: 'primary',
                        })],
                    });
                }

                const memberRoles = interaction.member.roles.cache;
                const myGroups = mappings.filter(m => memberRoles.has(m.roleId));

                if (!myGroups.length) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '📋 Your Google Groups',
                            description: 'None of your current roles are mapped to a Google Group.\n\nIf you think this is wrong, contact a staff member.',
                            color: 'primary',
                        })],
                    });
                }

                const groupLines = myGroups.map(m => {
                    const name = m.groupName && m.groupName !== m.groupEmail ? m.groupName : m.groupEmail;
                    return `**${name}**\n📧 \`${m.groupEmail}\`\n🔗 [Join via groups.google.com](https://groups.google.com/g/${m.groupEmail.split('@')[0]})`;
                });

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '📋 Your Google Groups',
                        description: `Based on your roles, you should be a member of the following Google Group${myGroups.length !== 1 ? 's' : ''}:\n\n${groupLines.join('\n\n')}\n\n**How to join:** Go to [groups.google.com](https://groups.google.com), search for the group by name, and request to join. Make sure you're signed in with your linked email.`,
                        color: 'primary',
                    })],
                });
            }

            const allowed = await canUseGoogleUpdate(interaction.member, interaction.guildId);
            if (!allowed) {
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '❌ No Permission',
                        description: 'You don\'t have permission to use this command.',
                        color: 'error',
                    })],
                });
            }

            const targetUser = interaction.options.getUser('member');
            const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!targetMember) {
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '❌ Member Not Found',
                        description: 'That member could not be found in this server.',
                        color: 'error',
                    })],
                });
            }

            if (sub === 'view') {
                const email = await getUserGoogleEmail(targetUser.id);
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '📧 Linked Google Email',
                        description: email
                            ? `**${targetMember.displayName}**'s linked email:\n\`${email}\``
                            : `**${targetMember.displayName}** has not linked a Google email yet.`,
                        color: 'primary',
                        fields: email ? [{ name: 'Member', value: targetUser.toString(), inline: true }] : [],
                    })],
                });
            }

            if (sub === 'clear') {
                const email = await getUserGoogleEmail(targetUser.id);
                if (!email) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '⚠️ No Email Linked',
                            description: `**${targetMember.displayName}** has no Google email linked.`,
                            color: 'warning',
                        })],
                    });
                }
                await removeUserGoogleEmail(targetUser.id);
                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '✅ Email Cleared',
                        description: `Removed the linked Google email for **${targetMember.displayName}**.`,
                        color: 'success',
                    })],
                });
            }

            if (sub === 'update') {
                const email = await getUserGoogleEmail(targetUser.id);
                const mappings = await getMappings(interaction.guildId);

                if (!email) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '❌ No Email Linked',
                            description: `**${targetMember.displayName}** hasn't linked a Google email yet.\n\nAsk them to click **Link Google Email** on the verification panel.`,
                            color: 'error',
                        })],
                    });
                }

                if (!mappings.length) {
                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '⚙️ No Group Mappings',
                            description: 'No Google Group → Role mappings are configured. Use `/googlegroups add` to set them up first.',
                            color: 'warning',
                            fields: [{ name: 'Linked Email', value: `\`${email}\``, inline: false }],
                        })],
                    });
                }

                if (await isGoogleGroupsConfigured()) {
                    await interaction.editReply({
                        embeds: [createEmbed({
                            title: '🔄 Syncing...',
                            description: `Checking Google Group memberships for \`${email}\`...`,
                            color: 'primary',
                        })],
                    });

                    const result = await syncGuildGoogleGroups(client, interaction.guildId);
                    const statusLines = [];
                    if (result.synced > 0) statusLines.push(`✅ **${result.synced}** role update(s) applied`);
                    if (result.errors.length > 0) statusLines.push(`❌ ${result.errors.slice(0, 2).map(e => `• ${e}`).join('\n')}`);
                    if (!statusLines.length) statusLines.push('✅ No role changes needed.');

                    return interaction.editReply({
                        embeds: [createEmbed({
                            title: '✅ Sync Complete',
                            description: statusLines.join('\n'),
                            color: result.errors.length ? 'warning' : 'success',
                            fields: [{ name: 'Email', value: `\`${email}\``, inline: true }],
                        })],
                    });
                }

                const fields = mappings.map(m => {
                    const role = interaction.guild.roles.cache.get(m.roleId);
                    const hasRole = targetMember.roles.cache.has(m.roleId);
                    return {
                        name: m.groupEmail,
                        value: `${role ? role.toString() : `Unknown (${m.roleId})`} — ${hasRole ? '✅ Assigned' : '❌ Not assigned'}`,
                        inline: false,
                    };
                });

                const rows = [];
                const buttons = mappings.slice(0, 5).map(m => {
                    const role = interaction.guild.roles.cache.get(m.roleId);
                    const hasRole = targetMember.roles.cache.has(m.roleId);
                    return new ButtonBuilder()
                        .setCustomId(`google_role_toggle:${targetUser.id}:${m.roleId}`)
                        .setLabel(`${hasRole ? 'Remove' : 'Assign'}: ${role?.name || m.roleId}`)
                        .setStyle(hasRole ? ButtonStyle.Danger : ButtonStyle.Success);
                });

                if (buttons.length) rows.push(new ActionRowBuilder().addComponents(buttons));

                return interaction.editReply({
                    embeds: [createEmbed({
                        title: '📋 Manual Google Groups Update',
                        description: `**${targetMember.displayName}**'s linked email: \`${email}\`\n\nReview their Google Group memberships below and use the buttons to assign or remove roles.`,
                        color: 'primary',
                        fields,
                    })],
                    components: rows,
                });
            }
        } catch (err) {
            return handleInteractionError(err, interaction);
        }
    },
};
