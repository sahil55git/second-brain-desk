// 💬 Chat: ask the shop desk in words, make entries, get PDFs; link Telegram / Discord.
import ChatDesk from "@/components/bot/ChatDesk";
import "@/components/hub/hub.css";

export const metadata = { title: "Chat — Mahadev Traders" };

export default function ChatPage() {
  return <ChatDesk />;
}
