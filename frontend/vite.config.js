import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  if (command === 'build' && mode === 'production' && env.VITE_BACKEND_URL) {
    let backendUrl
    try { backendUrl = new URL(env.VITE_BACKEND_URL) } catch { throw new Error('VITE_BACKEND_URL must be an absolute API origin') }
    if (backendUrl.protocol !== 'https:' || backendUrl.pathname !== '/' || ['localhost', '127.0.0.1', '::1'].includes(backendUrl.hostname)) {
      throw new Error('VITE_BACKEND_URL must be a deployed HTTPS API origin in production')
    }
  }
  return { plugins: [react()] }
})
