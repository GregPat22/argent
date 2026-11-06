import type { Metadata, Viewport } from "next";
import {
  Bodoni_Moda,
  JetBrains_Mono,
  Schibsted_Grotesk,
} from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Argent: AI coding agents you can verify",
  description:
    "Argent is an open-source desktop app for running AI coding agents in persistent workspaces. Runs survive disconnects, results are checked independently, and nothing merges without you.",
};

export const viewport: Viewport = {
  themeColor: "#08090c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${schibsted.variable} ${jetbrains.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
