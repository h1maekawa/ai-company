import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadDecisions, loadHoldings, loadRecommendations } from "@/app/lib/fund/store";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";
import {
  buildInvestmentPerformance,
  effectiveInvestmentTransactions,
  projectInvestmentAccounting,
} from "@/app/lib/fund/transactions/accounting";
import {
  appendInvestmentTransaction,
  loadInvestmentTransactions,
} from "@/app/lib/fund/transactions/store";
import {
  validateInvestmentTransaction,
  hasDuplicateExternalReference,
  type InvestmentTransaction,
  type InvestmentTransactionKind,
} from "@/app/lib/fund/transactions/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [transactions, holdings] = await Promise.all([
      loadInvestmentTransactions(), loadHoldings(),
    ]);
    const effectiveTransactions = effectiveInvestmentTransactions(transactions);
    const accounting = projectInvestmentAccounting(transactions);
    return NextResponse.json({
      success: true,
      transactions,
      effectiveTransactions,
      accounting,
      performance: buildInvestmentPerformance(accounting, holdings),
    });
  } catch (error) {
    console.error("[Fund Transactions API] GET Error:", error);
    return NextResponse.json({ error: "Transaction Ledgerの取得に失敗しました" }, { status: 500 });
  }
}

/** すでに人間が実行・確認した約定Factを記録するだけ。売買操作は行わない。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = await request.json();
    const kind: InvestmentTransactionKind = body.kind ?? "transaction";
    const existing = await loadInvestmentTransactions();
    const target = body.correctsId
      ? existing.find((entry) => entry.id === body.correctsId && entry.kind === "transaction")
      : undefined;
    if ((kind === "correction" || kind === "reversal") && !target) {
      return NextResponse.json({ error: "修正・取消対象のTransactionがありません" }, { status: 400 });
    }

    const now = new Date();
    const base = kind === "reversal" ? target! : body;
    const transaction: InvestmentTransaction = {
      id: `investment-tx-${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind,
      correctsId: kind === "transaction" ? undefined : body.correctsId,
      ticker: String(base.ticker ?? "").trim().toUpperCase(),
      transactionType: base.transactionType,
      quantity: base.quantity,
      price: base.price,
      currency: base.currency,
      executedAt: base.executedAt,
      source: base.source,
      confirmedByHuman: body.confirmedByHuman,
      recommendationId: kind === "reversal" ? target?.recommendationId : optionalString(body.recommendationId),
      decisionId: kind === "reversal" ? target?.decisionId : optionalString(body.decisionId),
      externalReference: kind === "reversal" ? undefined : optionalString(body.externalReference),
      fxRateToJpy: nullableNumber(base.fxRateToJpy),
      settlementAmountJpy: nullableNumber(base.settlementAmountJpy),
      fee: nullableNumber(base.fee),
      feeCurrency: base.feeCurrency ?? null,
      taxJpy: nullableNumber(base.taxJpy),
      note: optionalString(body.note),
      createdAt: now.toISOString(),
    };
    const validation = validateInvestmentTransaction(transaction);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    if (hasDuplicateExternalReference(existing, transaction)) {
      return NextResponse.json({ error: "DUPLICATE_EXTERNAL_REFERENCE" }, { status: 409 });
    }

    const [decisions, recommendations] = await Promise.all([loadDecisions(), loadRecommendations()]);
    const linkedDecision = transaction.decisionId
      ? decisions.find((decision) => decision.id === transaction.decisionId)
      : undefined;
    if (transaction.decisionId && !linkedDecision) {
      return NextResponse.json({ error: "decisionIdが存在しません" }, { status: 400 });
    }
    if (transaction.recommendationId && !recommendations.some((rec) => rec.id === transaction.recommendationId)) {
      return NextResponse.json({ error: "recommendationIdが存在しません" }, { status: 400 });
    }
    if (linkedDecision?.recommendationId && transaction.recommendationId &&
      linkedDecision.recommendationId !== transaction.recommendationId) {
      return NextResponse.json({ error: "DecisionとRecommendation参照が一致しません" }, { status: 400 });
    }

    const prospective = projectInvestmentAccounting([...existing, transaction]);
    const newError = prospective.errors.find((error) => error.transactionId === transaction.id);
    if (newError) return NextResponse.json({ error: newError.code, detail: newError.message }, { status: 422 });

    const idempotencyKey = request.headers.get("idempotency-key") ??
      transaction.externalReference ?? createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const executionStore = getExecutionStore();
    const prior = await executionStore.getIdempotencyResult<Record<string, unknown>>(
      "fund-investment-transaction", idempotencyKey
    );
    if (prior) return NextResponse.json(prior);
    if (!(await executionStore.claimIdempotency("fund-investment-transaction", idempotencyKey))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }

    const transactions = await appendInvestmentTransaction(transaction);
    const accounting = projectInvestmentAccounting(transactions);
    const response = { success: true, transaction, accounting };
    await executionStore.completeIdempotency("fund-investment-transaction", idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "DUPLICATE_EXTERNAL_REFERENCE" ? 409 : 500;
    console.error("[Fund Transactions API] POST Error:", message);
    return NextResponse.json({ error: message }, { status });
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
