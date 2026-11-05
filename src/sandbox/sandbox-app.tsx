import { useEffect, useMemo, useState, type ReactElement } from 'react';
import mockSubscriptions from '../data/mock-subscriptions.json';
import type {
  ICollectionDataResult,
  TWidgetRowLimit,
  TWidgetSize,
} from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import { SubscriptionUsageWidget } from '../widget/subscription-usage';
import {
  LIMIT_TYPES,
  SORT_MODES,
  STATUS_FILTERS,
  type TLimitType,
  type TSortMode,
  type TStatusFilter,
} from '../widget/subscription-usage-params';
import './sandbox.css';

type TDataStateMode =
  | 'ready'
  | 'stale'
  | 'refreshing'
  | 'loading'
  | 'empty'
  | 'error';

type TViewSizeMode = TWidgetSize | 'all';

const SIZE_LABELS: Record<TWidgetSize, string> = {
  full: 'XL · full (4/4 — ~880px)',
  half: 'L · half (1/2 — ~600px)',
  third: 'M · third (1/3 — ~400px)',
  quarter: 'S · quarter (1/4 — ~240px)',
};

const rows = mockSubscriptions as ISubscriptionRow[];

export function SandboxApp(): ReactElement {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [viewSize, setViewSize] = useState<TViewSizeMode>('full');
  const [dataMode, setDataMode] = useState<TDataStateMode>('ready');

  const [description, setDescription] = useState('Subscription Usage');
  const [subtitle, setSubtitle] = useState('Enigma · subscription-list');
  const [period, setPeriod] = useState('2026-10');
  const [customerId, setCustomerId] = useState<number | 'all'>('all');
  const [technologyIds, setTechnologyIds] = useState<number[]>([]);
  const [onlyActive, setOnlyActive] = useState(true);
  const [limitTypes, setLimitTypes] = useState<TLimitType[]>([
    'data',
    'voice',
    'money',
  ]);
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [criticalThreshold, setCriticalThreshold] = useState(100);
  const [statusFilter, setStatusFilter] = useState<TStatusFilter>('all');
  const [rowLimit, setRowLimit] = useState<TWidgetRowLimit>(10);
  const [showSummary, setShowSummary] = useState(true);
  const [showDetails, setShowDetails] = useState(true);
  const [sortBy, setSortBy] = useState<TSortMode>('usage_desc');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const customers = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      map.set(r.customer_id, r.customer_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const technologies = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      map.set(r.technology_id, r.technology_name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const dataEnvelope = useMemo<ICollectionDataResult<ISubscriptionRow>>(() => {
    switch (dataMode) {
      case 'loading':
        return {
          items: [],
          loading: true,
          loaded: false,
          error: null,
          stale: false,
          lastSuccessAt: null,
        };
      case 'refreshing':
        return {
          items: rows,
          loading: true,
          loaded: true,
          error: null,
          stale: false,
          lastSuccessAt: '2026-10-24T10:15:00Z',
        };
      case 'stale':
        return {
          items: rows,
          loading: false,
          loaded: true,
          error: null,
          stale: true,
          lastSuccessAt: '2026-10-24T08:40:00Z',
        };
      case 'empty':
        return {
          items: [],
          loading: false,
          loaded: true,
          error: null,
          stale: false,
          lastSuccessAt: '2026-10-24T10:15:00Z',
        };
      case 'error':
        return {
          items: [],
          loading: false,
          loaded: false,
          error:
            'Enigma API request timed out after 15000 ms for /api/Subscription/bysky/query',
          stale: false,
          lastSuccessAt: null,
        };
      default:
        return {
          items: rows,
          loading: false,
          loaded: true,
          error: null,
          stale: false,
          lastSuccessAt: '2026-10-24T10:15:00Z',
        };
    }
  }, [dataMode]);

  const rawParams = useMemo<Record<string, unknown>>(
    () => ({
      description,
      subtitle,
      size: viewSize === 'all' ? 'full' : viewSize,
      period,
      customerId,
      technologyIds,
      onlyActive,
      limitTypes,
      warningThreshold,
      criticalThreshold,
      statusFilter,
      rowLimit,
      showSummary,
      showDetails,
      sortBy,
    }),
    [
      description,
      subtitle,
      viewSize,
      period,
      customerId,
      technologyIds,
      onlyActive,
      limitTypes,
      warningThreshold,
      criticalThreshold,
      statusFilter,
      rowLimit,
      showSummary,
      showDetails,
      sortBy,
    ],
  );

  const toggleTechnology = (techId: number) => {
    setTechnologyIds((prev) =>
      prev.includes(techId)
        ? prev.filter((id) => id !== techId)
        : [...prev, techId],
    );
  };

  const toggleLimitType = (lt: TLimitType) => {
    setLimitTypes((prev) =>
      prev.includes(lt) ? prev.filter((x) => x !== lt) : [...prev, lt],
    );
  };

  const resetParams = () => {
    setDescription('Subscription Usage');
    setSubtitle('Enigma · subscription-list');
    setPeriod('2026-10');
    setCustomerId('all');
    setTechnologyIds([]);
    setOnlyActive(true);
    setLimitTypes(['data', 'voice', 'money']);
    setWarningThreshold(80);
    setCriticalThreshold(100);
    setStatusFilter('all');
    setRowLimit(10);
    setShowSummary(true);
    setShowDetails(true);
    setSortBy('usage_desc');
  };

  return (
    <div className="sandbox-shell">
      <header className="sandbox-topbar">
        <div className="sandbox-brand">
          <span className="sandbox-brand__badge">INTERA</span>
          <span>Task 1 — Subscription Usage Widget</span>
        </div>

        <div className="sandbox-toolbar">
          <div className="sandbox-toolbar__group">
            <span className="sandbox-toolbar__label">Размер:</span>
            <div className="sandbox-seg">
              {(['full', 'half', 'third', 'quarter', 'all'] as const).map(
                (sz) => (
                  <button
                    key={sz}
                    type="button"
                    className={`sandbox-seg__btn ${viewSize === sz ? 'sandbox-seg__btn--active' : ''}`}
                    onClick={() => setViewSize(sz)}
                  >
                    {sz === 'all' ? 'Все 4' : sz}
                  </button>
                ),
              )}
            </div>
          </div>

          <div className="sandbox-toolbar__group">
            <span className="sandbox-toolbar__label">Состояние:</span>
            <div className="sandbox-seg">
              {(
                [
                  'ready',
                  'stale',
                  'refreshing',
                  'loading',
                  'empty',
                  'error',
                ] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`sandbox-seg__btn ${dataMode === st ? 'sandbox-seg__btn--active' : ''}`}
                  onClick={() => setDataMode(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="sandbox-toolbar__group">
            <span className="sandbox-toolbar__label">Тема:</span>
            <div className="sandbox-seg">
              {(['light', 'dark'] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  className={`sandbox-seg__btn ${theme === th ? 'sandbox-seg__btn--active' : ''}`}
                  onClick={() => setTheme(th)}
                >
                  {th}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="sandbox-body">
        <section className="sandbox-stage">
          {viewSize === 'all' ? (
            <div className="sandbox-all-grid">
              <div className="sandbox-frame--full">
                <div className="sandbox-slot-label">{SIZE_LABELS.full}</div>
                <SubscriptionUsageWidget
                  params={{ ...rawParams, size: 'full' }}
                  data={dataEnvelope}
                  size="full"
                />
              </div>
              <div className="sandbox-all-grid__bottom">
                {(['half', 'third', 'quarter'] as const).map((sz) => (
                  <div key={sz} className={`sandbox-frame--${sz}`}>
                    <div className="sandbox-slot-label">{SIZE_LABELS[sz]}</div>
                    <SubscriptionUsageWidget
                      params={{ ...rawParams, size: sz }}
                      data={dataEnvelope}
                      size={sz}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`sandbox-frame--${viewSize}`}>
              <div className="sandbox-slot-label">{SIZE_LABELS[viewSize]}</div>
              <SubscriptionUsageWidget
                params={rawParams}
                data={dataEnvelope}
                size={viewSize}
              />
            </div>
          )}
        </section>

        <aside className="sandbox-panel">
          <h3 className="sandbox-panel__title">Параметры виджета (params)</h3>

          <label className="sandbox-field">
            <span className="sandbox-field__label">Заголовок (description)</span>
            <input
              className="sandbox-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="sandbox-row-2">
            <label className="sandbox-field">
              <span className="sandbox-field__label">Период (period)</span>
              <select
                className="sandbox-select"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="all">all (все периоды)</option>
                <option value="2026-10">2026-10 (Октябрь)</option>
                <option value="2026-09">2026-09 (Сентябрь)</option>
              </select>
            </label>

            <label className="sandbox-field">
              <span className="sandbox-field__label">Клиент (customerId)</span>
              <select
                className="sandbox-select"
                value={String(customerId)}
                onChange={(e) =>
                  setCustomerId(
                    e.target.value === 'all' ? 'all' : Number(e.target.value),
                  )
                }
              >
                <option value="all">all (все)</option>
                {customers.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} (#{id})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="sandbox-field">
            <span className="sandbox-field__label">
              Технологии (technologyIds — пусто = все)
            </span>
            <div className="sandbox-checks">
              {technologies.map(([id, name]) => (
                <label key={id} className="sandbox-check">
                  <input
                    type="checkbox"
                    checked={technologyIds.includes(id)}
                    onChange={() => toggleTechnology(id)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="sandbox-field">
            <span className="sandbox-field__label">Типы лимитов (limitTypes)</span>
            <div className="sandbox-checks">
              {LIMIT_TYPES.map((lt) => (
                <label key={lt} className="sandbox-check">
                  <input
                    type="checkbox"
                    checked={limitTypes.includes(lt)}
                    onChange={() => toggleLimitType(lt)}
                  />
                  <span>{lt}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="sandbox-row-2">
            <label className="sandbox-field">
              <span className="sandbox-field__label">
                Warning % ({warningThreshold}%)
              </span>
              <input
                type="number"
                className="sandbox-input"
                min={1}
                max={500}
                value={warningThreshold}
                onChange={(e) => setWarningThreshold(Number(e.target.value))}
              />
            </label>

            <label className="sandbox-field">
              <span className="sandbox-field__label">
                Critical % ({criticalThreshold}%)
              </span>
              <input
                type="number"
                className="sandbox-input"
                min={1}
                max={500}
                value={criticalThreshold}
                onChange={(e) => setCriticalThreshold(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="sandbox-row-2">
            <label className="sandbox-field">
              <span className="sandbox-field__label">Статус (statusFilter)</span>
              <select
                className="sandbox-select"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as TStatusFilter)
                }
              >
                {STATUS_FILTERS.map((sf) => (
                  <option key={sf} value={sf}>
                    {sf}
                  </option>
                ))}
              </select>
            </label>

            <label className="sandbox-field">
              <span className="sandbox-field__label">Сортировка (sortBy)</span>
              <select
                className="sandbox-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as TSortMode)}
              >
                {SORT_MODES.map((sm) => (
                  <option key={sm} value={sm}>
                    {sm}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="sandbox-row-2">
            <label className="sandbox-field">
              <span className="sandbox-field__label">Лимит строк (rowLimit)</span>
              <select
                className="sandbox-select"
                value={rowLimit}
                onChange={(e) =>
                  setRowLimit(Number(e.target.value) as TWidgetRowLimit)
                }
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="sandbox-field">
              <span className="sandbox-field__label">Опции</span>
              <div className="sandbox-checks">
                <label className="sandbox-check">
                  <input
                    type="checkbox"
                    checked={onlyActive}
                    onChange={(e) => setOnlyActive(e.target.checked)}
                  />
                  <span>onlyActive</span>
                </label>
                <label className="sandbox-check">
                  <input
                    type="checkbox"
                    checked={showSummary}
                    onChange={(e) => setShowSummary(e.target.checked)}
                  />
                  <span>showSummary</span>
                </label>
                <label className="sandbox-check">
                  <input
                    type="checkbox"
                    checked={showDetails}
                    onChange={(e) => setShowDetails(e.target.checked)}
                  />
                  <span>showDetails</span>
                </label>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="sandbox-reset-btn"
            onClick={resetParams}
          >
            Сбросить параметры по умолчанию
          </button>
        </aside>
      </main>
    </div>
  );
}
