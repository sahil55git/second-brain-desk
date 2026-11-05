// 🧾 A purchase order shared with the supplier by link (no sign-in). The token in the address is the key.
import PublicPo from "@/components/po/PublicPo";
import "@/components/po/po.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchase order", robots: { index: false, follow: false } };

export default function PublicPoPage({ params }: { params: { token: string } }) {
  return <PublicPo token={params.token} />;
}
