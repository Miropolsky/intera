# Тестовое задание №1 — Subscription Usage Widget

**Проект:** INTERA Core  
**Стек:** React 19, TypeScript 5, Vite, Vitest

![Референс размеров и параметров](./reference-layout.svg)

---

## 1. Цель

Разработать виджет мониторинга расхода лимитов телекоммуникационных подписок для дашборд-платформы **INTERA** на основе данных источника `subscription-list` из интеграции **Enigma**.

В этом архиве уже подготовлен стартовый проект с платформенными примитивами INTERA (`src/platform/`), эталонным набором данных (`src/data/mock-subscriptions.json`) и интерактивной песочницей (`src/sandbox/`). Ваша задача — реализовать три слоя виджета в `src/widget/`:

1. **`src/widget/subscription-usage-params.ts`** — защитное чтение и нормализация нетипизированных параметров `params: Record<string, unknown> | undefined` в строгий конфиг `ISubscriptionUsageConfig`.
2. **`src/widget/subscription-usage-compute.ts`** — чистая функция расчёта `computeSubscriptionUsage(rows, config, runtimeFilter)` без зависимостей от React и DOM.
3. **`src/widget/subscription-usage.tsx` (+ `.css`)** — React-компонент `SubscriptionUsageWidget`, адаптирующийся к четырём стандартным размерам карточки INTERA (`full`, `half`, `third`, `quarter`) и состояниям загрузки данных.

---

## 2. Быстрый старт

```bash
npm install
npm run dev        # запуск интерактивной песочницы
npm test           # запуск unit-тестов (Vitest)
npm run typecheck  # проверка типов TypeScript
```

---

## 3. Источник данных и доменные правила Enigma

Данные поступают из источника `subscription-list` (`src/types/subscription-list.ts`, фикстура `src/data/mock-subscriptions.json` — 20 записей со всеми граничными случаями).

### Ключевые поля `ISubscriptionRow`

- Идентификация подписки и клиента: `subscription_id`, `customer_id`, `customer_code`, `customer_name`.
- Судно и терминал: `vessel_id`, `vessel_name`, `item_id`, `item_number`, `item_name`, `terminal_status`, `terminal_status_name`.
- Продукт и технология: `product_name`, `package_plan_name`, `technology_id`, `technology_name`.
- Статус подписки в контракте: `subscription_active` (`1` — активна, `0` — отключена при переносе услуги на новый договор), `subscription_active_name`.
- Валюта: `currency_id`, `currency_name` (`USD`, `EUR`, `RUB`).
- Расчётный период и лимиты:
  - `allowance_period` (`YYYY-MM-DD` или `null`)
  - `allowance_minutes`, `used_minutes` (голосовой трафик, мин)
  - `allowance_mb`, `used_mb` (пакетный трафик в МБ)
  - `allowance_gb`, `used_gb` (пакетный трафик в ГБ — тарифы Starlink, `technology_id = 83`)
  - `allowance_money`, `used_money` (денежный лимит в валюте `currency_name`)

### Доменные инварианты (обязательны к соблюдению)

1. **Приведение чисел (`toFiniteNumber`):**
   - Используйте `toFiniteNumber` из `src/platform/to-finite-number.ts`.
   - Значения в строках могут приходить числами, числовыми строками (`"25800"`) или `null`.
   - Запрещено приводить `null` или `""` через `Number(v)` — это превращает отсутствующее значение в `0`.
2. **Фильтр активности (`onlyActive`):**
   - При переключении терминала на новый договор старая строка подписки в Enigma остаётся с `subscription_active = 0` и `null` во всех полях лимитов.
   - При `config.onlyActive === true` (по умолчанию) в расчёт включаются только строки с `subscription_active === 1`.
3. **Разрешение единицы трафика (`data`: GB против MB):**
   - В биллинге Enigma `allowance_gb` и `allowance_mb` отражают одно и то же физическое поле в единицах тарифа (для Starlink `technology_id = 83` — ГБ, для остальных — МБ).
   - Если `allowance_gb > 0` (либо оба лимита `<= 0`/`null`, но `used_gb > 0`), для измерения `data` используется пара `(allowance_gb, used_gb)` с единицей `'GB'`.
   - Иначе используется пара `(allowance_mb, used_mb)` с единицей `'MB'`.
   - **Никогда не учитывайте MB и GB одновременно для одной подписки.**
4. **Статус одного лимита (`ILimitEvaluation`):**
   - Если `allowance === null || allowance <= 0` (включая sentinel-значение `-1` в Enigma) → статус `'no_limit'`, `usagePercent = null`.
   - Если `allowance > 0`, но `used === null || used < 0` → статус `'no_data'` («Нет данных»), `usagePercent = null`. **Запрещено считать отсутствующий расход нулём.**
   - Если `allowance > 0` и `used >= 0` → `usagePercent = (used / allowance) * 100`:
     - `usagePercent >= criticalThreshold` → `'critical'`
     - `warningThreshold <= usagePercent < criticalThreshold` → `'warning'`
     - `usagePercent < warningThreshold` → `'normal'`
5. **Общий статус подписки (`overallStatus` и `maxUsagePercent`):**
   - Рассчитывается **только по тем типам лимитов, которые включены в `config.limitTypes`**.
   - Приоритет тяжести статуса (от худшего к лучшему):
     `critical` > `warning` > `normal` > `no_data` > `no_limit`.
   - `maxUsagePercent` — максимальный числовой `usagePercent` среди включённых в `config.limitTypes` измерений (`null`, если ни у одного измерения нет числового процента).
