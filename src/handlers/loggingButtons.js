// Legacy logging button handler — kept as a stub so the button registration file
// still has something to import. The old dashboard/toggle buttons are no longer
// active; the new panel uses select menus in src/interactions/selectMenus/loggingPanel.js
import { logger } from '../utils/logger.js';

export default {
  customIds: ['logging_toggle', 'logging_refresh_status', 'log_dash_toggle', 'log_dash_refresh'],

  async execute(interaction) {
    try {
      await interaction.reply({
        content: '⚠️ This button is no longer active. Use `/logging panel` to configure logging.',
        ephemeral: true,
      });
    } catch (error) {
      logger.error('Error in legacy logging button handler:', error);
    }
  }
};
