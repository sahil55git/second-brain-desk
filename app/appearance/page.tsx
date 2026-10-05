// 🎨 Appearance — for every signed-in user (Staff too): each device keeps
// its own look (text size, theme, font…), so the shop phone can differ
// from the owner's laptop.
import AppearancePanel from "@/components/AppearancePanel";
import "@/components/hub/hub.css";

export const metadata = { title: "Appearance — Second Brain Desk" };

export default function AppearancePage() {
  return (
    <div className="hub">
      <header className="hub-top">
        <div>
          <h1>🎨 Appearance</h1>
          <div className="hub-m">Themes, colours, font, text size, spacing, transparency — saved on this device.</div>
        </div>
        <nav className="hub-links">
          <a className="hub-btn" href="/register">📒 Quick Register</a>
          <a className="hub-btn" href="/">🗂️ Full desk</a>
        </nav>
      </header>
      <div style={{ maxWidth: 980 }}>
        <AppearancePanel />
      </div>
    </div>
  );
}
