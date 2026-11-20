# Build, commit and publish

How a change gets from this repository to the installed app. There is no build step in the usual sense: the files in the repository are the app. What runs before a commit is a check and a stamp, both plain Python (standard library only).

## What is published

The app at `https://hnikolov.github.io/THRII-Controller/` is made of these files only (the "release set"):

- `index.html`, `manifest.json`, `sw.js`, `icons/`
- everything under `src/` except `src/debug/` and `src/ui/debug/`

Everything else (`dev.html`, `test/`, `doc/`, `scripts/`, `cloudflare/`) stays in the repository but is not published.

## Before every commit that changes the app

From the repository root:

```
python scripts/check_release.py --stamp
python scripts/run_tests.py
```

1. **`--stamp`** writes the list of files the app keeps offline into `sw.js`, and a fingerprint of those files (`BUILD`) into `src/app/version.js`. It then runs the release check.
2. **`run_tests.py`** runs all unit tests in headless Chrome and must end with `FAIL 0`. See `doc/testing.md`.

Both must pass. Then stage the stamped files too (`sw.js`, `src/app/version.js`) together with your change.

**Why the stamp matters:** an installed app looks for a new version by comparing `sw.js` and `src/app/version.js` with what it has. If a file changed but the stamp did not, the installed apps would never see the change. The check catches that: it fails when `BUILD` does not match the files. That check also runs before every deploy, so a forgotten stamp stops the publish instead of shipping silently.

A change that touches only files outside the release set (docs, tests, `dev.html`, scripts) needs no stamp.

## Version number

`APP_VERSION` in `src/app/version.js` is the number users see (`v1.0.0` beside the plug of the connect button). Change it by hand when you want a new release to have a new number, then stamp. A stamp without a new number still reaches the installed apps; they only show the same number.

Suggested use: patch number (`1.0.1`) for fixes, minor number (`1.1.0`) for new features.

## Commit and push

```
git add <your files> sw.js src/app/version.js
git commit -m "..."
git push
```

A push to `main` starts the GitHub Actions workflow `.github/workflows/pages.yml`, which:

1. runs `python scripts/check_release.py`,
2. runs `python scripts/run_tests.py`,
3. collects the release set with `python scripts/check_release.py --out dist`,
4. publishes `dist` to GitHub Pages.

If step 1 or 2 fails, nothing is published and the site keeps the previous version. Progress and errors are in the repository's **Actions** tab. A run can also be started by hand there (**Run workflow**).

One-time setting (already needed for the first deploy): **Settings → Pages → Source: GitHub Actions**.

## How the installed apps get the update

The next time an installed app opens or comes back to the front, it finds the new version and downloads it in the background. A `⇪` button then appears left of the connect button:

- **Pressed:** the app restarts with the new version (if an amp is connected, it asks first, since a restart disconnects it).
- **Not pressed:** the app keeps working on its current version. The update is applied by itself the next time the app is fully closed (removed from the recent apps) and opened again.

Offline, the app keeps running its current version; the update is found the next time it is online.

## Trying a release locally before pushing

```
python scripts/check_release.py --out dist
python -m http.server 8080 --directory dist
```

Open `http://localhost:8080/`. This serves exactly the published files. (`dist/` is ignored by git.) For everyday work, serve the repository root instead and use `dev.html`, which is never served from the offline cache.

## The proxy Worker

`cloudflare/proxy-worker.js` is not deployed by the workflow. After changing it, paste it into the Worker in the Cloudflare dashboard and deploy there (see `doc/cloudflare_proxy_worker.md`).