6. **Запрет кросс-валютного и кросс-единичного сложения:**
   - В сводке по типам лимитов (`summary.byLimitType`) считаются **количества подписок** (`withLimit`, `warning`, `critical`, `noData`), а не сумма долларов с рублями или мегабайтов с гигабайтами.

---

## 4. Параметры виджета (`parseSubscriptionUsageParams`)

| Параметр | Тип в `ISubscriptionUsageConfig` | Значение по умолчанию | Правило валидации / fallback |
| --- | --- | --- | --- |
| `description` | `string` | `'Subscription Usage'` | Читает `params.description` или `params.title` (trim). |
| `subtitle` | `string` | `''` | Читает `params.subtitle` (trim). |
| `size` | `'full' \| 'half' \| 'third' \| 'quarter'` | `'full'` | При неизвестном значении — `'full'`. |
| `period` | `string` | `'all'` | `'all'` или префикс `YYYY-MM` (сравнивается с первыми 7 символами `allowance_period`). |
| `customerId` | `number \| 'all'` | `'all'` | Положительное конечное число или `'all'`. |
| `technologyIds` | `number[]` | `[]` | Массив конечных чисел; пустой массив = без фильтра по технологиям. |
| `onlyActive` | `boolean` | `true` | Фильтр `subscription_active === 1`. |
| `limitTypes` | `('data' \| 'voice' \| 'money')[]` | `['data', 'voice', 'money']` | Подмножество без дубликатов; если массив пуст или некорректен — все три. |
| `warningThreshold` | `number` | `80` | Клампится в `[1, 500]`. |
| `criticalThreshold` | `number` | `100` | Клампится в `[1, 500]`. Если после клампинга `warningThreshold >= criticalThreshold`, оба сбрасываются в `80` и `100`. |
| `statusFilter` | `'all' \| 'normal' \| 'warning' \| 'critical' \| 'no_data' \| 'no_limit'` | `'all'` | Фильтрует `filteredItems` по `overallStatus` (при этом `summary` всегда считается до применения `statusFilter` и `rowLimit`!). |
| `rowLimit` | `10 \| 25 \| 50 \| 100` | `10` | Читает `params.rowLimit` или `params.maxRows`. |
| `showSummary` | `boolean` | `true` | Отображение блока сводки. |
| `showDetails` | `boolean` | `true` | Доступность просмотра деталей подписки. |
| `sortBy` | `'usage_desc' \| 'usage_asc' \| 'customer_name'` | `'usage_desc'` | При `usage_desc`/`usage_asc` записи с `maxUsagePercent === null` всегда идут в конце списка; при равенстве — сортировка по `subscription_id` по возрастанию. |

---

## 5. Адаптация к четырём размерам INTERA

В платформе INTERA ширина карточки задаётся параметром `size` (`full`, `half`, `third`, `quarter`):

1. **`full` (XL — 4/4 ширины строки, ~880px):**
   - Карточки общей сводки (`total`, `warning`, `critical`, `noData / noLimit`).
   - Кольцевая диаграмма (donut) или полоса распределения по статусам с легендой и долями.
   - Строка поиска (по `customer_name`, `vessel_name`, `item_number`, `item_name`, `product_name`) и быстрых фильтров.
   - Таблица подписок (ограниченная `rowLimit`) с индикаторами прогресса и раскрытием/просмотром всех трёх лимитов (`data`, `voice`, `money`) при `showDetails = true`.
2. **`half` (L — 1/2 ширины строки, ~600px):**
   - Компактная сводка (`total`, `warning`, `critical`).
   - Разбивка проблемных подписок по типам лимитов (`data`, `voice`, `money`).
   - Список наиболее проблемных подписок (топ-3..5 по расходу) с прогресс-барами.
   - Кнопка/действие перехода к полному списку (например, раскрытие модального/полного списка внутри виджета).
3. **`third` (M — 1/3 ширины строки, ~400px):**
   - Компактная кольцевая диаграмма с общим числом подписок.
   - Счётчики по статусам (`Normal`, `Warning`, `Critical`, `No Data / No Limit`).
   - Действие открытия списка.
4. **`quarter` (S — 1/4 ширины строки, ~240px):**
   - Крупный KPI общего числа подписок.
   - Бейджи количества `Warning` и `Critical`.
   - Кнопка перехода к деталям.

### Требования к состояниям данных (`ICollectionDataResult`)

- **Начальная загрузка (`loading && !loaded`):** отображать скелетон внутри карточки, не показывая «Нет подписок».
- **Фоновое обновление (`loading && loaded`):** **не размонтировать** текущий вид, чтобы не сбрасывать введённый пользователем поисковый запрос и открытые детали.
- **Устаревшие данные (`stale === true`):** отображать `<FreshnessMark source="rows" stale={true} />` в шапке карточки.
- **Ошибка (`error !== null && !loaded`):** отображать информативный блок ошибки с текстом `data.error`.
- **Пустой результат (`loaded && items.length === 0` или пустой фильтр):** корректное пустое состояние.

---

## 6. Критерии оценки

1. **Корректность доменной логики и `compute`-слоя (30%):** точное соблюдение правил GB vs MB, `no_data` vs `no_limit`, `onlyActive`, приоритета статусов и валидации `params`.
2. **Архитектура и TypeScript (25%):** чистое разделение `params` / `compute` / `view`, отсутствие `any`, прохождение `npm run typecheck` и `npm test`.
3. **UI/UX и адаптация к 4 размерам INTERA (25%):** аккуратная вёрстка на CSS-переменных темы INTERA (`src/platform/theme.css`), корректная работа в `light` и `dark` темах и во всех 4 размерах.
4. **Обработка граничных случаев и состояний данных (20%):** работа при `loading`, `refreshing`, `stale`, `empty`, `error`, строковых числах и неполных данных.
