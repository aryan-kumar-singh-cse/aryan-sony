const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing url query parameter');
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

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

      if (contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL') || targetUrl.includes('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        let body = '';
        upstreamRes.on('data', chunk => body += chunk);
        upstreamRes.on('end', () => {
          const lines = body.split('\n');
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const rewritten = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Handle AES-128 key URIs
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
        res.setHeader('Content-Type', contentType || 'video/MP2T');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        upstreamRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) res.status(502).send('Proxy upstream error: ' + err.message);
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Proxy error: ' + err.message);
  }
};
