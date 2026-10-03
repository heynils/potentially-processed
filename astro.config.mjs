// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL and BASE_PATH are set by the deploy workflow from
// actions/configure-pages, so the same build works on
// https://<user>.github.io/<repo>/ and later on a custom domain at "/".
const site = process.env.SITE_URL || 'http://localhost:4321';
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  // With thousands of pages, shared CSS/JS files that the browser caches once
  // beat inlining a few KB into every page.
  build: { format: 'directory', inlineStylesheets: 'never' },
  scopedStyleStrategy: 'class',
  // compressHTML strips the whitespace between text and links that sit on
  // separate source lines ("from<a>"); gzip on the host makes up the bytes.
  compressHTML: false,
  vite: { build: { assetsInlineLimit: 0, cssCodeSplit: false } },
  integrations: [
    sitemap({
      filter: (page) => !/\/(search|404)\/?$/.test(new URL(page).pathname),
    }),
  ],
});
