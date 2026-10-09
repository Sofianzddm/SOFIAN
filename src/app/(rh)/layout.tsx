import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "@/components/rh/tokens.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-rh-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-rh-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Glow Up · Plateforme RH",
  robots: { index: false, follow: false },
};

export default function RhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`rh-root ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      style={
        {
          "--rh-font": "var(--font-rh-sans), 'Space Grotesk', system-ui, sans-serif",
          "--rh-mono": "var(--font-rh-mono), 'JetBrains Mono', ui-monospace, monospace",
          fontFamily: "var(--rh-font)",
        } as React.CSSProperties
      }
    >
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          style: {
            background: "#12161C",
            border: "1px solid #2B333F",
            color: "#E7ECF2",
          },
        }}
      />
    </div>
  );
}
