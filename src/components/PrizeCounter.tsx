import { formatLastUpdated } from "../lib/display";
import { formatCurrency, type PublicStatus } from "../lib/lottery";

export function PrizeCounter({ status }: { status: PublicStatus | null }) {
  if (status) {
    return (
      <div className="prize-counter" aria-live="polite">
        <p className="eyebrow eyebrow-light">Estimated prize so far</p>
        <p className="prize-number">{formatCurrency(status.winnerPrize)}</p>
        <p className="prize-description">Based on {formatCurrency(status.confirmedSales)} in entries submitted so far.</p>
        <p className="prize-meta">
          {status.confirmedEntryCount} entr{status.confirmedEntryCount === 1 ? "y" : "ies"} recorded · Updated {formatLastUpdated(status.lastUpdated)}
        </p>
      </div>
    );
  }

  return (
    <div className="prize-counter" aria-live="polite">
      <p className="eyebrow eyebrow-light">The prize</p>
      <p className="prize-number prize-number-placeholder">Half the final pot</p>
      <p className="prize-description">The winner will get half of the final pot.</p>
    </div>
  );
}
