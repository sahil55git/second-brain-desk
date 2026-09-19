import type { Metadata } from "next";
import "./globals.css";
import { CustomizeProvider } from "@/lib/customize";
import AuthSessionProvider from "@/components/AuthSessionProvider";

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
        <AuthSessionProvider>
          <CustomizeProvider>{children}</CustomizeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
