# Hosila Landing

Standalone landing-page app for Hosila. This folder is intentionally independent from `Hosila-frontend` so it can be deployed as a separate site.

## Stack

- React 18
- Vite 6
- TypeScript
- Tailwind CSS

## Included in this version

- Responsive static marketing page sections
- In-page anchor navigation (desktop + mobile menu)
- Hosila color tokens copied from `Hosila-frontend/src/index.css` (color variables only)
- Tailwind semantic color mapping for `surface`, `heading`, `body`, `muted`, `border`, and `primary`

## Design source status

The original plan requires Figma MCP for direct frame extraction. In this session, the `figma` MCP server is unavailable (`unknown MCP server 'figma'`), so frame-level code and asset export could not run.

## Local development

```bash
cd Hosila-landing
npm install
npm run dev
```

Default local URL: `http://localhost:5173`

## Production build

```bash
npm run build
npm run preview
```

## Lint

```bash
npm run lint
```

## Deployment (generic static hosting)

Any static host that supports Vite output can deploy this app.

1. Run `npm ci` (or `npm install`), then `npm run build`.
2. Publish the generated `dist/` directory.
3. Set project root to `Hosila-landing` in your hosting platform.

No provider-specific config files are required in this phase.
