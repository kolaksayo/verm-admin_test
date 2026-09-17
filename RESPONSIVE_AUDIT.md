# Responsive audit — VermoSports admin

Phase 0 deliverable. No code changed. Baseline commit `edd88be`.

Target: usable one-handed at 390px on mid-range Android over 4G, with `lg:+`
rendering unchanged.

Scale: 115 breakpoint-prefixed classes across 15,689 lines. **14 substantial
files have zero responsive classes**, including the two that matter most —
`Layout.jsx` (the shell) and `Login.jsx` (the first screen anyone sees).

---

## 0. Corrections to the brief

**a. Only 4 of the 10 `title="…"` are hover tooltips.** The other six are React
`title` *props* on local `<Section>` / `<Modal>` components and render as
visible headings — nothing to fix. Detail in §5.

**b. `<th>` counts are per file, not per table.** `AuditPage` has **4 tables**,
not a 31-column one; `CashFlow` has 3; `UserActivity` has 4. The real count is
**26 tables in 15 files** (§1), verified with
`grep -r '<table' --include=*.jsx client/src | wc -l`. Card layout is decided
per table, so this document is organised that way.

**c. Recharts is already in its own chunk.** `vite.config.js:16` puts it in
`vendor-recharts`. But it is statically imported by three pages and there is no
lazy routing, so all 111 kB gzip is still fetched on every load — including
`/login`. The Phase 4 win is real, but it is a *loading* fix, not a chunking
one. See §7.

**d. The `« ‹ › »` pagination exists twice**, not once: `DataTable.jsx:220-224`
and `FixturesView.jsx:256-259`. The compact variant must cover both.

---

## 1. Table inventory

26 tables across 15 files. ACTIONABLE = drives a decision on the row;
REFERENCE = detail. The split drives what goes on the card face versus behind a
tap.

### Generic

**`DataTable.jsx:158`** — collection browser, dynamic columns.
Columns come from `pickColumns(docs, collectionName)` (`:42`), capped at
`MAX_COLS = 7` (`:6`), plus a hardcoded `Actions` header (`:173`). Header text
is the raw field key — no label mapping.

`PRIORITY_COLUMNS` (`:34-40`) covers only 5 collections — `game_bet`,
`game_bet_leaderboard`, `users`, `transactions`, `walletusers` — as
`Record<collection, string[]>`.

Two behaviours matter for mobile:
- Resolution is `[...present, ...rest, ...timestamps].slice(0, 7)`, so leftover
  keys (`_id`, `__v`) can **push priority timestamps out of the budget**.
- The unmapped fallback is `['_id', ...rest, ...timestamps].slice(0, 7)` —
  an unmapped collection **leads with an opaque ObjectId**. On a card that is
  the worst possible heading.

Row actions: `View` per row (`:194-206`); `bookingCode` and `user` fields render
as buttons (`:102-112`, `:135-144`); headers sort (`:164`).
Widths: none. `overflow-x-auto` wrapper (`:157`), cells `max-w-xs truncate`.

**`UserRankingsView.jsx:91`** — leaderboard. 9 columns.
ACTIONABLE `Rank`, `Player`, `Total Pts` · REFERENCE the six score-component
columns. Heading `Player`, `Rank` as eyebrow. `Player` is a button
(`:113-118`). `overflow-x-auto` (`:90`).

### AuditPage — 4 tables

| Line | Table | ACTIONABLE | REFERENCE | Heading |
|---|---|---|---|---|
| `:145` | Finance adjustments | Type, Admin, User ID, Amount | When, Currency, Before, After, Description, Notes | Admin + User ID |
| `:256` | Admin activity log | User, Action, Collection, expander | When, Document | User + Action |
| `:364` | Orphaned wallets | Issue, Balance, Wallet ID | User Ref, Currency, Last Updated | Wallet ID |
| `:431` | Users without wallets | Username, Email | User ID, Mobile, Registered | Username → Email |

`:256` already has an expand-row pattern (`:272-287`) — a natural card-detail
fit. `:145` and `:364` have **no human identifier at all**, only a `shortId()`
ObjectId; cards there will read poorly whatever we do.

