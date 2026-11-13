# DivaFans — Complete Two-Owner Identity, Dashboard & 50/50 Financial Implementation

## 1. Confirmed Ownership Registry & Verified Identity Mapping

The internal ownership registry (`app.platform_owners` and `app.ownership_allocations`) enforces an exact 50/50 economic split (`5000` + `5000` = `10000` basis points) across two active owners:

| Owner ID | Display Name | Verified Auth User ID (`app.users.id`) | Economic Ownership | Payout Destination |
| :--- | :--- | :--- | :--- | :--- |
| `OWNER_001` | `Jade` | `c570c63a-c9d8-44fc-b47b-165aed89d764` | `50%` (`5000` bps) | `Account A` |
| `OWNER_002` | `Kael Veyre` | `aa44892b-67d1-4c22-93d0-371a61e51caa` | `50%` (`5000` bps) | `Account B` |

- Ownership percentages are resolved exclusively from `app.ownership_allocations` server-side via the authenticated user's session (`app.current_user_id()`).
- Neither usernames, email addresses, nor client-supplied parameters are ever trusted to resolve owner identity or economic share.
- Both owner accounts use independent credentials and independent TOTP MFA configurations (`AAL2` required for all `/owner` routes and financial actions).

---

## 2. Database Schema & PostgreSQL Invariants

Defined in [`supabase/migrations/20261122000001_two_owner_financials.sql`](../supabase/migrations/20261122000001_two_owner_financials.sql):

1. **`app.platform_owners`**:
   - Columns: `id` (`'OWNER_001' | 'OWNER_002'`), `auth_user_id` (`unique references app.users(id)`), `display_name` (`'Jade' | 'Kael Veyre'`), `status`, `created_at`, `updated_at`.
   - Constraint trigger `platform_owners_max_two_active` enforces at most 2 active owners.
2. **`app.ownership_allocations`**:
   - Columns: `id`, `owner_id`, `percentage_basis_points` (`check (percentage_basis_points = 5000)`), `effective_from`, `effective_to`, `approval_reference`, `created_at`.
   - Trigger `ownership_allocations_no_overlap` prevents overlapping date ranges per owner.
   - Deferred constraint trigger `ownership_allocations_total_10000` enforces that active allocations (`effective_to is null`) belong to exactly 2 owners and sum to `10000` basis points (`100.00%`).
3. **`app.payout_destinations`**:
   - Columns: `id`, `owner_id`, `account_label` (`'Account A'` for `OWNER_001`, `'Account B'` for `OWNER_002`), `provider`, `provider_account_reference`, `masked_details`, `destination_type`, `currency`, `verification_status`, `status`, `created_at`, `updated_at`.
   - **Row-Level Security (`payout_destinations_self_select`, `payout_destinations_self_update`)**: Scoped strictly to `owner_id = app.current_owner_id() and app.current_aal() >= 2`. `Jade` (`OWNER_001`) can never query or mutate `Account B`, and `Kael Veyre` (`OWNER_002`) can never query or mutate `Account A`.
4. **`app.financial_distribution_periods`**:
   - Tracks `period_start`, `period_end`, `currency`, `gross_collections_minor`, `refunds_chargebacks_minor`, `taxes_minor`, `creator_liabilities_minor`, `platform_revenue_minor`, `processing_costs_minor`, `operating_expenses_minor`, `reserves_minor`, `deductions_minor`, `distributable_amount_minor`, `reconciliation_exceptions`, `calculation_version`, `status`, `finalized_at`.
   - Supported states: `DRAFT`, `CALCULATED`, `RECONCILED`, `AWAITING_APPROVAL`, `PARTIALLY_APPROVED`, `APPROVED`, `READY_FOR_PAYOUT`, `SIMULATED`, `ON_HOLD`, `REJECTED`, `FAILED`, `PAID` (live settlement disabled by trigger & service guard).
5. **`app.owner_distribution_allocations`**:
   - Snapshots `5000` basis points and the exact integer minor currency allocation for `OWNER_001` and `OWNER_002` per distribution period.
6. **`app.distribution_approvals`**:
   - Append-only immutable table (`distribution_approvals_immutable` trigger blocks `UPDATE` and `DELETE`).
   - Enforces `unique (distribution_period_id, calculation_version, owner_id)` so one owner can never approve twice for the same calculation version.
   - RLS policy `distribution_approvals_owner_insert` requires `owner_id = app.current_owner_id()` and `authenticated_actor_id = app.current_user_id()`.
7. **`app.owner_payouts`**:
   - Records per-owner payout executions linked to `owner_id`, `distribution_allocation_id`, and `payout_destination_id` with `idempotency_key`.
   - Trigger `owner_payouts_verify_owner_match` ensures `owner_id` matches both the allocation owner and the payout destination owner, and blocks `status = 'PAID'` while live settlement transfers are disabled.
   - RLS policy `owner_payouts_self_select` restricts each owner to viewing only their own payout statements.
8. **`app.financial_audit_events`**:
   - Append-only immutable audit trail (`financial_audit_events_immutable` trigger blocks `UPDATE` and `DELETE`).

---

## 3. Deterministic 50/50 Financial Waterfall

Implemented in [`src/server/services/ownerFinance.ts`](../src/server/services/ownerFinance.ts) using integer minor currency units (`cents` / `minor`) only:

1. **Gross Settled Fan Collections** (`gross_collections_minor`)
2. **Less Applicable Taxes & Transaction Reversals** (`taxes_minor` + `refunds_chargebacks_minor`) = **Net Settled Fan Collections**
3. **Less Creator Contractual Earnings (`85%` / `8500` bps)** (`creator_liabilities_minor`) — protected creator liability that can never be distributed to platform owners
4. **Equals Platform Revenue Before Platform-Borne Costs (`15%` / `1500` bps provisional fee)** (`platform_revenue_minor`)
5. **Less Processing/Settlement Costs, Approved Operating Expenses & Reserve Allocations** (`deductions_minor`)
6. **Equals Net Distributable Platform Earnings** (`distributable_amount_minor`):
   - If raw net earnings are an odd minor unit, `1` minor unit is held in `roundingCarryReserveMinor` so `distributable_amount_minor` is even and splits deterministically `50/50`:
   - **`Jade` (`OWNER_001`)**: `50%` (`5000` bps) -> `Account A`
   - **`Kael Veyre` (`OWNER_002`)**: `50%` (`5000` bps) -> `Account B`

---

## 4. Dual-Owner MFA Approval & Simulated Payout Workflow

- Both `Jade` (`OWNER_001`) and `Kael Veyre` (`OWNER_002`) must sign an approval using their own authenticated `AAL2` session and a fresh 6-digit TOTP MFA code.
- First owner approval transitions the period from `AWAITING_APPROVAL` to `PARTIALLY_APPROVED`.
- Second owner approval transitions the period to `READY_FOR_PAYOUT`.
- Any material change to period calculations, operating expenses, reserves, or payout destinations increments `calculation_version` and resets unexecuted periods back to `AWAITING_APPROVAL`, invalidating prior approvals.
- Any `REJECTED` decision returns the distribution period to `REJECTED` for review.
- When `READY_FOR_PAYOUT`, running simulated payouts creates two independent `SIMULATED` records in `app.owner_payouts` (one for `OWNER_001` / `Account A` and one for `OWNER_002` / `Account B`). If one owner's payout fails (`FAILED`), funds are never redirected to the other owner.

