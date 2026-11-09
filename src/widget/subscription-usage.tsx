import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { FreshnessMark } from '../platform/freshness-mark';
import { formatPeriod, formatValue } from '../platform/value-format';
import { WidgetHeader } from '../platform/widget-card';
import { widgetCardClass } from '../platform/widget-card-class';
import {
  WIDGET_ROW_LIMITS,
  type ICollectionDataResult,
  type TWidgetRowLimit,
  type TWidgetSize,
} from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import {
  computeSubscriptionUsage,
  type ILimitEvaluation,
  type ISubscriptionUsageItem,
  type ISubscriptionUsageResult,
  type ISubscriptionUsageSummary,
} from './subscription-usage-compute';
import {
  LIMIT_TYPES,
  SORT_MODES,
  STATUS_FILTERS,
  parseSubscriptionUsageParams,
  type ISubscriptionUsageConfig,
  type TLimitType,
  type TSortMode,
  type TStatusFilter,
  type TSubscriptionStatus,
} from './subscription-usage-params';
import './subscription-usage.css';

const CLASS = 'dash-subscription-usage';
const TOP_PROBLEM_COUNT = 4;

const LIMIT_LABEL: Record<TLimitType, string> = {
  data: 'Трафик',
  voice: 'Голос',
  money: 'Деньги',
};

const LIMIT_BREAKDOWN_LABEL: Record<TLimitType, string> = {
  data: 'Трафик (MB / GB)',
  voice: 'Голос (минуты)',
  money: 'Деньги (валюта подписки)',
};

const STATUS_LABEL: Record<TSubscriptionStatus, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  no_data: 'No Data',
  no_limit: 'No Limit',
};

const SORT_LABEL: Record<TSortMode, string> = {
  usage_desc: 'По расходу ↓',
  usage_asc: 'По расходу ↑',
  customer_name: 'По клиенту',
};

const DONUT_SEGMENTS: ReadonlyArray<{
  key: string;
  color: string;
  pick: (summary: ISubscriptionUsageSummary) => number;
}> = [
  {
    key: 'normal',
    color: 'var(--metric-severity-ok-fg)',
    pick: (summary) => summary.normal,
  },
  {
    key: 'warning',
    color: 'var(--metric-severity-warning-fg)',
    pick: (summary) => summary.warning,
  },
  {
    key: 'critical',
    color: 'var(--metric-severity-error-fg)',
    pick: (summary) => summary.critical,
  },
  {
    key: 'rest',
    color: 'var(--text-subtle)',
    pick: (summary) => summary.noData + summary.noLimit,
  },
];

export interface ISubscriptionUsageWidgetProps {
  /** Raw widget configuration from dashboard YAML / parameter editor. */
  params?: Record<string, unknown>;
  /** Collection data envelope from INTERA runtime (`useCollectionData`). */
  data: ICollectionDataResult<ISubscriptionRow>;
  /** Optional explicit size override from the host container. */
  size?: TWidgetSize;
}

