import type { Metadata } from "next";
import "./globals.css";
import "./operational-polish.css";
import "./enterprise-forms.css";
import "./brand-presence.css";

export const metadata: Metadata = {
  title: { default: "Software de operación industrial · RERCHAR y E y J", template: "%s · RERCHAR y E y J" },
  description: "Software de operación industrial para RERCHAR y E y J.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CL"><body>{children}</body></html>;
}
