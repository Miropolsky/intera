/**
 * Canonical schema for the `subscription-list` DataSource in `intera-enigma-integration`.
 *
 * Domain notes from `Intera.Enigma.Api` (`TrafficAllowanceSql.cs`):
 * 1. `subscription_active` (`PROD_SUBS.MODE`): `1` = enabled, `0` = disabled.
 *    When a terminal moves to another contract, the old subscription row is switched off (`0`)
 *    rather than date-closed, and its allowance columns come back as `null`.
 * 2. `allowance_mb` / `used_mb` and `allowance_gb` / `used_gb` represent the same underlying
 *    traffic allowance column in whichever unit the tariff is denominated in (GB for Starlink,
 *    `technology_id = 83`; MB for other technologies). Whichever pair has a positive allowance
 *    is the one that applies — never count both MB and GB for the same subscription.
 * 3. Unused limit dimensions are `0` or `-1` (Enigma sentinel for "no limit of this kind").
 * 4. Missing consumption (`used_* === null`) when `allowance_* > 0` means telemetry has not
 *    arrived yet ("No data"), NOT zero consumption.
 */

export interface ISubscriptionRow {
  subscription_id: number;
  customer_id: number;
  customer_code: string;
  customer_name: string;
  item_type: number;
  item_id: number;
  item_number: string;
  item_name: string;
  vessel_id: number | null;
  vessel_name: string | null;
  contract_id: number;
  contract_description: string;
  service_id: number;
  product_name: string;
  package_plan_id: number | null;
  package_plan_name: string | null;
  currency_id: number;
  currency_name: string;
  amount: number;
  rebate: number;
  date_start: string;
  date_end: string | null;
  subscription_active: number;
  subscription_active_name: string;
  technology_id: number;
  technology_name: string;
  terminal_status: number;
  terminal_status_name: string;
  comments: string | null;
  allowance_period: string | null;
  allowance_minutes: number | string | null;
  used_minutes: number | string | null;
  allowance_mb: number | string | null;
  used_mb: number | string | null;
  allowance_gb: number | string | null;
  used_gb: number | string | null;
  allowance_money: number | string | null;
  used_money: number | string | null;
}
