// Icons from Lucide (https://lucide.dev, ISC licence, via the lucide-static
// package), read at build time. They are served as one small sprite file,
// /icons.svg (see pages/icons.svg.ts), that every page references with
// <use>: the browser fetches and caches it once, instead of every page
// carrying the same SVG paths inline. Add an icon by importing it here.
import apple from 'lucide-static/icons/apple.svg?raw';
import can from 'lucide-static/icons/can.svg?raw';
import chefHat from 'lucide-static/icons/chef-hat.svg?raw';
import factory from 'lucide-static/icons/factory.svg?raw';
import share from 'lucide-static/icons/share-2.svg?raw';

const ICONS = { apple, can, 'chef-hat': chefHat, factory, share } as const;
export type IconName = keyof typeof ICONS;

/** All icons as <symbol>s; each keeps Lucide's stroke settings, so it inherits the text colour. */
export function iconSprite(): string {
  const symbols = Object.entries(ICONS).map(([name, svg]) => {
    const body = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/)![1];
    return `<symbol id="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>`.replace(/\s+/g, ' ').replace(/>\s+</g, '><');
}
