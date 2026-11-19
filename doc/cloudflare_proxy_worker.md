# Setting up the Import AI proxy on Cloudflare

Import AI calls the preset generator of amplifier-presets.com. That API answers only requests that come from its own site, so the app reaches it through a small proxy:

- `scripts/serve.py` is the proxy on your own PC (`http://localhost:8080/api`).
- `cloudflare/proxy-worker.js` is the same proxy as a Cloudflare Worker, for the hosted app and for phones.

The Worker forwards every `GET` and `POST` under `/api/*` to `https://api.amplifier-presets.com`, answers `/api/health` itself (the app uses it to decide whether to show the AI button), and adds the CORS headers the browser needs. It accepts requests only from the page addresses in `ALLOWED_ORIGINS` and from `localhost` / `127.0.0.1` on any port.

A free Cloudflare account is enough. Nothing needs to be installed on the PC.

## 1. Create the Worker

1. Sign in at <https://dash.cloudflare.com>.
2. Open **Workers & Pages** (under **Compute** in some accounts).
3. Click **Create** → **Create Worker** (or **Start with Hello World!**).
4. Name it, for example `thrii-proxy`, and click **Deploy**.
5. Click **Edit code**, replace everything in the editor with the contents of `cloudflare/proxy-worker.js`, and click **Deploy**.
6. Note the Worker's address, for example `https://thrii-proxy.<your-subdomain>.workers.dev`.

## 2. Allow the hosted app (when it exists)

In `cloudflare/proxy-worker.js`, add the app's address to `ALLOWED_ORIGINS` (no trailing slash, no path), then paste and deploy again:

```js
const ALLOWED_ORIGINS = ['https://thrii.pages.dev'];
```

Localhost needs no entry.

## 3. Check it

From a terminal (replace the address with yours):

```
curl.exe -i -H "Origin: http://localhost:8080" https://thrii-proxy.<your-subdomain>.workers.dev/api/health
curl.exe -s -H "Origin: http://localhost:8080" https://thrii-proxy.<your-subdomain>.workers.dev/api/amplifiers
```

- The first answers `200` and `{"ok":true}`.
- The second answers the generator's list of amps, which shows the forwarding works.
- Without the `Origin` header the Worker answers `403`. That is intended.

## 4. Point the app at it

In `src/ai/config.js`:

```js
export const API_BASE = 'https://thrii-proxy.<your-subdomain>.workers.dev/api';
```

To test from the PC without the local proxy, serve the app with the plain server, open `http://localhost:8080/dev.html`, hard-reload (Ctrl+Shift+R), and generate a sound on the AI screen:

```
python -m http.server 8080
```

To go back to the local proxy, set `API_BASE` to `'/api'` and run `python scripts/serve.py`.

## Troubleshooting

- **The AI screen says "The preset generator cannot be reached" and the browser console shows a CORS error:** the page's address is not in `ALLOWED_ORIGINS` (and is not localhost).
- **The generator answers 403 through the Worker, but works through `serve.py`:** the generator rejected the Worker's request. `serve.py` also sends a browser `User-Agent` header; adding it to `UPSTREAM_HEADERS` in the Worker is the first thing to try.
- **Logs:** in the dashboard, open the Worker → **Logs** (or **Observability**) and start live logs while testing.

## Later: deploy from GitHub

Instead of pasting the code, the Worker can be connected to the repository (Worker → **Settings → Build**), so a push to `main` redeploys it. That needs a small `wrangler.toml` naming `cloudflare/proxy-worker.js` as the entry file; Cloudflare runs the deploy in its own build, so nothing is installed locally. Limit the builds to the `cloudflare/` folder so app-only pushes do not redeploy the Worker.
