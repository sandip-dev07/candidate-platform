import { toast } from "@/components/ui/toast";

/** Success toast for a completed action. */
export function notifySuccess(title: string, description?: string) {
  return toast.add({ title, description, type: "success" });
}

/** Error toast for a failed action or request. Stays a bit longer and is announced urgently. */
export function notifyError(title: string, description?: string) {
  return toast.add({ title, description, type: "error", timeout: 6000, priority: "high" });
}

/** Neutral informational toast. */
export function notifyInfo(title: string, description?: string) {
  return toast.add({ title, description, type: "info" });
}

/**
 * Persistent loading toast for an in-flight action.
 * Returns the toast id — resolve it with {@link resolveToast} when the
 * response arrives so the same toast morphs into the result.
 */
export function notifyLoading(title: string, description?: string) {
  return toast.add({ title, description, type: "loading", timeout: 0 });
}

/** Morph a loading toast into its success/error result. */
export function resolveToast(id: string, ok: boolean, title: string, description?: string) {
  toast.update(id, {
    title,
    description,
    type: ok ? "success" : "error",
    timeout: ok ? 5000 : 6000,
    priority: ok ? "low" : "high",
  });
}
