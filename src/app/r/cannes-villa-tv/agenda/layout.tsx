import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Villa · Agenda Cannes 2026",
  description:
    "Brunchs, dîners, soirées et tout l’agenda Cannes sur deux prochains jours (Europe/Paris).",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, noarchive: true },
  },
};

export default function CannesVillaTvAgendaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
