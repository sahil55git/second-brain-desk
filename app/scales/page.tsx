// Live scales: choose and connect the Bluetooth scale on this phone or computer, see every scale's
// reading. Opened by every "Set up scale" button; ?back= says which page to return to.
import ScalesPage from "@/components/scale/ScalesPage";

export const metadata = { title: "Live scales — Mahadev Traders" };

export default function Page({ searchParams }: { searchParams?: { back?: string } }) {
  return <ScalesPage back={typeof searchParams?.back === "string" ? searchParams.back : ""} />;
}
