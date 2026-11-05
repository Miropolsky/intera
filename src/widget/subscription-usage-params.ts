import {
  WIDGET_ROW_LIMITS,
  WIDGET_SIZES,
  type TWidgetRowLimit,
  type TWidgetSize,
} from '../platform/widget-types';

export const LIMIT_TYPES = ['data', 'voice', 'money'] as const;
export type TLimitType = (typeof LIMIT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = [
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

export const MIN_THRESHOLD_PERCENT = 1;
export const MAX_THRESHOLD_PERCENT = 500;
export const DEFAULT_WARNING_THRESHOLD = 80;
export const DEFAULT_CRITICAL_THRESHOLD = 100;
export const DEFAULT_ROW_LIMIT: TWidgetRowLimit = 10;

export interface ISubscriptionUsageConfig {
  /** Card header title (`params.description`, with fallback to `params.title` or `'Subscription Usage'`). */
  description: string;
  /** Optional card header subtitle (`params.subtitle`). */
  subtitle: string;
  /** Card width slot (`full` | `half` | `third` | `quarter`). */
  size: TWidgetSize;
  /**
   * Billing period filter (`'all'` or a `YYYY-MM` / `YYYY-MM-DD` string matched by leading `YYYY-MM`).
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
  const p = params ?? {};

  // TODO: Implement full defensive parsing and threshold validation according to the specification.
  return {
    description:
      typeof p.description === 'string' && p.description.trim()
        ? p.description.trim()
        : typeof p.title === 'string' && p.title.trim()
          ? p.title.trim()
          : 'Subscription Usage',
    subtitle: typeof p.subtitle === 'string' ? p.subtitle.trim() : '',
    size: WIDGET_SIZES.includes(p.size as TWidgetSize)
      ? (p.size as TWidgetSize)
      : 'full',
    period:
      typeof p.period === 'string' && p.period.trim()
        ? p.period.trim()
        : 'all',
    customerId:
      typeof p.customerId === 'number' && Number.isFinite(p.customerId)
        ? p.customerId
        : 'all',
    technologyIds: Array.isArray(p.technologyIds)
      ? p.technologyIds.filter(
          (id): id is number => typeof id === 'number' && Number.isFinite(id),
        )
      : [],
    onlyActive: typeof p.onlyActive === 'boolean' ? p.onlyActive : true,
    limitTypes: [...LIMIT_TYPES],
    warningThreshold: DEFAULT_WARNING_THRESHOLD,
    criticalThreshold: DEFAULT_CRITICAL_THRESHOLD,
    statusFilter: 'all',
    rowLimit: WIDGET_ROW_LIMITS.includes(p.rowLimit as TWidgetRowLimit)
      ? (p.rowLimit as TWidgetRowLimit)
      : DEFAULT_ROW_LIMIT,
    showSummary: typeof p.showSummary === 'boolean' ? p.showSummary : true,
    showDetails: typeof p.showDetails === 'boolean' ? p.showDetails : true,
    sortBy: 'usage_desc',
  };
}
