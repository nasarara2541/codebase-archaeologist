type MetricCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: "lime" | "blue" | "violet";
};

export function MetricCard({ label, value, detail, tone = "lime" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
