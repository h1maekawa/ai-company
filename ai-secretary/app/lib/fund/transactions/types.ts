export type InvestmentCurrency = "JPY" | "USD";
export type InvestmentTransactionType = "BUY" | "SELL";
export type InvestmentTransactionKind = "transaction" | "correction" | "reversal";
export type InvestmentPnlStatus = "CONFIRMED" | "PARTIAL" | "UNKNOWN";
export type CostBasisMethod = "AVERAGE_COST";

/** 実際に約定した取引Factだけを保存するAppend-only Ledger entry。 */
export type InvestmentTransaction = {
  id: string;
  kind: InvestmentTransactionKind;
  correctsId?: string;
  ticker: string;
  transactionType: InvestmentTransactionType;
  quantity: number;
  price: number;
  currency: InvestmentCurrency;
  executedAt: string;
  source: "manual" | "broker_import";
  confirmedByHuman: true;
  recommendationId?: string;
  decisionId?: string;
  externalReference?: string;
  fxRateToJpy: number | null;
  /** Brokerが提示した正式な円受渡金額。推計値より優先する。 */
  settlementAmountJpy: number | null;
  /** nullはunknown、0は手数料なしという確認済みFact。 */
  fee: number | null;
  feeCurrency: InvestmentCurrency | null;
  /** nullはunknown、0は税額0という確認済みFact。 */
  taxJpy: number | null;
  note?: string;
  createdAt: string;
};

export type CurrencyRealizedPnl = {
  currency: InvestmentCurrency;
  gross: number;
  net: number | null;
  status: InvestmentPnlStatus;
};

export type InvestmentPositionProjection = {
  ticker: string;
  currency: InvestmentCurrency;
  quantity: number;
  averageCost: number;
  totalAcquisitionCost: number;
  netAverageCost: number | null;
  netAcquisitionCost: number | null;
  realizedPnl: CurrencyRealizedPnl;
};

export type InvestmentAccountingError = {
  code: "OVERSELL" | "CURRENCY_MISMATCH";
  transactionId: string;
  ticker: string;
  message: string;
};

export type InvestmentAccountingProjection = {
  costBasisMethod: CostBasisMethod;
  /** 税務申告用ではなく、AI Company内部Performance Tracking用。 */
  accountingPurpose: "INTERNAL_PERFORMANCE_TRACKING";
  positions: InvestmentPositionProjection[];
  realizedByCurrency: CurrencyRealizedPnl[];
  realizedPnlJpy: {
    gross: number | null;
    net: number | null;
    status: InvestmentPnlStatus;
  };
  errors: InvestmentAccountingError[];
  transactionCount: number;
};

export type ReconciliationWarning = {
  ticker: string;
  projectedQuantity: number;
  holdingsQuantity: number | null;
  difference: number | null;
  status: "MATCH" | "MISMATCH" | "UNKNOWN";
};

export type InvestmentPerformance = {
  realized: InvestmentAccountingProjection["realizedPnlJpy"];
  unrealized: {
    pnlJpy: number | null;
    status: InvestmentPnlStatus;
    asOf: string | null;
  };
  totalInvestmentPnlJpy: number | null;
  positions: InvestmentPositionProjection[];
  transactionCount: number;
  reconciliation: ReconciliationWarning[];
};

export type TransactionValidation = { ok: true } | { ok: false; error: string };

export function validateInvestmentTransaction(
  input: Partial<InvestmentTransaction>
): TransactionValidation {
  if (!input.kind || !["transaction", "correction", "reversal"].includes(input.kind)) {
    return { ok: false, error: "Transaction kindが不正です" };
  }
  if ((input.kind === "correction" || input.kind === "reversal") && !input.correctsId) {
    return { ok: false, error: "Correction / ReversalにはcorrectsIdが必要です" };
  }
  if (!input.ticker || typeof input.ticker !== "string") return { ok: false, error: "tickerは必須です" };
  if (input.transactionType !== "BUY" && input.transactionType !== "SELL") {
    return { ok: false, error: "transactionTypeが不正です" };
  }
  if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { ok: false, error: "quantityは0より大きい数値にしてください" };
  }
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    return { ok: false, error: "priceは0より大きい数値にしてください" };
  }
  if (input.currency !== "JPY" && input.currency !== "USD") return { ok: false, error: "currencyが不正です" };
  if (!input.executedAt || Number.isNaN(Date.parse(input.executedAt))) return { ok: false, error: "executedAtが不正です" };
  if (input.source !== "manual" && input.source !== "broker_import") return { ok: false, error: "sourceが不正です" };
  if (input.confirmedByHuman !== true) return { ok: false, error: "実取引Factは本人確認済みである必要があります" };
  for (const [name, value] of [["fxRateToJpy", input.fxRateToJpy], ["settlementAmountJpy", input.settlementAmountJpy], ["fee", input.fee], ["taxJpy", input.taxJpy]] as const) {
    if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return { ok: false, error: `${name}は0以上の数値またはnullにしてください` };
    }
  }
  if (input.fee != null && input.feeCurrency !== "JPY" && input.feeCurrency !== "USD") {
    return { ok: false, error: "feeCurrencyが必要です" };
  }
  return { ok: true };
}

export function hasDuplicateExternalReference(
  entries: InvestmentTransaction[],
  candidate: InvestmentTransaction
): boolean {
  if (!candidate.externalReference) return false;
  return entries.some((entry) =>
    entry.externalReference === candidate.externalReference && entry.id !== candidate.correctsId
  );
}
