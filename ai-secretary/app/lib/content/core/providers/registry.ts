import { ManualContentProvider } from "./manual";
import { ObsidianContentProvider } from "./obsidian";
import { PreviousContentProvider } from "./previousContent";
import { ResearchContentProvider } from "./research";
import { TimeboxContentProvider } from "./timebox";
import { ContentSourceProvider } from "./types";
import { UploadContentProvider } from "./upload";
import { UrlContentProvider } from "./url";

export const ALL_CONTENT_SOURCE_PROVIDERS: ContentSourceProvider[] = [
  ManualContentProvider,
  ObsidianContentProvider,
  ResearchContentProvider,
  TimeboxContentProvider,
  UploadContentProvider,
  UrlContentProvider,
  PreviousContentProvider,
];

export function getProvider(id: string): ContentSourceProvider | undefined {
  return ALL_CONTENT_SOURCE_PROVIDERS.find((p) => p.id === id);
}

export type ProviderStatus = { id: string; label: string; available: boolean };

/**
 * 各Providerの可用性を返す。1つが例外を投げても他のProviderの判定を止めない
 * （Missing Provider fallback）。
 */
export async function listProviderStatuses(): Promise<ProviderStatus[]> {
  return Promise.all(
    ALL_CONTENT_SOURCE_PROVIDERS.map(async (p) => {
      try {
        const available = await p.isAvailable();
        return { id: p.id, label: p.label, available };
      } catch {
        return { id: p.id, label: p.label, available: false };
      }
    })
  );
}

/** 利用可能なProviderからのみMaterialを集める。1つの失敗が全体を止めない */
export async function listAllMaterials() {
  const results = await Promise.all(
    ALL_CONTENT_SOURCE_PROVIDERS.map(async (p) => {
      try {
        if (!(await p.isAvailable())) return [];
        return await p.listMaterials();
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}
