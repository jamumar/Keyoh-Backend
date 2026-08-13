const cron = require('node-cron');
const { Properties } = require('../models');
const { getConfig, getStreamAuthHeaders, isStreamConfigured } = require('./cloudflareAuth');
const https = require('https');

async function cleanupAbandonedUploads() {
    if (!isStreamConfigured()) return;

    try {
        console.log('[cron] Running abandoned video uploads cleanup...');
        const { accountId } = getConfig();
        const authHeaders = getStreamAuthHeaders();

        const properties = await Properties.findAll();
        const activeStreamIds = new Set();

        for (const prop of properties) {
            let vids = typeof prop.videos === 'string' ? JSON.parse(prop.videos) : (prop.videos || []);
            if (Array.isArray(vids)) {
                vids.forEach(v => {
                    if (v.streamId) activeStreamIds.add(v.streamId);
                    if (v.url) {
                        const match = v.url.match(/videodelivery\.net\/([a-zA-Z0-9]+)/);
                        if (match && match[1]) activeStreamIds.add(match[1]);
                    }
                });
            }
        }

        const reqOptions = {
            hostname: 'api.cloudflare.com',
            path: `/client/v4/accounts/${accountId}/stream`,
            method: 'GET',
            headers: {
                Accept: 'application/json',
                ...authHeaders,
            },
        };

        const resData = await new Promise((resolve) => {
            const req = https.request(reqOptions, (res) => {
                let raw = '';
                res.on('data', c => raw += c);
                res.on('end', () => {
                    try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
                });
            });
            req.on('error', () => resolve(null));
            req.end();
        });

        if (!resData || !resData.success || !Array.isArray(resData.result)) {
            console.log('[cron] Cloudflare Stream list request returned empty or failed.');
            return;
        }

        const now = Date.now();
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        let deletedCount = 0;

        for (const video of resData.result) {
            const uid = video.uid;
            const created = new Date(video.created).getTime();
            const isOlderThan24h = (now - created) > TWENTY_FOUR_HOURS_MS;

            if (isOlderThan24h && !activeStreamIds.has(uid)) {
                console.log(`[cron] Deleting abandoned Cloudflare video: ${uid} (created ${video.created})`);
                await new Promise((resolve) => {
                    const delReq = https.request({
                        hostname: 'api.cloudflare.com',
                        path: `/client/v4/accounts/${accountId}/stream/${uid}`,
                        method: 'DELETE',
                        headers: { ...authHeaders },
                    }, (res) => {
                        res.on('data', () => {});
                        res.on('end', () => resolve(true));
                    });
                    delReq.on('error', () => resolve(false));
                    delReq.end();
                });
                deletedCount++;
            }
        }

        console.log(`[cron] Cleanup complete: ${deletedCount} abandoned video(s) removed from Cloudflare Stream.`);
    } catch (error) {
        console.error('[cron] Abandoned upload cleanup failed:', error.message);
    }
}

function startCleanupCron() {
    cron.schedule('0 2 * * *', () => {
        cleanupAbandonedUploads();
    });
    console.log('[cron] Abandoned uploads cleanup cron scheduled daily at 02:00 AM');
}

module.exports = {
    startCleanupCron,
    cleanupAbandonedUploads,
};
