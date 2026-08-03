// @ts-check
import { defineConfig } from 'astro/config';

// Static site: one pre-rendered page per domain (ticket 008).
export default defineConfig({
  output: 'static',
});
