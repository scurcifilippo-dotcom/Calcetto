import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calcetto",
  description: "Partite, giocatori, statistiche e chat del gruppo di calcetto.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}</body></html>;
}
