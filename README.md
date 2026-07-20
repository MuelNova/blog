# Muir's Cream

A cozy cream-themed Astro blog. Theming is reduced to two hand-crafted palettes — `cream` (light) and `cream-dark` — with light/dark/system switching.

## Stack
- Astro 5 (Cloudflare adapter)
- Tailwind (v4 plugin) + global CSS variables for theming
- astro-expressive-code + Shiki bundled themes

## Scripts
- `yarn dev` — start dev server
- `yarn build` — production build
- `yarn preview` — preview the build locally
- `yarn astro ...` — run Astro CLI commands

## Theme system
- Only two themes exist: `cream` (light, default) and `cream-dark`. Definitions live in `src/config/themes.ts`.
- `BaseHead.astro` inlines the `:root[data-theme="cream"]` / `:root[data-theme="cream-dark"]` CSS variable blocks at build time.
- `ThemeLoader.astro` reads `localStorage('theme-preference')` early and applies `data-theme` to prevent FOUC; falls back to `prefers-color-scheme` and follows live system changes unless the user picked light/dark explicitly.

### Theme palettes
The two palettes are hand-maintained in `src/config/themes.ts`, `src/components/BaseHead.astro`, and the `@theme` block in `src/styles/global.css` — keep all three in sync when adjusting colors.

## Performance notes
- Tailwind v4 on-demand compilation removes unused utilities automatically; custom CSS is minimal.
- Theme FOUC is mitigated by the early inline `ThemeLoader` script.
- For a full audit, run Lighthouse against the built site (e.g., `yarn build && npx serve dist` then Lighthouse in Chrome DevTools).

## Content & pages
- Blog posts: `src/content/blog/`
- Layouts: `src/layouts/`
- Components: `src/components/`
- Global styles: `src/styles/global.css`

## Deployment
- Built for Cloudflare; see `astro.config.mjs` and `wrangler.jsonc` for bindings (SESSION KV required).
