// 🖼️ Icons — the icon library, grouped, with names. Use any icon on a Quick-links tile (🎨 Tile look → Library icon) or in code.
import IconGallery from "@/components/icons/IconGallery";
import "@/components/hub/hub.css";

export const metadata = { title: "Icons — Second Brain Desk" };

export default function IconsPage() {
  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🖼️ Icons</h1>
          <div className="hub-m">Every icon by group, with its name. Tap to copy the id.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/go">🔗 Quick links</a>
          <a className="hub-btn" href="/appearance">🎨 Appearance</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>
      <IconGallery />
    </div>
  );
}
