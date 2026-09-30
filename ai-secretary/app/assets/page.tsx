import { AssetsDashboard } from "./AssetsDashboard";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  return <AssetsDashboard initialTab={params.tab === "cards" ? "cards" : "summary"} />;
}
