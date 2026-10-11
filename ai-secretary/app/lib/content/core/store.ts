/**
 * Content Core の Vault ストア。Material / ContentCandidate を保持する。
 * 既存Note事業部と同じ「人間可読Markdown＋末尾jsonブロック」形式。
 */

import { getVaultFile, saveVaultFile } from "../../vault";
import { ContentCandidate, Material, MediaAsset, PersonalProduct, validateMediaAsset, validatePersonalProduct } from "./types";

const ROOT = "memory/personal/note";

export const CONTENT_CORE_PATHS = {
  core: `${ROOT}/content-core.md`,
} as const;

function extractJson<T>(markdown: string): T | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const file = await getVaultFile(path);
    return extractJson<T>(file.content || "");
  } catch {
    return null;
  }
}

async function write(path: string, markdown: string): Promise<void> {
  let sha: string | undefined;
  try {
    sha = (await getVaultFile(path)).sha;
  } catch {
    // 初回作成
  }
  await saveVaultFile(path, markdown, sha);
}

function buildDoc(title: string, note: string, humanBody: string, data: unknown): string {
  return `---
type: ${title}
updated: ${new Date().toISOString()}
---

# ${title}

${note}

${humanBody}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`
`;
}

export type ContentCoreFile = {
  materials: Material[];
  candidates: ContentCandidate[];
  /** Additive IG-0 dimensions in the existing Content Core SSOT. */
  products: PersonalProduct[];
  mediaAssets: MediaAsset[];
};

const MAX_MATERIALS = 500;

export async function loadContentCore(): Promise<ContentCoreFile> {
  const data = await readJson<ContentCoreFile>(CONTENT_CORE_PATHS.core);
  return {
    materials: Array.isArray(data?.materials) ? data.materials : [],
    candidates: Array.isArray(data?.candidates) ? data.candidates : [],
    products: Array.isArray(data?.products) ? data.products : [],
    mediaAssets: Array.isArray(data?.mediaAssets) ? data.mediaAssets : [],
  };
}

export async function saveContentCore(file: ContentCoreFile): Promise<ContentCoreFile> {
  const materials = [...file.materials]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_MATERIALS);
  const safeFile = { materials, candidates: file.candidates, products: file.products, mediaAssets: file.mediaAssets };

  const human = [
    `Material: ${materials.length}件 / ContentCandidate: ${safeFile.candidates.length}件 / Product: ${safeFile.products.length}件 / MediaAsset: ${safeFile.mediaAssets.length}件`,
    "",
    "## 発信材料（Material）",
    materials
      .slice(0, 30)
      .map((m) => `- [${m.status}][${m.sourceType}] ${m.title}`)
      .join("\n") || "（まだありません）",
    "",
    "## 候補（ContentCandidate）",
    safeFile.candidates
      .slice(0, 30)
      .map((c) => `- [${c.status}] ${c.title} — ${c.whyInteresting}`)
      .join("\n") || "（まだありません）",
    "",
    "## Product Vault",
    safeFile.products.slice(0, 30).map((p) => `- [${p.ownership}] ${p.brand} ${p.name}${p.personalExperience?.confirmedByUser ? "（本人確認済み）" : ""}`).join("\n") || "（まだありません）",
    "",
    "## Media Assets",
    safeFile.mediaAssets.slice(0, 30).map((a) => `- [${a.usageRights}][${a.type}] ${a.id}`).join("\n") || "（まだありません）",
  ].join("\n");

  await write(
    CONTENT_CORE_PATHS.core,
    buildDoc(
      "note_content_core",
      "Content事業部共通のMaterial・Candidate・Product・Media Assetです。Instagram専用の第二Storeではありません。",
      human,
      safeFile
    )
  );
  return safeFile;
}

export async function upsertMaterial(material: Material): Promise<Material> {
  const file = await loadContentCore();
  const index = file.materials.findIndex((m) => m.id === material.id);
  const next = { ...material, updatedAt: new Date().toISOString() };
  if (index >= 0) file.materials[index] = next;
  else file.materials.unshift(next);
  await saveContentCore(file);
  return next;
}

export async function upsertCandidate(candidate: ContentCandidate): Promise<ContentCandidate> {
  const file = await loadContentCore();
  const index = file.candidates.findIndex((c) => c.id === candidate.id);
  if (index >= 0) file.candidates[index] = candidate;
  else file.candidates.unshift(candidate);
  await saveContentCore(file);
  return candidate;
}

export async function upsertProduct(product: PersonalProduct): Promise<PersonalProduct> {
  const validation = validatePersonalProduct(product);
  if (!validation.valid) throw new Error(validation.errors.join(","));
  const file = await loadContentCore();
  const missingAsset = product.assetIds.find((id) => !file.mediaAssets.some((asset) => asset.id === id));
  if (missingAsset) throw new Error(`PRODUCT_ASSET_NOT_FOUND:${missingAsset}`);
  const index = file.products.findIndex((item) => item.id === product.id);
  const createdAt = index >= 0 ? file.products[index].createdAt : product.createdAt;
  const next = { ...product, createdAt, updatedAt: new Date().toISOString() };
  if (index >= 0) file.products[index] = next;
  else file.products.unshift(next);
  await saveContentCore(file);
  return next;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const file = await loadContentCore();
  if (file.mediaAssets.some((asset) => asset.productIds.includes(id))) throw new Error("PRODUCT_HAS_LINKED_ASSETS");
  const next = file.products.filter((item) => item.id !== id);
  if (next.length === file.products.length) return false;
  await saveContentCore({ ...file, products: next });
  return true;
}

export async function upsertMediaAsset(asset: MediaAsset): Promise<MediaAsset> {
  const validation = validateMediaAsset(asset);
  if (!validation.valid) throw new Error(validation.errors.join(","));
  const file = await loadContentCore();
  const missingProduct = asset.productIds.find((id) => !file.products.some((product) => product.id === id));
  if (missingProduct) throw new Error(`ASSET_PRODUCT_NOT_FOUND:${missingProduct}`);
  const index = file.mediaAssets.findIndex((item) => item.id === asset.id);
  const previousProductIds = index >= 0 ? file.mediaAssets[index].productIds : [];
  const createdAt = index >= 0 ? file.mediaAssets[index].createdAt : asset.createdAt;
  const next = { ...asset, createdAt, updatedAt: new Date().toISOString() };
  if (index >= 0) file.mediaAssets[index] = next;
  else file.mediaAssets.unshift(next);
  const linkedProductIds = new Set(next.productIds);
  for (const [productIndex, product] of file.products.entries()) {
    const wasLinked = previousProductIds.includes(product.id) || product.assetIds.includes(next.id);
    const shouldLink = linkedProductIds.has(product.id);
    if (wasLinked || shouldLink) {
      const assetIds = shouldLink
        ? [...new Set([...product.assetIds, next.id])]
        : product.assetIds.filter((id) => id !== next.id);
      file.products[productIndex] = { ...product, assetIds, updatedAt: next.updatedAt };
    }
  }
  await saveContentCore(file);
  return next;
}

export async function deleteMediaAsset(id: string): Promise<boolean> {
  const file = await loadContentCore();
  const next = file.mediaAssets.filter((item) => item.id !== id);
  if (next.length === file.mediaAssets.length) return false;
  const products = file.products.map((product) => ({ ...product, assetIds: product.assetIds.filter((assetId) => assetId !== id) }));
  await saveContentCore({ ...file, mediaAssets: next, products });
  return true;
}
