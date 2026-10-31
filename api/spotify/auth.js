/**
 * Spotify API integration — OAuth PKCE + sync for Bloom Notch
 * Design only (needs SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET env)
 */
const https = require('https');
const query = require('querystring');

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API = 'https://api.spotify.com/v1';

function buildAuthUrl(clientId, redirectUri, scope = 'user-read-playback-state user-modify-playback-state streaming user-read-email playlist-read-private') {
  return `${SPOTIFY_AUTH_URL}?` + query.stringify({
    response_type: 'code',
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    state: Math.random().toString(36).slice(2)
  });
}

function exchangeCode(clientId, clientSecret, code, redirectUri) {
  return new Promise((resolve, reject) => {
    const payload = query.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const req = https.request(SPOTIFY_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64') } }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(payload); req.end();
  });
}

async function getNowPlaying(accessToken) {
  return new Promise((resolve, reject) => {
    https.get(SPOTIFY_API + '/me/player/currently-playing', { headers: { Authorization: 'Bearer ' + accessToken } }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(d?JSON.parse(d):{})); }).on('error', reject);
  });
}

module.exports = { buildAuthUrl, exchangeCode, getNowPlaying, SPOTIFY_API };
