// What a tap on the scale dot of the Mill Desk does, in plain words. Pure, so it is tested
// (lib/__tests__/scaleTap.test.ts). The Mill Desk page runs this against the phone's Bluetooth
// scale link (components/scale/useBtScale.ts).
import type { LinkStatus } from "@/lib/scaleLink";

export type TapAct = "setup" | "connect" | "retry" | "none";
export interface TapPlan {
  act: TapAct;
  /** shown on the desk right after the tap */
  text: string;
  bad: boolean;
}

export function scaleTapPlan(o: { support: "native" | "serial" | "none"; hasConfig: boolean; status: LinkStatus; error: string | null; name: string }): TapPlan {
  const name = o.name || "the scale";
  if (o.support === "none") {
    return {
      act: "none",
      bad: true,
      text: "This browser cannot open a Bluetooth scale. On the phone, open the Mahadev Desk app (get it from the App page) and use Mill Desk there.",
    };
  }
  if (!o.hasConfig) return { act: "setup", bad: false, text: "Choose your scale first…" };
  switch (o.status) {
    case "live":
      return { act: "none", bad: false, text: `${name} is connected.` };
    case "off":
      return { act: "connect", bad: false, text: `Connecting to ${name}…` };
    case "connecting":
      return { act: "none", bad: false, text: `Connecting to ${name}… (can take 10 seconds)` };
    case "silent":
      return { act: "none", bad: true, text: `Connected, but no weight is coming. Switch the scale on and put something on it.` };
    case "waiting":
      return { act: "retry", bad: true, text: `${o.error || "The scale did not answer."} Trying again now…` };
    case "blocked":
      return { act: "retry", bad: true, text: o.error || "Allow Nearby devices for Mahadev Desk, or choose the scale again." };
  }
}
