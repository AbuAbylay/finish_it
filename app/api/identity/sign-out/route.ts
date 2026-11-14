import { json, route } from "@/lib/http";
import { signOut } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const res = json({ ok: true });
  await signOut(req, res);
  return res;
});
