import type { Holding } from "../rakutenCsv";
import type {
  CurrencyRealizedPnl,
  InvestmentAccountingProjection,
  InvestmentCurrency,
  InvestmentPerformance,
  InvestmentPositionProjection,
  InvestmentTransaction,
  ReconciliationWarning,
} from "./types";

type HoldingsSnapshotLike = { importedAt: string; holdings: Holding[] };

type PositionState = {
  ticker: string;
  currency: InvestmentCurrency;
  quantity: number;
  grossCost: number;
  netCost: number | null;
  grossCostJpy: number | null;
  netCostJpy: number | null;
  realizedGross: number;
  realizedNet: number;
  nativeSales: number;
  nativeNetComplete: boolean;
  realizedGrossJpy: number;
  realizedNetJpy: number;
  jpySales: number;
  jpyGrossComplete: boolean;
  jpyNetComplete: boolean;
};

const round = (value: number): number => Math.round(value * 1e8) / 1e8;
const keyOf = (ticker: string, currency: InvestmentCurrency) => `${ticker}|${currency}`;

/** Correction / Reversalを反映しても元Ledger recordsは残る。 */
export function effectiveInvestmentTransactions(
  entries: InvestmentTransaction[]
): InvestmentTransaction[] {
  const ordered = stableTransactionOrder(entries);
  const reversed = new Set(
    ordered.filter((entry) => entry.kind === "reversal" && entry.correctsId).map((entry) => entry.correctsId!)
  );
  const corrected = new Map<string, InvestmentTransaction>();
  for (const entry of ordered) {
    if (entry.kind === "correction" && entry.correctsId && !reversed.has(entry.id)) {
      corrected.set(entry.correctsId, entry);
    }
  }
  return ordered
    .filter((entry) => entry.kind === "transaction" && !reversed.has(entry.id))
    .map((entry) => corrected.get(entry.id) ?? entry)
    .filter((entry) => !reversed.has(entry.id));
}

