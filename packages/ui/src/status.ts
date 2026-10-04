import { TrustState } from "@platform/domain";

export interface StatusBadgeConfig {
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const TRUST_STATE_STYLES: Record<TrustState, StatusBadgeConfig> = {
  LIVE: {
    label: "Live",
    bgClass: "bg-emerald-50",
    textClass: "text-emerald-700",
    borderClass: "border-emerald-200"
  },
  VERIFIED: {
    label: "Verified",
    bgClass: "bg-green-50",
    textClass: "text-green-700",
    borderClass: "border-green-200"
  },
  STALE: {
    label: "Stale",
    bgClass: "bg-amber-50",
    textClass: "text-amber-700",
    borderClass: "border-amber-200"
  },
  CONFLICT: {
    label: "Conflict",
    bgClass: "bg-red-50",
    textClass: "text-red-700",
    borderClass: "border-red-200"
  },
  UNKNOWN: {
    label: "Unknown",
    bgClass: "bg-slate-50",
    textClass: "text-slate-700",
    borderClass: "border-slate-200"
  }
};
