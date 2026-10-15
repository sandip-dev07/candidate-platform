"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  API_BASE_URL,
  ApiError,
  createCandidate,
  deleteCandidate,
  getCandidateHistory,
  getProviderHealth,
  listCandidates,
  type ApiProviderHealth,
} from "@/lib/api";
import {
  formatApiTimestamp,
  toDisplayStatus,
  type Candidate,
} from "@/lib/candidates";
import {
  notifyError,
  notifyLoading,
  notifySuccess,
  resolveToast,
} from "@/lib/notify";
import {
  CandidateTable,
  CandidateIcon as Icon,
  candidateColumns as columns,
} from "./candidate-table";
import { CandidateDialogs } from "./candidate-dialogs";
import { CandidateSheets } from "./candidate-sheets";
import styles from "@/styles/candidate-workspace.module.css";

function toUiCandidate(c: {
  id: string;
  name: string;
  phone: string;
  email: string;
}): Candidate {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email ?? "",
    lastMessage: null,
    status: null,
  };
}

export function CandidateWorkspace() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [dialog, setDialog] = useState<"add" | "delete" | "message" | null>(
    null,
  );
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [messageFeedback, setMessageFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [health, setHealth] = useState<ApiProviderHealth | null>(null);
  const recipients = candidates.filter((candidate) =>
    selected.includes(candidate.id),
  );
  const [addValid, setAddValid] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCandidates = useCallback(async (q: string) => {
    setLoading(true);
    setApiError("");
    try {
      const data = await listCandidates({ search: q, limit: 100, offset: 0 });
      const ui = data.items.map(toUiCandidate);
      setCandidates(ui);
      setTotal(data.total);
      // Enrich with latest message status (best-effort, non-blocking for table paint).
      // Backend CandidateOut has no last-message summary, so fetch newest message per candidate.
      void (async () => {
        const updates = await Promise.all(
          ui.map(async (c) => {
            try {
              const h = await getCandidateHistory(c.id, { limit: 1 });
              const latest = h.items[0];
              if (!latest) return null;
              const { date } = formatApiTimestamp(latest.created_at);
              return {
                id: c.id,
                lastMessage: date,
                status: toDisplayStatus(latest.status),
              } as const;
            } catch {
              return null;
            }
          }),
        );
        const map = new Map(updates.filter(Boolean).map((u) => [u!.id, u!]));
        if (map.size) {
          setCandidates((prev) =>
            prev.map((c) => {
              const u = map.get(c.id);
              return u
                ? { ...c, lastMessage: u.lastMessage, status: u.status }
                : c;
            }),
          );
        }
      })();
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Could not load candidates.";
      setApiError(message);
      notifyError("Could not load candidates", message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + debounced server-side search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => void fetchCandidates(search),
      search ? 400 : 0,
    );
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, fetchCandidates]);

  // Provider health for the toolbar badge (bonus: provider health).
  const healthToastShown = useRef(false);
  useEffect(() => {
    let cancelled = false;
    getProviderHealth()
      .then((h) => {
        if (cancelled) return;
        setHealth(h);
        if (!h.operational && !healthToastShown.current) {
          healthToastShown.current = true;
          notifyError(
            "Communication service unavailable",
            "Sending and retrying are paused until the provider recovers.",
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = candidates.filter((candidate) =>
    Object.entries(filters).every(([key, value]) =>
      String(candidate[key as keyof Candidate] ?? "NA")
        .toLowerCase()
        .includes(value.toLowerCase()),
    ),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const activeColumn = columns.find(([key]) => key === filter);

  function openDialog(next: typeof dialog) {
    setError("");
    if (next === "add") setAddValid(false);
    if (next === "message") setMessageFeedback("");
    setDialog(next);
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    if (
      !name ||
      !/^[+\d\s()-]{7,20}$/.test(phone) ||
      phone.replace(/\D/g, "").length < 7
    ) {
      setError("Enter a name and a valid phone number.");
      return;
    }
    if (!email) {
      setError("Email is required by the API.");
      return;
    }
    setSaving(true);
    setError("");
    const toastId = notifyLoading("Adding candidate…", name);
    try {
      const created = await createCandidate({ name, phone, email });
      setCandidates((previous) => [toUiCandidate(created), ...previous]);
      setTotal((t) => t + 1);
      setSearch("");
      setFilters({});
      setPage(0);
      setDialog(null);
      resolveToast(
        toastId,
        true,
        "Candidate added",
        `${created.name} is now in the list.`,
      );
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : "Could not add candidate.";
      setError(message);
      resolveToast(toastId, false, "Could not add candidate", message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCandidates() {
    const count = selected.length;
    setDeleting(true);
    setError("");
    const toastId = notifyLoading(
      count === 1 ? "Deleting candidate…" : `Deleting ${count} candidates…`,
    );
    try {
      const results = await Promise.allSettled(
        selected.map((id) => deleteCandidate(id)),
      );
      const okIds = new Set(
        selected.filter((_, i) => results[i].status === "fulfilled"),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      setCandidates((previous) => previous.filter((c) => !okIds.has(c.id)));
      setTotal((t) => Math.max(0, t - okIds.size));
      setSelected((prev) => prev.filter((id) => !okIds.has(id)));
      if (failed === 0) {
        setDialog(null);
        resolveToast(
          toastId,
          true,
          count === 1 ? "Candidate deleted" : `${count} candidates deleted`,
        );
      } else {
        const message = `${failed} delete(s) failed. The rest were removed; try again for the remainder.`;
        setError(message);
        resolveToast(toastId, false, "Some deletes failed", message);
        if (okIds.size > 0) {
          notifySuccess(
            okIds.size === 1
              ? "1 candidate deleted"
              : `${okIds.size} candidates deleted`,
          );
        }
      }
    } finally {
      setDeleting(false);
    }
  }

  /** Refresh latest-message columns after a send. */
  const refreshAfterSend = useCallback(async (ids: string[]) => {
    await Promise.all(
      ids.map(async (id) => {
        try {
          const h = await getCandidateHistory(id, { limit: 1 });
          const latest = h.items[0];
          if (!latest) return;
          const { date } = formatApiTimestamp(latest.created_at);
          const status = toDisplayStatus(latest.status);
          setCandidates((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, lastMessage: date, status } : c,
            ),
          );
        } catch {
          /* keep previous row state on failure */
        }
      }),
    );
  }, []);

  return (
    <main className={styles.workspace}>
      <header className={styles.toolbar}>
        <h1>Candidate communication</h1>
        <div className={styles.actions}>
          <span
            role="status"
            aria-label={
              health
                ? health.operational
                  ? "Service operational"
                  : "Service unavailable"
                : "Service status unknown"
            }
            title={`API: ${API_BASE_URL}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--muted-foreground)",
              textTransform: "none",
              letterSpacing: "normal",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: health
                  ? health.operational
                    ? "#2e7d32"
                    : "#d32f2f"
                  : "#9e9e9e",
                display: "inline-block",
              }}
            />
            {health
              ? health.operational
                ? "Operational"
                : "Unavailable"
              : "Connecting…"}
          </span>
          <Button
            variant="outline"
            className={styles.addButton}
            onClick={() => openDialog("add")}
          >
            <Icon name="imgIconLeft" size={20} />
            Add candidate
          </Button>
          <Button
            className={styles.actionButton}
            disabled={!selected.length || deleting}
            onClick={() => openDialog("delete")}
          >
            <Icon name="imgIconLeft1" size={20} />
            {deleting ? (
              <>
                <Spinner /> Deleting…
              </>
            ) : (
              "Delete candidate"
            )}
          </Button>
          <Button
            className={styles.actionButton}
            disabled={!selected.length}
            onClick={() => openDialog("message")}
          >
            <Icon name="imgIconLeft2" size={20} />
            Send message
          </Button>
          <label className={styles.search}>
            <Icon name="imgMagnify11" />
            <Input
              aria-label="Search candidates"
              placeholder="Search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
      </header>

      {(loading || apiError || saving) && (
        <div className={styles.feedback} role="status" aria-live="polite">
          {loading ? (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Spinner /> Loading candidates…
            </span>
          ) : apiError ? (
            <>
              <span>{apiError}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchCandidates(search)}
              >
                Retry
              </Button>
            </>
          ) : null}
          {saving && (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <Spinner /> Saving…
            </span>
          )}
        </div>
      )}

      <CandidateTable
        candidates={candidates}
        visible={visible}
        selected={selected}
        setSelected={setSelected}
        setDetail={setDetail}
        filters={filters}
        setFilter={setFilter}
        pageSize={pageSize}
        setPageSize={setPageSize}
        setPage={setPage}
        filtered={filtered}
        currentPage={currentPage}
        lastPage={lastPage}
        loading={loading}
      />
      <CandidateDialogs
        dialog={dialog}
        setDialog={setDialog}
        addCandidate={addCandidate}
        setAddValid={setAddValid}
        error={error}
        setError={setError}
        addValid={addValid}
        selected={selected}
        candidates={candidates}
        onDelete={deleteCandidates}
        filter={filter}
        setFilter={setFilter}
        activeColumn={activeColumn}
        filters={filters}
        setFilters={setFilters}
        setPage={setPage}
        saving={saving}
        deleting={deleting}
      />
      <CandidateSheets
        dialog={dialog}
        setDialog={setDialog}
        draft={draft}
        setDraft={setDraft}
        recipients={recipients}
        messageFeedback={messageFeedback}
        setMessageFeedback={setMessageFeedback}
        detail={detail}
        setDetail={setDetail}
        onSent={refreshAfterSend}
      />
    </main>
  );
}
