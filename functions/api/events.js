// Cloudflare Pages Function: /api/events
// Fetches live SonyLiv events feed with fallback endpoints and caching

const UPSTREAM_FEEDS = [
  'https://raw.githubusercontent.com/drmlive/sliv-live-events/main/sonyliv.json',
  'https://cdn.jsdelivr.net/gh/drmlive/sliv-live-events@main/sonyliv.json',
  'https://fastly.jsdelivr.net/gh/drmlive/sliv-live-events@main/sonyliv.json'
];

export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }

  for (const feedUrl of UPSTREAM_FEEDS) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        cf: {
          cacheTtl: 30,
          cacheEverything: true
        }
      });

      if (res.ok) {
        const data = await res.text();
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=30'
          }
        });
      }
    } catch (_) {}
  }

  return new Response(JSON.stringify({ error: 'Failed to fetch events from upstream feeds' }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
