import { createServer } from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { officeMiddleware } from './office-state.ts'

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webp': 'image/webp',
}

export async function createOfficeServer(env: NodeJS.ProcessEnv = process.env, directory = fileURLToPath(new URL('../dist/', import.meta.url))) {
  const root = await realpath(directory)
  // Refuse to report readiness without a built frontend.
  const indexPath = await realpath(resolve(root, 'index.html'))
  if (!indexPath.startsWith(root + sep) || !(await stat(indexPath)).isFile()) {
    throw new Error('Frontend index must be a regular file within dist')
  }
  const index = await readFile(indexPath)
  const bridge = officeMiddleware(env)
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const reply = (status: number, body: string | Buffer, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    try {
      await bridge(req, res, () => {})
      if (res.writableEnded) return
      const pathname = new URL(req.url || '/', 'http://localhost').pathname
      if (pathname === '/health') {
        if (req.method !== 'GET') {
          res.setHeader('Allow', 'GET')
          return reply(405, 'Method not allowed')
        }
        return reply(200, '{"status":"ok"}', 'application/json')
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        return reply(405, 'Method not allowed')
      }
      let path: string
      try { path = decodeURIComponent(pathname) } catch { return reply(400, 'Bad request') }
      // Never serve source/configuration, dotfiles, unknown APIs or paths outside dist.
      if (path.includes('\\') || path.includes('\0') || path.split('/').some(p => p.startsWith('.')) || path === '/api' || path.startsWith('/api/')) return reply(404, 'Not found')
      const candidate = resolve(root, `.${path}`)
      if (candidate !== root && !candidate.startsWith(root + sep)) return reply(404, 'Not found')
      try {
        const file = await realpath(candidate)
        if (!file.startsWith(root + sep)) {
          if (file !== root) return reply(404, 'Not found')
        } else if ((await stat(file)).isFile()) {
          return reply(200, await readFile(file), types[extname(file)] || 'application/octet-stream')
        }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code || '')) throw error
      }
      // History routes fall back to the app; missing assets stay real 404s.
      if (!extname(path) && !path.startsWith('/assets/')) return reply(200, index, types['.html'])
      reply(404, 'Not found')
    } catch {
      if (!res.headersSent) reply(500, 'Internal server error')
      else res.destroy()
    }
  })
}

export function listenConfig(env: NodeJS.ProcessEnv) {
  const host = env.HOST || '127.0.0.1'
  const port = env.PORT === undefined ? 3000 : Number(env.PORT)
  if (!/^\d+$/.test(env.PORT ?? '3000') || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return { host, port }
}

async function main() {
  const config = listenConfig(process.env)
  const server = await createOfficeServer()
  server.on('error', () => { console.error('[office] Server failed to listen'); process.exitCode = 1 })
  let stopping = false
  const shutdown = () => {
    if (stopping) return
    stopping = true
    console.info('[office] Shutting down')
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1) }, 10_000)
    deadline.unref()
    server.close(() => { clearTimeout(deadline); process.exit(0) })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  server.listen(config, () => console.info(`[office] Listening on http://${config.host}:${config.port}`))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('[office] Startup failed; check build and host/port configuration'); process.exitCode = 1 })
}
