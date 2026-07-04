import { NextRequest, NextResponse } from "next/server";
import { getVaultFile, listVaultDirectory } from "@/app/lib/vault";
import { verifyApiSecret } from "@/app/lib/auth/verifyApiSecret";

type TableRow = Record<string, string>;
type ParsedTable = { heading: string; rows: TableRow[] };

/**
 * Generic markdown table parser. Finds every "| a | b |" table in the document
 * and groups its rows under the nearest preceding heading.
 */
function parseMarkdownTables(md: string): ParsedTable[] {
  const lines = md.split("\n");
  const tables: ParsedTable[] = [];
  let currentHeading = "";
  let i = 0;

  const splitRow = (line: string): string[] => {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|").map((c) => c.trim());
  };

  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      currentHeading = headingMatch[1].trim();
    }

    const isTableHeader = line.trim().startsWith("|");
    const nextLine = lines[i + 1] ?? "";
    const isSeparator = /^\s*\|?[\s:-]+\|/.test(nextLine) && nextLine.includes("-");

    if (isTableHeader && isSeparator) {
      const headerCells = splitRow(line);
      let j = i + 2;
      const rows: TableRow[] = [];
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        const cells = splitRow(lines[j]);
        const row: TableRow = {};
        headerCells.forEach((h, idx) => {
          row[h] = cells[idx] ?? "";
        });
        rows.push(row);
        j++;
      }
      tables.push({ heading: currentHeading, rows });
      i = j;
      continue;
    }
    i++;
  }

  return tables;
}

function extractBullets(md: string, sectionHeadingContains: string): string[] {
  const lines = md.split("\n");
  const startIdx = lines.findIndex(
    (l) => /^#{1,6}\s+/.test(l) && l.includes(sectionHeadingContains)
  );
  if (startIdx === -1) return [];
  const bullets: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s+/.test(line)) break;
    const bulletMatch = line.match(/^\s*-\s+(.*)$/);
    if (bulletMatch) bullets.push(bulletMatch[1].trim());
  }
  return bullets;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authError = verifyApiSecret(req);
  if (authError) return authError;

  try {
    const [positionsFile, portfolioFile] = await Promise.all([
      getVaultFile("memory/personal/fund/positions.md"),
      getVaultFile("memory/personal/fund/portfolio.md"),
    ]);

    const positionsTables = parseMarkdownTables(positionsFile.content || "");
    const portfolioTables = parseMarkdownTables(portfolioFile.content || "");

    const satellitePositions =
      positionsTables.find((t) => t.heading.includes("保有株ポジション"))?.rows ?? [];
    const corePositions =
      positionsTables.find((t) => t.heading.includes("コア資産"))?.rows ?? [];
    const summaryBullets = extractBullets(positionsFile.content || "", "ポートフォリオ合計");

    const targetAllocationMatch = (portfolioFile.content || "").match(
      /コア資産[^\n]*(\d+)%[\s\S]*?サテライト[^\n]*(\d+)%[\s\S]*?キャッシュ[^\n]*(\d+)%/
    );
    const targetAllocation = targetAllocationMatch
      ? { core: targetAllocationMatch[1], satellite: targetAllocationMatch[2], cash: targetAllocationMatch[3] }
      : null;

    const currentAllocationMatch = (portfolioFile.content || "").match(
      /現在の実際の配分[^：:]*[：:]\s*コア約([\d.]+)%\s*\/\s*サテライト約([\d.]+)%\s*\/\s*キャッシュ約([\d.]+)%/
    );
    const currentAllocation = currentAllocationMatch
      ? { core: currentAllocationMatch[1], satellite: currentAllocationMatch[2], cash: currentAllocationMatch[3] }
      : null;

    const reviewChecklist = extractBullets(portfolioFile.content || "", "次回レビューチェックリスト").map(
      (b) => b.replace(/^\[[ x]\]\s*/i, "")
    );

    // Recent investment log entries
    let logEntries: { fileName: string; title: string; date: string; ticker: string }[] = [];
    try {
      const fileNames = await listVaultDirectory("memory/personal/fund/investment-log");
      const realFiles = fileNames.filter((f) => f.endsWith(".md") && !f.startsWith("_"));
      const sorted = realFiles.sort().reverse().slice(0, 10);
      const entries = await Promise.all(
        sorted.map(async (fileName) => {
          const { content } = await getVaultFile(`memory/personal/fund/investment-log/${fileName}`);
          const titleMatch = content.match(/^#\s+(.*)$/m);
          const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
          return {
            fileName,
            title: titleMatch ? titleMatch[1].trim() : fileName,
            date: dateMatch ? dateMatch[1] : "",
            ticker: dateMatch ? dateMatch[2] : "",
          };
        })
      );
      logEntries = entries;
    } catch (e) {
      console.error("[Fund Report] Failed to list investment log:", e);
    }

    return NextResponse.json({
      success: true,
      updatedAt: (positionsFile.content || "").match(/最終更新：([^\n（(]*)/)?.[1]?.trim() ?? null,
      satellitePositions,
      corePositions,
      summaryBullets,
      targetAllocation,
      currentAllocation,
      reviewChecklist,
      logEntries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Report API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
