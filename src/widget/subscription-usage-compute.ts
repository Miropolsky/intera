import type { ISubscriptionRow } from '../types/subscription-list';
import type {
  ISubscriptionUsageConfig,
  TLimitType,
  TSubscriptionStatus,
} from './subscription-usage-params';

/** Evaluated metric for one limit dimension (`data`, `voice`, or `money`). */
export interface ILimitEvaluation {
  type: TLimitType;
  /** Display unit (`'GB' | 'MB'` for data, `'min'` for voice, `currency_name` for money). */
  unit: string;
  /** Positive tariff allowance, or `null` when no limit is set (`<= 0` or `null`). */
  allowance: number | null;
  /** Consumed amount, or `null` when missing/invalid (`null` or `< 0`). */
  used: number | null;
  /** `(used / allowance) * 100`, or `null` when `status` is `'no_limit'` or `'no_data'`. */
  usagePercent: number | null;
  status: TSubscriptionStatus;
}

/** Processed subscription row with per-dimension evaluations and overall status. */
export interface ISubscriptionUsageItem {
  row: ISubscriptionRow;
  /** Evaluations keyed by limit dimension (`data`, `voice`, `money`). */
  limits: Record<TLimitType, ILimitEvaluation>;
  /** Worst status across the dimensions enabled in `config.limitTypes`. */
  overallStatus: TSubscriptionStatus;
  /** Highest numeric `usagePercent` across enabled dimensions (`null` if none have numeric usage). */
  maxUsagePercent: number | null;
  /** The enabled limit evaluation that produced `overallStatus` / `maxUsagePercent`. */
  primaryLimit: ILimitEvaluation;
}

/** Summary counts across all subscriptions matching the scope filters (before `statusFilter` and `rowLimit` cut). */
export interface ISubscriptionUsageSummary {
  total: number;
  normal: number;
  warning: number;
  critical: number;
  noData: number;
  noLimit: number;
  /** Warning and critical counts broken down by limit dimension (never summing different units/currencies). */
  byLimitType: Record<
    TLimitType,
    { withLimit: number; warning: number; critical: number; noData: number }
  >;
}

/** Interactive UI filter overrides (search query, quick filters inside the widget). */
export interface ISubscriptionRuntimeFilter {
  searchQuery?: string;
}

export interface ISubscriptionUsageResult {
  /** Summary statistics for the scoped dataset. */
  summary: ISubscriptionUsageSummary;
  /** Filtered and sorted items (before `rowLimit` slicing). */
  filteredItems: ISubscriptionUsageItem[];
  /** Items sliced to `config.rowLimit` for table display. */
  visibleItems: ISubscriptionUsageItem[];
  /** Distinct available `YYYY-MM` periods in the raw dataset (sorted descending). */
  availablePeriods: string[];
}

/**
 * Pure computation of subscription usage metrics, statuses, summary counters, filtering and sorting.
 *
 * Must NOT depend on React or DOM APIs.
 *
 * Key domain rules:
 * 1. Traffic unit (`data` limit): if `allowance_gb > 0` (or both allowances `<= 0` and `used_gb > 0`),
 *    use GB (`allowance_gb` / `used_gb`); otherwise use MB (`allowance_mb` / `used_mb`). Never sum MB and GB.
 * 2. Missing usage: if `allowance > 0` and `used` is `null` (or `< 0` / non-numeric), status is `'no_data'`
 *    and `usagePercent` is `null` — never treat missing usage as `0%`.
 * 3. No limit: if `allowance === null || allowance <= 0` (including Enigma's `-1` sentinel),
 *    status is `'no_limit'` and `usagePercent` is `null`.
 * 4. Overall status of a subscription is the worst status among `config.limitTypes` using the severity order:
 *    `'critical'` > `'warning'` > `'normal'` > `'no_data'` > `'no_limit'`.
 */
export function computeSubscriptionUsage(
  rows: readonly ISubscriptionRow[],
  config: ISubscriptionUsageConfig,
  runtimeFilter?: ISubscriptionRuntimeFilter,
): ISubscriptionUsageResult {
  void rows;
  void config;
  void runtimeFilter;

  // TODO: Implement pure calculation, filtering, sorting, and aggregation.
  return {
    summary: {
      total: 0,
      normal: 0,
      warning: 0,
      critical: 0,
      noData: 0,
      noLimit: 0,
      byLimitType: {
        data: { withLimit: 0, warning: 0, critical: 0, noData: 0 },
        voice: { withLimit: 0, warning: 0, critical: 0, noData: 0 },
        money: { withLimit: 0, warning: 0, critical: 0, noData: 0 },
      },
    },
    filteredItems: [],
    visibleItems: [],
    availablePeriods: [],
  };
}
