import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gasolina Tickets",
  description: "Operator portal for gas ticket factura submission.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
