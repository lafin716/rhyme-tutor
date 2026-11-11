import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

/**
 * The production CSP lives in src/renderer/index.html and stays strict (connect-src 'self' only).
 * The dev server needs two extras: the Vite HMR websocket and dev origins for connect-src, and an inline
 * script for the React refresh preamble that @vitejs/plugin-react injects. Only `vite dev` gets them.
 */
function devCsp(): Plugin {
  const replacements: Array<[string, string]> = [
    ["script-src 'self';", "script-src 'self' 'unsafe-inline';"],
    ["connect-src 'self';", "connect-src 'self' ws: http://localhost:* http://0.0.0.0:*;"]
  ]
  return {
    name: 'tutor-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      let out = html
      for (const [from, to] of replacements) {
        if (!out.includes(from)) throw new Error(`devCsp: "${from}" not found in index.html CSP`)
        out = out.replace(from, to)
      }
      return out
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias },
    build: { outDir: 'out/main' }
  },
  preload: {
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { ...alias, '@renderer': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), tailwindcss(), devCsp()],
    // Global rule: expose dev/preview servers on all interfaces and allow Tailscale MagicDNS hosts.
    server: { host: '0.0.0.0', allowedHosts: ['.ts.net', 'localhost'] },
    preview: { host: '0.0.0.0', allowedHosts: ['.ts.net', 'localhost'] },
    build: { outDir: 'out/renderer' }
  }
})
