// Web-app manifest for the Mill Counter Desk, so Chrome can install it as its own app (opens straight into /mill/counter).
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "Mill Counter Desk — Mahadev Traders",
      short_name: "Mill Counter",
      description: "Barrel lots received at the mill: gross, tare and net weight per barrel.",
      id: "/mill/counter",
      start_url: "/mill/counter",
      scope: "/mill/counter",
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
