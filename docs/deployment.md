# Deployment

Fuzzaholic deploys the static client to GitHub Pages from `main`.

## URL

`https://cybrdelic.github.io/Fuzzaholic/`

## Build path

Production builds use Vite's `/Fuzzaholic/` base path. The Pages workflow runs:

```bash
npm ci
npm run build
```

and publishes `dist` to the `gh-pages` branch. The repository Pages settings should use the existing `gh-pages` source.

## Static and local modes

The file-backed shader database runs through `server.mjs` and writes to `data/fuzzaholic.sqlite`. GitHub Pages cannot run that API server, so the deployed static page can render and explore shaders, but permanent save/library features require the desktop/local launcher.

When `/api/health` is unavailable, the app runs in static export-only mode:

- saves and likes are held in the current session only
- library import/export uses `.fuzzaholic.json` bundles
- the UI labels storage as export-only instead of claiming disk permanence

For the full local app:

```bash
npm run dev
```

Then open `http://127.0.0.1:3000/`.

## Validation

Run the build gate:

```bash
npm run build
```

Run the visual smoke harness against a local server:

```bash
npm run visual:smoke
```

The harness writes screenshots and `report.json` to `visual-check-productization/`, which is ignored by default.
