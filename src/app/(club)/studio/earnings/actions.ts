"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/server/auth/request";
import { AppError } from "@/server/errors";
import {
  confirmCreatorReferralOnboarding,
  onboardCreatorPayoutAccount,
  requestCreatorWithdrawal,
  updateCreatorBankDestination,
} from "@/server/services/creatorReferralsAndWithdrawals";

export async function onboardPayoutAccountAction(input: {
  residenceCountry: string;
  entityType: "individual" | "company";
  currency: string;
  bankName: string;
  accountLast4: string;
  autoPayoutEnabled: boolean;
}) {
  try {
    const viewer = await requireViewer("club.discover");
    const acct = await onboardCreatorPayoutAccount(viewer, {
      residenceCountry: input.residenceCountry,
      entityType: input.entityType,
      currency: input.currency,
      bankName: input.bankName,
      accountLast4: input.accountLast4,
      kycVerified: true,
      autoPayoutEnabled: input.autoPayoutEnabled,
      autoPayoutSchedule: input.autoPayoutEnabled ? "weekly" : "manual",
    });
    revalidatePath("/studio/earnings");
    return { ok: true as const, account: acct };
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof AppError ? err.message : "Unable to complete bank onboarding.",
    };
  }
}

export async function updateBankDestinationAction(input: {
  password: string;
  bankName: string;
  accountLast4: string;
  currency: string;
  autoPayoutEnabled: boolean;
}) {
  try {
    const viewer = await requireViewer("club.discover");
    const acct = await updateCreatorBankDestination(viewer, {
      password: input.password,
      bankName: input.bankName,
      accountLast4: input.accountLast4,
      currency: input.currency,
      autoPayoutEnabled: input.autoPayoutEnabled,
      autoPayoutSchedule: input.autoPayoutEnabled ? "weekly" : "manual",
    });
    revalidatePath("/studio/earnings");
    return { ok: true as const, account: acct };
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof AppError ? err.message : "Unable to update bank destination.",
    };
  }
}

export async function requestWithdrawalAction(input: {
  amountCents: number;
  currency: string;
  idempotencyKey: string;
}) {
  try {
    const viewer = await requireViewer("club.discover");
    const testing = process.env.NODE_ENV !== "production";
    const payout = await requestCreatorWithdrawal(viewer, input, { testing });
    revalidatePath("/studio/earnings");
    return { ok: true as const, payout };
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof AppError ? err.message : "Unable to submit withdrawal request.",
    };
  }
}

export async function confirmReferralCodeAction(input: { recruitmentCode: string; acceptTerms: boolean }) {
  try {
    const viewer = await requireViewer("club.discover");
    const attribution = await confirmCreatorReferralOnboarding(viewer, {
      recruitmentCode: input.recruitmentCode,
      acceptReferralTerms: input.acceptTerms,
    });
    revalidatePath("/studio/earnings");
    return { ok: true as const, attribution };
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof AppError ? err.message : "Unable to confirm referral code.",
    };
  }
}