### CashFlow — 3 tables

| Line | Table | Notes |
|---|---|---|
| `:170` | Timeline fees (rendered twice: weekly `:722`, daily `:723`) | `min-w-[680px]`. 4 columns already `hidden lg:table-cell` — the code already treats them as secondary |
| `:303` | Monthly breakdown | `min-w-[860px]`. Two rate columns already `hidden xl:table-cell` |
| `:730` | Transaction type breakdown | **Wrapper is `overflow-hidden`, not `overflow-x-auto` — this table cannot scroll horizontally at any width** |

ACTIONABLE across these is the revenue lines (`Dep. Fees`, `With. Fees`,
`Bet Fees`, `Admin Credits/Debits`, `Payout Ratio`, `Notes / Trend`); counts and
average rates are REFERENCE. Headings are the period label.

`:170` and `:303` carry `<tfoot>` totals — a card list has no natural slot for
these (§ cross-cutting).

### UserActivity — 4 tables

| Line | Table | ACTIONABLE | Heading | Note |
|---|---|---|---|---|
| `:141` | Signups per period | Period, New Users | Period | `<tfoot>` total |
| `:337` | Top 10 depositors | User, Total NGN, # | User | 3 cols already `hidden` at lg/xl |
| `:378` | Top 10 bettors | User, Bets, # | User | **No `overflow-x-auto` wrapper at all** |
| `:411` | Recent withdrawals | User, USD, Status | User | 2 cols already `hidden` at md/lg |

### NGN ledgers — 2 tables

**`NgnDeposits.jsx:153`** (9 cols) and **`NgnWithdrawals.jsx:176`** (9 cols).
Both already have the expand-row pattern (`:189-190`, `:212-213`) opening a
`colSpan={9}` detail grid — the best existing model for card + tap-to-expand.

ACTIONABLE: `Platform User` (renders italic `unmatched` when absent — the key
exception flag), `Depositor`/`Recipient Name`, the NGN figure, `Status`, and on
deposits `USD Credited` (renders `—` when unreconciled). `Recipient Acct` is
ACTIONABLE on withdrawals but REFERENCE on deposits.
Heading: `Platform User`, subtitle `Depositor`/`Recipient Name`.

### Cross-cutting

**26 tables in 15 files.**

- **Only 2 hardcode a min-width** (`CashFlow:170`, `:303`). The rest are
  `w-full`, most inside an `overflow-x-auto` wrapper.
- **Seven have no working horizontal scroll** and clip content *today*, at any
  narrow width, before any mobile work:

  | Location | Cause |
  |---|---|
  | `CashFlow.jsx:730` | wrapper is `overflow-hidden` |
  | `AdminUsers.jsx:294` | `<Card className="overflow-hidden">` |
  | `UserActivity.jsx:378` | no wrapper |
  | `TelegramSettings.jsx:848` | no wrapper |
  | `DollarNairaRate.jsx:163` | no wrapper |
  | `DollarNairaRate.jsx:236` | no wrapper |
  | `NotificationsPage.jsx:2828` | no wrapper |

- **Expand-row pattern already exists** at `AuditPage:256`, `NgnDeposits:153`,
  `NgnWithdrawals:176`, `RequestLogs:220` — the closest thing to a card +
  tap-to-expand model, and the right precedent for `ResponsiveTable`.
- **`<tfoot>` totals** at `CashFlow:170`, `:303`, `UserActivity:141`,
  `InfluencerDashboard:470` need a designed home in card mode — a pinned
  summary card, not a row.
- **Unlabeled `<th>`** cells hosting a MiniBar or chevron: `AuditPage:264`,
  `CashFlow:737`, `UserActivity:146/:346/:385`, `InfluencerDashboard` (`w-32`),
  `RequestLogs` (`w-8`) — decorative, drop on mobile.
- **Three tables are keyed only on a truncated ObjectId**: `AuditPage:145`,
  `:364`, and DataTable's fallback path. Cards there will read poorly whatever
  we do; flagging rather than solving, since better identifiers would need an
  API change.
