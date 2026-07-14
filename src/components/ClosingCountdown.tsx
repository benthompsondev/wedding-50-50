import { useEffect, useState } from "react";
import { siteConfig } from "../config";
import { getCountdownParts, isConfigDate, padCountdownValue, type CountdownParts } from "../lib/lottery";

export function ClosingCountdown({ salesClosed }: { salesClosed: boolean }) {
  const [countdown, setCountdown] = useState<CountdownParts | null>(() =>
    getCountdownParts(siteConfig.salesClosingDate),
  );

  useEffect(() => {
    if (!isConfigDate(siteConfig.salesClosingDate)) return undefined;
    const update = () => setCountdown(getCountdownParts(siteConfig.salesClosingDate));
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  if (!countdown) return null;

  const units: Array<[number, string]> = [
    [countdown.days, "days"],
    [countdown.hours, "hours"],
    [countdown.minutes, "minutes"],
    [countdown.seconds, "seconds"],
  ];

  return (
    <div className="countdown-wrap" aria-live="polite">
      <p className="eyebrow">{salesClosed ? "Entries are closed" : "Time left"}</p>
      <div className="countdown" aria-label={salesClosed ? "Entries are closed" : "Countdown to entries closing"}>
        {units.map(([value, label]) => (
          <div className="countdown-unit" key={label}>
            <strong>{label === "days" ? value : padCountdownValue(value)}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
