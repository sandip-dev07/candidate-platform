"use client";

import type { Dispatch, SetStateAction, FormEvent } from "react";
import type { Candidate } from "@/lib/candidates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "@/styles/candidate-workspace.module.css";

interface Props {
  dialog: "add" | "delete" | "message" | null;
  setDialog: Dispatch<SetStateAction<"add" | "delete" | "message" | null>>;
  addCandidate: (event: FormEvent<HTMLFormElement>) => void;
  setAddValid: Dispatch<SetStateAction<boolean>>;
  error: string;
  setError: Dispatch<SetStateAction<string>>;
  addValid: boolean;
  selected: string[];
  candidates: Candidate[];
  onDelete: () => void;
  filter: string | null;
  setFilter: Dispatch<SetStateAction<string | null>>;
  activeColumn: readonly [string, string] | undefined;
  filters: Record<string, string>;
  setFilters: Dispatch<SetStateAction<Record<string, string>>>;
  setPage: Dispatch<SetStateAction<number>>;
  saving?: boolean;
  deleting?: boolean;
}

export function CandidateDialogs({
  dialog,
  setDialog,
  addCandidate,
  setAddValid,
  error,
  setError,
  addValid,
  selected,
  candidates,
  onDelete,
  filter,
  setFilter,
  activeColumn,
  filters,
  setFilters,
  setPage,
  saving = false,
  deleting = false,
}: Props) {
  return (
    <>
      <Dialog
        open={dialog === "add" || dialog === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent
          className={
            dialog === "add"
              ? styles.addCandidateDialog
              : dialog === "delete"
                ? `${styles.addCandidateDialog} ${styles.deleteCandidateDialog}`
                : styles.dialog
          }
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === "add"
                ? "Add Candidate"
                : dialog === "delete"
                  ? selected.length === 1
                    ? "Delete Candidate"
                    : "Delete Candidates"
                  : "Send message"}
            </DialogTitle>
            {dialog !== "delete" && (
              <DialogDescription
                className={dialog === "add" ? "sr-only" : undefined}
              >
                {dialog === "add"
                  ? "Add a candidate to this preview. Changes last until you refresh."
                  : `Compose a message for ${selected.length} selected candidate(s).`}
              </DialogDescription>
            )}
          </DialogHeader>
          {dialog === "add" && (
            <form
              className={styles.addCandidateForm}
              onSubmit={addCandidate}
              onChange={(event) => {
                const form = event.currentTarget;
                const data = new FormData(form);
                const name = String(data.get("name") ?? "").trim();
                const phone = String(data.get("phone") ?? "").trim();
                setAddValid(
                  form.checkValidity() &&
                    Boolean(name) &&
                    /^[+\d\s()-]{7,20}$/.test(phone) &&
                    phone.replace(/\D/g, "").length >= 7,
                );
                if (error) setError("");
              }}
            >
              <div className={styles.addCandidateFields}>
                <div className={styles.outlinedField}>
                  <Input
                    id="candidate-name"
                    name="name"
                    autoComplete="name"
                    placeholder=" "
                    required
                    maxLength={100}
                    disabled={saving}
                  />
                  <label htmlFor="candidate-name">
                    Candidate Name <span aria-hidden="true">*</span>
                  </label>
                </div>
                <div className={styles.outlinedField}>
                  <Input
                    id="candidate-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder=" "
                    required
                    maxLength={20}
                    disabled={saving}
                  />
                  <label htmlFor="candidate-phone">
                    Mobile Number <span aria-hidden="true">*</span>
                  </label>
                </div>
                <div className={styles.outlinedField}>
                  <Input
                    id="candidate-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder=" "
                    required
                    disabled={saving}
                  />
                  <label htmlFor="candidate-email">
                    Email <span aria-hidden="true">*</span>
                  </label>
                </div>
                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}
              </div>
              <div className={styles.addCandidateActions}>
                <Button
                  variant="outline"
                  type="button"
                  disabled={saving}
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!addValid || saving}>
                  {saving ? (
                    <>
                      <Spinner /> Adding…
                    </>
                  ) : (
                    "Add Candidate"
                  )}
                </Button>
              </div>
            </form>
          )}
          {dialog === "delete" && (
            <>
              <div className={styles.deleteCandidateBody}>
                <p className={styles.deleteCandidateQuestion}>
                  {selected.length === 1
                    ? "Are you sure you want to delete this Candidate?"
                    : `Are you sure you want to delete these ${selected.length} Candidates?`}
                </p>
                <DialogDescription className={styles.deleteCandidateWarning}>
                  This action cannot be undone, and you?ll lose all
                  communication history with{" "}
                  {candidates
                    .filter((candidate) => selected.includes(candidate.id))
                    .map((candidate) => candidate.name)
                    .join(", ")}
                  .
                </DialogDescription>
              </div>
              <div
                className={`${styles.addCandidateActions} ${styles.deleteCandidateActions}`}
              >
                <Button
                  variant="outline"
                  type="button"
                  disabled={deleting}
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  type="button"
                  disabled={!selected.length || deleting}
                  onClick={onDelete}
                >
                  {deleting ? (
                    <>
                      <Spinner /> Deleting…
                    </>
                  ) : selected.length === 1 ? (
                    "Delete Candidate"
                  ) : (
                    "Delete Candidates"
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={filter !== null}
        onOpenChange={(open) => {
          if (!open) setFilter(null);
        }}
      >
        <DialogContent className={styles.dialog}>
          <DialogHeader>
            <DialogTitle>Filter {activeColumn?.[1].toLowerCase()}</DialogTitle>
            <DialogDescription>
              Show candidates matching this value.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={`Filter ${activeColumn?.[1]}`}
            placeholder={
              filter === "status"
                ? "read, Failed, Sent, or NA"
                : "Enter a value"
            }
            value={filter ? (filters[filter] ?? "") : ""}
            onChange={(event) => {
              if (filter)
                setFilters((previous) => ({
                  ...previous,
                  [filter]: event.target.value,
                }));
              setPage(0);
            }}
          />
          <div className={styles.dialogActions}>
            <Button
              variant="outline"
              onClick={() => {
                if (filter)
                  setFilters((previous) => ({ ...previous, [filter]: "" }));
                setPage(0);
              }}
            >
              Clear
            </Button>
            <Button onClick={() => setFilter(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
