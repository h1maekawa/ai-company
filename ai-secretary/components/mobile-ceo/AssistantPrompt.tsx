"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AssistantPrompt() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = value.trim();
    if (!prompt) return;
    router.push(`/chat?node=assistant&prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <section aria-labelledby="assistant-prompt-title">
      <h2 id="assistant-prompt-title" className="text-base font-semibold text-white">何を知りたい・やりたい？</h2>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="今のXの状況を教えて"
          aria-label="AI秘書への質問または依頼"
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 text-base outline-none focus:border-violet-500"
        />
        <button type="submit" className="min-h-12 rounded-2xl bg-violet-600 px-6 font-semibold text-white hover:bg-violet-500">聞く</button>
      </form>
    </section>
  );
}
