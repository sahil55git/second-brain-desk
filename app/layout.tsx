import type { Metadata } from "next";
import "./globals.css";
import "./skins.css";
import "./home.css";
import { CustomizeProvider } from "@/lib/customize";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { ScaleProvider } from "@/components/ScaleProvider";

export const metadata: Metadata = {
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Mahadev", statusBarStyle: "default" },
  title: "Second Brain Desk",
  description:
    "Coded rebuild of the Second Brain Desk business dashboard — Job-Work Desk, Manufacturing, Daily Closing & Reports.",
};

// Mirrors lib/customize.tsx + migrateLook: saved glass look, untouched original look → Neon glass.
const PRE_PAINT = `(function(){try{var d=document.documentElement,p=JSON.parse(localStorage.getItem("sbd_prefs_v1")||"null"),l=p&&p.look;
var skin=l&&l.skin;if(!p||(!(p.lookV>=2)&&(!l||((l.preset||"parchment")==="parchment"&&!l.custom))))skin="neon";
if(skin&&skin!=="none"){d.dataset.skin=skin;var c={neon:["#070a1f","#e9edff"],frost:["#3a2a1f","#fbf4ea"],soft:["#eceeec","#1b1f1c"],earth:["#efe7d8","#2e2a24"],pastel:["#f3eefb","#2a2140"],ink:["#070b18","#eef1fa"]}[skin];if(c){d.style.setProperty("--background",c[0]);d.style.setProperty("--foreground",c[1]);}d.classList.add(skin==="soft"||skin==="earth"||skin==="pastel"?"light":"dark");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paint the saved look (or the Neon glass default) before React loads, so the page never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
      </head>
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
