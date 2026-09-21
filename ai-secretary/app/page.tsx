import { AssistantPrompt } from "@/components/mobile-ceo/AssistantPrompt";
import { DepartmentOverview } from "@/components/mobile-ceo/DepartmentOverview";

/** `/` is the canonical CEO Dashboard. Company/office detail remains at `/company`. */
export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl overflow-x-hidden px-4 py-8 sm:px-8 lg:py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">AI Company</p>
        <h1 className="mt-1 text-2xl font-bold text-white">会社の今</h1>
      </header>
      <div className="mt-6 space-y-7">
        <AssistantPrompt />
        <DepartmentOverview />
      </div>
    </main>
  );
}
