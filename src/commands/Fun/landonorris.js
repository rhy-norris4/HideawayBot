import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const BOARD_URL = 'https://www.pinterest.com/Rhy_m4/lando-norris/';
const BOARD_LINK = 'https://uk.pinterest.com/Rhy_m4/lando-norris/';

const CACHE_TTL = 10 * 60 * 1000;
let imageCache = { urls: [], fetchedAt: 0 };

async function fetchFromUrl(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) throw new Error(`Pinterest fetch failed: ${res.status}`);
    return res.text();
}

async function fetchBoardImages() {
    if (imageCache.urls.length > 0 && Date.now() - imageCache.fetchedAt < CACHE_TTL) {
        return imageCache.urls;
    }

    // Try primary board URL first, then fallback to the UK variant if needed.
    const tryUrls = [BOARD_URL, BOARD_LINK];
    let html = '';
    let lastErr = null;

    for (const u of tryUrls) {
        try {
            html = await fetchFromUrl(u);
            if (html && html.length) break;
        } catch (err) {
            lastErr = err;
            logger.debug(`[LandoNorris] Fetch from ${u} failed: ${err.message}`);
        }
    }

    if (!html) {
        throw lastErr || new Error('Empty response from Pinterest');
    }

    const seen = new Set();
    const urls = [];

    // Match common image hosts used by Pinterest and common extensions.
    const regex = /https:\/\/i\.pinimg\.com\/[^"')\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s]*)?/g;
    for (const match of html.matchAll(regex)) {
        const raw = match[0];
        // Normalize to the originals path to get the best quality image.
        const original = raw.replace(/https:\/\/i\.pinimg\.com\/[^/]+\//, 'https://i.pinimg.com/originals/').split('?')[0];
        const filename = original.substring(original.lastIndexOf('/') + 1);
        if (seen.has(filename)) continue;
        seen.add(filename);
        urls.push(original);
    }

    if (urls.length === 0) {
        // As a last resort, try to parse embedded JSON blobs that sometimes contain image URLs.
        // Look for url fields with i.pinimg.com inside the page.
        for (const match of html.matchAll(/"(https:\/\/i\.pinimg\.com\/[^"\\]+?\.(?:jpg|jpeg|png|webp))"/g)) {
            const raw = match[1].replace(/\\\//g, '/').split('?')[0];
            const original = raw.replace(/https:\/\/i\.pinimg\.com\/[^/]+\//, 'https://i.pinimg.com/originals/');
            const filename = original.substring(original.lastIndexOf('/') + 1);
            if (seen.has(filename)) continue;
            seen.add(filename);
            urls.push(original);
        }
    }

    if (urls.length === 0) throw new Error('No images found on board');

    imageCache = { urls, fetchedAt: Date.now() };
    logger.debug(`[LandoNorris] Cached ${urls.length} images from Pinterest board`);
    return urls;
}

export default {
    data: new SlashCommandBuilder()
        .setName('landonorris')
        .setDescription('Sends a random Lando Norris image 🧡'),
    category: 'Fun',

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction);

            const urls = await fetchBoardImages();
            const image = urls[Math.floor(Math.random() * urls.length)];

            const embed = new EmbedBuilder()
                .setColor(0xFF8000)
                .setTitle('🧡 Lando Norris')
                .setURL(BOARD_LINK)
                .setImage(image)
                .setFooter({ text: `Image ${urls.indexOf(image) + 1} of ${urls.length} • pinterest.com` });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (err) {
            logger.error('[LandoNorris] Failed to fetch image:', err.message);
            await InteractionHelper.safeEditReply(interaction, {
                content: '❌ Couldn\'t fetch an image from the board right now. Try again in a moment.'
            });
        }
    }
};
