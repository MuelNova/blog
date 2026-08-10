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
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkAdmonitions } from './src/plugins/remark-admonitions.ts';

const languageAliases = {
  'assembly': 'asm',
  'Assembly': 'asm',
  'ASSEMBLY': 'asm',
  'C': 'c',
  'ld': 'text',
  'gdbscript': 'bash',
};

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://nova.gal',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    routing: {
        prefixDefaultLocale: false
    }
  },
  markdown: {
    remarkPlugins: [remarkDirective, remarkMath, remarkAdmonitions],
    rehypePlugins: [rehypeKatex],
  },
  integrations: [expressiveCode({
    shiki: {
      langAlias: languageAliases,
    },
  }), mdx({
    remarkPlugins: [remarkDirective, remarkMath, remarkAdmonitions],
    rehypePlugins: [rehypeKatex],
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
