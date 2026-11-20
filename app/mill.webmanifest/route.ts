// Web-app manifest for the Mill Desk, so Chrome can install it as its own app (opens straight into /mill).
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Mill Desk — Mahadev Traders",
      short_name: "Mill Desk",
      description: "Mill 1 weighing, job-work tokens and our crushing runs.",
      id: "/mill",
      start_url: "/mill",
      scope: "/mill",
      display: "standalone",
      orientation: "any",
      background_color: "#05080C",
      theme_color: "#05080C",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
