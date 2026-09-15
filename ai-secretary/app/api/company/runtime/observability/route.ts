import { NextResponse } from "next/server";
import { getExecutionStore } from "@/app/lib/company/execution/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/company/runtime/observability — 検証時にExecution Storeの論理versionを見るための内部口。
 *
 * Production検証で「Cycleの前後でstoreが進んだか」を確認したいことが繰り返しあるが、
 * これまでどのAPIからも取得できなかった。ここはその観測口だけを持つ。
 *
 * public health (`/api/company/runtime/health`) には足さない。
 * あちらはmiddlewareで認証除外されているため、versionを載せると外に出る。
 * このルートは除外に入れないので、通常のセッション認証がそのまま効く。
 *
 * 読むだけで、storeを進めない。
 */
export async function GET() {
  try {
    const snapshot = await getExecutionStore().load();
    return NextResponse.json({
      store: "connected",
      /** Redis製品のバージョンではなく、Execution Store snapshotの論理revision。
       *  save()が成功するたびに進むので、Mission実行回数とは一致しない。 */
      executionStoreVersion: snapshot.version,
      runtimeSchemaVersion: snapshot.schemaVersion,
      /** snapshot.updatedAt は load() が都度入れる現在時刻で、最終保存時刻ではない。
       *  誤解を招くので返さず、観測時刻だけを返す。 */
      observedAt: new Date().toISOString(),
    });
  } catch {
    /* Redisのエラー全文・URL・namespace・keyは返さない */
    return NextResponse.json(
      { store: "unavailable", error: "EXECUTION_STORE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
