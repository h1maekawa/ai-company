import { AssetsDashboard } from "./AssetsDashboard";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const initialTab = ["summary", "household", "cards", "debt"].includes(params.tab ?? "")
    ? params.tab as "summary" | "household" | "cards" | "debt"
    : "summary";
  return <AssetsDashboard initialTab={initialTab} />;
}
