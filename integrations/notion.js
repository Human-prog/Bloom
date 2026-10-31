/**
 * Notion integration for Bloom Notch.
 *
 * Uses an internal integration secret + a database the user explicitly shares
 * with that integration. Notion Calendar has no public API, so events are read
 * from a normal Notion database with a Date property.
 *
 * The token is stored encrypted in the machine-bound vault. The database ID and
 * detected property names are non-secret config.
 */
const { requestJson, apiError } = require('./http');
const vault = require('../auth/token-vault');
const config = require('./config');

const PROVIDER = 'notion';
const API_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const TOKEN_RE = /^(?:secret_|ntn_)[A-Za-z0-9_-]{20,200}$/;
const CACHE_TTL_MS = 90000;

let cache = { key: '', at: 0, events: [] };

function normalizeToken(value) {
  if (typeof value !== 'string') return '';
  const token = value.trim();
  return TOKEN_RE.test(token) ? token : '';
}

function normalizeDatabaseId(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';

  const dashed = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (dashed) return dashed[0].toLowerCase();

  const compact = text.match(/[0-9a-f]{32}/i);
  if (!compact) return '';
  const hex = compact[0].toLowerCase();
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
    hex.slice(16, 20) + '-' + hex.slice(20);
}

function headers(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Notion-Version': NOTION_VERSION,
  };
}

function plainText(rich) {
  if (!Array.isArray(rich)) return '';
  return rich.map(function (part) {
    return part && typeof part.plain_text === 'string' ? part.plain_text : '';
  }).join('').trim();
}

function databaseTitle(db) {
  const title = db && Array.isArray(db.title) ? plainText(db.title) : '';
  return title || 'Notion database';
}

function detectProperties(db) {
  const properties = (db && db.properties) || {};
  const names = Object.keys(properties);
  const titleName = names.find(function (name) {
    return properties[name] && properties[name].type === 'title';
  }) || '';
  const dateNames = names.filter(function (name) {
    return properties[name] && properties[name].type === 'date';
  });
  const dateName = dateNames.find(function (name) {
    return /date|when|time|day/i.test(name);
  }) || dateNames[0] || '';

  return {
    titleProperty: titleName,
    dateProperty: dateName,
    hasDate: !!dateName,
  };
}

async function validateToken(token) {
  const res = await requestJson(API_BASE + '/users/me', { headers: headers(token) });
  if (res.status === 401) {
    throw new Error('Notion rejected the token. Paste the Internal Integration Secret again.');
  }
  if (res.status !== 200 || !res.json) {
    throw new Error(apiError(res, 'Could not validate the Notion token'));
  }
  return res.json;
}

async function getDatabase(token, databaseId) {
  const res = await requestJson(API_BASE + '/databases/' + databaseId, { headers: headers(token) });
  if (res.status === 401) {
    throw new Error('Notion rejected the token. Paste the Internal Integration Secret again.');
  }
  if (res.status === 404) {
    throw new Error('Database not found. In Notion, share the database with your integration, then check the ID.');
  }
  if (res.status !== 200 || !res.json) {
    throw new Error(apiError(res, 'Could not read the Notion database'));
  }
  return res.json;
}

function findLocation(properties) {
  const names = Object.keys(properties || {});
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (!/location|where|place|venue/i.test(name)) continue;
    const prop = properties[name];
    if (!prop) continue;
    if (prop.type === 'place' && prop.place) {
      return prop.place.name || prop.place.address || '';
    }
    if (prop.type === 'rich_text') return plainText(prop.rich_text);
    if (prop.type === 'select' && prop.select) return prop.select.name || '';
    if (prop.type === 'formula' && prop.formula) {
      if (prop.formula.string) return prop.formula.string;
      if (prop.formula.number != null) return String(prop.formula.number);
    }
  }
  return '';
}

function normalizePage(page, props) {
  if (!page || !page.properties) return null;
  const properties = page.properties;
  const configured = props || {};

  let titleProp = configured.titleProperty ? properties[configured.titleProperty] : null;
  if (!titleProp) {
    const names = Object.keys(properties);
    for (let i = 0; i < names.length; i++) {
      if (properties[names[i]] && properties[names[i]].type === 'title') {
        titleProp = properties[names[i]];
        break;
      }
    }
  }

  const dateProp = configured.dateProperty ? properties[configured.dateProperty] : null;
  const date = dateProp && dateProp.date ? dateProp.date : null;
  if (!date || !date.start) return null;

  const start = String(date.start);
  const end = date.end ? String(date.end) : '';

  return {
    id: page.id || '',
    title: plainText(titleProp && titleProp.title) || 'Untitled',
    start: start,
    end: end,
    allDay: start.indexOf('T') === -1,
    location: findLocation(properties),
    url: page.url || '',
    source: 'notion',
  };
}

