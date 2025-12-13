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
import remarkDirective from 'remark-directive';
import { remarkAdmonitions } from './src/plugins/remark-admonitions.ts';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://astro.nova.gal',
  markdown: {
    remarkPlugins: [remarkDirective, remarkAdmonitions],
  },
  integrations: [expressiveCode(), mdx({
    remarkPlugins: [remarkDirective, remarkAdmonitions],
  }), sitemap(), react(), icon()],
  adapter: cloudflare({
    imageService: 'cloudflare',
    
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
