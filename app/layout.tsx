import type { Metadata } from "next";
import "./globals.css";
import "./operational-polish.css";

export const metadata: Metadata = {
  title: { default: "RERCHAR Industrial Waste Management System", template: "%s · RERCHAR Industrial Waste Management System" },
  description: "RERCHAR Industrial Waste Management System · Piloto operacional",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-CL"><body>{children}</body></html>;
}
