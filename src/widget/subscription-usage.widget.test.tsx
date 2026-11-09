// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { ICollectionDataResult } from '../platform/widget-types';
import type { ISubscriptionRow } from '../types/subscription-list';
import { SubscriptionUsageWidget } from './subscription-usage';

function row(
  overrides: Partial<ISubscriptionRow> & Pick<ISubscriptionRow, 'subscription_id'>,
): ISubscriptionRow {
  return {
    customer_id: 1,
    customer_code: 'C',
    customer_name: 'Customer',
    item_type: 0,
    item_id: 1,
    item_number: 'T-1',
    item_name: 'Terminal',
    vessel_id: 1,
    vessel_name: 'Vessel',
    contract_id: 1,
    contract_description: 'Contract',
    service_id: 1,
    product_name: 'Product',
    package_plan_id: 1,
    package_plan_name: 'Plan',
    currency_id: 840,
    currency_name: 'USD',
    amount: 0,
    rebate: 0,
    date_start: '2026-01-01',
    date_end: null,
    subscription_active: 1,
    subscription_active_name: 'Active',
    technology_id: 1,
    technology_name: 'Tech',
    terminal_status: 1,
    terminal_status_name: 'Active',
    comments: null,
    allowance_period: '2026-10-01',
    allowance_minutes: 0,
    used_minutes: 0,
    allowance_mb: 100,
    used_mb: 10,
    allowance_gb: 0,
    used_gb: 0,
    allowance_money: 0,
    used_money: 0,
    ...overrides,
  };
}

function envelope(
  patch: Partial<ICollectionDataResult<ISubscriptionRow>> = {},
): ICollectionDataResult<ISubscriptionRow> {
  return {
    items: patch.items ?? [row({ subscription_id: 1, customer_name: 'Альфа' })],
    loading: patch.loading ?? false,
    loaded: patch.loaded ?? true,
    error: patch.error ?? null,
    stale: patch.stale ?? false,
    lastSuccessAt: patch.lastSuccessAt ?? '2026-10-24T10:15:00Z',
  };
}

const mounted: Array<{ root: Root; host: HTMLDivElement }> = [];

function render(ui: ReactElement): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, host });
  return host;
}

