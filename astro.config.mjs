// @ts-check
import { defineConfig } from 'astro/config';

// Static site: one pre-rendered page per domain (ticket 008).
// Served from GitHub Pages at /skill-atlas/ (ticket 010) — internal links
// must go through import.meta.env.BASE_URL, never hardcode "/".
export default defineConfig({
  output: 'static',
  site: 'https://micahchoo.github.io',
  base: '/skill-atlas',
});