- **Row actions to preserve in card mode**: Retry (×3), Edit/Delete, View,
  inline rate editing, and four whole-row expanders.

### Settings & logs — 11 more tables

None of these hardcode a width; all are `w-full`. Cell-level truncation caps
only.

| Location | Table | Cols | ACTIONABLE | Heading | Row action |
|---|---|---|---|---|---|
| `TelegramSettings.jsx:848` | Send log | 7 | Channel, Trigger, Status, Error, Retry | Status + Trigger | **Retry** when `!ok` |
| `SignupBonusDashboard.jsx:258` | Bonus rules | 7 | Code, Amount, Currency, Active, Edit | Code | **Edit** (editMode only) |
| `SignupBonusDashboard.jsx:340` | Bonuses granted | 6 | Status, User, Referral Code, Amount | User + Status | User → profile modal |
| `AdminUsers.jsx:294` | Admin users | 5 | Email, Role, 2FA, Actions | Email | **Edit**, **Delete** |
| `DollarNairaRate.jsx:163` | Rate history | 5 | Date, Morning, Midday, Night | Date | none |
| `DollarNairaRate.jsx:236` | SQLite snapshots | 5 | Date, Period, Rate | Date + Period | none (panel-level Snap buttons) |
| `InfluencerDashboard.jsx:374` | Influencer breakdown | **11** | Influencer, Code, Referred, Funded, Placed Bet, Conv. Rate, Earnings, Rate | Influencer | User → modal; inline-editable Rate |
| `RequestLogs.jsx:220` | API request logs | 7 | Provider, Method, Status, Time, expander | Status + Method + Provider | whole row expands |
| `PrizeProjector.jsx:92` | Contests | 5 | Match, Players, Stake, View | Match | **View** → WagerDetailsModal |
| `NotificationsPage.jsx:2620` | WhatsApp DM log | 7 | User, Phone, Status, Error, Retry | User + Status | **Retry** when `!ok` |
| `NotificationsPage.jsx:2828` | Notification send log | 7 | Channel, Trigger, Status, Error, Retry | Status + Trigger | **Retry** when `!ok` |

Notable:

- **`NotificationsPage:2828` is a near-exact duplicate of
  `TelegramSettings:848`** — identical headers, cell markup, `handleRetry(row.id,
  row.channel)` and the same `max-w-[280px] truncate`. Migrating one should
  produce the other for free; worth extracting a shared component rather than
  doing the work twice.
- `InfluencerDashboard:374` is the widest table in the app at **11 columns**,
  six of them sortable click targets, with an inline-editable Rate cell and a
  `<tfoot>` totals row (`:470`).
- `SignupBonusDashboard` and `InfluencerDashboard` already use
  `hidden md:table-cell` / `hidden lg:table-cell` on secondary columns — an
  existing precedent for the priority API.
- `NotificationsPage:2647` hardcodes the Template column to the literal
  `welcome_to_vermosports` on every row — a column carrying no information.

---

## 2. Overflow inventory

All five cited grids confirmed verbatim:

| Location | Class |
|---|---|
| `UserProfileModal.jsx:791` | `grid grid-cols-3 gap-2` |
| `GameBetModal.jsx:302` | `grid grid-cols-3 gap-2` |
| `NotificationsPage.jsx:689` | `flex-1 grid grid-cols-4 gap-4 pl-4 border-l` |
| `NotificationsPage.jsx:1793` | `grid grid-cols-3 divide-x divide-vs-border` |
| `NotificationsPage.jsx:2070` | `grid grid-cols-3 divide-x divide-vs-border border-t` |

Unprefixed multi-column grids by file — every one is an overflow candidate
below 400px:

```
NotificationsPage 15 · CashFlow 9 · UserSnapshot 7 · UserActivity 7
Dashboard 6 · TelegramSettings 4 · RequestLogs 4 · NgnWithdrawals 4
NgnDeposits 4 · InfluencerDashboard 4 · CrmSync 3 · GameBetModal 3
UserProfileModal 2 · AdminUsers 1
```

