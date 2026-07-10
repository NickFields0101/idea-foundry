import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const productName = "Idea Foundry — Xahau + Evernode";
const title = `Find the idea worth disproving | ${productName}`;
const description =
  "Generate and review Xahau and Evernode ideas with deterministic 51-claim scoring, evidence validation, non-compensable gates, and local-first privacy.";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const metadataBase = new URL(
  configuredSiteUrl ||
    "https://xahau-evernode-idea-foundry.allmoneyinrollin40.chatgpt.site",
);

export const metadata: Metadata = {
  metadataBase,
  title,
  description,
  openGraph: {
    type: "website",
    url: "/",
    siteName: productName,
    title,
    description,
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: `${productName} — Find the idea worth disproving`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
