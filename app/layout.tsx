import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fairway — AI Swing Lab",
  description: "A privacy-first, browser-based golf swing motion analysis lab.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
