import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/battle', '/api'],
    },
    sitemap: 'https://eztren.xyz/sitemap.xml',
  }
}
