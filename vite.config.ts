/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

/** Short commit hash for the About dialog: GITHUB_SHA in CI, else git, else 'dev'. */
function commitHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

// GitHub Pages serves the app at https://<user>.github.io/harmonics/, so the
// build (and `vite preview` of that build) use that base; the dev server uses '/'.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/harmonics/' : '/',
  plugins: [svelte()],
  define: {
    __APP_COMMIT__: JSON.stringify(commitHash()),
    __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Vitest stubs CSS imports by default; tokens.test.ts reads tokens.css?raw.
    css: { include: [/tokens\.css/] },
  },
}))
