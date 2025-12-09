// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import expressiveCode from 'astro-expressive-code';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: 'https://astro.nova.gal',
  integrations: [expressiveCode(), mdx(), sitemap(), react()],
  adapter: cloudflare({
    imageService: 'cloudflare',
    
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
