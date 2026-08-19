import type { Metadata } from "next";
import { Manrope, Piazzolla } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Шрифты дизайн-системы: Manrope — интерфейс, Piazzolla — тексты сказок/
// писем и заголовки экранов (см. docs/Науз - дизайн.dc.html). Грузим через
// next/font — самохостится и инлайнится без внешнего запроса к Google
// Fonts в браузере пользователя.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

const piazzolla = Piazzolla({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-piazzolla",
  display: "swap",
});

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
    <html
      lang="ru"
      className={`h-full antialiased ${manrope.variable} ${piazzolla.variable}`}
    >
      <body className="min-h-full flex flex-col bg-paper font-sans text-ink">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
