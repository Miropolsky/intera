import { describe, expect, it } from 'vitest';
import mockData from '../data/mock-subscriptions.json';
import type { ISubscriptionRow } from '../types/subscription-list';
import { computeSubscriptionUsage } from './subscription-usage-compute';
import { parseSubscriptionUsageParams } from './subscription-usage-params';

const rows = mockData as ISubscriptionRow[];

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
    allowance_mb: 0,
    used_mb: 0,
    allowance_gb: 0,
    used_gb: 0,
    allowance_money: 0,
    used_money: 0,
    ...overrides,
  };
}

describe('parseSubscriptionUsageParams', () => {
  it('returns default config when params are undefined', () => {
    const config = parseSubscriptionUsageParams(undefined);
    expect(config.description).toBe('Subscription Usage');
    expect(config.subtitle).toBe('');
    expect(config.size).toBe('full');
    expect(config.period).toBe('all');
    expect(config.customerId).toBe('all');
    expect(config.technologyIds).toEqual([]);
    expect(config.warningThreshold).toBe(80);
    expect(config.criticalThreshold).toBe(100);
    expect(config.rowLimit).toBe(10);
    expect(config.onlyActive).toBe(true);
    expect(config.limitTypes).toEqual(['data', 'voice', 'money']);
    expect(config.statusFilter).toBe('all');
    expect(config.showSummary).toBe(true);
    expect(config.showDetails).toBe(true);
    expect(config.sortBy).toBe('usage_desc');
  });

  it('resets thresholds to 80/100 when warningThreshold >= criticalThreshold', () => {
    const config = parseSubscriptionUsageParams({
      warningThreshold: 120,
      criticalThreshold: 90,
    });
    expect(config.warningThreshold).toBe(80);
    expect(config.criticalThreshold).toBe(100);
  });

  it('clamps thresholds and keeps them when warning stays below critical', () => {
    const clamped = parseSubscriptionUsageParams({
      warningThreshold: 0,
      criticalThreshold: 50,
    });
    expect(clamped.warningThreshold).toBe(1);
    expect(clamped.criticalThreshold).toBe(50);

    const overflow = parseSubscriptionUsageParams({
      warningThreshold: 600,
      criticalThreshold: 700,
    });
    expect(overflow.warningThreshold).toBe(80);
    expect(overflow.criticalThreshold).toBe(100);
  });

  it('reads description, title and subtitle defensively', () => {
    expect(
      parseSubscriptionUsageParams({ description: '  Fleet usage  ' }).description,
    ).toBe('Fleet usage');
    expect(
      parseSubscriptionUsageParams({ description: '   ', title: '  From title  ' })
        .description,
    ).toBe('From title');
    expect(parseSubscriptionUsageParams({ description: 12 }).description).toBe(
      'Subscription Usage',
    );
    expect(parseSubscriptionUsageParams({ subtitle: '  Enigma  ' }).subtitle).toBe(
      'Enigma',
    );
  });

  it('falls back on unknown enums and normalises a period prefix', () => {
    const config = parseSubscriptionUsageParams({
      size: 'widescreen',
      period: '2026-10-01',
      statusFilter: 'exploded',
      sortBy: 'revenue',
    });
    expect(config.size).toBe('full');
    expect(config.period).toBe('2026-10');
    expect(config.statusFilter).toBe('all');
    expect(config.sortBy).toBe('usage_desc');
    expect(parseSubscriptionUsageParams({ period: '2026-13' }).period).toBe('all');
    expect(parseSubscriptionUsageParams({ period: 'yesterday' }).period).toBe('all');
  });

  it('accepts a positive customer id and rejects zero, negative and junk', () => {
    expect(parseSubscriptionUsageParams({ customerId: 202 }).customerId).toBe(202);
    expect(parseSubscriptionUsageParams({ customerId: '214' }).customerId).toBe(214);
    expect(parseSubscriptionUsageParams({ customerId: 'all' }).customerId).toBe('all');
    expect(parseSubscriptionUsageParams({ customerId: 0 }).customerId).toBe('all');
    expect(parseSubscriptionUsageParams({ customerId: -3 }).customerId).toBe('all');
    expect(parseSubscriptionUsageParams({ customerId: '' }).customerId).toBe('all');
  });

  it('keeps finite technology ids in order and drops duplicates', () => {
    expect(
      parseSubscriptionUsageParams({
        technologyIds: ['83', 83, Number.POSITIVE_INFINITY, 'x', 12, 12],
      }).technologyIds,
    ).toEqual([83, 12]);
    expect(parseSubscriptionUsageParams({ technologyIds: '83' }).technologyIds).toEqual(
      [],
    );
  });

  it('keeps a unique ordered subset of limit types and restores the default when none are valid', () => {
    expect(
      parseSubscriptionUsageParams({
        limitTypes: ['money', 'nope', 'money', 'data'],
      }).limitTypes,
    ).toEqual(['money', 'data']);
    expect(parseSubscriptionUsageParams({ limitTypes: [] }).limitTypes).toEqual([
      'data',
      'voice',
      'money',
    ]);
    expect(parseSubscriptionUsageParams({ limitTypes: 'data' }).limitTypes).toEqual([
      'data',
      'voice',
      'money',
    ]);
  });

  it('reads rowLimit and the legacy maxRows alias, including numeric strings', () => {
    expect(parseSubscriptionUsageParams({ rowLimit: '25' }).rowLimit).toBe(25);
    expect(parseSubscriptionUsageParams({ rowLimit: 7, maxRows: 50 }).rowLimit).toBe(
      50,
    );
    expect(parseSubscriptionUsageParams({ rowLimit: 'lots' }).rowLimit).toBe(10);
  });

  it('does not coerce non-booleans into flags', () => {
    const config = parseSubscriptionUsageParams({
      onlyActive: 'false',
      showSummary: false,
      showDetails: 0,
    });
    expect(config.onlyActive).toBe(true);
    expect(config.showSummary).toBe(false);
    expect(config.showDetails).toBe(true);
  });
});

