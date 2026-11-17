// A second web-app manifest just for the Weigh & Bill counter, so Chrome can install it as its own app
// (own icon, opens straight into /register/counter, nothing else in scope). Public like manifest.webmanifest.
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Weigh & Bill — Mahadev Traders",
      short_name: "Weigh & Bill",
      description: "Weighing counter and billing for Mahadev Traders.",
      id: "/register/counter",
      start_url: "/register/counter",
      scope: "/register/counter",
      display: "standalone",
      orientation: "any",
      background_color: "#f4f5f7",
      theme_color: "#1f4fa0",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
