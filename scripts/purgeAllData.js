require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/lib/db');

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const streamToken = process.env.CLOUDFLARE_STREAM_TOKEN;
const imagesToken = process.env.CLOUDFLARE_IMAGES_TOKEN || streamToken;

async function purgeCloudflareImages() {
  console.log('🖼️  [Cloudflare Images] Listing uploaded images...');
  try {
    const listRes = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`,
      {
        headers: {
          Authorization: `Bearer ${imagesToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const images = listRes.data?.result?.images || [];
    console.log(`🖼️  [Cloudflare Images] Found ${images.length} image(s) to delete.`);

    for (const img of images) {
      console.log(`🗑️  [Cloudflare Images] Deleting image ${img.id}...`);
      try {
        await axios.delete(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${img.id}`,
          {
            headers: {
              Authorization: `Bearer ${imagesToken}`,
            },
          }
        );
        console.log(`✓  [Cloudflare Images] Deleted ${img.id}`);
      } catch (delErr) {
        console.warn(`⚠️  [Cloudflare Images] Could not delete ${img.id}:`, delErr.message);
      }
    }
  } catch (err) {
    console.warn('⚠️  [Cloudflare Images] List images failed:', err.response?.data || err.message);
  }
}

async function purgeCloudflareVideos() {
  console.log('🎥  [Cloudflare Stream] Listing uploaded videos...');
  try {
    const listRes = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      {
        headers: {
          Authorization: `Bearer ${streamToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const videos = listRes.data?.result || [];
    console.log(`🎥  [Cloudflare Stream] Found ${videos.length} video(s) to delete.`);

    for (const vid of videos) {
      console.log(`🗑️  [Cloudflare Stream] Deleting video ${vid.uid}...`);
      try {
        await axios.delete(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${vid.uid}`,
          {
            headers: {
              Authorization: `Bearer ${streamToken}`,
            },
          }
        );
        console.log(`✓  [Cloudflare Stream] Deleted ${vid.uid}`);
      } catch (delErr) {
        console.warn(`⚠️  [Cloudflare Stream] Could not delete ${vid.uid}:`, delErr.message);
      }
    }
  } catch (err) {
    console.warn('⚠️  [Cloudflare Stream] List videos failed:', err.response?.data || err.message);
  }
}

async function purgeDatabaseAndSellers() {
  console.log('🗄️  [Database] Cleaning MySQL database tables...');
  try {
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    const [propRes] = await sequelize.query('DELETE FROM properties');
    console.log('✓  [Database] Deleted properties.');

    const [saveRes] = await sequelize.query('DELETE FROM saves').catch(() => [null]);
    const [viewRes] = await sequelize.query('DELETE FROM property_views').catch(() => [null]);
    const [handoverRes] = await sequelize.query('DELETE FROM property_handovers').catch(() => [null]);

    const [sellerRes] = await sequelize.query("DELETE FROM users WHERE role = 'seller'");
    console.log('✓  [Database] Deleted seller accounts.');

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  } catch (err) {
    console.error('❌  [Database] Database wipe error:', err.message);
  }
}

function purgeLocalConversations() {
  console.log('💬  [Local Store] Wiping conversations file...');
  const convFile = path.join(__dirname, '../src/data/conversations.json');
  try {
    if (fs.existsSync(convFile)) {
      fs.writeFileSync(convFile, '[]', 'utf8');
      console.log('✓  [Local Store] Conversations reset to empty array.');
    }
  } catch (e) {
    console.warn('⚠️  [Local Store] Could not clear conversations.json:', e.message);
  }
}

async function run() {
  console.log('🧹 🚀 Starting complete system purge (Cloudflare Images, Stream Videos, DB Properties, Seller Accounts)...');
  await purgeCloudflareImages();
  await purgeCloudflareVideos();
  await purgeDatabaseAndSellers();
  purgeLocalConversations();
  console.log('✅ 🎉 SYSTEM PURGE COMPLETE! All Cloudflare images/videos, DB properties, seller accounts, and chat history have been cleared.');
  process.exit(0);
}

run();
