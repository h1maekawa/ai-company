/**
 * Vercelのレスポンス返却後もPromiseが完了するまでFunctionを維持する。
 *
 * Next.js 14では next/server の after() が利用できないため、Vercelが
 * Route Handlerへ提供するrequest contextの waitUntilを使用する。
 * ローカル開発などcontextがない環境ではPromiseをそのまま開始する。
 */
type VercelRequestContext = {
  get?: () => { waitUntil?: (task: Promise<unknown>) => void } | undefined;
};

export function runInBackground(task: Promise<unknown>): void {
  const globalWithContext = globalThis as typeof globalThis & {
    [key: symbol]: VercelRequestContext | undefined;
  };
  const context = globalWithContext[Symbol.for("@vercel/request-context")]?.get?.();
  if (context?.waitUntil) {
    context.waitUntil(task);
    return;
  }

  // Next devや通常のNode実行用。呼び出し側で必ずcatch済みのPromiseを渡す。
  void task;
}
