import type { Metadata, Viewport } from "next";
import { copy } from "@/lib/content";
import "./globals.css";

export const metadata: Metadata = {
  title: copy.pageTitle,
  description: "Turns the course you already paid for into a daily plan that adapts to what you get wrong and gets you to your exam date.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f5f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