function status() {
  return {
    connected: vault.has(PROVIDER),
    databaseId: config.get('notionDatabaseId', '') || '',
    databaseTitle: config.get('notionDatabaseTitle', '') || '',
    dateProperty: config.get('notionDateProperty', '') || '',
    titleProperty: config.get('notionTitleProperty', '') || '',
  };
}

async function connect(input) {
  const payload = input || {};
  const token = normalizeToken(payload.token);
  if (!token) {
    throw new Error('Paste your Notion Internal Integration Secret (it starts with secret_ or ntn_).');
  }
  const databaseId = normalizeDatabaseId(payload.databaseId);
  if (!databaseId) {
    throw new Error('Paste the Notion database ID or its full URL.');
  }

  await validateToken(token);
  const db = await getDatabase(token, databaseId);
  const props = detectProperties(db);
  if (!props.hasDate) {
    throw new Error('That database has no Date property. Add one, or choose another database.');
  }

  vault.set(PROVIDER, {
    access_token: token,
    token_type: 'Bearer',
    created_at: Date.now(),
  });
  config.set('notionDatabaseId', databaseId);
  config.set('notionDatabaseTitle', databaseTitle(db));
  config.set('notionDateProperty', props.dateProperty);
  config.set('notionTitleProperty', props.titleProperty);
  cache = { key: '', at: 0, events: [] };

  return status();
}

function disconnect() {
  vault.remove(PROVIDER);
  config.remove('notionDatabaseId');
  config.remove('notionDatabaseTitle');
  config.remove('notionDateProperty');
  config.remove('notionTitleProperty');
  cache = { key: '', at: 0, events: [] };
  return status();
}

function isoBound(value, fallback) {
  const date = new Date(value);
  if (isNaN(date.getTime())) return fallback;
  return date.toISOString();
}

async function queryRange(input) {
  const payload = input || {};
  const start = isoBound(payload.start, new Date(Date.now() - 7 * 86400000).toISOString());
  const end = isoBound(payload.end, new Date(Date.now() + 60 * 86400000).toISOString());

  const current = status();
  if (!current.connected) {
    const error = new Error('Notion is not connected.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }
  const token = vault.get(PROVIDER);
  if (!token || !token.access_token) {
    const error = new Error('Notion is not connected.');
    error.code = 'NOT_CONNECTED';
    throw error;
  }
  if (!current.databaseId || !current.dateProperty) {
    throw new Error('Notion is missing its database settings. Connect again.');
  }

  const key = current.databaseId + '|' + start + '|' + end;
  if (cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.events;
  }

  const filter = {
    and: [
      { property: current.dateProperty, date: { on_or_after: start } },
      { property: current.dateProperty, date: { on_or_before: end } },
    ],
  };
  const sorts = [{ property: current.dateProperty, direction: 'ascending' }];

  const pages = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const bodyObject = { page_size: 100, filter: filter, sorts: sorts };
    if (cursor) bodyObject.start_cursor = cursor;
    const body = JSON.stringify(bodyObject);
    const res = await requestJson(API_BASE + '/databases/' + current.databaseId + '/query', {
      method: 'POST',
      headers: Object.assign({}, headers(token.access_token), {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }),
      body: body,
    });

    if (res.status === 401) {
      vault.remove(PROVIDER);
      throw new Error('Notion session expired. Connect again.');
    }
    if (res.status === 403) {
      throw new Error('Notion denied access. Share the database with your integration.');
    }
    if (res.status === 429) {
      throw new Error('Notion rate limit reached. Try again in a moment.');
    }
    if (res.status === 404) {
      throw new Error('Notion database not found. It may have been deleted or unshared.');
    }
    if (res.status !== 200 || !res.json || !Array.isArray(res.json.results)) {
      throw new Error(apiError(res, 'Could not load Notion events'));
    }

    pages.push.apply(pages, res.json.results);
    if (!res.json.has_more || !res.json.next_cursor) break;
    cursor = res.json.next_cursor;
  }

  const props = {
    dateProperty: current.dateProperty,
    titleProperty: current.titleProperty,
  };
  const events = pages
    .map(function (item) { return normalizePage(item, props); })
    .filter(Boolean)
    .sort(function (a, b) { return String(a.start).localeCompare(String(b.start)); });

  cache = { key: key, at: Date.now(), events: events };
  return events;
}

module.exports = {
  connect,
  disconnect,
  status,
  queryRange,
  normalizeToken,
  normalizeDatabaseId,
  detectProperties,
  normalizePage,
  databaseTitle,
  NOTION_VERSION,
};
