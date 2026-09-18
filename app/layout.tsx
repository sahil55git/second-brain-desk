import type { Metadata } from "next";
import "./globals.css";
import { CustomizeProvider } from "@/lib/customize";

export const metadata: Metadata = {
  title: "Second Brain Desk",
  description:
    "Coded rebuild of the Second Brain Desk business dashboard — Job-Work Desk, Manufacturing, Daily Closing & Reports.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <CustomizeProvider>{children}</CustomizeProvider>
      </body>
    </html>
  );
}
