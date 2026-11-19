// Cloudflare Worker: the hosted form of the /api proxy in scripts/serve.py. Paste this file into the Worker's editor
// in the Cloudflare dashboard. It forwards /api/* to the preset generator of amplifier-presets.com, which answers
// browsers only on its own site (its authors are asked for their consent to this proxy).
// The app calls it from another origin, so it answers CORS, and only for the origins listed here.

const UPSTREAM = 'https://api.amplifier-presets.com';

// The hosted app's origin(s), no trailing slash and no path. Any localhost port is allowed too.
const ALLOWED_ORIGINS = ['https://hnikolov.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// The upstream answers only requests that come from its own site.
const UPSTREAM_HEADERS = {
  'Origin': 'https://amplifier-presets.com',
  'Referer': 'https://amplifier-presets.com/',
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (!ALLOWED_ORIGINS.includes(origin) && !LOCAL_ORIGIN.test(origin || '')) {
      return new Response('Origin not allowed', { status: 403 });
    }
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // Answered here, without calling the generator: tells the app that Import AI can be offered.
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return Response.json({ ok: true }, { headers: cors });
    }

    if (!url.pathname.startsWith('/api/') || !['GET', 'POST'].includes(request.method)) {
      return new Response('Not found', { status: 404, headers: cors });
    }

    try {
      const upstream = await fetch(UPSTREAM + url.pathname.slice('/api'.length) + url.search, {
        method: request.method,
        headers: UPSTREAM_HEADERS,
        body: request.method === 'POST' ? await request.text() : undefined
      });
      // Upstream errors (e.g. 422 validation details) go through to the page.
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json', ...cors }
      });
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', ...cors }
      });
    }
  }
};
