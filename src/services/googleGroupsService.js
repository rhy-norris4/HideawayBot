import { google } from 'googleapis';
import { logger } from '../utils/logger.js';
import { getFromDb, setInDb, deleteFromDb } from '../utils/database.js';

const USER_EMAIL_KEY = (userId) => `user:${userId}:google_email`;
const STAFF_ROLES_KEY = (guildId) => `guild:${guildId}:googlegroups:staffRoles`;

export async function setUserGoogleEmail(userId, email) {
    await setInDb(USER_EMAIL_KEY(userId), email.toLowerCase().trim());
}

export async function getUserGoogleEmail(userId) {
    return await getFromDb(USER_EMAIL_KEY(userId), null);
}

export async function removeUserGoogleEmail(userId) {
    await deleteFromDb(USER_EMAIL_KEY(userId));
}

export async function getStaffRoles(guildId) {
    const data = await getFromDb(STAFF_ROLES_KEY(guildId), []);
    return Array.isArray(data) ? data : [];
}

export async function addStaffRole(guildId, roleId) {
    const roles = await getStaffRoles(guildId);
    if (!roles.includes(roleId)) {
        roles.push(roleId);
        await setInDb(STAFF_ROLES_KEY(guildId), roles);
    }
    return roles;
}

export async function removeStaffRole(guildId, roleId) {
    const roles = await getStaffRoles(guildId);
    const filtered = roles.filter(r => r !== roleId);
    await setInDb(STAFF_ROLES_KEY(guildId), filtered);
    return filtered;
}

export async function canUseGoogleUpdate(member, guildId) {
    if (member.permissions.has('ManageRoles')) return true;
    const staffRoles = await getStaffRoles(guildId);
    return staffRoles.some(roleId => member.roles.cache.has(roleId));
}

const MAPPINGS_KEY = (guildId) => `guild:${guildId}:googlegroups:mappings`;
const SYNC_LOG_KEY = (guildId) => `guild:${guildId}:googlegroups:lastSync`;

function getAdminClient() {
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const adminEmail = process.env.GOOGLE_ADMIN_EMAIL;

    if (!rawKey || !adminEmail) {
        throw new Error('Google Groups is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_ADMIN_EMAIL secrets.');
    }

    let credentials;
    try {
        credentials = JSON.parse(rawKey);
    } catch {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }

    const auth = new google.auth.JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
            'https://www.googleapis.com/auth/admin.directory.group.readonly',
            'https://www.googleapis.com/auth/admin.directory.group.member.readonly',
        ],
        subject: adminEmail,
    });

    return google.admin({ version: 'directory_v1', auth });
}

export async function isGoogleGroupsConfigured() {
    return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_ADMIN_EMAIL);
}

export async function getMappings(guildId) {
    const data = await getFromDb(MAPPINGS_KEY(guildId), []);
    return Array.isArray(data) ? data : [];
}

export async function addMapping(guildId, groupEmail, roleId, groupName = null) {
    const mappings = await getMappings(guildId);
    const existing = mappings.find(m => m.groupEmail.toLowerCase() === groupEmail.toLowerCase());
    if (existing) {
        existing.roleId = roleId;
        if (groupName) existing.groupName = groupName;
    } else {
        mappings.push({ groupEmail: groupEmail.toLowerCase(), roleId, groupName: groupName || groupEmail });
    }
    await setInDb(MAPPINGS_KEY(guildId), mappings);
    return mappings;
}

export async function removeMapping(guildId, groupEmail) {
    const mappings = await getMappings(guildId);
    const filtered = mappings.filter(m => m.groupEmail.toLowerCase() !== groupEmail.toLowerCase());
    if (filtered.length === mappings.length) return false;
    await setInDb(MAPPINGS_KEY(guildId), filtered);
    return true;
}

async function getGroupMemberEmails(admin, groupEmail) {
    const emails = new Set();
    let pageToken;

    do {
        const res = await admin.members.list({
            groupKey: groupEmail,
            maxResults: 200,
            pageToken,
        });
        const members = res.data.members || [];
        for (const member of members) {
            if (member.email && member.status === 'ACTIVE') {
                emails.add(member.email.toLowerCase());
            }
        }
        pageToken = res.data.nextPageToken;
    } while (pageToken);

    return emails;
}

async function getDiscordMemberEmail(member) {
    return null;
}

export async function syncGuildGoogleGroups(client, guildId) {
    const mappings = await getMappings(guildId);
    if (!mappings.length) return { synced: 0, skipped: 0, errors: [] };

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { synced: 0, skipped: 0, errors: ['Guild not found in cache'] };

    let admin;
    try {
        admin = getAdminClient();
    } catch (err) {
        logger.warn(`[GoogleGroups] Cannot sync guild ${guildId}: ${err.message}`);
        return { synced: 0, skipped: 0, errors: [err.message] };
    }

    const errors = [];
    let synced = 0;
    let skipped = 0;

    await guild.members.fetch();

    for (const mapping of mappings) {
        try {
            const role = guild.roles.cache.get(mapping.roleId);
            if (!role) {
                errors.push(`Role ${mapping.roleId} not found for group ${mapping.groupEmail}`);
                skipped++;
                continue;
            }

            const groupEmails = await getGroupMemberEmails(admin, mapping.groupEmail);

            const membersToAdd = [];
            const membersToRemove = [];

            for (const [, member] of guild.members.cache) {
                if (member.user.bot) continue;

                const userEmail = member.user.email?.toLowerCase() || null;
                const hasRole = member.roles.cache.has(mapping.roleId);
                const inGroup = userEmail ? groupEmails.has(userEmail) : false;

                if (inGroup && !hasRole) {
                    membersToAdd.push(member);
                } else if (!inGroup && hasRole) {
                    membersToRemove.push(member);
                }
            }

            for (const member of membersToAdd) {
                await member.roles.add(role, `Google Groups sync: member of ${mapping.groupEmail}`);
                synced++;
            }
            for (const member of membersToRemove) {
                await member.roles.remove(role, `Google Groups sync: not in ${mapping.groupEmail}`);
                synced++;
            }
        } catch (err) {
            logger.error(`[GoogleGroups] Error syncing group ${mapping.groupEmail}:`, err.message);
            errors.push(`${mapping.groupEmail}: ${err.message}`);
        }
    }

    await setInDb(SYNC_LOG_KEY(guildId), { lastSync: new Date().toISOString(), synced, errors });
    return { synced, skipped, errors };
}

export async function syncAllGoogleGroups(client) {
    if (!(await isGoogleGroupsConfigured())) return;

    logger.info('[GoogleGroups] Running scheduled sync for all guilds...');
    for (const [guildId] of client.guilds.cache) {
        try {
            const mappings = await getMappings(guildId);
            if (!mappings.length) continue;
            const result = await syncGuildGoogleGroups(client, guildId);
            logger.info(`[GoogleGroups] Guild ${guildId}: synced=${result.synced} skipped=${result.skipped} errors=${result.errors.length}`);
        } catch (err) {
            logger.error(`[GoogleGroups] Error syncing guild ${guildId}:`, err.message);
        }
    }
}

export async function getLastSyncInfo(guildId) {
    return await getFromDb(SYNC_LOG_KEY(guildId), null);
}