function rerender(host: HTMLDivElement, ui: ReactElement): void {
  const entry = mounted.find((item) => item.host === host);
  if (!entry) {
    throw new Error('host is not mounted');
  }
  act(() => {
    entry.root.render(ui);
  });
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => {
      entry.root.unmount();
    });
    entry.host.remove();
  }
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('SubscriptionUsageWidget states', () => {
  it('shows a skeleton on the first load and does not claim there are no subscriptions', () => {
    const host = render(
      <SubscriptionUsageWidget
        data={envelope({ items: [], loading: true, loaded: false, lastSuccessAt: null })}
      />,
    );
    expect(host.querySelector('[aria-label="Загрузка подписок"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Нет подписок');
  });

  it('shows the error text when the first load fails, even if loading is still set', () => {
    const host = render(
      <SubscriptionUsageWidget
        data={envelope({
          items: [],
          loading: true,
          loaded: false,
          error: 'Enigma API request timed out',
          lastSuccessAt: null,
        })}
      />,
    );
    expect(host.textContent).toContain('Enigma API request timed out');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Загрузка подписок"]')).toBeNull();
  });

  it('keeps the typed search while a loaded collection refreshes', () => {
    const data = envelope();
    const host = render(
      <SubscriptionUsageWidget params={{ size: 'full' }} data={data} />,
    );
    const input = host.querySelector('input[type="search"]');
    expect(input).toBeInstanceOf(HTMLInputElement);
    setInputValue(input as HTMLInputElement, 'Альфа');
    rerender(
      host,
      <SubscriptionUsageWidget
        params={{ size: 'full' }}
        data={envelope({ loading: true, loaded: true })}
      />,
    );
    const again = host.querySelector('input[type="search"]');
    expect(again).toBeInstanceOf(HTMLInputElement);
    expect((again as HTMLInputElement).value).toBe('Альфа');
    expect(host.textContent).toContain('Обновление');
    expect(host.querySelector('[aria-label="Загрузка подписок"]')).toBeNull();
  });

  it('marks stale data and shows an empty result without a skeleton', () => {
    const stale = render(
      <SubscriptionUsageWidget data={envelope({ stale: true })} />,
    );
    expect(stale.textContent).toContain('Stale');

    const empty = render(
      <SubscriptionUsageWidget
        data={envelope({ items: [], loaded: true, loading: false })}
      />,
    );
    expect(empty.textContent).toContain('Нет подписок');
    expect(empty.querySelector('[aria-label="Загрузка подписок"]')).toBeNull();
  });

  it('renders the four INTERA sizes', () => {
    const data = envelope();
    const full = render(
      <SubscriptionUsageWidget params={{ size: 'full' }} data={data} />,
    );
    expect(full.querySelector('[data-size="full"]')).not.toBeNull();
    expect(full.querySelector('input[type="search"]')).not.toBeNull();
    expect(full.querySelector('table')).not.toBeNull();

    const half = render(
      <SubscriptionUsageWidget params={{ size: 'half' }} data={data} />,
    );
    expect(half.textContent).toContain('Топ превышений');
    expect(half.textContent).toContain('Открыть полный список (1)');

    const third = render(
      <SubscriptionUsageWidget params={{ size: 'third' }} data={data} />,
    );
    expect(third.querySelector('[data-size="third"] svg')).not.toBeNull();
    expect(third.textContent).toContain('Список подписок');

    const quarter = render(
      <SubscriptionUsageWidget params={{ size: 'quarter' }} data={data} />,
    );
    expect(quarter.textContent).toContain('подписок');
    expect(quarter.textContent).toContain('Детали');
  });

  it('filters the half list and names the filter on the compact sizes without changing the summary total', () => {
    const items = [
      row({
        subscription_id: 1,
        customer_name: 'Ровный',
        allowance_mb: 100,
        used_mb: 10,
      }),
      row({
        subscription_id: 2,
        customer_name: 'Перерасход',
        allowance_mb: 100,
        used_mb: 150,
      }),
    ];
    const data = envelope({ items });
    const half = render(
      <SubscriptionUsageWidget
        params={{ size: 'half', statusFilter: 'critical' }}
        data={data}
      />,
    );
    expect(half.textContent).toContain('Перерасход');
    expect(half.textContent).not.toContain('Ровный');
    expect(half.textContent).toContain('Фильтр: Critical · 1 из 2');
    expect(half.textContent).toContain('Открыть список (1 из 2)');
    expect(half.querySelector('[data-overflow="true"]')).not.toBeNull();

    const clear = Array.from(half.querySelectorAll('button')).find(
      (button) => button.textContent === 'Сбросить',
    );
    expect(clear).toBeDefined();
    act(() => {
      clear?.click();
    });
    expect(half.textContent).toContain('Ровный');
    expect(half.textContent).toContain('Перерасход');
    expect(half.textContent).not.toContain('Фильтр:');
    expect(half.textContent).toContain('Открыть полный список (2)');

    const quarter = render(
      <SubscriptionUsageWidget
        params={{ size: 'quarter', statusFilter: 'critical' }}
        data={data}
      />,
    );
    expect(quarter.querySelector('.dash-subscription-usage__hero-value')?.textContent).toBe(
      '2',
    );
    expect(quarter.textContent).toContain('Фильтр: Critical · 1 из 2');
  });

  it('closes the details dialog when the collection unloads or the scope becomes empty', () => {
    const host = render(
      <SubscriptionUsageWidget
        params={{ size: 'quarter' }}
        data={envelope()}
      />,
    );
    const open = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Детали',
    );
    act(() => {
      open?.click();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    rerender(
      host,
      <SubscriptionUsageWidget
        params={{ size: 'quarter' }}
        data={envelope({
          items: [],
          loading: true,
          loaded: false,
          lastSuccessAt: null,
        })}
      />,
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    rerender(
      host,
      <SubscriptionUsageWidget
        params={{ size: 'quarter' }}
        data={envelope()}
      />,
    );
    const openAgain = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Детали',
    );
    act(() => {
      openAgain?.click();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    rerender(
      host,
      <SubscriptionUsageWidget
        params={{ size: 'quarter', onlyActive: true }}
        data={envelope({
          items: [
            row({
              subscription_id: 9,
              subscription_active: 0,
              allowance_mb: 0,
              used_mb: 0,
            }),
          ],
        })}
      />,
    );
    expect(host.textContent).toContain('Нет подписок');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('paints an exact 100% bar as full and an over-limit bar as overflow', () => {
    const exact = render(
      <SubscriptionUsageWidget
        params={{ size: 'full', limitTypes: ['data'] }}
        data={envelope({
          items: [row({ subscription_id: 3, allowance_mb: 100, used_mb: 100 })],
        })}
      />,
    );
    expect(exact.querySelector('[data-overflow="true"]')).toBeNull();
    expect(exact.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('100');

    const over = render(
      <SubscriptionUsageWidget
        params={{ size: 'full', limitTypes: ['data'] }}
        data={envelope({
          items: [row({ subscription_id: 4, allowance_mb: 100, used_mb: 135 })],
        })}
      />,
    );
    const meter = over.querySelector('[role="meter"]');
    expect(meter?.getAttribute('aria-valuenow')).toBe('135');
    expect(meter?.getAttribute('aria-label')).toContain('выше лимита');
    expect(over.querySelector('.dash-subscription-usage__meter-fill--overflow')).not.toBeNull();
  });

  it('keeps Tab inside the details dialog', () => {
    const host = render(
      <SubscriptionUsageWidget
        params={{ size: 'quarter', showDetails: false }}
        data={envelope()}
      />,
    );
    const open = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Детали',
    );
    expect(open).toBeDefined();
    act(() => {
      open?.click();
    });
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).toBeInstanceOf(HTMLElement);
    const focusable = Array.from(
      (dialog as HTMLElement).querySelectorAll<HTMLElement>(
        'button, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.tabIndex >= 0);
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    expect(document.activeElement).toBe(first);

    act(() => {
      last.focus();
      last.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      );
    });
    expect(document.activeElement).toBe(first);

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(last);
  });
});
