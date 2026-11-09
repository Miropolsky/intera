import { toFiniteNumber } from '../platform/to-finite-number';
import type { ISubscriptionRow } from '../types/subscription-list';
import {
  LIMIT_TYPES,
  type ISubscriptionUsageConfig,
  type TLimitType,
  type TSortMode,
  type TSubscriptionStatus,
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

/** Interactive UI filter overrides (search query inside the widget). */
export interface ISubscriptionRuntimeFilter {
  searchQuery?: string;
}

export interface ISubscriptionUsageResult {
  /** Summary statistics for the scoped dataset (ignores status, search and row limit). */
  summary: ISubscriptionUsageSummary;
  /**
   * Scoped items sorted by usage descending, before `statusFilter`, search and `rowLimit`.
   * Used for "most critical" lists that must stay stable while the table is filtered.
   */
  scopedItems: ISubscriptionUsageItem[];
  /** Items after `statusFilter` and the runtime search, sorted by `config.sortBy`. */
  filteredItems: ISubscriptionUsageItem[];
  /** `filteredItems` sliced to `config.rowLimit` for the compact table. */
  visibleItems: ISubscriptionUsageItem[];
  /** Distinct available `YYYY-MM` periods in the raw dataset (sorted descending). */
  availablePeriods: string[];
}

const STATUS_RANK: Record<TSubscriptionStatus, number> = {
  critical: 4,
  warning: 3,
  normal: 2,
  no_data: 1,
  no_limit: 0,
};

const PERIOD_PREFIX = /^(\d{4})-(0[1-9]|1[0-2])/;

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
 * 5. `summary` and `scopedItems` are computed before `statusFilter`, search and `rowLimit`.
 */
export function computeSubscriptionUsage(
  rows: readonly ISubscriptionRow[],
  config: ISubscriptionUsageConfig,
  runtimeFilter?: ISubscriptionRuntimeFilter,
): ISubscriptionUsageResult {
  const enabled = config.limitTypes.length > 0 ? config.limitTypes : [...LIMIT_TYPES];
  const technologyIds = new Set(config.technologyIds);
  const searchQuery = normalizeSearch(runtimeFilter?.searchQuery);

  const availablePeriods = collectPeriods(rows);
  const summary = createEmptySummary();
  const scoped: ISubscriptionUsageItem[] = [];

  for (const row of rows) {
    if (!matchesScope(row, config, technologyIds)) {
      continue;
    }
    const item = evaluateSubscription(row, config, enabled);
    scoped.push(item);
    accumulateSummary(summary, item, enabled);
  }

  const scopedItems = scoped.slice().sort(compareItems('usage_desc'));
  const filteredItems = scoped
    .filter(
      (item) =>
        config.statusFilter === 'all' ||
        item.overallStatus === config.statusFilter,
    )
    .filter((item) => matchesSearch(item.row, searchQuery))
    .sort(compareItems(config.sortBy));

  return {
    summary,
    scopedItems,
    filteredItems,
    visibleItems: filteredItems.slice(0, config.rowLimit),
    availablePeriods,
  };
}

function matchesScope(
  row: ISubscriptionRow,
  config: ISubscriptionUsageConfig,
  technologyIds: ReadonlySet<number>,
): boolean {
  if (config.onlyActive && toFiniteNumber(row.subscription_active) !== 1) {
    return false;
  }
  if (
    config.period !== 'all' &&
    readPeriodPrefix(row.allowance_period) !== config.period
  ) {
    return false;
  }
  if (config.customerId !== 'all' && row.customer_id !== config.customerId) {
    return false;
  }
  if (technologyIds.size > 0 && !technologyIds.has(row.technology_id)) {
    return false;
  }
  return true;
}

function evaluateSubscription(
  row: ISubscriptionRow,
  config: ISubscriptionUsageConfig,
  enabled: readonly TLimitType[],
): ISubscriptionUsageItem {
  const dataPair = resolveDataPair(row);
  const limits: Record<TLimitType, ILimitEvaluation> = {
    data: evaluateLimit(
      'data',
      dataPair.unit,
      dataPair.allowance,
      dataPair.used,
      config,
    ),
    voice: evaluateLimit(
      'voice',
      'min',
      toFiniteNumber(row.allowance_minutes),
      toFiniteNumber(row.used_minutes),
      config,
    ),
    money: evaluateLimit(
      'money',
      currencyUnit(row.currency_name),
      toFiniteNumber(row.allowance_money),
      toFiniteNumber(row.used_money),
      config,
    ),
  };

  const primaryLimit = pickPrimaryLimit(limits, enabled);
  return {
    row,
    limits,
    overallStatus: primaryLimit.status,
    maxUsagePercent: maxUsage(limits, enabled),
    primaryLimit,
  };
}

/**
 * GB and MB are the same Enigma allowance expressed in the tariff unit.
 * A positive GB allowance wins. When neither allowance is positive, a positive
 * `used_gb` still selects the GB pair so Starlink telemetry is not read as MB.
 */
function resolveDataPair(row: ISubscriptionRow): {
  unit: 'GB' | 'MB';
  allowance: number | null;
  used: number | null;
} {
  const allowanceGb = toFiniteNumber(row.allowance_gb);
  const usedGb = toFiniteNumber(row.used_gb);
  const allowanceMb = toFiniteNumber(row.allowance_mb);
  const usedMb = toFiniteNumber(row.used_mb);

  const gbAllowance = allowanceGb !== null && allowanceGb > 0;
  const bothAllowancesEmpty =
    (allowanceGb === null || allowanceGb <= 0) &&
    (allowanceMb === null || allowanceMb <= 0);
  const gbUsage = usedGb !== null && usedGb > 0;

  if (gbAllowance || (bothAllowancesEmpty && gbUsage)) {
    return { unit: 'GB', allowance: allowanceGb, used: usedGb };
  }
  return { unit: 'MB', allowance: allowanceMb, used: usedMb };
}

function evaluateLimit(
  type: TLimitType,
  unit: string,
  allowanceRaw: number | null,
  usedRaw: number | null,
  config: ISubscriptionUsageConfig,
): ILimitEvaluation {
  const used = usedRaw !== null && usedRaw >= 0 ? usedRaw : null;

  if (allowanceRaw === null || allowanceRaw <= 0) {
    return {
      type,
      unit,
      allowance: null,
      used,
      usagePercent: null,
      status: 'no_limit',
    };
  }

  if (usedRaw === null || usedRaw < 0) {
    return {
      type,
      unit,
      allowance: allowanceRaw,
      used: null,
      usagePercent: null,
      status: 'no_data',
    };
  }

  const usagePercent = (usedRaw / allowanceRaw) * 100;
  const status: TSubscriptionStatus =
    usagePercent >= config.criticalThreshold
      ? 'critical'
      : usagePercent >= config.warningThreshold
        ? 'warning'
        : 'normal';

  return {
    type,
    unit,
    allowance: allowanceRaw,
    used: usedRaw,
    usagePercent,
    status,
  };
}

/**
 * Worst enabled status wins. Ties break toward the higher percent, which is
 * also `maxUsagePercent` whenever any enabled dimension has a numeric percent:
 * a critical percent is always above a warning percent, and so on down the scale.
 */
function pickPrimaryLimit(
  limits: Record<TLimitType, ILimitEvaluation>,
  enabled: readonly TLimitType[],
): ILimitEvaluation {
  const first = enabled[0] ?? 'data';
  let best = limits[first];
  for (const type of enabled) {
    const candidate = limits[type];
    const rankDelta = STATUS_RANK[candidate.status] - STATUS_RANK[best.status];
    if (rankDelta > 0) {
      best = candidate;
      continue;
    }
    if (rankDelta < 0) {
      continue;
    }
    const candidatePercent = candidate.usagePercent;
    const bestPercent = best.usagePercent;
    if (
      candidatePercent !== null &&
      (bestPercent === null || candidatePercent > bestPercent)
    ) {
      best = candidate;
    }
  }
  return best;
}

function maxUsage(
  limits: Record<TLimitType, ILimitEvaluation>,
  enabled: readonly TLimitType[],
): number | null {
  let max: number | null = null;
  for (const type of enabled) {
    const percent = limits[type].usagePercent;
    if (percent !== null && (max === null || percent > max)) {
      max = percent;
    }
  }
  return max;
}

function accumulateSummary(
  summary: ISubscriptionUsageSummary,
  item: ISubscriptionUsageItem,
  enabled: readonly TLimitType[],
): void {
  summary.total += 1;
  switch (item.overallStatus) {
    case 'normal':
      summary.normal += 1;
      break;
    case 'warning':
      summary.warning += 1;
      break;
    case 'critical':
      summary.critical += 1;
      break;
    case 'no_data':
      summary.noData += 1;
      break;
    case 'no_limit':
      summary.noLimit += 1;
      break;
    default: {
      const unexpected: never = item.overallStatus;
      throw new Error(`Unexpected subscription status: ${String(unexpected)}`);
    }
  }

  for (const type of enabled) {
    const status = item.limits[type].status;
    const bucket = summary.byLimitType[type];
    if (status !== 'no_limit') {
      bucket.withLimit += 1;
    }
    if (status === 'warning') {
      bucket.warning += 1;
    } else if (status === 'critical') {
      bucket.critical += 1;
    } else if (status === 'no_data') {
      bucket.noData += 1;
    }
  }
}

function createEmptySummary(): ISubscriptionUsageSummary {
  return {
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
  };
}

function collectPeriods(rows: readonly ISubscriptionRow[]): string[] {
  const periods = new Set<string>();
  for (const row of rows) {
    const period = readPeriodPrefix(row.allowance_period);
    if (period) {
      periods.add(period);
    }
  }
  return Array.from(periods).sort((left, right) => right.localeCompare(left));
}

function currencyUnit(value: unknown): string {
  if (typeof value !== 'string') {
    return '—';
  }
  const trimmed = value.trim();
  return trimmed || '—';
}

function sortableName(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readPeriodPrefix(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = PERIOD_PREFIX.exec(value.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

function normalizeSearch(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('ru-RU') ?? '';
}

function matchesSearch(row: ISubscriptionRow, query: string): boolean {
  if (!query) {
    return true;
  }
  const fields = [
    row.customer_name,
    row.vessel_name,
    row.item_number,
    row.item_name,
    row.product_name,
  ];
  return fields.some(
    (field) =>
      typeof field === 'string' &&
      field.toLocaleLowerCase('ru-RU').includes(query),
  );
}

function compareItems(
  sortBy: TSortMode,
): (left: ISubscriptionUsageItem, right: ISubscriptionUsageItem) => number {
  return (left, right) => {
    if (sortBy === 'customer_name') {
      const byName = sortableName(left.row.customer_name).localeCompare(
        sortableName(right.row.customer_name),
        'ru',
      );
      if (byName !== 0) {
        return byName;
      }
      return left.row.subscription_id - right.row.subscription_id;
    }

    const direction = sortBy === 'usage_asc' ? 1 : -1;
    const leftPercent = left.maxUsagePercent;
    const rightPercent = right.maxUsagePercent;
    if (leftPercent === null && rightPercent === null) {
      return left.row.subscription_id - right.row.subscription_id;
    }
    if (leftPercent === null) {
      return 1;
    }
    if (rightPercent === null) {
      return -1;
    }
    if (leftPercent !== rightPercent) {
      return (leftPercent - rightPercent) * direction;
    }
    return left.row.subscription_id - right.row.subscription_id;
  };
}
