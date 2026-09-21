import { redirect } from "next/navigation";

/** Backward-compatible alias; `/` is the single CEO Dashboard implementation. */
export default function CeoPage() {
  redirect("/");
}
