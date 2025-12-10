// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import expressiveCode from 'astro-expressive-code';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';
import viteCompression from 'vite-plugin-compression';

import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://astro.nova.gal',
  integrations: [expressiveCode(), mdx(), sitemap(), react(), icon()],
  adapter: cloudflare({
    imageService: 'compile',
    
  }),
  build: {
    // Inline styles to avoid render-blocking CSS requests on simple pages
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [
      tailwindcss(),
      // Precompress assets so CDNs/servers can serve brotli or gzip when available
      viteCompression({ algorithm: 'brotliCompress' }),
      viteCompression({ algorithm: 'gzip' }),
    ],
  },
});