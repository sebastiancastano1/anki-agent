import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cozy Anki — investiga y aprende",
  description: "Tarjetas Anki generadas por un agente de investigación profunda.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
