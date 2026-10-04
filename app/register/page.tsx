// Quick Register — the manager's simple counter screen. Protected by
// middleware.ts like every other page (login required; Staff and Owner
// both allowed). Data is loaded client-side from /api/register so the
// screen can refresh itself after every save.
import QuickRegister from "@/components/register/QuickRegister";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <QuickRegister />;
}
