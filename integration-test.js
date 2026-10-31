/**
 * Offline checks for the Spotify/Notion integration helpers.
 * No credentials, no network, no Electron app required.
 */
const assert = require('assert');
const spotify = require('./integrations/spotify');
const notion = require('./integrations/notion');
const { requestJson } = require('./integrations/http');
const { createRedirectServer } = require('./auth/oauth-server');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok - ' + name);
  } catch (error) {
    console.error('FAIL - ' + name);
    console.error('       ' + error.message);
    process.exitCode = 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log('ok - ' + name);
  } catch (error) {
    console.error('FAIL - ' + name);
    console.error('       ' + error.message);
    process.exitCode = 1;
  }
}

// --- Spotify PKCE ---
check('PKCE matches RFC 7636 vector', function () {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  assert.strictEqual(
    spotify.createChallenge(verifier),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );
});

check('generated verifier is 64 unreserved characters', function () {
  const verifier = spotify.createVerifier();
  assert.strictEqual(verifier.length, 64);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
});

check('auth URL carries PKCE, state, scopes, redirect', function () {
  const url = new URL(spotify.buildAuthUrl('0123456789abcdef0123456789abcdef', {
    state: 'state123',
    challenge: 'challenge123',
  }));
  assert.strictEqual(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
  assert.strictEqual(url.searchParams.get('response_type'), 'code');
  assert.strictEqual(url.searchParams.get('client_id'), '0123456789abcdef0123456789abcdef');
  assert.strictEqual(url.searchParams.get('redirect_uri'), spotify.REDIRECT_URI);
  assert.strictEqual(url.searchParams.get('state'), 'state123');
  assert.strictEqual(url.searchParams.get('code_challenge'), 'challenge123');
  assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('scope').includes('user-read-playback-state'));
  assert.ok(url.searchParams.get('scope').includes('user-modify-playback-state'));
});

check('client ID validation rejects URLs and short values', function () {
  assert.strictEqual(spotify.normalizeClientId('0123456789abcdef0123456789abcdef'), '0123456789abcdef0123456789abcdef');
  assert.strictEqual(spotify.normalizeClientId(' 0123456789abcdef0123456789abcdef '), '0123456789abcdef0123456789abcdef');
  assert.strictEqual(spotify.normalizeClientId('https://developer.spotify.com/dashboard'), '');
  assert.strictEqual(spotify.normalizeClientId('abc'), '');
  assert.strictEqual(spotify.normalizeClientId(null), '');
});

check('now-playing normalization keeps only display fields', function () {
  const playback = spotify.normalizePlayback({
    is_playing: true,
    progress_ms: 42000,
    device: { id: 'device123', name: 'Arega PC' },
    item: {
      name: 'Blinding Lights',
      duration_ms: 200040,
      artists: [{ name: 'The Weeknd' }],
      album: { name: 'After Hours' },
    },
  });
  assert.strictEqual(playback.active, true);
  assert.strictEqual(playback.playing, true);
  assert.strictEqual(playback.title, 'Blinding Lights');
  assert.strictEqual(playback.artists, 'The Weeknd');
  assert.strictEqual(playback.album, 'After Hours');
  assert.strictEqual(playback.progress, 42000);
  assert.strictEqual(playback.duration, 200040);
  assert.strictEqual(playback.device, 'Arega PC');
  assert.ok(!('item' in playback));
});

check('empty playback normalizes to idle', function () {
  const playback = spotify.normalizePlayback(null);
  assert.strictEqual(playback.active, false);
  assert.strictEqual(playback.playing, false);
  assert.strictEqual(playback.title, '');
});

