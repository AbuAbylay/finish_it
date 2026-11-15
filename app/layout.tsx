import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Literata } from "next/font/google";
import { copy } from "@/lib/content";
import "./globals.css";

// Two voices (docs/design.md §2). The coach: navigation, buttons, reasons, feedback, the plan.
const coach = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-coach", display: "swap" });
// The course: lesson text, the lesson title and every passage quoted from the learner's material.
const course = Literata({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-course", display: "swap" });

export const metadata: Metadata = {
  title: copy.pageTitle,
  description: "Turns the course you already paid for into a daily plan that adapts to what you get wrong and gets you to your exam date.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafbfd",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${coach.variable} ${course.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
