import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const brand = Manrope({ subsets: ["latin"], variable: "--font-brand", display: "swap", weight: ["700", "800"] });
const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap", weight: ["400", "500", "600", "700", "800"] });

const DESCRIPTION = "Plan your next home around your life anchors: real travel times from every home to work, the gym and the people you see. Free, no sign-up.";
/** Absolute base for link previews: the production domain on Vercel, else this deployment, else local. */
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(SITE ? `https://${SITE}` : "http://localhost:3000"),
  title: "Settle · Find the home that fits your life",
  description: DESCRIPTION,
  // The preview image is src/app/opengraph-image.jpg (Next adds it to every page).
  openGraph: { type: "website", siteName: "Settle", locale: "en_NZ", title: "Settle · Find the home that fits your life", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Settle · Find the home that fits your life", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${brand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
