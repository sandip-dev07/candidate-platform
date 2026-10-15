"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, createTemplate, deleteTemplate, listTemplates, updateTemplate, type ApiTemplate } from "@/lib/api";
import { notifyLoading, resolveToast } from "@/lib/notify";
import styles from "@/styles/candidate-workspace.module.css";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (template: ApiTemplate) => void;
}

export function TemplateDialog({ open, onOpenChange, onApplied }: Props) {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formValid, setFormValid] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const duplicateName =
    createName.trim().length >= 2 &&
    templates.some((t) => t.name.toLowerCase() === createName.trim().toLowerCase());

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTemplates(await listTemplates());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchTemplates();
  }, [open, fetchTemplates]);

  async function handleUpdate(tpl: ApiTemplate) {
    const name = editName.trim();
    const body = editBody.trim();
    if (name.length < 2 || !body) return;
    setBusyId(tpl.id);
    const toastId = notifyLoading("Updating template…", name);
    try {
      const updated = await updateTemplate(tpl.id, { name, body });
      setTemplates((prev) => prev.map((t) => (t.id === tpl.id ? updated : t)));
      setEditingId(null);
      resolveToast(toastId, true, "Template updated", `"${updated.name}" saved.`);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not update template.";
      resolveToast(toastId, false, "Could not update template", message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(tpl: ApiTemplate) {
    if (confirmDeleteId !== tpl.id) {
      setConfirmDeleteId(tpl.id);
      return;
    }
    setConfirmDeleteId(null);
    setBusyId(tpl.id);
    const toastId = notifyLoading("Deleting template…", tpl.name);
    try {
      await deleteTemplate(tpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      if (editingId === tpl.id) setEditingId(null);
      resolveToast(toastId, true, "Template deleted", `"${tpl.name}" removed.`);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not delete template.";
      resolveToast(toastId, false, "Could not delete template", message);
    } finally {
      setBusyId(null);
    }
  }
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Capture the form element synchronously: React nulls event.currentTarget
    // after the await below, so it cannot be touched in the success path.
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const name = String(form.get("name") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (name.length < 2) {
      setFormError("Template name must be at least 2 characters.");
      return;
    }
    if (!body) {
      setFormError("Template body cannot be empty.");
      return;
    }
    if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setFormError(`A template named "${name}" already exists. Edit it from the list above instead.`);
      return;
    }
    setSaving(true);
    setFormError("");
    const toastId = notifyLoading("Saving template…", name);
    try {
      const created = await createTemplate({ name, body });
      setTemplates((prev) => [created, ...prev]);
      formEl.reset();
      setFormValid(false);
      setCreateName("");
      resolveToast(toastId, true, "Template saved", `"${created.name}" is ready to use.`);
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not save template.";
      setFormError(message);
      resolveToast(toastId, false, "Could not save template", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={styles.addCandidateDialog}>
        <DialogHeader>
          <DialogTitle>Message templates</DialogTitle>
          <DialogDescription className="sr-only">
            Create reusable templates and apply one to your message draft.
          </DialogDescription>
        </DialogHeader>
        <div className={styles.addCandidateFields} style={{ paddingBottom: 24 }}>
          {loading ? (
            <div style={{ display: "grid", gap: 12 }} aria-label="Loading templates">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`tpl-loading-${i}`} style={{ display: "grid", gap: 6 }}>
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div>
              <p role="alert" className={styles.error}>
                {error}
              </p>
              <Button
                variant="outline"
                size="sm"
                style={{ marginTop: 8 }}
                onClick={() => void fetchTemplates()}
              >
                Retry
              </Button>
            </div>
          ) : templates.length === 0 ? (
            <p className={styles.helper} style={{ margin: 0 }}>
              No templates yet. Create one below — use {"{{name}}"} and {"{{phone}}"} to
              personalize per candidate.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
              {templates.map((tpl) => {
                const isEditing = editingId === tpl.id;
                const busy = busyId === tpl.id;
                return (
                  <li
                    key={tpl.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    {isEditing ? (
                      <>
                        <Input
                          aria-label="Template name"
                          value={editName}
                          maxLength={100}
                          disabled={busy}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                        <Textarea
                          aria-label="Template body"
                          value={editBody}
                          maxLength={2000}
                          rows={3}
                          disabled={busy}
                          onChange={(e) => setEditBody(e.target.value)}
                        />
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={busy || editName.trim().length < 2 || !editBody.trim()}
                            onClick={() => void handleUpdate(tpl)}
                          >
                            {busy ? (
                              <>
                                <Spinner /> Saving…
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <strong style={{ overflowWrap: "anywhere" }}>{tpl.name}</strong>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            {onApplied && (
                              <Button variant="outline" size="sm" onClick={() => onApplied(tpl)}>
                                Use
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              title="Edit template"
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setEditName(tpl.name);
                                setEditBody(tpl.body);
                                setEditingId(tpl.id);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant={confirmDeleteId === tpl.id ? "destructive" : "ghost"}
                              size="sm"
                              disabled={busy}
                              title="Delete template"
                              onClick={() => void handleDelete(tpl)}
                              onBlur={() => {
                                if (confirmDeleteId === tpl.id) setConfirmDeleteId(null);
                              }}
                            >
                              {busy ? (
                                <Spinner />
                              ) : confirmDeleteId === tpl.id ? (
                                "Sure?"
                              ) : (
                                "Delete"
                              )}
                            </Button>
                          </div>
                        </div>
                        <p className={styles.helper} style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                          {tpl.body}
                        </p>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <form
          className={styles.addCandidateForm}
          onSubmit={handleCreate}
          onChange={(event) => {
            const data = new FormData(event.currentTarget);
            const name = String(data.get("name") ?? "").trim();
            const body = String(data.get("body") ?? "").trim();
            setCreateName(name);
            setFormValid(
              event.currentTarget.checkValidity() && name.length >= 2 && body.length > 0,
            );
            if (formError) setFormError("");
          }}
        >
          <div className={styles.addCandidateFields} style={{ paddingTop: 8 }}>
            <div className={styles.outlinedField}>
              <Input
                id="template-name"
                name="name"
                placeholder=" "
                required
                maxLength={100}
                disabled={saving}
              />
              <label htmlFor="template-name">
                Template name <span aria-hidden="true">*</span>
              </label>
            </div>
            {duplicateName && (
              <p role="alert" className={styles.error} style={{ margin: 0 }}>
                A template named &ldquo;{createName.trim()}&rdquo; already exists — edit it
                from the list above instead.
              </p>
            )}
            <div className={styles.messageField}>
              <label htmlFor="template-body">
                Template body <span aria-hidden="true">*</span>
              </label>
              <p id="template-body-help">
                Use {"{{name}}"} and {"{{phone}}"} — filled per candidate on send.
              </p>
              <Textarea
                id="template-body"
                name="body"
                aria-describedby="template-body-help"
                placeholder="Hi {{name}}, your interview is scheduled for tomorrow at 11:00 AM."
                required
                maxLength={2000}
                rows={4}
                disabled={saving}
              />
            </div>
            {formError && (
              <p role="alert" className={styles.error}>
                {formError}
              </p>
            )}
          </div>
          <div className={styles.addCandidateActions}>
            <Button
              variant="outline"
              type="button"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button type="submit" disabled={!formValid || saving || duplicateName}>
              {saving ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Save template"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
