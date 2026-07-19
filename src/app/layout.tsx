import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gasolina · Tickets y comisiones",
  description: "Plataforma para capturar, procesar y liquidar tickets de gasolina.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-MX"
      className={sora.variable}
      data-theme="dark"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