// --- Notion helpers ---
check('database ID accepts plain, dashed, and full URL forms', function () {
  const expected = '01234567-89ab-cdef-0123-456789abcdef';
  assert.strictEqual(notion.normalizeDatabaseId('0123456789abcdef0123456789abcdef'), expected);
  assert.strictEqual(notion.normalizeDatabaseId('01234567-89AB-CDEF-0123-456789ABCDEF'), expected);
  assert.strictEqual(
    notion.normalizeDatabaseId('https://www.notion.so/Workspace/My-Events-0123456789abcdef0123456789abcdef?v=ffffffffffffffffffffffffffffffff'),
    expected
  );
  assert.strictEqual(notion.normalizeDatabaseId('not a database'), '');
  assert.strictEqual(notion.normalizeDatabaseId(null), '');
});

check('integration token validation', function () {
  const secret = 'secret_' + 'a'.repeat(43);
  const ntn = 'ntn_' + 'b'.repeat(46);
  assert.strictEqual(notion.normalizeToken(secret), secret);
  assert.strictEqual(notion.normalizeToken('  ' + ntn + ' '), ntn);
  assert.strictEqual(notion.normalizeToken('secret_short'), '');
  assert.strictEqual(notion.normalizeToken('https://notion.so'), '');
});

const database = {
  object: 'database',
  title: [{ plain_text: 'Bloom Events' }],
  properties: {
    Name: { type: 'title', title: {} },
    When: { type: 'date', date: {} },
    Location: { type: 'rich_text', rich_text: {} },
    Notes: { type: 'rich_text', rich_text: {} },
  },
};

check('database title and properties are detected', function () {
  assert.strictEqual(notion.databaseTitle(database), 'Bloom Events');
  const props = notion.detectProperties(database);
  assert.strictEqual(props.titleProperty, 'Name');
  assert.strictEqual(props.dateProperty, 'When');
  assert.strictEqual(props.hasDate, true);
});

check('database without a date property is rejected by detection', function () {
  const props = notion.detectProperties({ properties: { Name: { type: 'title' } } });
  assert.strictEqual(props.hasDate, false);
});

check('page normalization reads title, date, location', function () {
  const event = notion.normalizePage({
    id: 'page-1',
    url: 'https://www.notion.so/page-1',
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Design review' }] },
      When: { type: 'date', date: { start: '2026-10-30', end: '2026-10-31' } },
      Location: { type: 'rich_text', rich_text: [{ plain_text: 'Studio' }] },
    },
  }, { titleProperty: 'Name', dateProperty: 'When' });

  assert.strictEqual(event.title, 'Design review');
  assert.strictEqual(event.start, '2026-10-30');
  assert.strictEqual(event.end, '2026-10-31');
  assert.strictEqual(event.allDay, true);
  assert.strictEqual(event.location, 'Studio');
  assert.strictEqual(event.source, 'notion');
});

check('page normalization handles timed events and missing dates', function () {
  const event = notion.normalizePage({
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'Standup' }] },
      When: { type: 'date', date: { start: '2026-10-30T09:15:00.000-04:00', end: null } },
    },
  }, { titleProperty: 'Name', dateProperty: 'When' });
  assert.strictEqual(event.allDay, false);
  assert.strictEqual(event.end, '');

  const missing = notion.normalizePage({
    properties: {
      Name: { type: 'title', title: [{ plain_text: 'No date' }] },
      When: { type: 'date', date: null },
    },
  }, { titleProperty: 'Name', dateProperty: 'When' });
  assert.strictEqual(missing, null);
});

// --- transport / OAuth listener ---
(async function () {
  await checkAsync('HTTP client refuses non-HTTPS URLs', async function () {
    await assert.rejects(requestJson('http://example.com'), /Only HTTPS/);
  });

  await checkAsync('OAuth listener can be cancelled', async function () {
    const wait = createRedirectServer({ port: 8799, expectedState: 'x', timeoutMs: 5000 });
    wait.cancel('cancelled by test');
    await assert.rejects(wait, /cancelled by test/);
  });

  console.log('\n' + passed + ' integration checks passed.');
  if (process.exitCode) process.exit(process.exitCode);
})();
