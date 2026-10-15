"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Candidate } from "@/lib/candidates";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ApiError,
  getCandidateHistory,
  retryMessage,
  sendBulk,
  sendMessage,
  type ApiMessage,
} from "@/lib/api";
import {
  formatApiTimestamp,
  initialCommunicationHistory,
  toDisplayStatus,
} from "@/lib/candidates";
import { notifyError, notifyLoading, resolveToast } from "@/lib/notify";
import { CandidateStatus } from "./candidate-table";
import styles from "@/styles/candidate-workspace.module.css";

interface Props {
  dialog: "add" | "delete" | "message" | null;
  setDialog: Dispatch<SetStateAction<"add" | "delete" | "message" | null>>;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  recipients: Candidate[];
  messageFeedback: string;
  setMessageFeedback: Dispatch<SetStateAction<string>>;
  detail: Candidate | null;
  setDetail: Dispatch<SetStateAction<Candidate | null>>;
  onSent?: (candidateIds: string[]) => void | Promise<void>;
}

export function CandidateSheets({
  dialog,
  setDialog,
  draft,
  setDraft,
  recipients,
  messageFeedback,
  setMessageFeedback,
  detail,
  setDetail,
  onSent,
}: Props) {
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<ApiMessage[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Load communication history from GET /candidates/{id}/messages when a candidate is opened.
  useEffect(() => {
    if (!detail) {
      setHistory([]);
      setHistoryError("");
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");
    getCandidateHistory(detail.id, { limit: 50 })
      .then((data) => {
        if (!cancelled) setHistory(data.items);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const fallback = initialCommunicationHistory[detail.id];
        if (fallback?.length) {
          // Offline/fixture fallback for the pre-API demo row.
          setHistory([]);
          setHistoryError("");
        } else {
          const message = e instanceof ApiError ? e.message : "Could not load history.";
          setHistoryError(message);
          notifyError("Could not load history", message);
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail]);

  async function handleSend(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !recipients.length || sending) return;
    setSending(true);
    const toastId = notifyLoading(
      recipients.length === 1
        ? `Sending message to ${recipients[0].name}…`
        : `Sending to ${recipients.length} candidates…`,
    );
    setMessageFeedback("Sending…");
    try {
      if (recipients.length === 1) {
        const msg = await sendMessage(recipients[0].id, draft.trim());
        const status = msg.status.toLowerCase();
        if (status === "failed") {
          const detail = `${msg.error_message ?? "Delivery failed."} ${msg.retryable ? "You can retry it from the candidate's history." : ""}`.trim();
          setMessageFeedback(`Message failed: ${detail}`);
          resolveToast(toastId, false, "Message failed", detail);
        } else {
          setMessageFeedback(`Message ${status} to ${recipients[0].name}.`);
          resolveToast(toastId, true, `Message ${status}`, `To ${recipients[0].name}.`);
          setDraft("");
        }
        await onSent?.([recipients[0].id]);
      } else {
        const result = await sendBulk(
          recipients.map((r) => r.id),
          draft.trim(),
        );
        const failedNames = result.results
          .filter((r) => r.message_id === null || r.status === "failed")
          .map((r) => recipients.find((c) => c.id === r.candidate_id)?.name ?? r.candidate_id);
        if (result.failed === 0) {
          setMessageFeedback(`Sent to all ${result.total} candidates. Each delivery is tracked independently.`);
          resolveToast(toastId, true, `Sent to all ${result.total} candidates`);
          setDraft("");
        } else if (result.sent === 0) {
          const detail = `All ${result.total} failed${failedNames.length ? `: ${failedNames.join(", ")}` : "."} No candidate blocked the others; each result is tracked independently.`;
          setMessageFeedback(detail);
          resolveToast(toastId, false, "All messages failed", detail);
        } else {
          const detail = `Sent to ${result.sent} of ${result.total}; ${result.failed} failed${failedNames.length ? ` (${failedNames.join(", ")})` : ""}. Each result is tracked independently.`;
          setMessageFeedback(detail);
          resolveToast(toastId, false, `Partial send: ${result.sent} of ${result.total} sent`, detail);
          setDraft("");
        }
        await onSent?.(recipients.map((r) => r.id));
      }
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Could not send message.";
      setMessageFeedback(message);
      resolveToast(toastId, false, "Could not send message", message);
    } finally {
      setSending(false);
    }
  }

  async function handleRetry(messageId: string) {
    const toastId = notifyLoading("Retrying message…");
    setRetryingId(messageId);
    setHistoryError("");
    try {
      const updated = await retryMessage(messageId);
      setHistory((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      if (detail) await onSent?.([detail.id]);
      const ok = updated.status.toLowerCase() !== "failed";
      resolveToast(
        toastId,
        ok,
        ok ? `Message ${updated.status}` : "Retry failed",
        ok ? undefined : (updated.error_message ?? "Delivery failed again."),
      );
      if (!ok) setHistoryError(updated.error_message ?? "Delivery failed again.");
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Retry failed.";
      setHistoryError(message);
      resolveToast(toastId, false, "Retry failed", message);
    } finally {
      setRetryingId(null);
    }
  }

  const fallbackHistory = detail ? initialCommunicationHistory[detail.id] ?? [] : [];

  return (
    <>
      <Sheet
        open={dialog === "message"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <SheetContent side="right" className={styles.messageSheet}>
          <SheetHeader className={styles.messageSheetHeader}>
            <SheetTitle>Send Message</SheetTitle>
            <SheetDescription className="sr-only">
              Compose a message for the selected candidates.
            </SheetDescription>
          </SheetHeader>
          <form className={styles.messageSheetForm} onSubmit={handleSend}>
            <div className={styles.messageSheetBody}>
              <section aria-label="Message recipients" className={styles.messageRecipients}>
                <p>
                  {recipients.length} {recipients.length === 1 ? "Recipient" : "Recipients"}
                </p>
                <ul className={styles.recipientChips}>
                  {recipients.map((candidate) => (
                    <li key={candidate.id}>
                      <Badge className={styles.recipientChip}>{candidate.name}</Badge>
                    </li>
                  ))}
                </ul>
              </section>
              <div className={styles.messageField}>
                <label htmlFor="candidate-message">
                  Message <span aria-hidden="true">*</span>
                </label>
                <p id="candidate-message-help">Type, or paste the message you want to send.</p>
                <Textarea
                  id="candidate-message"
                  name="message"
                  aria-describedby="candidate-message-help"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setMessageFeedback("");
                  }}
                  placeholder="Type or paste here..."
                  required
                  maxLength={2000}
                  rows={8}
                  disabled={sending}
                />
              </div>
              {messageFeedback && (
                <p role="status" className={styles.messageFeedback}>
                  {messageFeedback}
                </p>
              )}
            </div>
            <div className={`${styles.addCandidateActions} ${styles.messageSheetActions}`}>
              <Button variant="outline" type="button" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!draft.trim() || !recipients.length || sending}>
                {sending ? (
                  <>
                    <Spinner /> Sending…
                  </>
                ) : recipients.length > 1 ? (
                  `Send to ${recipients.length} Candidates`
                ) : (
                  "Send Message"
                )}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <SheetContent side="right" className={`${styles.messageSheet} ${styles.historySheet}`}>
          <SheetHeader className={styles.messageSheetHeader}>
            <SheetTitle>Communication history</SheetTitle>
            <SheetDescription className="sr-only">
              Contact details and message history for {detail?.name}.
            </SheetDescription>
          </SheetHeader>
          {detail && (
            <div className={styles.historyBody} key={detail.id}>
              <section className={styles.historyContact} aria-label="Candidate details">
                <p className={styles.historyCandidateId}>Candidate ID: {detail.id}</p>
                <h2>{detail.name}</h2>
                <p>{detail.phone}</p>
                {detail.email && <p>{detail.email}</p>}
              </section>
              {historyLoading ? (
                <ol aria-label="Loading messages">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li key={`history-loading-${i}`} className={styles.historyEntry}>
                      <div className={styles.historyEntryHeader}>
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-6 w-20" />
                      </div>
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="mt-2 h-4 w-3/4" />
                    </li>
                  ))}
                </ol>
              ) : historyError ? (
                <div>
                  <p role="alert" className={styles.error}>
                    {historyError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setDetail({ ...detail })}
                  >
                    Retry
                  </Button>
                </div>
              ) : history.length > 0 ? (
                <ol className={styles.historyList} aria-label="Messages, newest first">
                  {history.map((message) => {
                    const { date, time } = formatApiTimestamp(message.created_at);
                    const failed = message.status.toLowerCase() === "failed";
                    return (
                      <li key={message.id} className={styles.historyEntry}>
                        <div className={styles.historyEntryHeader}>
                          <p className={styles.historyTimestamp}>
                            <span>{date}</span>
                            <span aria-hidden="true">|</span>
                            <span>{time}</span>
                          </p>
                          <CandidateStatus status={toDisplayStatus(message.status)} />
                        </div>
                        <p className={styles.historyMessage}>{message.body}</p>
                        {failed && message.error_message && (
                          <p className={styles.error} style={{ marginTop: 8, fontSize: 13 }}>
                            {message.error_message}
                          </p>
                        )}
                        {failed && (
                          <Button
                            variant="outline"
                            size="sm"
                            style={{ marginTop: 8 }}
                            disabled={retryingId === message.id || !message.retryable}
                            title={message.retryable ? "Retry this message" : "This failure is permanent and cannot be retried"}
                            onClick={() => void handleRetry(message.id)}
                          >
                            {retryingId === message.id ? (
                              <>
                                <Spinner /> Retrying…
                              </>
                            ) : message.retryable ? (
                              "Retry"
                            ) : (
                              "Cannot retry (permanent)"
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : fallbackHistory.length > 0 ? (
                <ol className={styles.historyList} aria-label="Messages, newest first">
                  {fallbackHistory.map((message) => (
                    <li key={message.id} className={styles.historyEntry}>
                      <div className={styles.historyEntryHeader}>
                        <p className={styles.historyTimestamp}>
                          <span>{message.date}</span>
                          <span aria-hidden="true">|</span>
                          <span>{message.time}</span>
                        </p>
                        <CandidateStatus status={message.status} />
                      </div>
                      <p className={styles.historyMessage}>{message.text}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <section className={styles.historyEmpty} aria-label="No communication history">
                  <Image
                    src="/figma/empty-communucation.svg"
                    alt=""
                    width={220}
                    height={220}
                    className={styles.historyEmptyIllustration}
                    unoptimized
                  />
                  <h3 className={styles.historyEmptyTitle}>No communication history</h3>
                  <p>
                    You have not communicated with this candidate yet.
                    <br />
                    When you send them a message, it will appear here.
                  </p>
                </section>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
