import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDraftBySlug } from "@/app/lib/note/drafts/mobile";

export const dynamic = "force-dynamic";

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; text: string }
  | { type: "quote"; text: string }
  | { type: "text"; text: string };

function bodyWithoutFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function blocks(markdown: string): Block[] {
  return bodyWithoutFrontmatter(markdown).split("\n").flatMap((line): Block[] => {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) return [{ type: "heading", level: heading[1].length, text: heading[2] }];
    if (/^[-*]\s+/.test(line)) return [{ type: "bullet", text: line.replace(/^[-*]\s+/, "") }];
    if (/^>\s?/.test(line)) return [{ type: "quote", text: line.replace(/^>\s?/, "") }];
    return [{ type: "text", text: line }];
  });
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\))/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    return link ? (
      <a key={index} href={link[2]} target="_blank" rel="nofollow sponsored noopener noreferrer"
        className="font-medium text-brand underline decoration-brand/40 underline-offset-4">
        {link[1]}
      </a>
    ) : <span key={index}>{part.replace(/\*\*/g, "")}</span>;
  });
}

export default async function MobileNoteDraftPage({ params }: { params: { slug: string } }) {
  let draft;
  try {
    draft = await loadDraftBySlug(params.slug);
  } catch {
    notFound();
  }
  const content = blocks(draft.content);
  return (
    <main className="min-h-screen bg-ink-base px-4 py-5 text-slate-200">
      <article className="mx-auto max-w-2xl rounded-2xl border border-hairline bg-ink-card px-5 py-6 shadow-xl sm:px-8">
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <p className="text-xs font-semibold text-gain">NOTE下書き・スマホ確認版</p>
            <p className="mt-1 text-[11px] text-sub">外部公開前の内容です</p>
          </div>
          <Link href="/note" className="rounded-lg border border-hairline px-3 py-2 text-xs text-brand">Note事業部へ</Link>
        </div>
        {content.map((block, index) => {
          if (block.type === "heading") {
            const size = block.level === 1 ? "mt-8 text-2xl" : block.level === 2 ? "mt-8 text-xl" : "mt-6 text-lg";
            return <h2 key={index} className={`${size} mb-3 font-bold leading-snug text-white`}><Inline text={block.text} /></h2>;
          }
          if (block.type === "bullet") return <div key={index} className="ml-4 flex gap-2 text-[15px] leading-7"><span className="text-gain">•</span><p><Inline text={block.text} /></p></div>;
          if (block.type === "quote") return <p key={index} className="my-2 border-l-2 border-brand/50 pl-3 text-sm leading-6 text-sub"><Inline text={block.text} /></p>;
          return block.text ? <p key={index} className="my-3 text-[15px] leading-8"><Inline text={block.text} /></p> : <div key={index} className="h-1" />;
        })}
      </article>
    </main>
  );
}
