import { toFiniteNumber } from '../platform/to-finite-number';
import {
  readBoolean,
  readEnum,
  readString,
  isRecord,
} from '../platform/widget-param-readers';
import {
  WIDGET_ROW_LIMITS,
  WIDGET_SIZES,
  type TWidgetRowLimit,
  type TWidgetSize,
} from '../platform/widget-types';

export const LIMIT_TYPES = ['data', 'voice', 'money'] as const;
export type TLimitType = (typeof LIMIT_TYPES)[number];

const SUBSCRIPTION_STATUSES = [
  'normal',
  'warning',
  'critical',
  'no_data',
  'no_limit',
] as const;
export type TSubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const STATUS_FILTERS = ['all', ...SUBSCRIPTION_STATUSES] as const;
export type TStatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_MODES = ['usage_desc', 'usage_asc', 'customer_name'] as const;
export type TSortMode = (typeof SORT_MODES)[number];

const MIN_THRESHOLD_PERCENT = 1;
const MAX_THRESHOLD_PERCENT = 500;
const DEFAULT_WARNING_THRESHOLD = 80;
const DEFAULT_CRITICAL_THRESHOLD = 100;
const DEFAULT_ROW_LIMIT: TWidgetRowLimit = 10;

const PERIOD_PREFIX = /^(\d{4})-(0[1-9]|1[0-2])$/;

export interface ISubscriptionUsageConfig {
  /** Card header title (`params.description`, with fallback to `params.title` or `'Subscription Usage'`). */
  description: string;
  /** Optional card header subtitle (`params.subtitle`). */
  subtitle: string;
  /** Card width slot (`full` | `half` | `third` | `quarter`). */
  size: TWidgetSize;
  /**
   * Billing period filter (`'all'` or a `YYYY-MM` prefix of `allowance_period`).
   * Default: `'all'`.
   */
  period: string;
  /** Customer filter (`'all'` or a positive finite `customer_id`). Default: `'all'`. */
  customerId: number | 'all';
  /** Technology filter (`technology_id[]`). Empty array means all technologies. */
  technologyIds: number[];
  /** When `true` (default), only rows with `subscription_active === 1` are included. */
  onlyActive: boolean;
  /** Active limit dimensions to evaluate (`data`, `voice`, `money`). Non-empty; defaults to all three. */
  limitTypes: TLimitType[];
  /** Warning threshold in percent (`1..500`, must be strictly less than `criticalThreshold`). Default: `80`. */
  warningThreshold: number;
  /** Critical threshold in percent (`1..500`, must be strictly greater than `warningThreshold`). Default: `100`. */
  criticalThreshold: number;
  /** Status filter applied to each subscription's overall status. Default: `'all'`. */
  statusFilter: TStatusFilter;
  /** Maximum rows displayed in the table (`10 | 25 | 50 | 100`, reads `rowLimit` or `maxRows`). Default: `10`. */
  rowLimit: TWidgetRowLimit;
  /** Whether to show summary counters / distribution. Default: `true`. */
  showSummary: boolean;
  /** Whether to allow opening / viewing per-subscription details. Default: `true`. */
  showDetails: boolean;
  /** Sort order for subscription rows. Default: `'usage_desc'`. */
  sortBy: TSortMode;
}

/**
 * Parses untyped widget `params` into a validated `ISubscriptionUsageConfig` with all defaults applied.
 *
 * Rules:
 * 1. Never throw on malformed or missing fields — fall back to defaults.
 * 2. `description`: trimmed `params.description` or `params.title`, fallback `'Subscription Usage'`.
 * 3. `warningThreshold` and `criticalThreshold`: clamp to `[1, 500]`. If after clamping
 *    `warningThreshold >= criticalThreshold`, reset both to `80` and `100`.
 * 4. `limitTypes`: keep only valid `TLimitType` values in unique order; if empty or invalid, fallback to `['data', 'voice', 'money']`.
 * 5. `rowLimit`: read `params.rowLimit` (or legacy `params.maxRows`); if not in `[10, 25, 50, 100]`, fallback to `10`.
 */
