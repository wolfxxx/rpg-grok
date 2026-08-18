/** Resolve a file from `public/` for local `/` and GitHub Pages subpaths. */
export function publicUrl(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
