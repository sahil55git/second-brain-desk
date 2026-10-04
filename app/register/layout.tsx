import type { Metadata, Viewport } from "next";
import "./register.css";

export const metadata: Metadata = {
  title: "Quick Register — Mahadev Traders",
  description: "Simple bilingual counter register: sale, purchase, job-work, expense, payment, pigmee, cash count.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Kannada-friendly rounded font; falls back to Noto Sans Kannada / system font offline. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Baloo+Tamma+2:wght@500;600;700;800&display=swap"
      />
      {children}
    </>
  );
}
