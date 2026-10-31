/**
 * System stats widget: native Electron OS module, no external API.
 */
const os = require('os');

function getStats() {
  const mem = process.getMemoryInfo ? process.getMemoryInfo() : { rss: 0, heapTotal: 0, heapUsed: 0 };
  const totalMem = os.totalmem ? os.totalmem() : 0;
  const freeMem = os.freemem ? os.freemem() : 0;
  return {
    ok: true,
    cpu: { loadavg: os.loadavg ? os.loadavg()[0] : 0, cpus: os.cpus ? os.cpus().length : 0 },
    memory: {
      total: totalMem,
      free: freeMem,
      processRss: mem.rss || 0,
    },
    platform: os.platform(),
  };
}

module.exports = { getStats };
