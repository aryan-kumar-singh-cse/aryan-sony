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
          const cleanPath = targetUrl.split('?')[0];
          const baseUrl = cleanPath.substring(0, cleanPath.lastIndexOf('/') + 1);

          function resolveUrl(rel) {
            if (rel.startsWith('http://') || rel.startsWith('https://')) return rel;
            if (rel.startsWith('/')) {
              try {
                return new URL(targetUrl).origin + rel;
              } catch (_) {
                return rel;
              }
            }
            return baseUrl + rel;
          }

          const rewritten = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Handle AES-128 key URIs
            if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
              return line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const fullKeyUrl = resolveUrl(uri);
                return `URI="/api/proxy?url=${encodeURIComponent(fullKeyUrl)}"`;
              });
            }

            if (trimmed.startsWith('#')) return line;

            const fullUrl = resolveUrl(trimmed);
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
