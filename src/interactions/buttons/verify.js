import { EmbedBuilder, MessageFlags } from 'discord.js';
import { logger } from '../../utils/logger.js';

const VERIFIED_ROLE_ID = '1511500090165039264';

export default [
    {
        name: 'verify',
        async execute(interaction, client) {
            const { member, guild } = interaction;

            if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
                return interaction.reply({
                    content: '✅ You are already verified!',
                    flags: MessageFlags.Ephemeral
                });
            }

            const role = guild.roles.cache.get(VERIFIED_ROLE_ID)
                || await guild.roles.fetch(VERIFIED_ROLE_ID).catch(() => null);

            if (!role) {
                logger.error(`[Verify] Verified role ${VERIFIED_ROLE_ID} not found in guild ${guild.id}`);
                return interaction.reply({
                    content: '❌ Verification role not found. Please contact a staff member.',
                    flags: MessageFlags.Ephemeral
                });
            }

            try {
                await member.roles.add(role, 'Self-verified via panel');
            } catch (err) {
                logger.error(`[Verify] Failed to add role to ${member.id}:`, err.message);
                return interaction.reply({
                    content: '❌ Failed to assign your role. Please contact a staff member.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Verified!')
                .setDescription(`You've been verified and now have full access to **${guild.name}**. Welcome!`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
];
