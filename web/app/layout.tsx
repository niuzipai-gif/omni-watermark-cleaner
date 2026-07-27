import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Omni Image Cleaner",
  description: "Local Gemini image watermark cleanup in your browser.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
