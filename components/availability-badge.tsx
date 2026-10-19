import { CircleCheck, Clock } from "lucide-react";

type AvailabilityBadgeProps = {
  name: string;
  confirmed: boolean;
};

export default function AvailabilityBadge({ name, confirmed }: AvailabilityBadgeProps) {
  const label = `${confirmed ? "Disponibilità confermata" : "Disponibilità non confermata"}: ${name}`;
  const Icon = confirmed ? CircleCheck : Clock;

  return <span className={`availability-badge ${confirmed ? "confirmed" : "pending"}`} role="img" aria-label={label} title={label}>
    <Icon size={15} aria-hidden="true" focusable="false" />
  </span>;
}
