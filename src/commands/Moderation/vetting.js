import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getModerationCases } from '../../utils/moderation.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const LEVEL_PREFIX = {
    Moderation: 'MOD',
    Executive: 'EXE',
    Enhanced: 'ENH',
    Management: 'MAN'
};

export default {
    data: new SlashCommandBuilder()
        .setName('vetting')
        .setDescription('Vetting management commands')
        .addSubcommand(sub =>
            sub.setName('check')
                .setDescription('Perform a vetting check on a user')
                .addStringOption(o =>
                    o.setName('level')
                        .setDescription('Level of vetting')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Moderation', value: 'Moderation' },
                            { name: 'Executive', value: 'Executive' },
                            { name: 'Enhanced', value: 'Enhanced' },
                            { name: 'Management', value: 'Management' }
                        )
                )
                .addUserOption(o =>
                    o.setName('username')
                        .setDescription('The user to vet')
                        .setRequired(true)
                )
                .addStringOption(o =>
                    o.setName('reason')
                        .setDescription('Reason for the vetting request')
                        .setRequired(true)
                )
                .addUserOption(o =>
                    o.setName('requesting_member')
                        .setDescription('The member requesting the vetting')
                        .setRequired(true)
                )
        ),
    category: 'moderation',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) return;

        try {
            const sub = interaction.options.getSubcommand();
            if (sub === 'check') await handleVettingCheck(interaction, client);
        } catch (error) {
            logger.error('Vetting command error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ An error occurred while processing the vetting request.'
            });
        }
    }
};

async function handleVettingCheck(interaction, client) {
    const level = interaction.options.getString('level');
    const targetUser = interaction.options.getUser('username');
    const reason = interaction.options.getString('reason');
    const requestingMember = interaction.options.getUser('requesting_member');
    const guild = interaction.guild;

    const member = await guild.members.fetch(targetUser.id).catch(() => null);

    const levelPrefix = LEVEL_PREFIX[level] || level.slice(0, 3).toUpperCase();
    const userPrefix = targetUser.username.slice(0, 3).toUpperCase();

    const vettingCountKey = `vetting_count_${guild.id}_${targetUser.id}`;
    const currentCount = await getFromDb(vettingCountKey, 0);
    const newCount = currentCount + 1;
    await setInDb(vettingCountKey, newCount);

    const vettingId = `${levelPrefix}//${userPrefix}//${newCount}//${targetUser.id}`;
    const shortId = `${Date.now().toString(36).toUpperCase()}`;

    const now = Date.now();

    const [cases, notes, rankHistory] = await Promise.all([
        getModerationCases(guild.id, { userId: targetUser.id, limit: 100 }),
        getFromDb(`moderation_user_notes_${guild.id}_${targetUser.id}`, []),
        getFromDb(`rank_history_${guild.id}_${targetUser.id}`, []),
    ]);

    const activeSanctionsText = cases.length > 0
        ? cases.slice(0, 10).map(c => {
            const expiry = c.metadata?.expiryDate || c.metadata?.timeoutEnds;
            const isExpired = expiry && new Date(expiry).getTime() <= now;
            const expiryText = expiry
                ? isExpired
                    ? ` *(expired <t:${Math.floor(new Date(expiry).getTime() / 1000)}:R>)*`
                    : ` — Expires: <t:${Math.floor(new Date(expiry).getTime() / 1000)}:R>`
                : '';
            return `• **${c.action}** — ${(c.reason || 'No reason').slice(0, 80)}${expiryText}`;
        }).join('\n')
        : '- No active sanctions';

    const rankChangesText = rankHistory.length > 0
        ? rankHistory.slice(-8).reverse().map(r => {
            const action = r.action === 'add' ? 'Added' : 'Removed';
            return `- **${r.roleName}** ${action} — Issued by: <@${r.issuerId}> at <t:${Math.floor(r.timestamp / 1000)}:D>`;
        }).join('\n')
        : '- No rank changes';

    const noteTypeLabel = { warning: '⚠️ Warning', positive: '✅ Positive', neutral: '📝 Neutral', alert: '🚨 Alert' };
    const notesText = Array.isArray(notes) && notes.length > 0
        ? notes.slice(0, 5).map(n => {
            const label = noteTypeLabel[n.type] || '📝 Note';
            const content = (n.content || n.note || '').slice(0, 100);
            return `- ${content} — Added by <@${n.authorId || 'Unknown'}>\n  -- ${label}`;
          }).join('\n')
        : '- No internal notes';

    const joinDate = member?.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`
        : 'Not in server';

    const accountCreated = `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:F>`;

    await setInDb(`vetting_${shortId}`, {
        level,
        vettingId,
        vettingCount: newCount,
        targetUserId: targetUser.id,
        targetUserTag: targetUser.tag,
        requestingMemberId: requestingMember.id,
        reason,
        guildId: guild.id,
        issuerId: interaction.user.id,
        status: 'PENDING',
        createdAt: new Date().toISOString()
    });

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: 'Hideaway Moderation Team' })
        .setTitle(`${level} Vetting Check`)
        .setDescription(
            `> Vetting Level: ${level}\n` +
            `> Authorisation: <@${requestingMember.id}> — \`${requestingMember.id}\`\n` +
            `> Reason: ${reason}`
        )
        .addFields(
            {
                name: 'Member Information',
                value: `👤 <@${targetUser.id}> / \`${targetUser.id}\``,
                inline: true
            },
            {
                name: 'Server Join Date',
                value: `📅 ${joinDate}`,
                inline: true
            },
            {
                name: 'Account Creation',
                value: `📅 ${accountCreated}`,
                inline: true
            },
            {
                name: '⚠️ Active Moderation Sanctions',
                value: activeSanctionsText
            },
            {
                name: '🥇 Rank Changes',
                value: rankChangesText
            },
            {
                name: '🗒️ Internal Notes',
                value: notesText
            }
        )
        .setFooter({ text: `Vetting ID: ${vettingId}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`vetting_pass:${shortId}`)
            .setLabel('✅  PASS')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`vetting_fail:${shortId}`)
            .setLabel('❌  FAIL')
            .setStyle(ButtonStyle.Danger)
    );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] });
}
