import { calculateAmountForEntryCount, formatCurrency, parseEntryCount } from "../lib/lottery";

type EntryPickerProps = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

export function EntryPicker({ value, error, onChange }: EntryPickerProps) {
  const quickChoices = [1, 3, 6, 9, 12];
  const parsed = parseEntryCount(value);
  const entryCount = parsed ?? 1;
  const amount = calculateAmountForEntryCount(entryCount);

  function adjust(delta: number): void {
    const current = parseEntryCount(value) ?? 1;
    onChange(String(Math.min(99, Math.max(1, current + delta))));
  }

  return (
    <div className="ticket-picker" aria-describedby={error ? "entry-count-error" : undefined}>
      <div className="ticket-picker-heading">
        <div>
          <p className="eyebrow">Entries</p>
          <h3>How many entries?</h3>
        </div>
        <span className="ticket-limit">1–99 entries</span>
      </div>
      <p className="ticket-picker-copy">
        Entries are $10 each or 3 for $25. Every entry puts your name in the jar once.
      </p>
      <div className="quick-select" role="group" aria-label="Quick entry quantities">
        {quickChoices.map((choice) => (
          <button
            className={parsed === choice ? "quick-choice quick-choice-selected" : "quick-choice"}
            type="button"
            key={choice}
            aria-pressed={parsed === choice}
            onClick={() => onChange(String(choice))}
          >
            {choice}
          </button>
        ))}
      </div>
      <div className="quantity-control">
        <button className="quantity-stepper" type="button" aria-label="Remove one entry" disabled={parsed === 1} onClick={() => adjust(-1)}>−</button>
        <label className="quantity-input-label" htmlFor="entryCount">
          <span className="sr-only">Number of entries</span>
          <input
            id="entryCount"
            name="entryCount"
            className="quantity-input"
            type="number"
            min="1"
            max="99"
            inputMode="numeric"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "entry-count-error" : "entry-count-help"}
          />
        </label>
        <button className="quantity-stepper" type="button" aria-label="Add one entry" disabled={parsed === 99} onClick={() => adjust(1)}>+</button>
      </div>
      <p className="ticket-summary" id="entry-count-help">
        {parsed === null ? "Choose a whole number from 1 to 99." : <><strong>{entryCount} {entryCount === 1 ? "entry" : "entries"}</strong> · {formatCurrency(amount)}</>}
      </p>
      {error ? <span className="field-error" id="entry-count-error">{error}</span> : null}
    </div>
  );
}
