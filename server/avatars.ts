import type { IncomingMessage, ServerResponse } from 'node:http'
import { normalizeAppearance } from '../src/identity.ts'

/** Fixed native asset route: never proxy user-supplied URLs or forward credentials. */
export function avatarMiddleware(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Buffer>()
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split('?')[0] ?? ''
    if (!path.startsWith('/api/office-avatar/')) return next()
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET'); res.statusCode = 405; res.end(); return
    }
    const match = /^\/api\/office-avatar\/([^/]+)\/([^/]+)\.png$/.exec(path)
    const appearance = match && normalizeAppearance({ schemaVersion: 1, characterVersion: match[1], paletteId: match[2] })
    if (!appearance) { res.statusCode = 404; res.end(); return }
    try {
      let bytes = cache.get(path)
      if (!bytes) {
        const base = new URL(env.PAPERCLIP_API_URL || '')
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid origin')
        const response = await fetcher(new URL(`/api/agent-avatars/${appearance.characterVersion}/${appearance.paletteId}/rest.png?size=64&scale=1`, base), {
          redirect: 'error', signal: AbortSignal.timeout(2500),
        })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error('Invalid asset')
        bytes = Buffer.from(await response.arrayBuffer())
        if (bytes.length > 256_000 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Invalid PNG')
        cache.set(path, bytes)
      }
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.end(bytes)
    } catch { res.statusCode = 503; res.end() }
  }
}
