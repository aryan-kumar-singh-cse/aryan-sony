const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const SONYLIV_JSON_URL = 'https://raw.githubusercontent.com/drmlive/sliv-live-events/main/sonyliv.json';

// Helper for fetching text/json
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ...headers
      }
    }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).href;
        return fetchUrl(nextUrl, headers).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
  });
}

// ── GET /api/events — Fetch live & upcoming matches ─────────────────────────
app.get('/api/events', async (req, res) => {
  try {
    const response = await fetchUrl(SONYLIV_JSON_URL);
    if (response.status !== 200) {
      throw new Error(`Upstream returned ${response.status}`);
    }
    const data = JSON.parse(response.body);
    res.json(data);
  } catch (err) {
    console.error('Error fetching sonyliv.json:', err.message);
    res.status(500).json({ error: 'Failed to fetch live events', message: err.message });
  }
});

// ── GET /api/proxy — Transparent HLS Stream Proxy ───────────────────────────
app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('Missing url query parameter');

  try {
    const client = targetUrl.startsWith('https') ? https : http;
    const proxyReq = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.sonyliv.com/',
        'Origin': 'https://www.sonyliv.com'
      }
    }, (upstreamRes) => {
      // Handle redirect
      if ([301, 302, 307, 308].includes(upstreamRes.statusCode) && upstreamRes.headers.location) {
        const nextUrl = new URL(upstreamRes.headers.location, targetUrl).href;
        return res.redirect(`/api/proxy?url=${encodeURIComponent(nextUrl)}`);
      }

      const contentType = upstreamRes.headers['content-type'] || '';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL') || targetUrl.includes('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        let body = '';
        upstreamRes.on('data', chunk => body += chunk);
        upstreamRes.on('end', () => {
          // Rewrite internal relative URLs and encryption key URIs in m3u8
          const lines = body.split('\n');
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const rewritten = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Handle encryption keys and media initialization maps
            if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                let fullKeyUrl = (uri.startsWith('http://') || uri.startsWith('https://'))
                  ? uri
                  : new URL(uri, baseUrl).href;
                return `URI="/api/proxy?url=${encodeURIComponent(fullKeyUrl)}"`;
              });
            }

            if (trimmed.startsWith('#')) return line;

            let fullUrl;
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              fullUrl = trimmed;
            } else {
              fullUrl = new URL(trimmed, baseUrl).href;
            }
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
          }).join('\n');

          res.send(rewritten);
        });
      } else {
        // Binary segment or key stream
        res.setHeader('Content-Type', contentType || 'video/MP2T');
        upstreamRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy Error:', err.message);
      if (!res.headersSent) res.status(502).send('Proxy upstream error: ' + err.message);
    });
  } catch (err) {
    console.error('Proxy Fatal Error:', err.message);
    if (!res.headersSent) res.status(500).send('Proxy error: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  ⚡ Aryan SonyLiv Sports Hub Running!`);
  console.log(`  🌐 Web App: http://localhost:${PORT}`);
  console.log(`  📡 API:     http://localhost:${PORT}/api/events`);
  console.log(`======================================================\n`);
});
