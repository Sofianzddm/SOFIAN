import type { Metadata } from "next";
import { Toaster } from "sonner";
import "@/styles/ui-fonts.css";
import "@/components/rh/tokens.css";

export const metadata: Metadata = {
  title: "Glow Up · Plateforme RH",
  robots: { index: false, follow: false },
};

export default function RhLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rh-root"
      style={
        {
          "--rh-font":
            "var(--font-rh-sans), 'Space Grotesk', system-ui, sans-serif",
          "--rh-mono":
            "var(--font-rh-mono), 'JetBrains Mono', ui-monospace, monospace",
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
