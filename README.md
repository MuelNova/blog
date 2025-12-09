# Blog Astro (Spectre x MultiTerm)

A custom Astro blog that blends the Spectre visual style with MultiTerm-inspired theme switching. Themes are pre-generated from Shiki to avoid runtime loading issues on Cloudflare workers.

## Stack
- Astro 5 (Cloudflare adapter)
- Tailwind (v4 plugin) + global CSS variables for theming
- astro-expressive-code + Shiki bundled themes

## Scripts
- `yarn dev` — start dev server
- `yarn build` — production build
- `yarn preview` — preview the build locally
- `yarn astro ...` — run Astro CLI commands
- `yarn generate:themes` — pre-generate theme color JSON from Shiki (`src/generated/theme-colors.json`)

## Theme system
- Theme definitions live in `src/config/themes.ts` and use the pre-generated `src/generated/theme-colors.json`.
- `BaseHead.astro` injects CSS variables for every theme at build time.
- `ThemeLoader.astro` reads `localStorage` early and applies `data-theme` to prevent FOUC; defaults to `spectre` if no stored theme.

### Adding a new theme
1) Edit `scripts/generate-theme-colors.ts` and append a new entry to `themeDefinitions` with `id`, `name`, `description`, `shikiTheme`, and `tone` (`dark` or `light`).
2) Run `yarn generate:themes` to regenerate `src/generated/theme-colors.json`.
3) Ensure the new theme appears in the UI (ThemeSelector lists all themes automatically).

## Performance notes
- Latest build output: CSS bundle `dist/_astro/ec.y0rd3.css` ~18.5 kB (gz ~4.1 kB); client JS `dist/_astro/client.C3DCzcxU.js` ~195 kB (gz ~61 kB).
- Tailwind v4 on-demand compilation removes unused utilities automatically; custom CSS is minimal.
- Theme FOUC is mitigated by early `ThemeLoader` defaulting to `spectre` when no saved theme exists.
- For a full audit, run Lighthouse against the built site (e.g., `yarn build && npx serve dist` then Lighthouse in Chrome DevTools).

## Content & pages
- Blog posts: `src/content/blog/`
- Layouts: `src/layouts/`
- Components: `src/components/`
- Global styles: `src/styles/global.css`

## Deployment
- Built for Cloudflare; see `astro.config.mjs` and `wrangler.jsonc` for bindings (SESSION KV required).
