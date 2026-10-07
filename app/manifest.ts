// Web app manifest — lets Chrome / Safari install the desk like an app and
// shows long-press shortcuts (Sale, Expense, Stock, Cash, Manufacturing…).
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mahadev Traders — Second Brain Desk",
    short_name: "Mahadev",
    description: "Quick register, tallies, manufacturing and reports for Mahadev Traders.",
    start_url: "/go",
    scope: "/",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#1f6f43",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Sale", url: "/register?open=sale" },
      { name: "Expense", url: "/register?open=expense" },
      { name: "New job-work", url: "/register?open=jobwork" },
      { name: "Cash tally", url: "/cash" },
      { name: "Stock tally", url: "/stock" },
      { name: "Manufacturing", url: "/mfg" },
    ],
  };
}
