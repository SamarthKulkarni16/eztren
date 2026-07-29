import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const SITE_URL = "https://eztren.xyz";
const TITLE = "Eztren | A Debate Sport";
const DESCRIPTION =
  "Eztren is a global debate sport ranked by letters, not numbers. Join ranked debate battles, climb from the lower alphabet leagues toward becoming A, and compete live against debaters worldwide.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Eztren",
  },
  description: DESCRIPTION,
  keywords: [
    "Eztren",
    "debate sport",
    "competitive debate",
    "online debate platform",
    "debate ranking",
    "ranked debate battles",
    "One Alphabet League",
  ],
  applicationName: "Eztren",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Eztren",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/favicon-512.png",
        width: 512,
        height: 512,
        alt: "Eztren — A Debate Sport",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/favicon-512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/favicon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Eztren",
  alternateName: "One Alphabet",
  url: SITE_URL,
  description: DESCRIPTION,
  applicationCategory: "SportsApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  sameAs: [
    "https://github.com/SamarthKulkarni16/eztren",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
