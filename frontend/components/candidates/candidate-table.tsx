"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Candidate } from "@/lib/candidates";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MessageStatus } from "@/lib/candidates";
import styles from "@/styles/candidate-workspace.module.css";

export function CandidateIcon({
  name,
  size = 16,
}: {
  name: string;
  size?: number;
}) {
  return (
    <Image
      src={`/figma/${name}.svg`}
      width={size}
      height={size}
      alt=""
      unoptimized
    />
  );
}

export function CandidateStatus({ status }: { status: MessageStatus | null }) {
  if (!status) return <span className={styles.unavailable}>NA</span>;
  const normalized = status.toLowerCase();
  const display =
    normalized === "sent" ? "Sent" : normalized === "delivered" ? "Delivered" : normalized === "failed" ? "Failed" : status;
  return (
    <Badge className={styles.status} data-status={display}>
      {(normalized === "read" || normalized === "delivered") && (
        <CandidateIcon name="imgCheckFilled" />
      )}
      {normalized === "failed" && <CandidateIcon name="imgErrorOutline" />}
      <span>{display}</span>
    </Badge>
  );
}

export const candidateColumns = [
  ["name", "Full name"],
  ["phone", "Mobile number"],
  ["lastMessage", "Last message"],
  ["status", "Status"],
  ["id", "Candidate ID"],
] as const;

interface Props {
  candidates: Candidate[];
  visible: Candidate[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  setDetail: Dispatch<SetStateAction<Candidate | null>>;
  filters: Record<string, string>;
  setFilter: Dispatch<SetStateAction<string | null>>;
  pageSize: number;
  setPageSize: Dispatch<SetStateAction<number>>;
  setPage: Dispatch<SetStateAction<number>>;
  filtered: Candidate[];
  currentPage: number;
  lastPage: number;
  loading?: boolean;
}

export function CandidateTable({
  candidates,
  visible,
  selected,
  setSelected,
  setDetail,
  filters,
  setFilter,
  pageSize,
  setPageSize,
  setPage,
  filtered,
  currentPage,
  lastPage,
  loading = false,
}: Props) {
  const allSelected =
    visible.length > 0 &&
    visible.every((candidate) => selected.includes(candidate.id));
  const someSelected = visible.some((candidate) =>
    selected.includes(candidate.id),
  );
  return (
    <section className={styles.panel} aria-label="Candidates" aria-busy={loading}>
      <div className={styles.tableArea}>
        <Table className={styles.table}>
          <caption className="sr-only">
            Candidates and their latest communication status
          </caption>
          <colgroup>
            <col className={styles.checkboxColumn} />
            <col className={styles.nameColumn} />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox
                  className={styles.checkbox}
                  aria-label="Select all candidates on this page"
                  checked={allSelected}
                  disabled={!visible.length}
                  indeterminate={!allSelected && someSelected}
                  onCheckedChange={(checked) =>
                    setSelected((previous) =>
                      checked
                        ? [
                            ...new Set([
                              ...previous,
                              ...visible.map((candidate) => candidate.id),
                            ]),
                          ]
                        : previous.filter(
                            (id) =>
                              !visible.some((candidate) => candidate.id === id),
                          ),
                    )
                  }
                />
              </TableHead>
              {candidateColumns.map(([key, label]) => (
                <TableHead key={key}>
                  <div className={styles.columnHeader}>
                    {label}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Filter ${label.toLowerCase()}`}
                      className={filters[key] ? styles.activeFilter : ""}
                      onClick={() => setFilter(key)}
                    >
                      <CandidateIcon name="imgFilterVariant" />
                    </Button>
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && candidates.length === 0
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`loading-${i}`}>
                    <TableCell>
                      <Skeleton className="h-5 w-5" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              : visible.map((candidate) => (
              <TableRow
                key={candidate.id}
                data-state={
                  selected.includes(candidate.id) ? "selected" : undefined
                }
              >
                <TableCell>
                  <Checkbox
                    className={styles.checkbox}
                    aria-label={`Select ${candidate.name}`}
                    checked={selected.includes(candidate.id)}
                    onCheckedChange={(checked) =>
                      setSelected((previous) =>
                        checked
                          ? [...previous, candidate.id]
                          : previous.filter((id) => id !== candidate.id),
                      )
                    }
                  />
                </TableCell>
                <TableCell>
                  <button
                    className={styles.name}
                    onClick={() => setDetail(candidate)}
                  >
                    {candidate.name}
                  </button>
                </TableCell>
                <TableCell>{candidate.phone}</TableCell>
                <TableCell>
                  <span
                    className={
                      !candidate.lastMessage ? styles.unavailable : undefined
                    }
                  >
                    {candidate.lastMessage ?? "NA"}
                  </span>
                </TableCell>
                <TableCell>
                  <CandidateStatus status={candidate.status} />
                </TableCell>
                <TableCell className={styles.idCell} title={candidate.id}>
                  {candidate.id}
                </TableCell>
              </TableRow>
            ))}
            {candidates.length > 0 && !visible.length && !loading && (
              <TableRow>
                <TableCell colSpan={6} className={styles.empty}>
                  <strong>
                    {candidates.length
                      ? "No candidates found"
                      : "No candidates yet"}
                  </strong>
                  <p>
                    {candidates.length
                      ? "Try another search or clear your filters."
                      : "Add a candidate to start a conversation."}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {candidates.length === 0 && !loading ? (
          <section
            className={styles.candidatesEmpty}
            aria-label="No candidates added"
          >
            <Image
              src="/figma/empty-communucation.svg"
              alt=""
              width={220}
              height={220}
              unoptimized
            />
            <h2>No candidates added</h2>
            <p>When you add a candidate, they will appear here.</p>
          </section>
        ) : (
          <div aria-hidden="true" className={styles.gridFiller} />
        )}
      </div>
      {candidates.length > 0 && (
        <footer className={styles.footer}>
          <label className={styles.pageSize}>
            Rows per page:
            <span>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(0);
                }}
              >
                <option>5</option>
                <option>10</option>
                <option>25</option>
              </select>
              <CandidateIcon name="imgArrowDropDownFilled" size={24} />
            </span>
          </label>
          <span>
            {filtered.length ? currentPage * pageSize + 1 : 0}-
            {Math.min((currentPage + 1) * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <nav className={styles.pagination} aria-label="Candidate pages">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="First page"
              disabled={currentPage === 0}
              onClick={() => setPage(0)}
            >
              <Image
                className={styles.pageEdge}
                src="/figma/imgGroup1.svg"
                alt=""
                width={1241}
                height={1200}
                unoptimized
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <CandidateIcon name="imgChevronLeftOutlined" size={24} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={currentPage === lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              <CandidateIcon name="imgChevronRightOutlined" size={24} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Last page"
              disabled={currentPage === lastPage}
              onClick={() => setPage(lastPage)}
            >
              <Image
                className={`${styles.pageEdge} ${styles.lastPage}`}
                src="/figma/imgGroup1.svg"
                alt=""
                width={1241}
                height={1200}
                unoptimized
              />
            </Button>
          </nav>
        </footer>
      )}
    </section>
  );
}
