export type Role = "Portiere" | "Difensore" | "Centrocampista" | "Attaccante";

export type Player = {
  id: string;
  name: string;
  role: Role;
  icon: string;
  photo?: string;
};

export type Season = { id: string; name: string };

export type Appearance = {
  playerId: string;
  team: "A" | "B";
  goals: number;
  rating: number | null;
};

export type Match = {
  id: string;
  seasonId: string;
  date: string;
  time: string;
  venue: string;
  status: "scheduled" | "completed";
  availableIds: string[];
  selectedIds: string[];
  appearances: Appearance[];
  scoreA: number;
  scoreB: number;
  mvpId: string | null;
};

export type ChatAttachment = { type: "sticker"; stickerId: string };

export type ChatMessage = {
  id: string;
  authorId: string;
  text: string;
  createdAt: string;
  mentionIds: string[];
  attachment?: ChatAttachment;
};

export type AppData = {
  version: 1;
  players: Player[];
  seasons: Season[];
  matches: Match[];
  messages: ChatMessage[];
};

export type PlayerStat = {
  player: Player;
  played: number;
  goals: number;
  average: number | null;
  mvps: number;
};

export const STORAGE_KEY = "calcetto-preview-v1";

export const STICKERS = [
  { id: "gol", label: "Gol", emoji: "⚽" },
  { id: "presente", label: "Ci sono", emoji: "🙋" },
  { id: "mvp", label: "MVP", emoji: "🏆" },
  { id: "parata", label: "Parata", emoji: "🧤" },
  { id: "assist", label: "Assist", emoji: "🎯" },
  { id: "bravo", label: "Bella giocata", emoji: "👏" },
] as const;

export const initialData: AppData = {
  version: 1,
  players: [
    { id: "trieu", name: "Trieu", role: "Portiere", icon: "🧤" },
    { id: "egor", name: "Egor", role: "Difensore", icon: "🛡️" },
    { id: "pippo", name: "Pippo", role: "Difensore", icon: "🛡️" },
    { id: "pujia", name: "Pujia", role: "Difensore", icon: "🛡️" },
    { id: "presidente", name: "Presidente", role: "Difensore", icon: "🛡️" },
    { id: "adriano", name: "Adriano", role: "Difensore", icon: "🛡️" },
    { id: "tiziano", name: "Tiziano", role: "Centrocampista", icon: "⚡" },
    { id: "lele", name: "Lele", role: "Centrocampista", icon: "⚡" },
    { id: "buba", name: "Buba", role: "Centrocampista", icon: "⚡" },
    { id: "michele", name: "Michele", role: "Centrocampista", icon: "⚡" },
    { id: "cristian", name: "Cristian", role: "Centrocampista", icon: "⚡" },
    { id: "baldo", name: "Baldo", role: "Attaccante", icon: "🎯" },
    { id: "fiori", name: "Fiori", role: "Attaccante", icon: "🎯" },
    { id: "gigi", name: "Gigi", role: "Attaccante", icon: "🎯" },
    { id: "arossa", name: "Arossa", role: "Attaccante", icon: "🎯" },
  ],
  seasons: [],
  matches: [],
  messages: [],
};

function freshData(): AppData {
  return {
    version: 1,
    players: initialData.players.map((player) => ({ ...player })),
    seasons: [],
    matches: [],
    messages: [],
  };
}

export function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Keeps the supplied order; confirmations and participant validation stay separate. */
export function createAppearances(playerIds: string[]): Appearance[] {
  return playerIds.map((playerId, index) => ({
    playerId,
    team: index < 5 ? "A" : "B",
    goals: 0,
    rating: null,
  }));
}

