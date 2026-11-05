/** Shape returned by every server action to its form (safe for the client). */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fields?: Record<string, string>;
  /** Non-secret echo of submitted values so forms keep their input on error. */
  values?: Record<string, string>;
  /** Action-specific payload, e.g. a freshly issued invitation link. */
  data?: Record<string, string>;
};

export const idle: FormState = { status: "idle" };
