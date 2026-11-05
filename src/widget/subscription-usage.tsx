import { useMemo, type ReactElement } from 'react';
import { FreshnessMark } from '../platform/freshness-mark';
import { WidgetHeader } from '../platform/widget-card';
import { widgetCardClass } from '../platform/widget-card-class';
import type { ICollectionDataResult, TWidgetSize } from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import { computeSubscriptionUsage } from './subscription-usage-compute';
import { parseSubscriptionUsageParams } from './subscription-usage-params';
import './subscription-usage.css';

const CLASS = 'dash-subscription-usage';

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

  const result = useMemo(
    () => computeSubscriptionUsage(data.items, config),
    [data.items, config],
  );

  const header = (
    <WidgetHeader
      title={config.description}
      subtitle={config.subtitle}
      aside={
        data.loaded ? (
          <FreshnessMark
            source="rows"
            stale={data.stale}
            lastSuccessAt={data.lastSuccessAt}
            showLabel={effectiveSize === 'full' || effectiveSize === 'half'}
          />
        ) : null
      }
    />
  );

  return (
    <article
      className={`${CLASS} ${widgetCardClass()}`}
      data-size={effectiveSize}
    >
      {header}
      <div className={`${CLASS}__placeholder`}>
        <strong>TODO: Реализуйте SubscriptionUsageWidget</strong>
        <div>
          Размер: <code>{effectiveSize}</code> · Записей во входном источнике:{' '}
          <code>{data.items.length}</code> · Рассчитано в compute:{' '}
          <code>{result.summary.total}</code>
        </div>
      </div>
    </article>
  );
}
