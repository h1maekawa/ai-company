export const WEEK1_CSV_HEADERS = [
  "day", "platform", "title", "body", "caption", "slide_1", "slide_2", "slide_3", "slide_4", "slide_5", "status",
] as const;

export type Week1CsvRow = {
  day: string;
  platform: "x" | "instagram";
  title: string;
  body: string;
  caption: string;
  slides: string[];
  status: "review_required";
};

function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/u, "");
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
      continue;
    }
    if (closedQuote && char !== "," && char !== "\r" && char !== "\n") throw new Error("CSV_INVALID_QUOTE");
    if (char === '"') {
      if (cell.length) throw new Error("CSV_INVALID_QUOTE");
      quoted = true;
    } else if (char === ",") {
      row.push(cell); cell = ""; closedQuote = false;
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = ""; closedQuote = false;
      if (row.some((value) => value.trim() !== "")) records.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) records.push(row);
  }
  return records;
}

export function parseWeek1Csv(input: string): Week1CsvRow[] {
  if (typeof input !== "string" || !input.trim()) throw new Error("CSV_EMPTY");
  const [headers, ...records] = parseCsvRecords(input);
  if (!headers || headers.length !== WEEK1_CSV_HEADERS.length || headers.some((value, i) => value !== WEEK1_CSV_HEADERS[i])) {
    throw new Error("CSV_INVALID_HEADERS");
  }
  if (records.length !== 14 || records.some((record) => record.length !== WEEK1_CSV_HEADERS.length)) throw new Error("CSV_INVALID_ROW_COUNT_OR_WIDTH");

  const rows = records.map((record): Week1CsvRow => {
    const [day, rawPlatform, title, body, caption, ...rest] = record;
    const slides = rest.slice(0, 5);
    const status = rest[5];
    if (!("月火水木金土日".includes(day) && day.length === 1) || !title.trim()) throw new Error("CSV_INVALID_REQUIRED_FIELD");
    if (rawPlatform !== "x" && rawPlatform !== "instagram") throw new Error("CSV_INVALID_PLATFORM");
    if (status !== "review_required") throw new Error("CSV_INVALID_STATUS");
    if (rawPlatform === "x" && (!body.trim() || caption.trim() || slides.some((slide) => slide.trim()))) throw new Error("CSV_INVALID_X_FIELDS");
    if (rawPlatform === "instagram" && (body.trim() || !caption.trim() || slides.some((slide) => !slide.trim()))) throw new Error("CSV_INVALID_INSTAGRAM_FIELDS");
    return { day, platform: rawPlatform, title, body, caption, slides, status };
  });

  const xRows = rows.filter((row) => row.platform === "x");
  const instagramRows = rows.filter((row) => row.platform === "instagram");
  if (xRows.length !== 7 || instagramRows.length !== 7) throw new Error("CSV_INVALID_PLATFORM_COUNTS");
  const days = "月火水木金土日";
  for (const day of days) {
    if (rows.filter((row) => row.day === day).length !== 2 || rows.filter((row) => row.day === day && row.platform === "x").length !== 1 || rows.filter((row) => row.day === day && row.platform === "instagram").length !== 1) {
      throw new Error("CSV_INVALID_DAY_DISTRIBUTION");
    }
  }
  const duplicateKeys = rows.map((row) => `${row.day}\u0000${row.platform}\u0000${row.title}`);
  if (new Set(duplicateKeys).size !== rows.length) throw new Error("CSV_DUPLICATE_POST_ROW");
  return rows;
}
