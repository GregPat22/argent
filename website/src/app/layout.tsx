import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
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

const TITLE = "Argent: AI coding agents you can verify";
const DESCRIPTION =
  "Argent is an open-source desktop app for running AI coding agents in persistent workspaces. A local desktop prototype that runs Claude Code in Git worktrees today. Persistent cloud execution and independently verified code are the roadmap.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // Shown when the page is shared. No image or address yet: the site is not
  // deployed, so there is no canonical URL to point at.
  openGraph: {
    type: "website",
    siteName: "Argent",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
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
