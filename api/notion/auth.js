/**
 * Notion API integration — OAuth + page/calendar sync for Bloom Notch
 * Design only (needs NOTION_CLIENT_ID / NOTION_CLIENT_SECRET env)
 */
const https = require('https');

const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';

function buildAuthUrl(clientId, redirectUri) {
  return `${NOTION_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&owner=user`;
}

function listDatabases(accessToken) {
  return new Promise((resolve, reject) => {
    https.get('https://api.notion.com/v1/databases', { headers: { 'Notion-Version': '2022-06-28', Authorization: 'Bearer ' + accessToken } }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); }).on('error', reject);
  });
}

module.exports = { buildAuthUrl, listDatabases, NOTION_TOKEN_URL, NOTION_AUTH_URL };
