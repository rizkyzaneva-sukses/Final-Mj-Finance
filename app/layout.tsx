import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUDA JUARA Finance",
  description: "Pusat pencatatan dan laporan keuangan komunitas MUDA JUARA",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
