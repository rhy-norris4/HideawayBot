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
    const shortId = `${Date.now().toString(36).toUpperCase()}`;
    const vettingId = `${levelPrefix}//${userPrefix}-${targetUser.id}`;

    const now = Date.now();
    const cases = await getModerationCases(guild.id, { userId: targetUser.id, limit: 100 });

    const activeCases = cases.filter(c => {
        const expiry = c.metadata?.expiryDate || c.metadata?.timeoutEnds;
        if (!expiry) return true;
        return new Date(expiry).getTime() > now;
    });

    const expiredCases = cases.filter(c => {
        const expiry = c.metadata?.expiryDate || c.metadata?.timeoutEnds;
        return expiry && new Date(expiry).getTime() <= now;
    });

    const notes = await getFromDb(`moderation_user_notes_${guild.id}_${targetUser.id}`, []);
    const lastRankChange = await getFromDb(`rank_last_change_${guild.id}_${targetUser.id}`, null);

    const activeCasesText = activeCases.length > 0
        ? activeCases.slice(0, 5).map(c => `• **${c.action}** — ${(c.reason || 'No reason').slice(0, 60)}`).join('\n')
        : 'None';

    const expiredCasesText = expiredCases.length > 0
        ? expiredCases.slice(0, 5).map(c => `• **${c.action}** — ${(c.reason || 'No reason').slice(0, 60)}`).join('\n')
        : 'None';

    const notesText = Array.isArray(notes) && notes.length > 0
        ? notes.slice(0, 3).map(n => `• [${n.type || 'note'}] ${(n.note || '').slice(0, 60)}`).join('\n')
        : 'None';

    const joinDate = member?.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`
        : 'Not in server';

    const accountCreated = `<t:${Math.floor(targetUser.createdAt.getTime() / 1000)}:F>`;

    const lastRankText = lastRankChange
        ? `${lastRankChange.roleName} — by <@${lastRankChange.issuerId}> on <t:${Math.floor(lastRankChange.timestamp / 1000)}:D>`
        : 'Not tracked';

    await setInDb(`vetting_${shortId}`, {
        level,
        vettingId,
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
        .setTitle(`Vetting Request – ${level}`)
        .setDescription(`<@${targetUser.id}> — ${targetUser.id}`)
        .addFields(
            { name: '📊 Messages Sent', value: 'Not tracked', inline: true },
            { name: '📅 Date Joined Server', value: joinDate, inline: true },
            { name: '🗓️ Account Created', value: accountCreated, inline: true },
            { name: '🔴 Active Moderation Actions', value: activeCasesText },
            { name: '⚫ Expired Moderation Actions', value: expiredCasesText },
            { name: '🎖️ Last Rank Change via /rank', value: lastRankText },
            { name: '📝 Staff Notes', value: notesText }
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