export function stableTransactionOrder(entries: InvestmentTransaction[]): InvestmentTransaction[] {
  return [...entries].sort((a, b) =>
    a.executedAt.localeCompare(b.executedAt) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** AVERAGE_COST。税務申告用ではなく内部Performance Tracking用の決定論的Projection。 */
export function projectInvestmentAccounting(
  ledger: InvestmentTransaction[]
): InvestmentAccountingProjection {
  const transactions = stableTransactionOrder(effectiveInvestmentTransactions(ledger));
  const states = new Map<string, PositionState>();
  const errors: InvestmentAccountingProjection["errors"] = [];

  for (const transaction of transactions) {
    const key = keyOf(transaction.ticker, transaction.currency);
    const otherCurrency = [...states.values()].find(
      (state) => state.ticker === transaction.ticker && state.currency !== transaction.currency && state.quantity > 0
    );
    if (otherCurrency) {
      errors.push({
        code: "CURRENCY_MISMATCH", transactionId: transaction.id, ticker: transaction.ticker,
        message: "同一Tickerの保有通貨が一致しません",
      });
      continue;
    }
    const state = states.get(key) ?? emptyState(transaction.ticker, transaction.currency);
    states.set(key, state);
    if (transaction.transactionType === "BUY") applyBuy(state, transaction);
    else if (transaction.quantity > state.quantity + 1e-10) {
      errors.push({
        code: "OVERSELL", transactionId: transaction.id, ticker: transaction.ticker,
        message: `保有${state.quantity}株に対して${transaction.quantity}株のSELLはできません`,
      });
    } else applySell(state, transaction);
  }

  const positions = [...states.values()].map(toPosition);
  const realizedByCurrency = (["JPY", "USD"] as InvestmentCurrency[])
    .map((currency) => aggregateCurrency([...states.values()].filter((state) => state.currency === currency), currency))
    .filter((item) => item.status !== "UNKNOWN" || item.gross !== 0);
  const allStates = [...states.values()];
  const totalJpySales = allStates.reduce((sum, state) => sum + state.jpySales, 0);
  const grossJpyComplete = totalJpySales > 0 && allStates.every((state) => state.jpySales === 0 || state.jpyGrossComplete);
  const netJpyComplete = totalJpySales > 0 && allStates.every((state) => state.jpySales === 0 || state.jpyNetComplete);
  const grossJpy = grossJpyComplete ? round(allStates.reduce((sum, state) => sum + state.realizedGrossJpy, 0)) : null;
  const netJpy = netJpyComplete ? round(allStates.reduce((sum, state) => sum + state.realizedNetJpy, 0)) : null;

  return {
    costBasisMethod: "AVERAGE_COST",
    accountingPurpose: "INTERNAL_PERFORMANCE_TRACKING",
    positions,
    realizedByCurrency,
    realizedPnlJpy: {
      gross: grossJpy,
      net: netJpy,
      status: netJpyComplete ? "CONFIRMED" : grossJpyComplete || totalJpySales > 0 ? "PARTIAL" : "UNKNOWN",
    },
    errors,
    transactionCount: transactions.length,
  };
}

function emptyState(ticker: string, currency: InvestmentCurrency): PositionState {
  return {
    ticker, currency, quantity: 0, grossCost: 0, netCost: 0, grossCostJpy: 0, netCostJpy: 0,
    realizedGross: 0, realizedNet: 0, nativeSales: 0, nativeNetComplete: true,
    realizedGrossJpy: 0, realizedNetJpy: 0, jpySales: 0, jpyGrossComplete: true, jpyNetComplete: true,
  };
}

function applyBuy(state: PositionState, tx: InvestmentTransaction): void {
  const gross = tx.quantity * tx.price;
  state.quantity = round(state.quantity + tx.quantity);
  state.grossCost = round(state.grossCost + gross);
  const feeNative = nativeFee(tx);
  state.netCost = state.netCost !== null && feeNative !== null && taxNative(tx) !== null
    ? round(state.netCost + gross + feeNative + taxNative(tx)!)
    : null;
  const grossJpy = toJpy(gross, tx);
  state.grossCostJpy = state.grossCostJpy !== null && grossJpy !== null
    ? round(state.grossCostJpy + grossJpy) : null;
  const netJpy = tx.settlementAmountJpy ?? acquisitionNetJpy(tx, grossJpy);
  state.netCostJpy = state.netCostJpy !== null && netJpy !== null
    ? round(state.netCostJpy + netJpy) : null;
}

function applySell(state: PositionState, tx: InvestmentTransaction): void {
  const quantityBefore = state.quantity;
  const grossAverage = state.grossCost / quantityBefore;
  const disposedGross = grossAverage * tx.quantity;
  const proceeds = tx.quantity * tx.price;
  state.realizedGross = round(state.realizedGross + proceeds - disposedGross);
  state.nativeSales++;

  const netAverage = state.netCost === null ? null : state.netCost / quantityBefore;
  const feeNative = nativeFee(tx);
  const tax = taxNative(tx);
  if (netAverage === null || feeNative === null || tax === null) state.nativeNetComplete = false;
  else state.realizedNet = round(state.realizedNet + proceeds - feeNative - tax - netAverage * tx.quantity);

  const grossAverageJpy = state.grossCostJpy === null ? null : state.grossCostJpy / quantityBefore;
  const grossProceedsJpy = toJpy(proceeds, tx);
  state.jpySales++;
  if (grossAverageJpy === null || grossProceedsJpy === null) state.jpyGrossComplete = false;
  else state.realizedGrossJpy = round(state.realizedGrossJpy + grossProceedsJpy - grossAverageJpy * tx.quantity);

  const netAverageJpy = state.netCostJpy === null ? null : state.netCostJpy / quantityBefore;
  const netProceedsJpy = tx.settlementAmountJpy ?? disposalNetJpy(tx, grossProceedsJpy);
  if (netAverageJpy === null || netProceedsJpy === null) state.jpyNetComplete = false;
  else state.realizedNetJpy = round(state.realizedNetJpy + netProceedsJpy - netAverageJpy * tx.quantity);

  state.quantity = round(quantityBefore - tx.quantity);
  state.grossCost = round(state.grossCost - disposedGross);
  if (state.netCost !== null && netAverage !== null) state.netCost = round(state.netCost - netAverage * tx.quantity);
  if (state.grossCostJpy !== null && grossAverageJpy !== null) state.grossCostJpy = round(state.grossCostJpy - grossAverageJpy * tx.quantity);
  if (state.netCostJpy !== null && netAverageJpy !== null) state.netCostJpy = round(state.netCostJpy - netAverageJpy * tx.quantity);
  if (Math.abs(state.quantity) < 1e-10) {
    state.quantity = 0;
    state.grossCost = 0;
    state.netCost = state.netCost === null ? null : 0;
    state.grossCostJpy = state.grossCostJpy === null ? null : 0;
    state.netCostJpy = state.netCostJpy === null ? null : 0;
  }
}

function nativeFee(tx: InvestmentTransaction): number | null {
  if (tx.fee === null) return null;
  return tx.feeCurrency === tx.currency ? tx.fee : null;
}

function taxNative(tx: InvestmentTransaction): number | null {
  if (tx.taxJpy === null) return null;
  if (tx.taxJpy === 0) return 0;
  if (tx.currency === "JPY") return tx.taxJpy;
  return tx.fxRateToJpy && tx.fxRateToJpy > 0 ? tx.taxJpy / tx.fxRateToJpy : null;
}

function toJpy(amount: number, tx: InvestmentTransaction): number | null {
  if (tx.currency === "JPY") return amount;
  return tx.fxRateToJpy && tx.fxRateToJpy > 0 ? amount * tx.fxRateToJpy : null;
}

function feeJpy(tx: InvestmentTransaction): number | null {
  if (tx.fee === null) return null;
  if (tx.feeCurrency === "JPY") return tx.fee;
  return tx.fxRateToJpy && tx.fxRateToJpy > 0 ? tx.fee * tx.fxRateToJpy : null;
}

function acquisitionNetJpy(tx: InvestmentTransaction, grossJpy: number | null): number | null {
  const fee = feeJpy(tx);
  return grossJpy !== null && fee !== null && tx.taxJpy !== null ? grossJpy + fee + tx.taxJpy : null;
}

function disposalNetJpy(tx: InvestmentTransaction, grossJpy: number | null): number | null {
  const fee = feeJpy(tx);
  return grossJpy !== null && fee !== null && tx.taxJpy !== null ? grossJpy - fee - tx.taxJpy : null;
}

function toPosition(state: PositionState): InvestmentPositionProjection {
  return {
    ticker: state.ticker,
    currency: state.currency,
    quantity: state.quantity,
    averageCost: state.quantity > 0 ? round(state.grossCost / state.quantity) : 0,
    totalAcquisitionCost: state.grossCost,
    netAverageCost: state.quantity > 0 && state.netCost !== null ? round(state.netCost / state.quantity) : state.netCost,
    netAcquisitionCost: state.netCost,
    realizedPnl: {
      currency: state.currency,
      gross: state.realizedGross,
      net: state.nativeNetComplete && state.nativeSales > 0 ? state.realizedNet : null,
      status: state.nativeSales === 0 ? "UNKNOWN" : state.nativeNetComplete ? "CONFIRMED" : "PARTIAL",
    },
  };
}

function aggregateCurrency(states: PositionState[], currency: InvestmentCurrency): CurrencyRealizedPnl {
  const sales = states.reduce((sum, state) => sum + state.nativeSales, 0);
  const complete = sales > 0 && states.every((state) => state.nativeSales === 0 || state.nativeNetComplete);
  return {
    currency,
    gross: round(states.reduce((sum, state) => sum + state.realizedGross, 0)),
    net: complete ? round(states.reduce((sum, state) => sum + state.realizedNet, 0)) : null,
    status: sales === 0 ? "UNKNOWN" : complete ? "CONFIRMED" : "PARTIAL",
  };
}

export function reconcilePositions(
  positions: InvestmentPositionProjection[],
  holdings: HoldingsSnapshotLike | null
): ReconciliationWarning[] {
  if (!holdings) return positions.map((position) => ({
    ticker: position.ticker, projectedQuantity: position.quantity, holdingsQuantity: null,
    difference: null, status: "UNKNOWN",
  }));
  const holdingByTicker = new Map(holdings.holdings.map((holding) => [holding.code.toUpperCase(), holding]));
  const tickers = new Set([...positions.map((position) => position.ticker), ...holdingByTicker.keys()].filter(Boolean));
  return [...tickers].sort().map((ticker) => {
    const projected = positions.find((position) => position.ticker === ticker)?.quantity ?? 0;
    const current = holdingByTicker.get(ticker)?.quantity ?? null;
    const difference = current === null ? null : round(current - projected);
    return {
      ticker, projectedQuantity: projected, holdingsQuantity: current, difference,
      status: difference === null ? "UNKNOWN" : Math.abs(difference) < 1e-10 ? "MATCH" : "MISMATCH",
    };
  });
}

export function buildInvestmentPerformance(
  accounting: InvestmentAccountingProjection,
  holdings: HoldingsSnapshotLike | null
): InvestmentPerformance {
  const known = holdings?.holdings.filter((holding) => holding.pnlJpy !== null) ?? [];
  const totalHoldings = holdings?.holdings.length ?? 0;
  const unrealizedStatus = totalHoldings === 0 ? "UNKNOWN" : known.length === totalHoldings ? "CONFIRMED" : known.length > 0 ? "PARTIAL" : "UNKNOWN";
  const unrealizedPnlJpy = known.length > 0 ? round(known.reduce((sum, holding) => sum + (holding.pnlJpy ?? 0), 0)) : null;
  const total = accounting.realizedPnlJpy.status === "CONFIRMED" &&
    accounting.realizedPnlJpy.net !== null && unrealizedStatus === "CONFIRMED" && unrealizedPnlJpy !== null
    ? round(accounting.realizedPnlJpy.net + unrealizedPnlJpy) : null;
  return {
    realized: accounting.realizedPnlJpy,
    unrealized: { pnlJpy: unrealizedPnlJpy, status: unrealizedStatus, asOf: holdings?.importedAt ?? null },
    totalInvestmentPnlJpy: total,
    positions: accounting.positions,
    transactionCount: accounting.transactionCount,
    reconciliation: reconcilePositions(accounting.positions, holdings),
  };
}