The `divide-x` pairs are the worst of these: at 390px three divided columns give
~120px each, and the dividers make the cramping look intentional.

---

## 3. Toolbar inventory

Control density per page, driving the `DataToolbar` collapse threshold:

| Page | Inputs | Selects |
|---|---|---|
| NotificationsPage | 30 | 6 |
| TelegramSettings | 6 | 5 |
| AdminUsers | 5 | 2 |
| UserProfileModal | 5 | — |
| AuditPage | — | 4 |
| SignupBonusDashboard | — | 2 |
| RequestLogs | 1 | 2 |
| NgnWithdrawals | — | 1 |
| Collection | 2 | — |

Anything with 3+ controls needs the Sheet collapse. That is AuditPage,
AdminUsers, TelegramSettings, RequestLogs, SignupBonusDashboard and
NotificationsPage.

---

## 4. Touch targets

Guideline is 44px. Current:

| Element | Location | Size |
|---|---|---|
| Sidebar toggle / theme toggle | `Layout.jsx:268`, `:282` | `p-1.5` on `w-4 h-4` ≈ **28px** |
| Nav links | `Layout.jsx:81` | `px-3 py-1.5 text-sm` ≈ **30px** |
| Button `default` | `ui/Button.jsx:25` | `h-9` = **36px** |
| Button `sm` | `ui/Button.jsx:26` | `h-8` = **32px** |
| Button `icon` | `ui/Button.jsx:28` | `h-9 w-9` = **36px** |
| Pagination | `DataTable.jsx:220-224`, `FixturesView.jsx:256-259` | `px-2 py-1` ≈ **26px** |

Button `lg` (`h-10`, 40px) is the only variant close to compliant. Raise below
`md:` only, so desktop density is untouched.

---

## 5. Tooltips

Four real hover tooltips, all in `LeaderboardView.jsx`:

| Line | Tooltip | Becomes |
|---|---|---|
| `:246` | "Click to copy" | Visible copy icon + toast on tap |
| `:440` | "Copy page URL" | Already labelled "Share" — drop the tooltip |
| `:443` | "Export (coming soon)" | On a `disabled` button — render the "coming soon" state visibly or remove |
| `:446` | "Filter (coming soon)" | Same |

Two of the four sit on disabled placeholder buttons, so the real work is one
copy affordance plus tidying two dead controls.

Not tooltips — component props, no action needed: `Profile.jsx:120/136/164`,
`AdminUsers.jsx:366/485`, `NotificationsPage.jsx:2089`.

---

## 6. Severity × effort

Severity = how broken at 390px. Effort = S/M/L.

