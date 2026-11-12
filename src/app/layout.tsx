import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap", weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Settle",
  description: "Compare homes by how they fit your life: real travel times to work, the gym and the people you see.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
