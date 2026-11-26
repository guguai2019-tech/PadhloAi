import type { IncomingMessage, ServerResponse } from 'http';
import type express from 'express';
import { createApp } from '../server.ts';

let appPromise: Promise<express.Express> | null = null;

function getApp(): Promise<express.Express> {
  if (!appPromise) {
    appPromise = createApp({ attachStaticOrVite: false });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Reconstruct original /api/... path when Vercel routes through /api/index?__path=...
  if (req.url && req.url.startsWith('/api/index')) {
    const parsed = new URL(req.url, 'http://localhost');
    const subPath = parsed.searchParams.get('__path') || '';
    parsed.searchParams.delete('__path');
    const remainingQuery = parsed.searchParams.toString();
    const cleanSub = subPath.replace(/^\/+/, '');
    req.url = `/api${cleanSub ? `/${cleanSub}` : ''}${remainingQuery ? `?${remainingQuery}` : ''}`;
  }

  const app = await getApp();
  app(req as unknown as express.Request, res as unknown as express.Response);
}
