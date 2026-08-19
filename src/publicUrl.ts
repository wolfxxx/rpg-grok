/** Resolve a file from `public/` for local `/` and GitHub Pages subpaths. */
export function publicUrl(path: string): string {
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  const rel = `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
  if (typeof document === 'undefined') return rel
  // Absolute URLs so CSS `url()` is not resolved against hashed `/assets/*.css`.
  return new URL(rel, document.baseURI).href
}
