import type { APIRoute } from 'astro';
import { iconSprite } from '../lib/icons.ts';

export const GET: APIRoute = () => new Response(iconSprite(), { headers: { 'Content-Type': 'image/svg+xml' } });
