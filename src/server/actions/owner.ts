"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/forms";
import { requireViewer } from "@/server/auth/request";
import { isAppError } from "@/server/errors";
import {
  createOrCalculateDistributionPeriod,
  reconcileDistributionPeriod,
  recordOperatingExpense,
  recordPlatformReserve,
  simulateOwnerPayouts,
  submitDistributionDecision,
  updateMyPayoutDestination,
} from "@/server/services/ownerFinance";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).trim() : "");

function fail(e: unknown): FormState {
  if (isAppError(e)) {
    return {
      status: "error",
      message: e.message,
      fields: e.field ? { [e.field]: e.message } : undefined,
    };
  }
  throw e;
}

function revalidateOwnerRoutes() {
  revalidatePath("/owner");
  revalidatePath("/owner/revenue");
  revalidatePath("/owner/share");
  revalidatePath("/owner/distributions");
  revalidatePath("/owner/payouts");
  revalidatePath("/owner/approvals");
  revalidatePath("/owner/reports");
  revalidatePath("/owner/audit");
}

export async function createDistributionPeriodAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.distributions.calculate");
  try {
    const startRaw = str(fd, "periodStart");
    const endRaw = str(fd, "periodEnd");
    const currency = str(fd, "currency") || "usd";
    const notes = str(fd, "notes") || undefined;

    const periodStart = startRaw ? new Date(startRaw) : new Date(Date.now() - 30 * 86400_000);
    const periodEnd = endRaw ? new Date(endRaw) : new Date();

    const created = await createOrCalculateDistributionPeriod(viewer, {
      periodStart,
      periodEnd,
      currency,
      notes,
    });
    const reconciled = await reconcileDistributionPeriod(viewer, created.periodId);
    revalidateOwnerRoutes();
    return {
      status: "success",
      message: `Distribution period calculated and reconciled (${reconciled.status}). Both Jade and Kael Veyre must approve with MFA before simulated payout.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function submitDistributionDecisionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.distributions.approve");
  try {
    const periodId = str(fd, "periodId");
    const decisionRaw = str(fd, "decision");
    const mfaCode = str(fd, "mfaCode");
    const note = str(fd, "note") || undefined;
    if (decisionRaw !== "APPROVED" && decisionRaw !== "REJECTED") {
      return { status: "error", message: "Choose Approve or Reject." };
    }
    const res = await submitDistributionDecision(viewer, {
      periodId,
      decision: decisionRaw,
      mfaCode,
      note,
    });
    revalidateOwnerRoutes();
    return {
      status: "success",
      message:
        res.status === "READY_FOR_PAYOUT"
          ? "Dual-owner approval complete. Distribution is now READY_FOR_PAYOUT."
          : res.status === "PARTIALLY_APPROVED"
            ? "Your approval is recorded (PARTIALLY_APPROVED). Waiting for the second owner's independent approval."
            : "Distribution rejected and returned to review.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function simulateOwnerPayoutsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.payouts.simulate");
  try {
    const periodId = str(fd, "periodId");
    const idempotencyKey = str(fd, "idempotencyKey") || `sim-${periodId}`;
    const res = await simulateOwnerPayouts(viewer, {
      periodId,
      idempotencyKey,
    });
    revalidateOwnerRoutes();
    return {
      status: "success",
      message: `Simulated payout run completed (${res.periodStatus}). Live settlement transfers remain disabled.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMyPayoutDestinationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.payout_accounts.manage");
  try {
    const provider = str(fd, "provider");
    const providerAccountReference = str(fd, "providerAccountReference");
    const maskedAccountLabel = str(fd, "maskedAccountLabel");
    const destinationTypeRaw = str(fd, "destinationType") || "settlement_account";
    const currency = str(fd, "currency") || "usd";
    const mfaCode = str(fd, "mfaCode");

    const allowedTypes = ["bank_account", "settlement_account", "wallet", "other"] as const;
    const destinationType = (allowedTypes.includes(destinationTypeRaw as (typeof allowedTypes)[number])
      ? destinationTypeRaw
      : "settlement_account") as (typeof allowedTypes)[number];

    const updated = await updateMyPayoutDestination(viewer, {
      provider,
      providerAccountReference,
      maskedAccountLabel,
      destinationType,
      currency,
      mfaCode,
    });
    revalidateOwnerRoutes();
    return {
      status: "success",
      message: `${updated.accountCode} payout destination updated and logged in the financial audit trail.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function recordExpenseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.distributions.calculate");
  try {
    const category = str(fd, "category");
    const description = str(fd, "description");
    const amountMinor = Number(str(fd, "amountMinor"));
    const currency = str(fd, "currency") || "usd";
    await recordOperatingExpense(viewer, { category, description, amountMinor, currency });
    revalidateOwnerRoutes();
    return { status: "success", message: "Approved operating expense recorded." };
  } catch (e) {
    return fail(e);
  }
}

export async function recordReserveAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const viewer = await requireViewer("owner.distributions.calculate");
  try {
    const reason = str(fd, "reason");
    const amountMinor = Number(str(fd, "amountMinor"));
    const currency = str(fd, "currency") || "usd";
    await recordPlatformReserve(viewer, { reason, amountMinor, currency });
    revalidateOwnerRoutes();
    return { status: "success", message: "Platform reserve allocation recorded." };
  } catch (e) {
    return fail(e);
  }
}

