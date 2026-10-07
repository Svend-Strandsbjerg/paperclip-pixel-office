import { defineConfig, loadEnv } from 'vite'
import { officeMiddleware } from './server/office-state.ts'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  return { plugins: [{
    name: 'office-state-bridge',
    configureServer(server) { server.middlewares.use(officeMiddleware(env)) },
    configurePreviewServer(server) { server.middlewares.use(officeMiddleware(env)) },
  }] }
})