| Route | File | Lines | Resp | Severity | Effort |
|---|---|---|---|---|---|
| *(all)* | `Layout.jsx` | 298 | **0** | **Critical** — sidebar `w-60` leaves ~120px of content | M |
| `/login` | `Login.jsx` | 264 | **0** | Low — `min-h-screen p-4` → `max-w-sm` → `Card p-8` renders acceptably at 390px; only defects are sub-16px inputs and `min-h-screen`, both fixed globally in Phase 1 | S |
| `/notifications` | `NotificationsPage.jsx` | 3144 | 10 | **Critical** — 15 unprefixed grids, 2 tables, 36 controls | **L — own phase** |
| `collections/:name` | `DataTable.jsx` + `Collection.jsx` | 493 | **0** | High — 7 dynamic cols, `_id`-first fallback | M |
| `/audit` | `AuditPage.jsx` | 494 | **0** | High — 4 tables, 4 selects | M |
| `/admin-users` | `AdminUsers.jsx` | 500 | **0** | High — table + 2 modals | M |
| *(modal)* | `UserProfileModal.jsx` | 872 | **0** | High — 2 `grid-cols-3`, 5 inputs | M |
| `/cash-flow` | `CashFlow.jsx` | 764 | 29 | High — 2 hardcoded min-widths, 1 unscrollable table | M |
| `/ngn-deposits`* | `NgnDeposits.jsx` | 294 | 2 | High — 9-col ledger | M |
| `/ngn-withdrawals`* | `NgnWithdrawals.jsx` | 311 | 2 | High — 9-col ledger | M |
| `/campaigns` | `CampaignsPage.jsx` | 449 | **0** | Medium | M |
| `/request-logs` | `RequestLogs.jsx` | 268 | 5 | Medium | S |
| `/user-activity` | `UserActivity.jsx` | 476 | 23 | Medium — 4 tables, one unscrollable | M |
| `/user-snapshot` | `UserSnapshot.jsx` | 268 | 5 | Medium — 7 grids, charts | S |
| `/` | `Dashboard.jsx` | — | 4 | Medium — 6 grids | S |
| `/dollar-naira-rate` | `DollarNairaRate.jsx` | 286 | **0** | Medium — 2 tables + chart | S |
| `/telegram` | `TelegramSettings.jsx` | 1120 | 1 | **Unreachable** — `App.jsx` redirects `/telegram` to `/notifications` and nothing imports this file. Found during Phase 1; decision needed (delete, or re-route) before any Phase 3 effort is spent on it | — |
| `/crm-sync` | `CrmSync.jsx` | 381 | 2 | Low — recently built, partly responsive | S |
| `/profile` | `Profile.jsx` | 249 | **0** | Low — single column already | S |
| `/social-data` | `SocialData.jsx` | — | **0** | Low | S |
| `/influencer/:code` | `InfluencerDashboard.jsx` | 511 | 10 | Low — public page, partly done | S |
| `/wager-card` | `WagerCardFrame.jsx` | — | **0** | **None — screenshot target, fixed width is correct** | — |

\* reached via nav, not a top-level route in `App.jsx`.

`WagerCardFrame` must be left alone: it is rendered headlessly at a fixed size
to produce the broadcast PNG. Making it responsive would change the image.

---

## 7. Bundle baseline

Clean `npm run build` in `client/`, before any responsive work:

| Asset | Raw | Gzip |
|---|---|---|
| `index.css` | 42.19 kB | 7.88 kB |
| `vendor-react.js` | 169.81 kB | 55.04 kB |
| `vendor-recharts.js` | 380.04 kB | 111.34 kB |
| `index.js` | **539.32 kB** | **121.99 kB** |
| **Total JS** | **1,089.17 kB** | **288.37 kB** |

Vite warns that `index.js` exceeds 500 kB.

`vendor-recharts` is already a manual chunk (`vite.config.js:16`) but is
statically imported by `DollarNairaRate`, `CashFlow` and `UserSnapshot`, and
there is no `React.lazy` anywhere — so **288 kB gzip of JS is fetched before
the login form renders**. Route-level lazy loading should move both
`vendor-recharts` (111 kB) and most of `index.js` off the initial path.

Unbounded-list check: `Collection.jsx` paginates at `limit: 20`. The other
list views need the same check during migration — findings will be noted, not
fixed, since the fix is server-side and out of scope.

---

## 8. NotificationsPage — structure for its own phase

3,144 lines, **one single component** `NotificationsPage()` starting at `:902`.
No tab is its own component. `TABS` at `:5`, tab bar rendered `:1633-1641` as a
`flex gap-1 w-fit` row of five pills — **no wrap or scroll handling**, so it
overflows at 390px.

| Block | Lines | Pattern |
|---|---|---|
| Prologue — state, effects, handlers | 902 – 1632 | ~730 lines shared across all tabs |
| Header + tab bar | 1625 – 1641 | |
| **Channels** | 1643 – 2112 | IIFE |
| **Direct Messages** | 2113 – 2712 | IIFE, own sub-tabs |
| **Messages** | 2714 – 2792 | delegates to `<MessagesTab>` (`:265`) — already extracted |
| **Logs** | 2794 – 2904 | IIFE, contains the duplicate send-log table |
| **Settings** | 2906 – 3141 | includes `<ChatwootSettings />` |

