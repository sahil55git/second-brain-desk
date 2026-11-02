// 🕘 Attendance: present / half / absent, check-in selfie and place, days this month.
import AttendanceDesk from "@/components/attendance/AttendanceDesk";
import "@/components/hub/hub.css";

export const metadata = { title: "Attendance — Mahadev Traders" };

export default function AttendancePage() {
  return <AttendanceDesk />;
}
