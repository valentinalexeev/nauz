import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Науз — сказки и письма голосом родных",
  description:
    "Науз записывает сказки и личные послания для детей голосами родителей и близких, сохраняя их связь на расстоянии и во времени.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
