import { permanentRedirect } from "next/navigation";

/**
 * /fund は /investing に統合済み（Phase 3, docs/14）。
 * Canonical Route = /investing。既存リンク・ブックマーク互換のため 308 permanent redirect を返す。
 * （next.config.mjs 側でも /fund → /investing の 308 redirect を定義している。二重の安全策）
 */
export default function FundRedirect(): never {
  permanentRedirect("/investing");
}
