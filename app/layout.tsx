import type { Metadata } from "next";
import "./globals.css";
import { CustomizeProvider } from "@/lib/customize";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ScaleProvider } from "@/components/ScaleProvider";

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
          <ScaleProvider>
            <CustomizeProvider>{children}</CustomizeProvider>
          </ScaleProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