/** Finds complete @names, including names with spaces, in their first mention order. */
export function findMentionIds(text: string, players: Player[]): string[] {
  const namedPlayers = players.filter((player) => player.name.trim().length > 0);
  if (!text || !namedPlayers.length) return [];
  const escapedNames = [...namedPlayers]
    .sort((a, b) => b.name.length - a.name.length)
    .map((player) => player.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}\\p{M}_@])@(${escapedNames.join("|")})(?![\\p{L}\\p{N}\\p{M}_])`,
    "giu",
  );
  const byName = new Map(namedPlayers.map((player) => [player.name.toLocaleLowerCase("it"), player.id]));
  const mentioned = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const id = byName.get(match[1].toLocaleLowerCase("it"));
    if (id) mentioned.add(id);
  }
  return [...mentioned];
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRating(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && value >= 1 && value <= 10 && Number.isInteger(value * 2))
  );
}

export function validateCompletion(match: Match): string[] {
  const errors: string[] = [];
  const participants = new Set(match.appearances.map((appearance) => appearance.playerId));
  const selected = new Set(match.selectedIds);

  if (match.appearances.length !== 10 || participants.size !== 10) {
    errors.push("Servono esattamente dieci giocatori distinti in campo.");
  }
  if (match.selectedIds.length !== 10 || selected.size !== 10) {
    errors.push("Seleziona dieci convocati distinti.");
  }
  if (
    match.appearances.filter((appearance) => appearance.team === "A").length !== 5 ||
    match.appearances.filter((appearance) => appearance.team === "B").length !== 5
  ) {
    errors.push("Ogni squadra deve avere cinque giocatori.");
  }
  if (
    match.appearances.some((appearance) => !selected.has(appearance.playerId)) ||
    match.selectedIds.some((id) => !participants.has(id))
  ) {
    errors.push("Tutti i partecipanti devono essere convocati e assegnati a una squadra.");
  }
  if (match.appearances.some((appearance) => !isNonnegativeInteger(appearance.goals))) {
    errors.push("I gol devono essere numeri interi maggiori o uguali a zero.");
  }
  if (match.appearances.some((appearance) => !isRating(appearance.rating))) {
    errors.push("I voti devono essere tra 1 e 10, con incrementi di mezzo punto, oppure lasciati vuoti.");
  }
  if (!isNonnegativeInteger(match.scoreA) || !isNonnegativeInteger(match.scoreB)) {
    errors.push("Il risultato deve contenere numeri interi maggiori o uguali a zero.");
  }
  if (match.mvpId !== null && !participants.has(match.mvpId)) {
    errors.push("L’MVP deve essere uno dei giocatori in campo.");
  }

  // The final score may differ from individual goals: own goals are not tracked.
  return errors;
}

export function getStats(data: AppData, seasonId?: string): PlayerStat[] {
  const totals = new Map(
    data.players.map((player) => [
      player.id,
      { player, played: 0, goals: 0, mvps: 0, ratingSum: 0, ratingCount: 0 },
    ]),
  );

  for (const match of data.matches) {
    if (match.status !== "completed" || (seasonId && match.seasonId !== seasonId)) continue;
    for (const appearance of match.appearances) {
      const stat = totals.get(appearance.playerId);
      if (!stat) continue;
      stat.played += 1;
      stat.goals += appearance.goals;
      if (appearance.rating !== null) {
        stat.ratingSum += appearance.rating;
        stat.ratingCount += 1;
      }
      if (match.mvpId === appearance.playerId) stat.mvps += 1;
    }
  }

  return Array.from(totals.values(), (stat) => ({
    player: stat.player,
    played: stat.played,
    goals: stat.goals,
    average: stat.ratingCount ? stat.ratingSum / stat.ratingCount : null,
    mvps: stat.mvps,
  })).sort((a, b) => b.goals - a.goals || b.played - a.played || a.player.name.localeCompare(b.player.name, "it"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isId(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId) && new Set(value).size === value.length;
}

function isPlayer(value: unknown): value is Player {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.name) &&
    ["Portiere", "Difensore", "Centrocampista", "Attaccante"].includes(value.role as string) &&
    isString(value.icon) &&
    (value.photo === undefined ||
      (isString(value.photo) && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value.photo)))
  );
}

function isSeason(value: unknown): value is Season {
  return isRecord(value) && isId(value.id) && isId(value.name);
}

function isAppearance(value: unknown): value is Appearance {
  return (
    isRecord(value) &&
    isId(value.playerId) &&
    (value.team === "A" || value.team === "B") &&
    isNonnegativeInteger(value.goals) &&
    isRating(value.rating)
  );
}

function isMatch(value: unknown): value is Match {
  return (
    isRecord(value) &&
    isId(value.id) &&
    isId(value.seasonId) &&
    isString(value.date) &&
    isString(value.time) &&
    isString(value.venue) &&
    (value.status === "scheduled" || value.status === "completed") &&
    isStringList(value.availableIds) &&
    isStringList(value.selectedIds) &&
    Array.isArray(value.appearances) &&
    value.appearances.every(isAppearance) &&
    isNonnegativeInteger(value.scoreA) &&
    isNonnegativeInteger(value.scoreB) &&
    (value.mvpId === null || isId(value.mvpId))
  );
}

export function isChatAttachment(value: unknown): value is ChatAttachment {
  return isRecord(value) && value.type === "sticker" &&
    Object.keys(value).every((key) => key === "type" || key === "stickerId") &&
    STICKERS.some((sticker) => sticker.id === value.stickerId);
}

/** Strip media from existing conversations without dropping messages or sports data. */
export function removeChatMedia(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.messages)) return value;
  let changed = false;
  const messages = value.messages.map((message: unknown) => {
    if (!isRecord(message) || message.attachment === undefined ||
      (isRecord(message.attachment) && message.attachment.type === "sticker")) return message;
    changed = true;
    const { attachment: _removed, ...rest } = message;
    return { ...rest, text: isString(rest.text) && rest.text.trim() ? rest.text : "Allegato rimosso" };
  });
  return changed ? { ...value, messages } : value;
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => ["id", "authorId", "text", "createdAt", "mentionIds", "attachment"].includes(key)) &&
    isId(value.id) &&
    isId(value.authorId) &&
    isString(value.text) && value.text.length <= 2000 &&
    isString(value.createdAt) && Number.isFinite(Date.parse(value.createdAt)) &&
    isStringList(value.mentionIds) &&
    (value.attachment === undefined || isChatAttachment(value.attachment)) &&
    (value.text.trim().length > 0 || value.attachment !== undefined)
  );
}

export function isAppData(value: unknown): value is AppData {
  if (
    !isRecord(value) || value.version !== 1 ||
    !Array.isArray(value.players) || !value.players.every(isPlayer) ||
    !Array.isArray(value.seasons) || !value.seasons.every(isSeason) ||
    !Array.isArray(value.matches) || !value.matches.every(isMatch) ||
    !Array.isArray(value.messages) || !value.messages.every(isChatMessage)
  ) return false;

  const players = new Set(value.players.map((player) => player.id));
  const seasons = new Set(value.seasons.map((season) => season.id));
  if (
    players.size !== value.players.length ||
    seasons.size !== value.seasons.length ||
    new Set(value.matches.map((match) => match.id)).size !== value.matches.length ||
    new Set(value.messages.map((message) => message.id)).size !== value.messages.length
  ) return false;

  const validMessages = value.messages.every((message) =>
    (message.authorId === "admin" || players.has(message.authorId)) &&
    message.mentionIds.every((id) => players.has(id)),
  );

  return validMessages && value.matches.every((match) =>
    seasons.has(match.seasonId) &&
    match.availableIds.every((id) => players.has(id)) &&
    match.selectedIds.every((id) => players.has(id)) &&
    match.appearances.every((appearance) => players.has(appearance.playerId)) &&
    (match.mvpId === null || match.appearances.some((appearance) => appearance.playerId === match.mvpId)) &&
    (match.status !== "completed" || validateCompletion(match).length === 0),
  );
}

export function loadData(): AppData {
  if (typeof window === "undefined") return freshData();
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return freshData();
    const parsed: unknown = JSON.parse(saved);
    if (isRecord(parsed) && parsed.version === 1 && !("messages" in parsed)) {
      parsed.messages = [];
    }
    const migrated = removeChatMedia(parsed);
    if (!isAppData(migrated)) return freshData();
    if (migrated !== parsed) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); }
      catch { /* Still show the cleaned conversation if this browser blocks writes. */ }
    }
    return migrated;
  } catch {
    return freshData();
  }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") {
    throw new Error("L’archiviazione locale è disponibile solo nel browser.");
  }
  // Quota and storage-access failures intentionally reach the interface.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Compare JSON data without depending on the object key order returned by PostgreSQL. */
export function equalData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equalData(value, right[index]));
  if (!isRecord(left) || !isRecord(right)) return false;
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  const other = Object.keys(right).filter(key => right[key] !== undefined);
  return keys.length === other.length && keys.every(key => Object.hasOwn(right, key) && equalData(left[key], right[key]));
}
