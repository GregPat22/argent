import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "@/lib/site";
import { isSiteIndexable } from "@/lib/seo";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  applicationName: "Argent",
  robots: {
    index: isSiteIndexable(),
    follow: true,
    ...(isSiteIndexable() ? { "max-image-preview": "large" as const } : {}),
  },
  openGraph: {
    type: "website",
    siteName: "Argent",
    locale: "en_US",
    url: SITE_URL,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: "@Argent_build",
  },
};

// Runs before first paint: hide content for the entrance only when scripts run
// and motion is allowed, and reveal it anyway if the app never takes over.
const ENTRANCE_SCRIPT = `(function(){try{var d=document.documentElement;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.dataset.entrance="pending";setTimeout(function(){if(d.dataset.entrance==="pending")d.dataset.entrance="done"},4000)}catch(e){}})()`;

export const viewport: Viewport = {
  themeColor: "#08090c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${manrope.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENTRANCE_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