export function parseSubscriptionUsageParams(
  params: Record<string, unknown> | undefined,
): ISubscriptionUsageConfig {
  const source = isRecord(params) ? params : {};
  const warningThreshold = readThreshold(
    source.warningThreshold,
    DEFAULT_WARNING_THRESHOLD,
  );
  const criticalThreshold = readThreshold(
    source.criticalThreshold,
    DEFAULT_CRITICAL_THRESHOLD,
  );
  const thresholdsAreOrdered = warningThreshold < criticalThreshold;

  return {
    description: readDescription(source),
    subtitle: readString(source.subtitle).trim(),
    size: readEnum(source.size, WIDGET_SIZES, 'full'),
    period: readPeriod(source.period),
    customerId: readCustomerId(source.customerId),
    technologyIds: readTechnologyIds(source.technologyIds),
    onlyActive: readBoolean(source.onlyActive, true),
    limitTypes: readLimitTypes(source.limitTypes),
    warningThreshold: thresholdsAreOrdered
      ? warningThreshold
      : DEFAULT_WARNING_THRESHOLD,
    criticalThreshold: thresholdsAreOrdered
      ? criticalThreshold
      : DEFAULT_CRITICAL_THRESHOLD,
    statusFilter: readEnum(source.statusFilter, STATUS_FILTERS, 'all'),
    rowLimit:
      readRowLimit(source.rowLimit) ??
      readRowLimit(source.maxRows) ??
      DEFAULT_ROW_LIMIT,
    showSummary: readBoolean(source.showSummary, true),
    showDetails: readBoolean(source.showDetails, true),
    sortBy: readEnum(source.sortBy, SORT_MODES, 'usage_desc'),
  };
}

function readDescription(source: Record<string, unknown>): string {
  const description = readString(source.description).trim();
  if (description) {
    return description;
  }
  const title = readString(source.title).trim();
  return title || 'Subscription Usage';
}

/** `'all'` or a normalised `YYYY-MM`. Anything else falls back to `'all'`. */
function readPeriod(value: unknown): string {
  if (typeof value !== 'string') {
    return 'all';
  }
  const trimmed = value.trim();
  if (trimmed === 'all') {
    return 'all';
  }
  const match = PERIOD_PREFIX.exec(trimmed);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  // The table contract allows a full YYYY-MM-DD value; normalise it to the month.
  const dateMatch = /^(\d{4})-(0[1-9]|1[0-2])-\d{2}$/.exec(trimmed);
  return dateMatch ? `${dateMatch[1]}-${dateMatch[2]}` : 'all';
}

function readCustomerId(value: unknown): number | 'all' {
  if (value === 'all') {
    return 'all';
  }
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed <= 0) {
    return 'all';
  }
  return parsed;
}

function readTechnologyIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const entry of value) {
    const parsed = toFiniteNumber(entry);
    if (parsed === null || seen.has(parsed)) {
      continue;
    }
    seen.add(parsed);
    ids.push(parsed);
  }
  return ids;
}

function readLimitTypes(value: unknown): TLimitType[] {
  if (!Array.isArray(value)) {
    return [...LIMIT_TYPES];
  }
  const seen = new Set<TLimitType>();
  const types: TLimitType[] = [];
  for (const entry of value) {
    if (!isLimitType(entry) || seen.has(entry)) {
      continue;
    }
    seen.add(entry);
    types.push(entry);
  }
  return types.length > 0 ? types : [...LIMIT_TYPES];
}

function isLimitType(value: unknown): value is TLimitType {
  return (
    typeof value === 'string' &&
    (LIMIT_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Finite numbers are clamped into `[1, 500]`. Missing or non-numeric values
 * keep the field default so a typo does not silently become the minimum.
 */
function readThreshold(value: unknown, fallback: number): number {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return fallback;
  }
  return Math.min(
    MAX_THRESHOLD_PERCENT,
    Math.max(MIN_THRESHOLD_PERCENT, parsed),
  );
}

function readRowLimit(value: unknown): TWidgetRowLimit | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null || !isRowLimit(parsed)) {
    return null;
  }
  return parsed;
}

function isRowLimit(value: number): value is TWidgetRowLimit {
  return (WIDGET_ROW_LIMITS as readonly number[]).includes(value);
}
