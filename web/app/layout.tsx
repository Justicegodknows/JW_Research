import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JW Research",
  description: "Personal RAG over JW Library content"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
