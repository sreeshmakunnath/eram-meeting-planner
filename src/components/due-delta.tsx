/** How a completed task finished against its due date: "−2d early", "On time" or "+3d late". `days` comes from completionDelta. */
export function DueDelta({ days }: { days: number | null }) {
  if (days === null) return null;
  const [text, tone, title] =
    days === 0
      ? ["On time", "text-emerald-700", "Completed on the due date"]
      : days < 0
        ? [`−${-days}d early`, "text-emerald-700", `Completed ${-days} day${days === -1 ? "" : "s"} before the due date`]
        : [`+${days}d late`, "text-red-600", `Completed ${days} day${days === 1 ? "" : "s"} after the due date`];
  return (
    <span className={`font-medium ${tone}`} title={title}>
      {text}
    </span>
  );
}
