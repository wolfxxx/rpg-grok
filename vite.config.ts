import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // Relative URLs so `dist/` works on GitHub project pages (`/repo-name/`).
  // The dev server needs an absolute base.
  base: command === 'build' ? './' : '/',
}))
