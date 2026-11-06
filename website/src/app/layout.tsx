import type { Metadata, Viewport } from "next";
import {
  Bodoni_Moda,
  JetBrains_Mono,
  Space_Grotesk,
  Manrope,
} from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const space = Space_Grotesk({
  variable: "--font-space",
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
  title: "Argent: AI coding agents you can verify",
  description:
    "Argent is an open-source desktop app for running AI coding agents in persistent workspaces. A local simulated desktop prototype today. Persistent cloud execution and independently verified code are the roadmap.",
};

export const viewport: Viewport = {
  themeColor: "#08090c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${space.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
