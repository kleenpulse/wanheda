import type { Metadata } from "next";
import { Figtree, Geist, Geist_Mono, Poppins } from "next/font/google";
import { MotionProvider } from "@/components/providers/motion-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { privacyBootScript } from "@/lib/money/privacy";
import { prefsBootScript } from "@/lib/prefs/prefs";
import { railBootScript } from "@/lib/shell/rail";
import "./globals.css";
import "./privacy.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Display face, as in the portfolio (user 2026-11-05). Variable font: every weight up to 900.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});
// Readout microtype only (SPEC V15). Poppins is not a variable font: load the weights in use.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wanheda",
  description: "A personal super-dashboard: money, media, reading, voice and notes in one place.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${figtree.variable} ${poppins.variable} h-full antialiased`}
    >
      <head>
        {/* Before first paint: the shell fallback's rail width (lib/shell/rail.ts). */}
        <script dangerouslySetInnerHTML={{ __html: railBootScript() }} />
        {/* Before first paint: the skin and accent from the prefs cookie (lib/prefs/prefs.ts). */}
        <script dangerouslySetInnerHTML={{ __html: prefsBootScript() }} />
        {/* Before first paint: privacy mode from this device (lib/money/privacy.ts), so figures never flash. */}
        <script dangerouslySetInnerHTML={{ __html: privacyBootScript() }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider>
          <MotionProvider>{children}</MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
