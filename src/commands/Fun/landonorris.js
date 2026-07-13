import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getFromDb } from '../../utils/database.js';

// Safe Lando Norris command — use a curated list of image URLs provided per-guild in the database,
// then fallback to LANDO_IMAGES env, then DEFAULT_IMAGES.

const DEFAULT_IMAGES = [
  // Replace these placeholders with vetted hosted images if you want a built-in fallback.
  'https://cdn.jsdelivr.net/gh/rhy-norris4/HideawayBot-assets/lando1.jpg',
  'https://cdn.jsdelivr.net/gh/rhy-norris4/HideawayBot-assets/lando2.jpg',
  'https://cdn.jsdelivr.net/gh/rhy-norris4/HideawayBot-assets/lando3.jpg'
];

function parseEnvList() {
  const raw = process.env.LANDO_IMAGES || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean).filter(u => /^https:\/\//i.test(u));
}

export default {
  data: new SlashCommandBuilder()
    .setName('landonorris')
    .setDescription('Sends a Lando Norris image 🧡 (curated list; Pinterest scraping disabled)'),
  category: 'Fun',

  async execute(interaction) {
    try {
      await InteractionHelper.safeDefer(interaction);

      // 1) Try DB per-guild list (persistent)
      let images = [];
      try {
        const dbKey = `lando_images:${interaction.guildId}`;
        const dbList = await getFromDb(dbKey, null);
        if (Array.isArray(dbList) && dbList.length) images = dbList.slice();
      } catch (err) {
        logger.debug('[LandoNorris] Failed to load images from DB:', err?.message || err);
      }

      // 2) Fallback to env-provided list
      if (!images.length) images = parseEnvList();

      // 3) Fallback to default built-in images
      if (!images.length) images = DEFAULT_IMAGES.slice();

      if (!images.length) {
        const embed = new EmbedBuilder()
          .setColor(0xFF8000)
          .setTitle('🧡 Lando Norris — Images Disabled')
          .setDescription(
            'Image delivery is disabled because no curated image list is configured.\n' +
            'An admin can add images using `/landonorris-manage add <url>`. Alternatively set the environment variable `LANDO_IMAGES` to a comma-separated list of HTTPS image URLs.'
          )
          .setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
      }

      // Pick a random image from the curated list
      const idx = Math.floor(Math.random() * images.length);
      const image = images[idx];

      // Basic validation: must be HTTPS URL
      if (!/^https:\/\//i.test(image)) {
        logger.warn('[LandoNorris] Skipping invalid image URL:', image);
        const embed = new EmbedBuilder()
          .setColor(0xFF8000)
          .setTitle('🧡 Lando Norris — Image Error')
          .setDescription('The configured image list contains an invalid URL. Please ensure all entries are HTTPS image URLs.')
          .setTimestamp();
        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF8000)
        .setTitle('🧡 Lando Norris')
        .setImage(image)
        .setFooter({ text: `Image ${idx + 1} of ${images.length}` })
        .setTimestamp();

      await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    } catch (err) {
      logger.error('[LandoNorris] Command error:', err?.message || err);
      await InteractionHelper.safeEditReply(interaction, {
        content: "❌ Could not process your request."
      });
    }
  }
};
