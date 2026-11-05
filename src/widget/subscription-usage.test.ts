import { describe, expect, it } from 'vitest';
import mockData from '../data/mock-subscriptions.json';
import type { ISubscriptionRow } from '../types/subscription-list';
import { computeSubscriptionUsage } from './subscription-usage-compute';
import { parseSubscriptionUsageParams } from './subscription-usage-params';

const rows = mockData as ISubscriptionRow[];

describe('parseSubscriptionUsageParams', () => {
  it('returns default config when params are undefined', () => {
    const config = parseSubscriptionUsageParams(undefined);
    expect(config.description).toBe('Subscription Usage');
    expect(config.warningThreshold).toBe(80);
    expect(config.criticalThreshold).toBe(100);
    expect(config.rowLimit).toBe(10);
    expect(config.onlyActive).toBe(true);
    expect(config.limitTypes).toEqual(['data', 'voice', 'money']);
  });

  it('resets thresholds to 80/100 when warningThreshold >= criticalThreshold', () => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: 120,
      criticalThreshold: 90,
    });
    expect(config.warningThreshold).toBe(80);
    expect(config.criticalThreshold).toBe(100);
  });
});

describe('computeSubscriptionUsage', () => {
  it('excludes inactive subscriptions by default (onlyActive = true)', () => {
    const config = parseSubscriptionUsageParams({ period: 'all' });
    const result = computeSubscriptionUsage(rows, config);
    // 20 rows total in mock-subscriptions.json, 1 has subscription_active = 0
    expect(result.summary.total).toBe(19);
  });

  it('prioritizes GB over MB when allowance_gb > 0 and does not double-count', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(rows, config);
    const sub1020 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1020,
    );
    expect(sub1020).toBeDefined();
    expect(sub1020?.limits.data.unit).toBe('GB');
    expect(sub1020?.limits.data.allowance).toBe(500);
    expect(sub1020?.limits.data.used).toBe(440);
    expect(sub1020?.limits.data.usagePercent).toBeCloseTo(88, 2);
  });

  it('marks missing usage (used = null) as no_data instead of 0%', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(rows, config);
    const sub1018 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1018,
    );
    expect(sub1018).toBeDefined();
    expect(sub1018?.limits.data.status).toBe('no_data');
    expect(sub1018?.limits.data.usagePercent).toBeNull();
    expect(sub1018?.overallStatus).toBe('no_data');
  });
});