export function SubscriptionUsageWidget({
  params,
  data,
  size,
}: ISubscriptionUsageWidgetProps): ReactElement {
  const config = useMemo(() => parseSubscriptionUsageParams(params), [params]);
  const effectiveSize = size ?? config.size;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TStatusFilter>(config.statusFilter);
  const [sortBy, setSortBy] = useState<TSortMode>(config.sortBy);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [listLimit, setListLimit] = useState<TWidgetRowLimit>(config.rowLimit);

  useEffect(() => {
    setStatusFilter(config.statusFilter);
  }, [config.statusFilter]);

  useEffect(() => {
    setSortBy(config.sortBy);
  }, [config.sortBy]);

  useEffect(() => {
    setListLimit(config.rowLimit);
  }, [config.rowLimit]);

  useEffect(() => {
    if (!config.showDetails) {
      setExpandedKey(null);
    }
  }, [config.showDetails]);

  const viewConfig = useMemo(
    () => ({ ...config, statusFilter, sortBy }),
    [config, statusFilter, sortBy],
  );

  const result = useMemo(
    () =>
      computeSubscriptionUsage(data.items, viewConfig, {
        searchQuery,
      }),
    [data.items, viewConfig, searchQuery],
  );

  useEffect(() => {
    if (!data.loaded || result.summary.total === 0) {
      setListOpen(false);
    }
  }, [data.loaded, result.summary.total]);

  useEffect(() => {
    if (!listOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setListOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listOpen]);

  const clearRuntimeFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  const header = (
    <WidgetHeader
      title={config.description}
      subtitle={config.subtitle}
      aside={
        data.loaded ? (
          <>
            {data.loading ? (
              <span className={`${CLASS}__refresh`}>Обновление</span>
            ) : null}
            <FreshnessMark
              source="rows"
              stale={data.stale}
              lastSuccessAt={data.lastSuccessAt}
              showLabel={effectiveSize === 'full' || effectiveSize === 'half'}
            />
          </>
        ) : null
      }
    />
  );

  let body: ReactNode;
  if (data.error && !data.loaded) {
    body = <ErrorState message={data.error} />;
  } else if (data.loading && !data.loaded) {
    body = <SkeletonState size={effectiveSize} />;
  } else if (result.summary.total === 0) {
    body = (
      <EmptyState
        title="Нет подписок"
        text={
          data.items.length === 0
            ? 'Источник не вернул строк за текущий запрос.'
            : 'Ни одна подписка не попала в фильтры виджета.'
        }
      />
    );
  } else {
    const viewProps: IUsageViewProps = {
      config,
      result,
      searchQuery,
      onSearchQuery: setSearchQuery,
      statusFilter,
      onStatusFilter: setStatusFilter,
      sortBy,
      onSortBy: setSortBy,
      expandedKey,
      onToggle: (key) => setExpandedKey((current) => (current === key ? null : key)),
      onOpenList: () => setListOpen(true),
      onClearFilters: clearRuntimeFilters,
      listLimit,
      onListLimit: setListLimit,
    };
    body = <SizeLayout size={effectiveSize} {...viewProps} />;
  }

  return (
    <article
      className={`${CLASS} ${widgetCardClass()}`}
      data-size={effectiveSize}
      data-loading={data.loading && data.loaded ? 'true' : 'false'}
      aria-busy={data.loading}
    >
      {header}
      {body}
      {listOpen && data.loaded && result.summary.total > 0 ? (
        <ListDialog
          config={config}
          result={result}
          searchQuery={searchQuery}
          onSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          sortBy={sortBy}
          onSortBy={setSortBy}
          expandedKey={expandedKey}
          onToggle={(key) =>
            setExpandedKey((current) => (current === key ? null : key))
          }
          listLimit={listLimit}
          onListLimit={setListLimit}
          onClose={() => setListOpen(false)}
        />
      ) : null}
    </article>
  );
}

interface IUsageViewProps {
  config: ISubscriptionUsageConfig;
  result: ISubscriptionUsageResult;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  statusFilter: TStatusFilter;
  onStatusFilter: (value: TStatusFilter) => void;
  sortBy: TSortMode;
  onSortBy: (value: TSortMode) => void;
  expandedKey: string | null;
  onToggle: (key: string) => void;
  onOpenList: () => void;
  onClearFilters: () => void;
  listLimit: TWidgetRowLimit;
  onListLimit: (value: TWidgetRowLimit) => void;
}

function SizeLayout({ size, ...props }: IUsageViewProps & { size: TWidgetSize }) {
  switch (size) {
    case 'full':
      return <FullLayout {...props} />;
    case 'half':
      return <HalfLayout {...props} />;
    case 'third':
      return <ThirdLayout {...props} />;
    case 'quarter':
      return <QuarterLayout {...props} />;
    default: {
      const unexpected: never = size;
      return unexpected;
    }
  }
}

function FullLayout(props: IUsageViewProps): ReactElement {
  const { config, result } = props;
  return (
    <div className={`${CLASS}__body`}>
      <ScopeMeta config={config} total={result.summary.total} />
      {config.showSummary ? (
        <>
          <KpiRow summary={result.summary} config={config} variant="full" />
          <Distribution summary={result.summary} config={config} />
        </>
      ) : null}
      <Toolbar {...props} />
      <SubscriptionTable
        items={result.visibleItems}
        enabled={config.limitTypes}
        showDetails={config.showDetails}
        expandedKey={props.expandedKey}
        onToggle={props.onToggle}
      />
      <ListFoot
        shown={result.visibleItems.length}
        filtered={result.filteredItems.length}
        total={result.summary.total}
      />
    </div>
  );
}

function HalfLayout(props: IUsageViewProps): ReactElement {
  const { config, result } = props;
  // KPI stay on the unfiltered summary. The short list follows statusFilter
  // and search, still ordered by usage so the card matches the opened list.
  const problems = topByUsage(result);

  return (
    <div className={`${CLASS}__body`}>
      <ScopeMeta config={config} total={result.summary.total} />
      {config.showSummary ? (
        <>
          <KpiRow summary={result.summary} config={config} variant="compact" />
          <LimitBreakdown summary={result.summary} enabled={config.limitTypes} />
        </>
      ) : null}
      <FilterHint
        statusFilter={props.statusFilter}
        searchQuery={props.searchQuery}
        filtered={result.filteredItems.length}
        total={result.summary.total}
        onClear={props.onClearFilters}
      />
      <section className={`${CLASS}__block`}>
        <h5 className={`${CLASS}__block-title`}>Топ превышений</h5>
        {problems.length === 0 ? (
          <p className={`${CLASS}__hint`}>Нет подписок по текущему фильтру.</p>
        ) : (
          <ul className={`${CLASS}__problems`}>
            {problems.map((item) => (
              <li key={itemKey(item)}>
                <ProblemRow item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <button type="button" className={`${CLASS}__action`} onClick={props.onOpenList}>
        {listActionLabel(result.filteredItems.length, result.summary.total)}
      </button>
    </div>
  );
}

function ThirdLayout(props: IUsageViewProps): ReactElement {
  const { config, result } = props;
  return (
    <div className={`${CLASS}__body`}>
      {config.showSummary ? (
        <>
          <div className={`${CLASS}__donut-wrap`}>
            <StatusDonut summary={result.summary} size={120} caption={false} />
          </div>
          <StatusCounters summary={result.summary} />
        </>
      ) : null}
      <FilterHint
        statusFilter={props.statusFilter}
        searchQuery={props.searchQuery}
        filtered={result.filteredItems.length}
        total={result.summary.total}
        onClear={props.onClearFilters}
      />
      <button type="button" className={`${CLASS}__action`} onClick={props.onOpenList}>
        Список подписок
      </button>
    </div>
  );
}

function QuarterLayout(props: IUsageViewProps): ReactElement {
  const { config, result } = props;
  const { summary } = result;
  return (
    <div className={`${CLASS}__body`}>
      {config.showSummary ? (
        <>
          <div className={`${CLASS}__hero`}>
            <span className={`${CLASS}__hero-value`}>{summary.total}</span>
            <span className={`${CLASS}__hero-label`}>подписок</span>
          </div>
          <div className={`${CLASS}__badge ${CLASS}__badge--warning`}>
            <strong>{summary.warning}</strong>
            <span>≥ {formatThreshold(config.warningThreshold)}% Warn</span>
          </div>
          <div className={`${CLASS}__badge ${CLASS}__badge--critical`}>
            <strong>{summary.critical}</strong>
            <span>≥ {formatThreshold(config.criticalThreshold)}% Crit</span>
          </div>
          <p className={`${CLASS}__quiet`}>
            {summary.noData} No Data · {summary.noLimit} No Limit
          </p>
        </>
      ) : null}
      <FilterHint
        statusFilter={props.statusFilter}
        searchQuery={props.searchQuery}
        filtered={result.filteredItems.length}
        total={summary.total}
        onClear={props.onClearFilters}
      />
      <button type="button" className={`${CLASS}__action`} onClick={props.onOpenList}>
        Детали
      </button>
    </div>
  );
}

function ScopeMeta({
  config,
  total,
}: {
  config: ISubscriptionUsageConfig;
  total: number;
}): ReactElement {
  const period =
    config.period === 'all' ? 'Все периоды' : formatPeriod(config.period, 'long');
  const activity = config.onlyActive ? 'только активные' : 'включая отключённые';
  return (
    <p className={`${CLASS}__meta`}>
      {period} · {activity} · {total}
    </p>
  );
}

function FilterHint({
  statusFilter,
  searchQuery,
  filtered,
  total,
  onClear,
}: {
  statusFilter: TStatusFilter;
  searchQuery: string;
  filtered: number;
  total: number;
  onClear: () => void;
}): ReactElement | null {
  const query = searchQuery.trim();
  if (statusFilter === 'all' && query.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (statusFilter !== 'all') {
    parts.push(STATUS_LABEL[statusFilter]);
  }
  if (query.length > 0) {
    parts.push(`«${query}»`);
  }
  return (
    <div className={`${CLASS}__filter-hint`}>
      <p className={`${CLASS}__meta`}>
        Фильтр: {parts.join(' · ')} · {filtered} из {total}
      </p>
      <button type="button" className={`${CLASS}__clear`} onClick={onClear}>
        Сбросить
      </button>
    </div>
  );
}

function KpiRow({
  summary,
  config,
  variant,
}: {
  summary: ISubscriptionUsageSummary;
  config: ISubscriptionUsageConfig;
  variant: 'full' | 'compact';
}): ReactElement {
  return (
    <div className={`${CLASS}__kpis`} data-variant={variant}>
      <Kpi value={summary.total} label="Подписок" tone="neutral" />
      <Kpi
        value={summary.warning}
        label={`Warning ≥ ${formatThreshold(config.warningThreshold)}%`}
        tone="warning"
      />
      <Kpi
        value={summary.critical}
        label={`Critical ≥ ${formatThreshold(config.criticalThreshold)}%`}
        tone="critical"
      />
      {variant === 'full' ? (
        <Kpi
          value={`${summary.noData} / ${summary.noLimit}`}
          label="No Data / No Limit"
          tone="muted"
        />
      ) : null}
    </div>
  );
}

function Kpi({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone: 'neutral' | 'warning' | 'critical' | 'muted';
}): ReactElement {
  return (
    <div className={`${CLASS}__kpi ${CLASS}__kpi--${tone}`}>
      <span className={`${CLASS}__kpi-value`}>{value}</span>
      <span className={`${CLASS}__kpi-label`}>{label}</span>
    </div>
  );
}

function Distribution({
  summary,
  config,
}: {
  summary: ISubscriptionUsageSummary;
  config: ISubscriptionUsageConfig;
}): ReactElement {
  const rows = [
    {
      key: 'normal',
      label: `Normal (< ${formatThreshold(config.warningThreshold)}%)`,
      count: summary.normal,
      tone: 'normal' as const,
    },
    {
      key: 'warning',
      label: `Warning (≥ ${formatThreshold(config.warningThreshold)}% и < ${formatThreshold(config.criticalThreshold)}%)`,
      count: summary.warning,
      tone: 'warning' as const,
    },
    {
      key: 'critical',
      label: `Critical (≥ ${formatThreshold(config.criticalThreshold)}%)`,
      count: summary.critical,
      tone: 'critical' as const,
    },
    {
      key: 'rest',
      label: 'No Data / No Limit',
      count: summary.noData + summary.noLimit,
      tone: 'muted' as const,
    },
  ];

  return (
    <div className={`${CLASS}__distribution`}>
      <StatusDonut summary={summary} size={112} caption />
      <ul className={`${CLASS}__legend`}>
        {rows.map((row) => (
          <li key={row.key} className={`${CLASS}__legend-row`}>
            <span className={`${CLASS}__dot ${CLASS}__dot--${row.tone}`} />
            <span className={`${CLASS}__legend-label`}>{row.label}</span>
            <span className={`${CLASS}__legend-value`}>
              {row.count} ({formatShare(row.count, summary.total)})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDonut({
  summary,
  size,
  caption,
}: {
  summary: ISubscriptionUsageSummary;
  size: number;
  caption: boolean;
}): ReactElement {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const active = DONUT_SEGMENTS.filter((segment) => segment.pick(summary) > 0);
  const gap = active.length > 1 ? 2 : 0;
  let consumed = 0;

  return (
    <svg
      className={`${CLASS}__donut`}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Распределение ${summary.total} подписок по статусам`}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--bg-muted)"
        strokeWidth={stroke}
      />
      {summary.total > 0
        ? DONUT_SEGMENTS.map((segment) => {
            const value = segment.pick(summary);
            if (value <= 0) {
              return null;
            }
            const share = (value / summary.total) * circumference;
            const length = Math.max(0, share - gap);
            const offset = -consumed;
            consumed += share;
            return (
              <circle
                key={segment.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth={stroke}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
          })
        : null}
      <text
        x={center}
        y={caption ? center - 2 : center + 1}
        textAnchor="middle"
        className={`${CLASS}__donut-value`}
      >
        {summary.total}
      </text>
      {caption ? (
        <text
          x={center}
          y={center + 14}
          textAnchor="middle"
          className={`${CLASS}__donut-caption`}
        >
          подписок
        </text>
      ) : null}
    </svg>
  );
}

function StatusCounters({
  summary,
}: {
  summary: ISubscriptionUsageSummary;
}): ReactElement {
  const rows: Array<{ label: string; count: number; tone: TSubscriptionStatus | 'muted' }> =
    [
      { label: 'Normal', count: summary.normal, tone: 'normal' },
      { label: 'Warning', count: summary.warning, tone: 'warning' },
      { label: 'Critical', count: summary.critical, tone: 'critical' },
      {
        label: 'No Data / No Limit',
        count: summary.noData + summary.noLimit,
        tone: 'muted',
      },
    ];
  return (
    <ul className={`${CLASS}__counters`}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className={`${CLASS}__dot ${CLASS}__dot--${row.tone}`} />
          <span>{row.label}</span>
          <strong className={`${CLASS}__count ${CLASS}__count--${row.tone}`}>
            {row.count}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function LimitBreakdown({
  summary,
  enabled,
}: {
  summary: ISubscriptionUsageSummary;
  enabled: readonly TLimitType[];
}): ReactElement {
  return (
    <section className={`${CLASS}__block`}>
      <h5 className={`${CLASS}__block-title`}>Проблемные лимиты по типам</h5>
      <ul className={`${CLASS}__breakdown`}>
        {enabled.map((type) => {
          const stats = summary.byLimitType[type];
          const tone =
            stats.critical > 0 ? 'critical' : stats.warning > 0 ? 'warning' : 'muted';
          return (
            <li key={type}>
              <span>{LIMIT_BREAKDOWN_LABEL[type]}</span>
              <strong className={`${CLASS}__count ${CLASS}__count--${tone}`}>
                {formatBreakdown(stats)}
              </strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProblemRow({ item }: { item: ISubscriptionUsageItem }): ReactElement {
  const percent = item.maxUsagePercent;
  return (
    <div className={`${CLASS}__problem`}>
      <div className={`${CLASS}__problem-head`}>
        <span className={`${CLASS}__problem-name`} title={item.row.customer_name}>
          {item.row.customer_name}
          {item.row.vessel_name ? ` · ${item.row.vessel_name}` : ''}
        </span>
        <span className={`${CLASS}__percent ${CLASS}__percent--${item.overallStatus}`}>
          {percent === null ? STATUS_LABEL[item.overallStatus] : formatPercent(percent)}
        </span>
      </div>
      <UsageMeter percent={percent} status={item.overallStatus} />
    </div>
  );
}

function Toolbar(props: IUsageViewProps): ReactElement {
  return (
    <div className={`${CLASS}__toolbar`}>
      <SearchField value={props.searchQuery} onChange={props.onSearchQuery} />
      <SortField value={props.sortBy} onChange={props.onSortBy} />
      <StatusChips
        summary={props.result.summary}
        value={props.statusFilter}
        onChange={props.onStatusFilter}
      />
    </div>
  );
}

function ListControls(
  props: Omit<IUsageViewProps, 'onOpenList' | 'onClearFilters'>,
): ReactElement {
  return (
    <div className={`${CLASS}__list-controls`}>
      <SearchField value={props.searchQuery} onChange={props.onSearchQuery} />
      <SortField value={props.sortBy} onChange={props.onSortBy} />
      <label className={`${CLASS}__row-limit`}>
        <span className={`${CLASS}__sr`}>Количество строк</span>
        <select
          value={props.listLimit}
          onChange={(event) => props.onListLimit(Number(event.target.value) as TWidgetRowLimit)}
        >
          {WIDGET_ROW_LIMITS.map((limit) => (
            <option key={limit} value={limit}>{limit} строк</option>
          ))}
        </select>
      </label>
      <StatusChips
        summary={props.result.summary}
        value={props.statusFilter}
        onChange={props.onStatusFilter}
      />
    </div>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactElement {
  const id = useId();
  return (
    <label className={`${CLASS}__search`} htmlFor={id}>
      <span className={`${CLASS}__sr`}>Поиск подписок</span>
      <input
        id={id}
        type="search"
        value={value}
        placeholder="Клиент, судно, терминал, продукт"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SortField({
  value,
  onChange,
}: {
  value: TSortMode;
  onChange: (value: TSortMode) => void;
}): ReactElement {
  const id = useId();
  return (
    <label className={`${CLASS}__sort`} htmlFor={id}>
      <span className={`${CLASS}__sr`}>Сортировка</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as TSortMode)}
      >
        {SORT_MODES.map((mode) => (
          <option key={mode} value={mode}>
            {SORT_LABEL[mode]}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusChips({
  summary,
  value,
  onChange,
}: {
  summary: ISubscriptionUsageSummary;
  value: TStatusFilter;
  onChange: (value: TStatusFilter) => void;
}): ReactElement {
  const counts: Record<TStatusFilter, number> = {
    all: summary.total,
    normal: summary.normal,
    warning: summary.warning,
    critical: summary.critical,
    no_data: summary.noData,
    no_limit: summary.noLimit,
  };
  return (
    <div className={`${CLASS}__chips`} role="group" aria-label="Фильтр по статусу">
      {STATUS_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className={
            filter === value
              ? `${CLASS}__chip ${CLASS}__chip--active`
              : `${CLASS}__chip`
          }
          aria-pressed={filter === value}
          onClick={() => onChange(filter)}
        >
          {filter === 'all' ? 'Все' : STATUS_LABEL[filter]}
          <span>{counts[filter]}</span>
        </button>
      ))}
    </div>
  );
}

function SubscriptionTable({
  items,
  enabled,
  showDetails,
  expandedKey,
  onToggle,
}: {
  items: readonly ISubscriptionUsageItem[];
  enabled: readonly TLimitType[];
  showDetails: boolean;
  expandedKey: string | null;
  onToggle: (key: string) => void;
}): ReactElement {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Ничего не найдено"
        text="Измените поиск или фильтр статуса — сводка выше считается по всему отбору."
      />
    );
  }

  return (
    <div className={`${CLASS}__table-wrap`}>
      <table className={`${CLASS}__table`}>
        <thead>
          <tr>
            <th>Клиент / судно</th>
            <th>Технология</th>
            <th>Макс. расход лимита</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const key = itemKey(item);
            const expanded = showDetails && expandedKey === key;
            return (
              <TableRow
                key={key}
                item={item}
                itemKey={key}
                enabled={enabled}
                showDetails={showDetails}
                expanded={expanded}
                onToggle={onToggle}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  item,
  itemKey: key,
  enabled,
  showDetails,
  expanded,
  onToggle,
}: {
  item: ISubscriptionUsageItem;
  itemKey: string;
  enabled: readonly TLimitType[];
  showDetails: boolean;
  expanded: boolean;
  onToggle: (key: string) => void;
}): ReactElement {
  const meta = [item.row.vessel_name, item.row.item_number].filter(Boolean).join(' · ');
  return (
    <>
      <tr className={showDetails ? `${CLASS}__row--openable` : undefined}>
        <td>
          {showDetails ? (
            <button
              type="button"
              className={`${CLASS}__row-toggle`}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Скрыть детали ${item.row.customer_name}`
                  : `Показать детали ${item.row.customer_name}`
              }
              onClick={() => onToggle(key)}
            >
              <span className={`${CLASS}__primary`}>{item.row.customer_name}</span>
              {meta ? <span className={`${CLASS}__secondary`}>{meta}</span> : null}
            </button>
          ) : (
            <>
              <span className={`${CLASS}__primary`}>{item.row.customer_name}</span>
              {meta ? <span className={`${CLASS}__secondary`}>{meta}</span> : null}
            </>
          )}
        </td>
        <td>{item.row.technology_name}</td>
        <td>
          <span className={`${CLASS}__secondary`}>{limitCaption(item.primaryLimit)}</span>
          <UsageMeter
            percent={item.primaryLimit.usagePercent}
            status={item.primaryLimit.status}
          />
        </td>
        <td className={`${CLASS}__percent ${CLASS}__percent--${item.overallStatus}`}>
          {item.maxUsagePercent === null
            ? statusShort(item.overallStatus)
            : formatPercent(item.maxUsagePercent)}
        </td>
      </tr>
      {expanded ? (
        <tr className={`${CLASS}__details-row`}>
          <td colSpan={4}>
            <SubscriptionDetails item={item} enabled={enabled} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function SubscriptionDetails({
  item,
  enabled,
}: {
  item: ISubscriptionUsageItem;
  enabled: readonly TLimitType[];
}): ReactElement {
  const { row } = item;
  const facts = [
    ['Продукт', row.product_name],
    ['Тариф', row.package_plan_name],
    ['Терминал', row.item_name],
    ['Контракт', row.contract_description],
    [
      'Период',
      row.allowance_period ? formatPeriod(row.allowance_period, 'long') : '—',
    ],
    ['Статус терминала', row.terminal_status_name],
  ];
  return (
    <div className={`${CLASS}__details`}>
      <dl className={`${CLASS}__facts`}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
      <div className={`${CLASS}__limits`}>
        {LIMIT_TYPES.map((type) => (
          <LimitCard
            key={type}
            limit={item.limits[type]}
            included={enabled.includes(type)}
          />
        ))}
      </div>
    </div>
  );
}

function LimitCard({
  limit,
  included,
}: {
  limit: ILimitEvaluation;
  included: boolean;
}): ReactElement {
  return (
    <article className={`${CLASS}__limit`}>
      <header>
        <span>{LIMIT_LABEL[limit.type]}</span>
        <strong className={`${CLASS}__percent ${CLASS}__percent--${limit.status}`}>
          {limit.usagePercent === null
            ? STATUS_LABEL[limit.status]
            : formatPercent(limit.usagePercent)}
        </strong>
      </header>
      <p>{limitCaption(limit)}</p>
      <UsageMeter percent={limit.usagePercent} status={limit.status} />
      {included ? null : <p className={`${CLASS}__hint`}>Не входит в расчёт</p>}
    </article>
  );
}

function UsageMeter({
  percent,
  status,
}: {
  percent: number | null;
  status: TSubscriptionStatus;
}): ReactElement {
  const overflow = percent !== null && percent > 100;
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  return (
    <div
      className={`${CLASS}__meter`}
      role={percent === null ? undefined : 'meter'}
      aria-valuemin={percent === null ? undefined : 0}
      aria-valuemax={percent === null ? undefined : Math.max(100, Math.ceil(percent))}
      aria-valuenow={percent === null ? undefined : Math.round(percent)}
      aria-label={
        percent === null
          ? undefined
          : overflow
            ? `Расход ${formatPercent(percent)}, выше лимита`
            : `Расход ${formatPercent(percent)}`
      }
    >
      <span className={`${CLASS}__meter-track`} data-overflow={overflow ? 'true' : 'false'}>
        <span
          className={
            overflow
              ? `${CLASS}__meter-fill ${CLASS}__meter-fill--${status} ${CLASS}__meter-fill--overflow`
              : `${CLASS}__meter-fill ${CLASS}__meter-fill--${status}`
          }
          style={{ width: `${width}%` }}
        />
      </span>
    </div>
  );
}

function ListFoot({
  shown,
  filtered,
  total,
}: {
  shown: number;
  filtered: number;
  total: number;
}): ReactElement {
  const text =
    filtered === 0
      ? 'Нет строк по текущему фильтру'
      : shown < filtered
        ? `Показаны ${shown} из ${filtered}`
        : `${filtered} из ${total} в отборе`;
  return (
    <p className={`${CLASS}__foot`} aria-live="polite">
      {text}
    </p>
  );
}

function ListDialog({
  onClose,
  ...props
}: Omit<IUsageViewProps, 'onOpenList' | 'onClearFilters'> & {
  onClose: () => void;
}): ReactElement {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = focusableIn(dialog);
    (items[0] ?? dialog).focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div
      className={`${CLASS}__scrim`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`${CLASS}__dialog`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapDialogTab}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`${CLASS}__dialog-head`}>
          <h5 id={titleId}>{props.config.description}</h5>
          <button type="button" className={`${CLASS}__close`} onClick={onClose}>
            Закрыть
          </button>
        </header>
        <ListControls {...props} />
        <SubscriptionTable
          items={props.result.filteredItems.slice(0, props.listLimit)}
          enabled={props.config.limitTypes}
          showDetails={props.config.showDetails}
          expandedKey={props.expandedKey}
          onToggle={props.onToggle}
        />
        <ListFoot
          shown={Math.min(props.result.filteredItems.length, props.listLimit)}
          filtered={props.result.filteredItems.length}
          total={props.result.summary.total}
        />
      </div>
    </div>
  );
}

function SkeletonState({ size }: { size: TWidgetSize }): ReactElement {
  const bars = size === 'quarter' ? 3 : size === 'third' ? 4 : 6;
  return (
    <div className={`${CLASS}__skeleton`} role="status" aria-label="Загрузка подписок">
      <span className={`${CLASS}__sr`}>Загрузка подписок</span>
      <span className={`${CLASS}__bone ${CLASS}__bone--lg`} />
      <span className={`${CLASS}__skeleton-row`}>
        <span className={`${CLASS}__bone`} />
        <span className={`${CLASS}__bone`} />
        <span className={`${CLASS}__bone`} />
      </span>
      {Array.from({ length: bars }, (_, index) => (
        <span key={index} className={`${CLASS}__bone`} />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }): ReactElement {
  return (
    <div className={`${CLASS}__notice ${CLASS}__notice--error`} role="alert">
      <strong>Не удалось загрузить подписки</strong>
      <p>{message}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }): ReactElement {
  return (
    <div className={`${CLASS}__notice`}>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled'),
  );
}

function trapDialogTab(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== 'Tab') {
    return;
  }
  const dialog = event.currentTarget;
  const items = focusableIn(dialog);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const inside = active instanceof Node && dialog.contains(active);
  if (event.shiftKey && (!inside || active === first || active === dialog)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && (!inside || active === last || active === dialog)) {
    event.preventDefault();
    first.focus();
  }
}

function topByUsage(result: ISubscriptionUsageResult): ISubscriptionUsageItem[] {
  const order = new Map(
    result.scopedItems.map((item, index) => [itemKey(item), index]),
  );
  return result.filteredItems
    .slice()
    .sort(
      (left, right) =>
        (order.get(itemKey(left)) ?? 0) - (order.get(itemKey(right)) ?? 0),
    )
    .slice(0, TOP_PROBLEM_COUNT);
}

function listActionLabel(filtered: number, total: number): string {
  return filtered === total
    ? `Открыть полный список (${total})`
    : `Открыть список (${filtered} из ${total})`;
}

function itemKey(item: ISubscriptionUsageItem): string {
  return `${item.row.subscription_id}:${item.row.allowance_period ?? 'none'}`;
}

function limitCaption(limit: ILimitEvaluation): string {
  if (limit.status === 'no_limit') {
    return limit.used !== null && limit.used > 0
      ? `Без лимита · расход ${formatQty(limit.used)} ${limit.unit}`
      : 'Без лимита';
  }
  if (limit.status === 'no_data') {
    return limit.allowance !== null
      ? `Лимит ${formatQty(limit.allowance)} ${limit.unit} · нет данных`
      : 'Нет данных';
  }
  return `${formatQty(limit.used ?? 0)} / ${formatQty(limit.allowance ?? 0)} ${limit.unit}`;
}

function statusShort(status: TSubscriptionStatus): string {
  if (status === 'no_data') {
    return 'NO DATA';
  }
  if (status === 'no_limit') {
    return 'NO LIM';
  }
  return STATUS_LABEL[status];
}

function formatQty(value: number): string {
  return formatValue(value, Number.isInteger(value) ? 'integer' : 'decimal');
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatShare(count: number, total: number): string {
  if (total <= 0) {
    return '0%';
  }
  return formatPercent((count / total) * 100);
}

function formatThreshold(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value);
}

function formatBreakdown(stats: {
  warning: number;
  critical: number;
  noData: number;
}): string {
  const parts: string[] = [];
  if (stats.critical > 0) {
    parts.push(`${stats.critical} crit`);
  }
  if (stats.warning > 0) {
    parts.push(`${stats.warning} warn`);
  }
  if (stats.noData > 0) {
    parts.push(`${stats.noData} no data`);
  }
  return parts.length > 0 ? parts.join(' · ') : '0';
}