**Does it split cleanly? Partially.** The five tab blocks are contiguous and
non-overlapping, so each is extractable. Two obstacles:

1. **The 730-line prologue** declares state and handlers for every tab
   together, referenced across tab boundaries (`loadLogs` used by the Logs tab
   *and* effects at `:1134-1136`; `handleRetry`/`retryResults` used only by
   Logs but declared far above; all `dm*` state used only by Direct Messages).
   Extraction means untangling that first.
2. **Direct Messages does not decompose into exclusive sub-routes.** Its five
   sub-tabs (`DM_SUBTABS` `:2144`, flags `:2145-2149`) have overlapping
   semantics — `Overview` renders *all* sections at once, so the sub-blocks
   must stay co-renderable. The grid wrappers at `:2240` and `:2535` compute
   their column counts from which flags are true.

Recommended split, to propose before touching it: `ChannelsTab`,
`DirectMessagesTab` (keeping its sub-blocks co-renderable), `LogsTab`,
`SettingsTab`, with the shared send-log table extracted as a component reused
by `TelegramSettings` — `MessagesTab` is already done and is the model.

---

## 9. Recommended sequence

The brief's order stands, with one change already agreed: the bundle baseline
was captured here rather than in Phase 4, so the eventual comparison is honest.

1. **Phase 1 — shell.** `Layout.jsx` drawer, `h-dvh`, 16px inputs,
   `viewport-fit=cover`, touch targets, `p-4 md:p-6`. Unblocks every other
   page. **Add `Login.jsx`** — it is Critical, trivial, and currently not in
   any phase.
2. **Phase 2 — primitives.** `Sheet`, `ResponsiveTable`, `ResponsiveModal`,
   `PageHeader`, `DataToolbar`, compact pagination. Prove on `DataTable` +
   `Collection`. Decision on focus-trap approach needed first.
3. **Phase 3 — pages**, highest severity first, per §6.
4. **NotificationsPage** — its own phase, after a component split is agreed.
5. **Phase 4 — weight.** Lazy routes, skeletons, measured against §7.
6. **Phase 5 — QA.** `RESPONSIVE_QA.md`.

### Pull forward into Phase 1

**The seven unscrollable tables** (§1 cross-cutting) are bugs today, not mobile
issues — they clip on a narrow desktop window. Adding the missing
`overflow-x-auto` is a one-line fix per table, carries no `lg:+` visual change,
and stops the same content being lost before `ResponsiveTable` ever lands.

**`Login.jsx`** — Low severity, S effort. It renders acceptably at 390px today;
its two defects (sub-16px inputs, `min-h-screen`) are fixed globally in Phase 1
anyway. Kept in Phase 1 because it is the first screen on every device and the
remaining change (`min-h-dvh`, verify `p-8` at 320px) is one line.

### Deduplicate rather than migrate twice

`NotificationsPage:2828` and `TelegramSettings:848` are the same table. Extract
once during Phase 3 and both pages get it — and the two `« ‹ › »` pagination
blocks (`DataTable:220`, `FixturesView:256`) should both move onto the compact
variant built in Phase 2.

### Found during Phase 1, noted for §6

- **`TelegramSettings.jsx` (1,120 lines) is dead code.** `App.jsx` redirects
  `/telegram` to `/notifications` and no file imports the page. Its send-log
  table is the duplicate of `NotificationsPage:2828` noted in §1 — so the
  "extract once" recommendation collapses to "delete the dead copy". Needs a
  decision before Phase 3; ranked accordingly in §6.

### Out of scope, flagged not fixed

- **Three ObjectId-keyed tables** (`AuditPage:145`, `:364`, DataTable fallback)
  have no human-readable identifier. Better card headings would need the API to
  return a username — a data change, which the brief excludes.
- **`NotificationsPage:2647`** hardcodes its Template column to
  `welcome_to_vermosports` on every row. Dropping the column is a product call,
  not a responsive one.
- **`WagerCardFrame.jsx`** is deliberately fixed-width — it is rendered
  headlessly to produce the broadcast PNG. Excluded from all phases.
