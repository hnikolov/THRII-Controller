// The app's version, read by the page (shown under CONNECT) and by sw.js (its cache name). APP_VERSION is set by hand
// for a release; BUILD is a hash of the shipped files, written by `python scripts/check_release.py --stamp`. Any change
// here makes the browser install the new service worker, which is how a release reaches installed apps.
export const APP_VERSION = '1.0.2';
export const BUILD = '682b5a3b';
