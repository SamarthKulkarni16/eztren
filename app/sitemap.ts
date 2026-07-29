import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://eztren.xyz'
  const now = new Date()

  return [
    { url: base, lastModified: now, priority: 1 },
    { url: `${base}/rankings`, lastModified: now, priority: 0.9 },
    { url: `${base}/players`, lastModified: now, priority: 0.8 },
    { url: `${base}/tournaments`, lastModified: now, priority: 0.8 },
    { url: `${base}/matches`, lastModified: now, priority: 0.7 },
    { url: `${base}/watch`, lastModified: now, priority: 0.7 },
    { url: `${base}/archive`, lastModified: now, priority: 0.6 },
    { url: `${base}/history`, lastModified: now, priority: 0.6 },
    { url: `${base}/constitution`, lastModified: now, priority: 0.5 },
    { url: `${base}/join`, lastModified: now, priority: 0.9 },
  ]
}
