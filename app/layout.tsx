import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horário — Fénix, à tua maneira",
  description: "Importa o teu horário do Técnico, personaliza as cores e exporta para A4 em PDF ou PNG.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT">
      <body className="antialiased">{children}</body>
    </html>
  );
}
