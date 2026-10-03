// Site-wide settings that are not secrets or environment-specific.
export const SITE = {
  name: 'Is it ultra-processed?',
  /** Shown in meta descriptions and the home page. */
  tagline: 'Look up how processed a packaged food is, why, and what to buy instead.',
  /** Show Open Food Facts product photos (CC BY-SA), hotlinked from images.openfoodfacts.org. */
  showProductImages: true,
} as const;
