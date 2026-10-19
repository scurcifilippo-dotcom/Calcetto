"use client";

import { Check, Circle } from "lucide-react";
import type { Player } from "../lib/model";
import AvailabilityBadge from "./availability-badge";

type MatchParticipantsPickerProps = {
  players: Player[];
  selectedIds: string[];
  confirmedIds?: string[];
  onToggle: (id: string) => void;
  disabled?: boolean;
  showAvailability?: boolean;
};

export default function MatchParticipantsPicker({
  players,
  selectedIds,
  confirmedIds = [],
  onToggle,
  disabled = false,
  showAvailability = true,
}: MatchParticipantsPickerProps) {
  const selected = new Set(selectedIds);
  const confirmed = new Set(confirmedIds);

  return <div className="choice-grid" role="group" aria-label="Partecipanti alla partita">
    {players.map((player) => {
      const isSelected = selected.has(player.id);
      const isDisabled = disabled || (!isSelected && selected.size >= 10);
      const SelectionIcon = isSelected ? Check : Circle;

      return <button
        type="button"
        key={player.id}
        className={`player-choice ${isSelected ? "selected" : ""}`}
        aria-pressed={isSelected}
        aria-label={isSelected ? `Rimuovi partecipante ${player.name}` : `Seleziona ${player.name}`}
        disabled={isDisabled}
        onClick={() => { if (!isDisabled) onToggle(player.id); }}
      >
        <span className="player-avatar" aria-hidden="true">{player.photo ? <img src={player.photo} alt="" /> : player.icon}</span>
        <span className="player-meta">
          <span className="participant-name"><strong className="player-name">{player.name}</strong>{showAvailability && <AvailabilityBadge name={player.name} confirmed={confirmed.has(player.id)} />}</span>
          <span className="player-role">{player.role}</span>
        </span>
        <SelectionIcon size={15} aria-hidden="true" focusable="false" />
      </button>;
    })}
  </div>;
}
