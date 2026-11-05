import type { Metadata } from "next";
import { NotFoundContent } from "@/components/layout/NotFoundContent";

export const metadata: Metadata = { title: "Not found", robots: { index: false } };

/** Rendered inside the club shell, which already provides the main landmark. */
export default function NotFound() {
  return <NotFoundContent inShell />;
}
