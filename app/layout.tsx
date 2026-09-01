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
    "debate game",
    "debate competition",
    "letter ranking debate",
    "eztren.xyz",
  ],
  applicationName: "Eztren",
  authors: [{ name: "Eztren", url: SITE_URL }],
  creator: "Eztren",
  publisher: "Eztren",
  category: "Sports & Recreation",
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
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "EZT REN — A global debate sport, ranked by letters, not numbers. eztren.xyz",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
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

const jsonLd = [
  {
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
    sameAs: ["https://github.com/SamarthKulkarni16/eztren"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Eztren",
    alternateName: "Eztren Debate Sport",
    url: SITE_URL,
    description: DESCRIPTION,
    inLanguage: "en",
  },
  {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: "Eztren",
    alternateName: "One Alphabet League",
    url: SITE_URL,
    description:
      "Eztren is a global debate sport played and ranked online. Players argue live, judged in real time, and ranked by letters from Z toward A.",
    sport: "Debate",
    sameAs: ["https://github.com/SamarthKulkarni16/eztren"],
  },
];

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
