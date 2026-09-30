import { DepartmentOverview } from "@/components/mobile-ceo/DepartmentOverview";

export const dynamic = "force-dynamic";
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 11 ? "おはようございます" : hour < 18 ? "こんにちは" : "こんばんは";
}

/** `/` is the canonical CEO Dashboard. Company/office detail remains at `/company`. */
export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl overflow-x-hidden px-4 py-8 sm:px-8 lg:py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">AI Company</p>
        <h1 className="mt-1 text-2xl font-bold text-white">{greeting()}</h1>
      </header>
      <div className="mt-6 space-y-7">
        <DepartmentOverview />
      </div>
    </main>
  );
}
