import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MUDA JUARA Finance",
  description: "Pusat pencatatan dan laporan keuangan komunitas MUDA JUARA",
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("mj-theme");
    const theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