describe('computeSubscriptionUsage', () => {
  it('excludes inactive subscriptions by default (onlyActive = true)', () => {
    const config = parseSubscriptionUsageParams({ period: 'all' });
    const result = computeSubscriptionUsage(rows, config);
    // Fixture has 22 rows; subscription 1044 is the only inactive contract row.
    expect(result.summary.total).toBe(21);
    expect(
      result.filteredItems.some((item) => item.row.subscription_id === 1044),
    ).toBe(false);
  });

  it('includes the inactive row when onlyActive is turned off', () => {
    const config = parseSubscriptionUsageParams({ period: 'all', onlyActive: false });
    const result = computeSubscriptionUsage(rows, config);
    const inactive = result.filteredItems.find(
      (item) => item.row.subscription_id === 1044,
    );
    expect(result.summary.total).toBe(22);
    expect(inactive?.overallStatus).toBe('no_limit');
    expect(inactive?.limits.data.usagePercent).toBeNull();
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
    expect(sub1020?.limits.voice.status).toBe('no_limit');
    expect(sub1020?.limits.voice.usagePercent).toBeNull();
  });

  it('selects GB when both allowances are empty but used_gb is positive', () => {
    const config = parseSubscriptionUsageParams({});
    const result = computeSubscriptionUsage(
      [
        row({
          subscription_id: 1,
          allowance_gb: 0,
          used_gb: 12,
          allowance_mb: null,
          used_mb: 4000,
        }),
      ],
      config,
    );
    expect(result.filteredItems[0]?.limits.data.unit).toBe('GB');
    expect(result.filteredItems[0]?.limits.data.status).toBe('no_limit');
    expect(result.filteredItems[0]?.limits.data.used).toBe(12);
  });

  it('keeps MB when a positive MB allowance exists beside a zero GB allowance', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(rows, config);
    const sub1004 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1004,
    );
    expect(sub1004?.limits.data.unit).toBe('MB');
    expect(sub1004?.limits.data.used).toBe(420);
    expect(sub1004?.limits.data.allowance).toBe(500);
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
    expect(sub1018?.limits.voice.status).toBe('no_data');
    expect(sub1018?.limits.money.status).toBe('no_data');
    expect(sub1018?.overallStatus).toBe('no_data');
    expect(sub1018?.maxUsagePercent).toBeNull();
  });

  it('treats Enigma sentinel allowance -1 and non-positive allowances as no_limit', () => {
    const config = parseSubscriptionUsageParams({
      limitTypes: ['data', 'voice', 'money'],
    });
    const result = computeSubscriptionUsage(
      [
        row({
          subscription_id: 51,
          allowance_mb: -1,
          used_mb: 40,
          allowance_minutes: -1,
          used_minutes: 12,
          allowance_money: 0,
          used_money: 5,
        }),
      ],
      config,
    );
    const item = result.filteredItems[0];
    expect(item?.limits.data.status).toBe('no_limit');
    expect(item?.limits.data.usagePercent).toBeNull();
    expect(item?.limits.voice.status).toBe('no_limit');
    expect(item?.limits.money.status).toBe('no_limit');
    expect(item?.overallStatus).toBe('no_limit');
  });

  it('marks negative used as no_data when a positive allowance exists', () => {
    const config = parseSubscriptionUsageParams({ limitTypes: ['data'] });
    const result = computeSubscriptionUsage(
      [
        row({
          subscription_id: 52,
          allowance_mb: 100,
          used_mb: -3,
        }),
      ],
      config,
    );
    const item = result.filteredItems[0];
    expect(item?.limits.data.status).toBe('no_data');
    expect(item?.limits.data.used).toBeNull();
    expect(item?.limits.data.usagePercent).toBeNull();
    expect(item?.overallStatus).toBe('no_data');
    expect(item?.maxUsagePercent).toBeNull();
  });

  it('resolves overallStatus by severity critical > warning > normal > no_data > no_limit', () => {
    const config = parseSubscriptionUsageParams({});
    const ladder = [
      {
        id: 61,
        expected: 'critical' as const,
        patch: {
          allowance_mb: 100,
          used_mb: 120,
          allowance_minutes: 100,
          used_minutes: 85,
          allowance_money: 100,
          used_money: 10,
        },
      },
      {
        id: 62,
        expected: 'warning' as const,
        patch: {
          allowance_mb: 100,
          used_mb: 85,
          allowance_minutes: 100,
          used_minutes: 10,
          allowance_money: null,
          used_money: null,
        },
      },
      {
        id: 63,
        expected: 'normal' as const,
        patch: {
          allowance_mb: 100,
          used_mb: 10,
          allowance_minutes: null,
          used_minutes: null,
          allowance_money: 100,
          used_money: null,
        },
      },
      {
        id: 64,
        expected: 'no_data' as const,
        patch: {
          allowance_mb: 100,
          used_mb: null,
          allowance_minutes: -1,
          used_minutes: 0,
          allowance_money: 0,
          used_money: 0,
        },
      },
      {
        id: 65,
        expected: 'no_limit' as const,
        patch: {
          allowance_mb: -1,
          used_mb: 9,
          allowance_minutes: 0,
          used_minutes: 0,
          allowance_money: null,
          used_money: null,
        },
      },
    ];

    for (const caseRow of ladder) {
      const result = computeSubscriptionUsage(
        [row({ subscription_id: caseRow.id, ...caseRow.patch })],
        config,
      );
      expect(result.filteredItems[0]?.overallStatus).toBe(caseRow.expected);
    }
  });

  it('matches period by YYYY-MM prefix without Date timezone shifts', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(
      [
        row({
          subscription_id: 71,
          allowance_period: '2026-10-01',
          allowance_mb: 100,
          used_mb: 10,
        }),
        row({
          subscription_id: 72,
          allowance_period: '2026-09-30',
          allowance_mb: 100,
          used_mb: 10,
        }),
      ],
      config,
    );
    expect(result.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      71,
    ]);
    expect(result.availablePeriods).toEqual(['2026-10', '2026-09']);
  });

  it('does not turn blank strings into zero usage', () => {
    const config = parseSubscriptionUsageParams({});
    const result = computeSubscriptionUsage(
      [
        row({
          subscription_id: 2,
          allowance_mb: '',
          used_mb: '',
          allowance_minutes: 100,
          used_minutes: '',
        }),
      ],
      config,
    );
    const item = result.filteredItems[0];
    expect(item?.limits.data.status).toBe('no_limit');
    expect(item?.limits.voice.status).toBe('no_data');
    expect(item?.limits.voice.usagePercent).toBeNull();
  });

  it('parses numeric strings and classifies exact threshold boundaries', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(rows, config);
    const sub1024 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1024,
    );
    const sub1008 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1008,
    );
    const sub1010 = result.filteredItems.find(
      (item) => item.row.subscription_id === 1010,
    );

    expect(sub1024?.limits.data.used).toBe(25800);
    expect(sub1024?.limits.data.usagePercent).toBeCloseTo(86, 2);
    expect(sub1024?.limits.money.usagePercent).toBeCloseTo(94, 2);
    expect(sub1024?.overallStatus).toBe('warning');

    expect(sub1008?.limits.data.usagePercent).toBeCloseTo(100, 2);
    expect(sub1008?.limits.data.status).toBe('critical');
    expect(sub1008?.primaryLimit.type).toBe('data');

    expect(sub1010?.limits.data.usagePercent).toBeCloseTo(80, 2);
    expect(sub1010?.limits.data.status).toBe('warning');
    expect(sub1010?.overallStatus).toBe('warning');
  });

  it('picks the worst enabled dimension and ignores dimensions outside limitTypes', () => {
    const config = parseSubscriptionUsageParams({
      period: '2026-10',
      limitTypes: ['voice'],
    });
    const result = computeSubscriptionUsage(rows, config);
    const moneyCritical = result.filteredItems.find(
      (item) => item.row.subscription_id === 1026,
    );
    const voiceCritical = result.filteredItems.find(
      (item) => item.row.subscription_id === 1004,
    );
    const dataOnly = result.filteredItems.find(
      (item) => item.row.subscription_id === 1002,
    );

    expect(moneyCritical?.limits.money.status).toBe('critical');
    expect(moneyCritical?.overallStatus).toBe('normal');
    expect(moneyCritical?.maxUsagePercent).toBeCloseTo(62, 2);
    expect(voiceCritical?.overallStatus).toBe('critical');
    expect(voiceCritical?.primaryLimit.type).toBe('voice');
    expect(voiceCritical?.maxUsagePercent).toBeCloseTo(135, 2);
    expect(dataOnly?.overallStatus).toBe('no_limit');
    expect(result.summary.byLimitType.data).toEqual({
      withLimit: 0,
      warning: 0,
      critical: 0,
      noData: 0,
    });
    expect(result.summary.byLimitType.voice.critical).toBe(1);
  });

  it('aggregates October counts without summing currencies or units', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const result = computeSubscriptionUsage(rows, config);

    expect(result.summary).toMatchObject({
      total: 18,
      normal: 5,
      warning: 6,
      critical: 5,
      noData: 1,
      noLimit: 1,
    });
    expect(result.summary.byLimitType.data).toEqual({
      withLimit: 17,
      warning: 6,
      critical: 3,
      noData: 1,
    });
    expect(result.summary.byLimitType.voice).toEqual({
      withLimit: 11,
      warning: 2,
      critical: 1,
      noData: 1,
    });
    expect(result.summary.byLimitType.money).toEqual({
      withLimit: 15,
      warning: 5,
      critical: 3,
      noData: 1,
    });
    expect(result.availablePeriods).toEqual(['2026-10', '2026-09']);
  });

  it('sorts by usage with null percents last and subscription_id as the tie break', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const desc = computeSubscriptionUsage(rows, config);
    expect(desc.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      1004, 1034, 1026, 1014, 1008, 1024, 1030, 1016, 1002, 1020, 1010, 1006, 1032,
      1028, 1012, 1036, 1018, 1022,
    ]);

    const asc = computeSubscriptionUsage(rows, {
      ...config,
      sortBy: 'usage_asc',
    });
    expect(asc.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      1036, 1012, 1028, 1032, 1006, 1010, 1002, 1020, 1016, 1024, 1030, 1008, 1014,
      1026, 1034, 1004, 1018, 1022,
    ]);
    expect(desc.visibleItems).toHaveLength(10);
    expect(desc.scopedItems).toHaveLength(18);
  });

  it('applies customer, technology and period filters', () => {
    const config = parseSubscriptionUsageParams({
      period: '2026-09',
      customerId: 204,
      technologyIds: [12],
    });
    const result = computeSubscriptionUsage(rows, config);
    expect(result.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      1040,
    ]);
  });

  it('keeps summary stable when statusFilter, search and rowLimit change the list', () => {
    const config = parseSubscriptionUsageParams({
      period: '2026-10',
      statusFilter: 'critical',
      rowLimit: 10,
    });
    const result = computeSubscriptionUsage(rows, config, {
      searchQuery: '  Корсаков ',
    });

    expect(result.summary.total).toBe(18);
    expect(result.summary.critical).toBe(5);
    expect(result.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      1034,
    ]);
    expect(result.scopedItems).toHaveLength(18);
  });

  it('searches customer, vessel, terminal and product, not technology alone', () => {
    const config = parseSubscriptionUsageParams({ period: '2026-10' });
    const byVessel = computeSubscriptionUsage(rows, config, {
      searchQuery: 'ocean star',
    });
    expect(byVessel.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      1004,
    ]);

    const synthetic = computeSubscriptionUsage(
      [
        row({
          subscription_id: 7,
          customer_name: 'Alpha',
          vessel_name: 'Beta',
          item_number: 'N-1',
          item_name: 'Dome',
          product_name: 'Priority',
          technology_name: 'UniqueTechOnly',
        }),
      ],
      config,
      { searchQuery: 'uniquetechonly' },
    );
    expect(synthetic.filteredItems).toHaveLength(0);
    expect(synthetic.summary.total).toBe(1);
  });

  it('sorts equal customer names by subscription id', () => {
    const config = parseSubscriptionUsageParams({ sortBy: 'customer_name' });
    const result = computeSubscriptionUsage(
      [
        row({ subscription_id: 30, customer_name: 'Арктик' }),
        row({ subscription_id: 10, customer_name: 'Арктик' }),
        row({ subscription_id: 20, customer_name: 'Балтика' }),
      ],
      config,
    );
    expect(result.filteredItems.map((item) => item.row.subscription_id)).toEqual([
      10, 30, 20,
    ]);
  });
});
