// Cloudflare Pages Function: /api/proxy
// Handles transparent CORS bypass, header injection, and m3u8 playlist rewriting

export async function onRequest(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const targetUrl = reqUrl.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Missing "url" query parameter', { 
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return new Response(`Upstream error: ${upstreamRes.status} ${upstreamRes.statusText}`, {
        status: upstreamRes.status,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const contentType = upstreamRes.headers.get('content-type') || '';
    const isM3u8 = contentType.includes('mpegurl') || 
                   contentType.includes('application/x-mpegURL') || 
                   targetUrl.includes('.m3u8');

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    if (isM3u8) {
      responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
      responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

      const text = await upstreamRes.text();
      const lines = text.split('\n');
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Handle AES-128 keys and media initialization maps
        if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MAP')) {
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            let fullKeyUrl;
            try {
              fullKeyUrl = (uri.startsWith('http://') || uri.startsWith('https://'))
                ? uri
                : new URL(uri, baseUrl).href;
            } catch (_) {
              fullKeyUrl = uri;
            }
            return `URI="/api/proxy?url=${encodeURIComponent(fullKeyUrl)}"`;
          });
        }

        if (trimmed.startsWith('#')) return line;

        let fullUrl;
        try {
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            fullUrl = trimmed;
          } else {
            fullUrl = new URL(trimmed, baseUrl).href;
          }
        } catch (_) {
          fullUrl = trimmed;
        }

        return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
      });

      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: responseHeaders
      });
    } else {
      // Media segment (.ts, .aac, .m4s) or key file
      responseHeaders.set('Content-Type', contentType || 'video/MP2T');
      responseHeaders.set('Cache-Control', 'public, max-age=3600');

      return new Response(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders
      });
    }
  } catch (err) {
    return new Response(`Proxy Exception: ${err.message}`, {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
