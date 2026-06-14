import { Button } from "./Button";
import "./Pagination.css";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
}

export function Pagination({
  total,
  limit,
  offset,
  onPrev,
  onNext,
}: PaginationProps) {
  if (total <= limit) return null;

  const start = offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <nav className="pagination" aria-label="Page navigation">
      <Button
        variant="secondary"
        className="pagination__prev"
        disabled={offset === 0}
        onClick={onPrev}
      >
        ‹ Previous
      </Button>
      <span className="pagination__range">
        {start}–{end} of {total} words
      </span>
      <Button
        variant="secondary"
        className="pagination__next"
        disabled={offset + limit >= total}
        onClick={onNext}
      >
        Next ›
      </Button>
    </nav>
  );
}
