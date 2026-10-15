import { redirect } from "next/navigation";

// The customer-facing website now lives in GoHighLevel. The root of this deployment is the dashboard
// (signed-out visitors are sent on to /login by src/proxy.ts).
export default function Root() {
  redirect("/app");
}
