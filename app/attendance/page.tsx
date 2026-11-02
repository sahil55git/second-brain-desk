// 🕘 Attendance: present / half / absent, check-in selfie and place, days this month.
import AttendanceDesk from "@/components/attendance/AttendanceDesk";
import "@/components/hub/hub.css";
import { FeatureGate } from "@/lib/useFeatures";

export const metadata = { title: "Attendance — Mahadev Traders" };

export default function AttendancePage() {
  return <FeatureGate k="attendance"><AttendanceDesk /></FeatureGate>;
}
