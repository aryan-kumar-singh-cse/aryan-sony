const https = require('https');

const UPSTREAM_URL = 'https://raw.githubusercontent.com/drmlive/sliv-live-events/main/sonyliv.json';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  https.get(UPSTREAM_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  }, upstreamRes => {
    let data = '';
    upstreamRes.on('data', c => data += c);
    upstreamRes.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.send(data);
    });
  }).on('error', err => {
    res.status(500).json({ error: 'Failed to fetch events', message: err.message });
  });
};
