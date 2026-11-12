import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

const brand = Manrope({ subsets: ["latin"], variable: "--font-brand", display: "swap", weight: ["700", "800"] });
const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Settle · Find the home that fits your life",
  description: "Plan your next home around your life anchors: real travel times from every home to work, the gym and the people you see. Free, no sign-up.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${ui.variable} ${brand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
