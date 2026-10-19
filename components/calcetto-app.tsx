"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, Camera, Check, ChevronRight, Clock, Goal, Home, Info, MapPin, MessageSquare, Plus, Search, Shield, Star, Target, Trophy, Users, X } from "lucide-react";
import { equalData, createAppearances, getStats, initialData, loadData, newId, saveData, validateCompletion, type AppData, type Appearance, type Match, type Player, type PlayerStat, type Role } from "@/lib/model";
import NewPlayerForm from "@/components/new-player-form";
import AvailabilityBadge from "@/components/availability-badge";
import MatchParticipantsPicker from "@/components/match-participants-picker";
import GroupChat from "@/components/group-chat";
import { compactPhoto } from "@/lib/photo";
import type { LiveConnection } from "@/lib/live";

type View = "home" | "matches" | "players" | "stats" | "chat";
const views = [{ id: "home", label: "Home", icon: Home }, { id: "matches", label: "Partite", icon: CalendarDays }, { id: "players", label: "Giocatori", icon: Users }, { id: "stats", label: "Statistiche", icon: BarChart3 }, { id: "chat", label: "Chat", icon: MessageSquare }] as const;
const roles: Role[] = ["Portiere", "Difensore", "Centrocampista", "Attaccante"];
const icons = ["⚽", "🧤", "🛡️", "⚡", "🎯", "🦁", "🐺", "🦅", "🔥", "🚀", "👑", "⭐"];
const scoreNumber = (v: string) => {
  const number = Number(v);
  return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number))) : 0;
};
const formatAverage = (v: number | null) => v === null ? "—" : v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const matchDate = (m: Match) => new Date(`${m.date}T${m.time || "12:00"}`).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

function Avatar({ player, small = false }: { player: Player; small?: boolean }) {
  return <span className={small ? "mini-avatar" : "player-avatar"} aria-hidden="true">{player.photo ? <img src={player.photo} alt="" /> : player.icon}</span>;
}

function PitchArt() {
  return <svg className="pitch-art" viewBox="0 0 500 330" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="pitch-line" x1="75" y1="30" x2="400" y2="300"><stop stopColor="#89caff" stopOpacity=".05" /><stop offset=".55" stopColor="#89caff" stopOpacity=".8" /><stop offset="1" stopColor="#80c7ff" stopOpacity=".2" /></linearGradient>
      <radialGradient id="pitch-glow"><stop stopColor="#6fa8ff" stopOpacity=".23" /><stop offset="1" stopColor="#5a86c9" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="265" cy="175" rx="235" ry="155" fill="url(#pitch-glow)" />
    <g transform="translate(95 25) rotate(-18 170 145) skewX(12)">
      <rect x="15" y="15" width="300" height="250" rx="8" stroke="url(#pitch-line)" strokeWidth="1.5" />
      <rect x="28" y="28" width="274" height="224" rx="2" stroke="url(#pitch-line)" />
      <path d="M28 140H302M108 28V75H222V28M108 252V205H222V252M140 28V49H190V28M140 252V231H190V252" stroke="url(#pitch-line)" />
      <ellipse cx="165" cy="140" rx="38" ry="31" stroke="url(#pitch-line)" />
      <circle cx="165" cy="140" r="3" fill="#89caff" />
      {[[75, 67], [165, 85], [255, 67], [100, 175], [230, 175]].map(([cx, cy], i) => <g key={i}><circle cx={cx} cy={cy} r="13" fill="#89caff" fillOpacity=".1" /><circle cx={cx} cy={cy} r="5" fill="#89caff" /></g>)}
      {[[75, 220], [165, 195], [255, 220], [100, 108], [230, 108]].map(([cx, cy], i) => <g key={i}><circle cx={cx} cy={cy} r="12" fill="#c2b4ff" fillOpacity=".08" /><circle cx={cx} cy={cy} r="4" fill="#c2b4ff" /></g>)}
    </g>
    <path d="M50 290H450M80 305H420" stroke="#89caff" strokeOpacity=".08" />
    <circle cx="430" cy="55" r="2" fill="#89caff" /><path d="M430 45V65M420 55H440" stroke="#89caff" strokeOpacity=".5" />
  </svg>;
}

function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button, input, select")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={(e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <div className="dialog-header"><h2 id="dialog-title" className="dialog-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Chiudi finestra"><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3 className="empty-title">{title}</h3><p className="empty-description">{description}</p>{action}</div>;
}

function MatchCard({ match, season, onClick }: { match: Match; season?: string; onClick: () => void }) {
  return <button className="match-card" onClick={onClick}>
    <div className="match-date"><CalendarDays size={15} /><span>{matchDate(match)}</span><span className={`status-badge ${match.status}`}>{match.status === "completed" ? "Conclusa" : "In programma"}</span></div>
    <div className="match-teams"><span><span className="team-dot team-a" />Squadra A</span><strong className="match-score">{match.status === "completed" ? `${match.scoreA} : ${match.scoreB}` : "— : —"}</strong><span>Squadra B<span className="team-dot team-b" /></span></div>
    <div className="match-meta"><span><MapPin size={13} />{match.venue}</span><span>{season}</span><ChevronRight size={16} /></div>
  </button>;
}

function MatchDetail({ match, data, isAdmin, viewerId, onSave, onClose, notify, offline = false }: { offline?:boolean; match: Match; data: AppData; isAdmin: boolean; viewerId: string; onSave: (m: Match, before: Match) => boolean; onClose: () => void; notify: (s: string) => void }) {
  const [draft, setDraft] = useState<Match>(match);
  const baseline = useRef(match);
  useEffect(() => { if (!isAdmin || match.status === "scheduled") { setDraft(match); baseline.current = match; } }, [match, isAdmin]);
  const [tab, setTab] = useState<"availability" | "teams">(match.status === "completed" ? "teams" : "availability");
  const [errors, setErrors] = useState<string[]>([]);
  const patch = (values: Partial<Match>) => {
    const next = { ...draft, ...values };
    if (draft.status === "scheduled" && !onSave(next, baseline.current)) return false;
    if (draft.status === "scheduled") baseline.current = next;
    setDraft(next); setErrors([]);
    return true;
  };
  const toggleAvailability = () => {
    if (draft.status !== "scheduled" || !draft.selectedIds.includes(viewerId)) return;
    const present = draft.availableIds.includes(viewerId);
    const saved = patch({ availableIds: present ? draft.availableIds.filter((id) => id !== viewerId) : [...draft.availableIds, viewerId] });
    if (saved) notify(present ? "Disponibilità ritirata." : "Disponibilità confermata!");
  };
  const toggleSelected = (id: string) => {
    if (!isAdmin || draft.status === "completed") return;
    const selected = draft.selectedIds.includes(id);
    if (!selected && draft.selectedIds.length >= 10) { notify("Hai già convocato dieci giocatori."); return; }
    patch({ selectedIds: selected ? draft.selectedIds.filter((v) => v !== id) : [...draft.selectedIds, id], appearances: selected ? draft.appearances.filter((a) => a.playerId !== id) : [...draft.appearances, { playerId: id, team: draft.appearances.filter((a) => a.team === "A").length < 5 ? "A" : "B", goals: 0, rating: null }], mvpId: selected && draft.mvpId === id ? null : draft.mvpId });
  };
  const appearance = (id: string, values: Partial<Appearance>) => patch({ appearances: draft.appearances.map((a) => a.playerId === id ? { ...a, ...values } : a) });
  const finish = () => {
    const next = { ...draft, status: "completed" as const };
    const invalid = validateCompletion(next);
    if (invalid.length) { setErrors(invalid); return; }
    if (onSave(next, baseline.current)) { notify(draft.status === "completed" ? "Correzioni salvate. Statistiche aggiornate." : "Partita conclusa. Statistiche aggiornate!"); onClose(); }
  };
  const goalA = draft.appearances.filter((a) => a.team === "A").reduce((s, a) => s + a.goals, 0);
  const goalB = draft.appearances.filter((a) => a.team === "B").reduce((s, a) => s + a.goals, 0);
  return <Dialog title="La partita" wide onClose={onClose}>
    <div className="dialog-body">
      <div className="match-detail-intro"><span className={`status-badge ${draft.status}`}>{draft.status === "completed" ? "Conclusa" : "In programma"}</span><strong>{matchDate(draft)} · {draft.time}</strong><span className="muted"><MapPin size={14} /> {draft.venue}</span><span className="role-badge">{data.seasons.find((s) => s.id === draft.seasonId)?.name}</span></div>
      <div className="filter-tabs"><button className={`filter-tab ${tab === "availability" ? "active" : ""}`} onClick={() => setTab("availability")}>Partecipanti · {draft.selectedIds.length}/10</button><button className={`filter-tab ${tab === "teams" ? "active" : ""}`} onClick={() => setTab("teams")}>Squadre e voti · {draft.selectedIds.length}/10</button></div>
      {tab === "availability" ? <>
        {draft.status === "scheduled" && draft.selectedIds.includes(viewerId) && <div className="availability-action"><div><strong>Sei tra i partecipanti</strong><p className="muted">Se vuoi, conferma la tua disponibilità. La conferma è facoltativa.</p></div><button className={`button ${draft.availableIds.includes(viewerId) ? "secondary" : "primary"}`} onClick={toggleAvailability}>{draft.availableIds.includes(viewerId) ? <><Check size={17} /> Ritira disponibilità</> : <><Plus size={17} /> Sono disponibile</>}</button></div>}
        {draft.status === "scheduled" && !isAdmin && !draft.selectedIds.includes(viewerId) && <p className="field-hint">Non sei tra i partecipanti selezionati per questa partita.</p>}
        <p className="field-hint">{offline ? "Seleziona i dieci giocatori e poi inserisci squadre, gol, voti e risultato." : isAdmin && draft.status === "scheduled" ? "Puoi scegliere subito fino a dieci partecipanti, anche senza conferme di disponibilità." : "La conferma di disponibilità non modifica la partecipazione o le statistiche."}</p>
        {!offline && <div className="availability-legend"><span><Check size={14} aria-hidden="true" /> Disponibilità confermata</span><span><Clock size={14} aria-hidden="true" /> Non ancora confermata</span></div>}
        <MatchParticipantsPicker showAvailability={!offline} players={isAdmin && draft.status === "scheduled" ? data.players : data.players.filter((p) => draft.selectedIds.includes(p.id))} selectedIds={draft.selectedIds} confirmedIds={draft.availableIds} onToggle={toggleSelected} disabled={!isAdmin || draft.status === "completed"} />
      </> : <>
        {!draft.selectedIds.length ? <EmptyState icon={<Users size={30} />} title="Nessun partecipante selezionato" description="Seleziona i dieci giocatori nella prima scheda. Le conferme di disponibilità sono facoltative." /> : <>
          <div className="team-grid">{(["A", "B"] as const).map((team) => <div className="team-panel" key={team}><h3 className="team-title"><span className={`team-dot team-${team.toLowerCase()}`} />Squadra {team}<span className="muted">{draft.appearances.filter((a) => a.team === team).length}/5</span></h3>{draft.appearances.filter((a) => a.team === team).map((a) => {
            const p = data.players.find((v) => v.id === a.playerId)!;
            return <div className="rating-row" key={p.id}><div className="player-row"><Avatar player={p} small /><strong>{p.name}</strong>{!offline && <AvailabilityBadge name={p.name} confirmed={draft.availableIds.includes(p.id)} />}</div><div className="rating-controls"><label><span className="field-label">Squadra</span><select className="form-select" aria-label={`Squadra di ${p.name}`} value={a.team} disabled={!isAdmin} onChange={(e) => appearance(p.id, { team: e.target.value as "A" | "B" })}><option>A</option><option>B</option></select></label><label><span className="field-label">Gol</span><input className="form-input" type="number" min="0" step="1" value={a.goals} aria-label={`Gol di ${p.name}`} disabled={!isAdmin} onChange={(e) => appearance(p.id, { goals: scoreNumber(e.target.value) })} /></label><label><span className="field-label">Voto</span><select className="form-select" value={a.rating ?? ""} aria-label={`Voto di ${p.name}`} disabled={!isAdmin} onChange={(e) => appearance(p.id, { rating: e.target.value ? Number(e.target.value) : null })}><option value="">S.V.</option>{Array.from({ length: 19 }, (_, i) => 1 + i / 2).map((n) => <option value={n} key={n}>{n.toLocaleString("it-IT")}</option>)}</select></label></div></div>;
          })}</div>)}</div>
          <div className="form-grid result-grid"><div className="form-field"><span className="field-label">Risultato finale</span><div className="score-inputs"><label><span className="field-hint">Squadra A</span><input className="score-input" type="number" min="0" step="1" aria-label="Risultato squadra A" disabled={!isAdmin} value={draft.scoreA} onChange={(e) => patch({ scoreA: scoreNumber(e.target.value) })} /></label><span>:</span><label><span className="field-hint">Squadra B</span><input className="score-input" type="number" min="0" step="1" aria-label="Risultato squadra B" disabled={!isAdmin} value={draft.scoreB} onChange={(e) => patch({ scoreB: scoreNumber(e.target.value) })} /></label></div></div><label className="form-field"><span className="field-label"><Star size={14} /> MVP della partita</span><select className="form-select" value={draft.mvpId ?? ""} disabled={!isAdmin} onChange={(e) => patch({ mvpId: e.target.value || null })}><option value="">Da assegnare</option>{draft.appearances.map((a) => <option key={a.playerId} value={a.playerId}>{data.players.find((p) => p.id === a.playerId)?.name}</option>)}</select><span className="field-hint">Scegli tra i giocatori in campo.</span></label></div>
          {(goalA !== draft.scoreA || goalB !== draft.scoreB) && <div className="alert warning"><Info size={17} /><span>I gol individuali ({goalA}–{goalB}) differiscono dal risultato. Puoi salvare comunque: gli autogol non vengono registrati.</span></div>}
        </>}
      </>}
      {errors.length > 0 && <div className="alert warning" role="alert"><Info size={18} /><div>{errors.map((s) => <p key={s}>{s}</p>)}</div></div>}
    </div>
    <div className="dialog-footer"><span className="field-hint">{draft.status === "scheduled" ? (offline ? "Le modifiche si salvano automaticamente." : "Partecipanti e conferme facoltative si salvano automaticamente.") : "Le correzioni aggiornano anche le statistiche."}</span><button className="button secondary" onClick={onClose}>Chiudi</button>{isAdmin && tab === "teams" && <button className="button primary" onClick={finish}><Check size={16} />{draft.status === "completed" ? "Salva correzioni" : "Concludi partita"}</button>}</div>
  </Dialog>;
}

function Profile({ player, stat, canEdit, onSave, onClose, notify }: { player: Player; stat: PlayerStat; canEdit: boolean; onSave: (p: Player, before: Player) => boolean; onClose: () => void; notify: (s: string) => void }) {
  const [draft, setDraft] = useState(player);
  const baseline = useRef(player);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const uploadVersion = useRef(0);
  useEffect(() => () => { uploadVersion.current++; }, []);
  const upload = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { notify("Scegli una foto JPG, PNG o WebP."); return; }
    if (file.size > 2 * 1024 * 1024) { notify("La foto può pesare al massimo 2 MB."); return; }
    const version = ++uploadVersion.current;
    setReadingPhoto(true);
    const reader = new FileReader();
    reader.onerror = () => { if (version === uploadVersion.current) { setReadingPhoto(false); notify("Non è stato possibile leggere la foto."); } };
    reader.onload = async () => {
      try {
        const photo = await compactPhoto(String(reader.result));
        if (version === uploadVersion.current) setDraft(p => ({ ...p, photo }));
      } catch { if (version === uploadVersion.current) notify("Non è stato possibile leggere la foto."); }
      finally { if (version === uploadVersion.current) setReadingPhoto(false); }
    };
    reader.readAsDataURL(file);
  };
  return <Dialog title={canEdit ? `Profilo di ${player.name}` : player.name} onClose={onClose}>
    <div className="dialog-body profile-editor"><div className="profile-heading"><Avatar player={draft} /><div><h3>{player.name}</h3><span className="role-badge">{draft.role}</span></div></div>
      <div className="player-card-stats">{[[stat.played, "Partite"], [stat.goals, "Gol"], [formatAverage(stat.average), "Media"], [stat.mvps, "MVP"]].map(([v, l]) => <div className="player-stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>
      {canEdit ? <><label className="form-field"><span className="field-label">Ruolo</span><select className="form-select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></label><div className="form-field"><span className="field-label">Scegli la tua icona</span><div className="avatar-picker">{icons.map((icon) => <button className={`avatar-option ${!draft.photo && draft.icon === icon ? "active" : ""}`} key={icon} aria-label={`Usa icona ${icon}`} aria-pressed={!draft.photo && draft.icon === icon} onClick={() => { uploadVersion.current++; setReadingPhoto(false); setDraft({ ...draft, icon, photo: undefined }); }}>{icon}</button>)}</div></div><label className="photo-upload"><Camera size={21} /><span>Oppure carica una foto<small>JPG, PNG o WebP · massimo 2 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => upload(e.target.files?.[0])} /></label></> : <p className="field-hint">Statistiche complessive del giocatore.</p>}
    </div><div className="dialog-footer"><button className="button secondary" onClick={onClose}>Chiudi</button>{canEdit && <button className="button primary" disabled={readingPhoto} onClick={() => { if (onSave(draft, baseline.current)) { notify("Profilo aggiornato!"); onClose(); } }}><Check size={16} />Salva profilo</button>}</div>
  </Dialog>;
}

export type OfflineConnection = {data:AppData;persist:(next:AppData)=>boolean;openBackup:()=>void};
export default function CalcettoApp({ live, offline }: { live?: LiveConnection; offline?:OfflineConnection }) {
  const [localData, setData] = useState<AppData>(initialData);
  const [view, setView] = useState<View>("home");
  const [demoAdmin, setIsAdmin] = useState(true);
  const isAdmin = live ? live.user.isAdmin : demoAdmin;
  const data = live?.data || offline?.data || localData;
  const navigation = offline ? views.filter(item=>item.id!=='chat') : views;
  const [demoViewer, setViewerId] = useState("trieu");
  const viewerId = offline ? '' : live?.user.playerId || demoViewer;
  const [seasonId, setSeasonId] = useState("");
  const [role, setRole] = useState("Tutti");
  const [query, setQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState("all");
  const [sort, setSort] = useState<"goals" | "average" | "played" | "mvps">("goals");
  const [modal, setModal] = useState<"season" | "match" | "player" | "profile" | "detail" | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const [temporaryStorage, setTemporaryStorage] = useState(false);
  const [seasonError, setSeasonError] = useState("");
  const [newMatchParticipants, setNewMatchParticipants] = useState<string[]>([]);
  const seasonFormRef = useRef<HTMLFormElement>(null);
  const matchFormRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (!live && !offline) setData(loadData()); setReady(true); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 5000); return () => clearTimeout(t); } }, [toast]);
  const notify = (s: string) => setToast(s);
  const persist = (next: AppData) => {
    if (offline) return offline.persist(next);
    if (live) return live.persist(next);
    try { saveData(next); setTemporaryStorage(false); }
    catch { setTemporaryStorage(true); }
    setData(next);
    return true;
  };
  const updateMatch = (m: Match, before: Match) => {
    if (live && !equalData(before, data.matches.find(v => v.id === m.id))) { notify("Partita aggiornata da un altro utente. Chiudi e riapri la finestra prima di riprovare."); return false; }
    return persist({ ...data, matches: data.matches.map((v) => v.id === m.id ? m : v) });
  };
  const allStats = useMemo(() => getStats(data), [data]);
  const stats = useMemo(() => getStats(data, seasonId || undefined).sort((a, b) => (b[sort] ?? -1) - (a[sort] ?? -1) || b.played - a.played || a.player.name.localeCompare(b.player.name, "it")), [data, seasonId, sort]);
  const completed = data.matches.filter((m) => m.status === "completed");
  const upcoming = data.matches.filter((m) => m.status === "scheduled").sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  const recent = [...completed].sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).slice(0, 3);
  const roleSummary = [
    ["Portiere", "portiere", "portieri"], ["Difensore", "difensore", "difensori"],
    ["Centrocampista", "centrocampista", "centrocampisti"], ["Attaccante", "attaccante", "attaccanti"],
  ].map(([name, singular, plural]) => { const n = data.players.filter((p) => p.role === name).length; return `${n} ${n === 1 ? singular : plural}`; }).join(" · ");
  const leader = allStats.find((s) => s.goals > 0);
  const activePlayer = data.players.find((p) => p.id === viewerId)!;
  const selectedPlayer = data.players.find((p) => p.id === selectedId);
  const selectedMatch = data.matches.find((m) => m.id === selectedId);
  const go = (next: View) => { setView(next); setQuery(""); setModal(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openMatch = (id: string) => { setSelectedId(id); setModal("detail"); };
  const openProfile = (id: string) => { setSelectedId(id); setModal("profile"); };
  const seasonSelect = <select className="form-select season-select" aria-label="Filtra per stagione" value={seasonId} onChange={(e) => setSeasonId(e.target.value)}><option value="">Tutte le stagioni</option>{data.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  const newMatch = () => { setNewMatchParticipants([]); setModal("match"); };
  const createSeason = () => {
    const form = seasonFormRef.current;
    if (!isAdmin || !form || !form.reportValidity()) return;
    const name = String(new FormData(form).get("name") || "").trim().replace(/\s+/g, " ");
    if (!name) { setSeasonError("Inserisci un nome per la stagione."); return; }
    if (data.seasons.some((s) => s.name.toLocaleLowerCase("it") === name.toLocaleLowerCase("it"))) { setSeasonError("Esiste già una stagione con questo nome."); return; }
    const id = newId();
    if (persist({ ...data, seasons: [...data.seasons, { id, name }] })) { setSeasonId(id); setSeasonError(""); setModal(null); notify("Stagione creata. Ora puoi organizzare la prima partita."); }
  };
  const createMatch = () => {
    const form = matchFormRef.current;
    if (!isAdmin || !form || !form.reportValidity()) return;
    const f = new FormData(form);
    const date = String(f.get("date") || ""), time = String(f.get("time") || ""), venue = String(f.get("venue") || "").trim(), season = String(f.get("season") || "");
    if (!venue || !date || !time || !data.seasons.some((s) => s.id === season)) { notify("Completa data, ora, campo e stagione."); return; }
    const m: Match = { id: newId(), seasonId: season, date, time, venue, status: "scheduled", availableIds: [], selectedIds: [...newMatchParticipants], appearances: createAppearances(newMatchParticipants), scoreA: 0, scoreB: 0, mvpId: null };
    if (persist({ ...data, matches: [...data.matches, m] })) { setSelectedId(m.id); setModal("detail"); notify(newMatchParticipants.length ? `Partita creata con ${newMatchParticipants.length} partecipanti.` : "Partita creata. Puoi aggiungere i partecipanti."); }
  };
  const createPlayer = (player: Player) => {
    if (!isAdmin) return false;
    if (!persist({ ...data, players: [...data.players, player] })) return false;
    setRole("Tutti"); setQuery(""); setModal(null);
    notify(`${player.name} aggiunto al gruppo!`);
    return true;
  };
  return <div className="app-shell">
    <aside className="sidebar"><button className="brand" onClick={() => go("home")} aria-label="Calcetto, torna alla Home"><span className="brand-mark"><Goal size={25} strokeWidth={1.7} /></span><span><span className="brand-title">calcetto<span>.</span></span><span className="brand-subtitle">GESTIONE PARTITE</span></span></button><span className="section-label">NAVIGAZIONE</span><nav className="nav-list" aria-label="Navigazione principale">{navigation.map(({ id, label, icon: Icon }) => <button className={`nav-item ${view === id ? "active" : ""}`} key={id} onClick={() => go(id)} aria-current={view === id ? "page" : undefined}><Icon size={19} /><span>{label}</span>{id === "players" && <span className="nav-count">{data.players.length}</span>}{view === id && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="group-card"><div className="avatar-stack">{data.players.slice(0, 4).map((p) => <Avatar player={p} key={p.id} small />)}{data.players.length > 4 && <span className="mini-avatar">+{data.players.length - 4}</span>}</div><strong>Il nostro gruppo</strong><span>{data.players.length} giocatori</span><span className="group-private"><Shield size={12} /> {offline ? "Archivio offline" : "Gruppo su invito"}</span></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><span>Calcetto</span><ChevronRight size={14} /><strong>{views.find((v) => v.id === view)?.label}</strong></div><div className="topbar-right">{!live && !offline && <><span className="preview-tag" title="Anteprima interattiva locale. Account e condivisione non ancora attivi."><span />Anteprima</span><label className="viewer-switch"><span className="sr-only">Vista anteprima</span><select value={isAdmin ? "admin" : viewerId} onChange={(e) => { setIsAdmin(e.target.value === "admin"); if (e.target.value !== "admin") setViewerId(e.target.value); }} aria-label="Vista anteprima"><option value="admin">Vista amministratore</option>{data.players.map((p) => <option value={p.id} key={p.id}>Gioca come {p.name}</option>)}</select></label></>}{offline && <><span className="role-badge">Offline</span><button className="button secondary small" onClick={offline.openBackup}>Backup e dati</button></>}{live && <><span className="role-badge">{activePlayer.name}{isAdmin ? " · Admin" : ""}</span>{isAdmin && <button className="button secondary small" onClick={live.openInvites}>Inviti</button>}<button className="button ghost small" onClick={live.logout}>Esci</button></>}<span className="user-avatar">{isAdmin ? <Shield size={18} /> : activePlayer.icon}</span></div></header>
      <main className="page-content" id="main-content">{live && <div className={`alert ${live.error ? "warning" : ""}`} role="status">{live.error || live.status}</div>}{temporaryStorage && <div className="alert warning storage-warning" role="status"><Info size={18} /><span>Il browser non consente il salvataggio permanente. Le modifiche restano solo in questa sessione e possono andare perse ricaricando o chiudendo l’anteprima.</span></div>}
        <div className="page-heading"><div><h1 className="page-title">{views.find((item) => item.id === view)?.label}</h1><p className="page-description">{view === "home" ? "Partite, giocatori e statistiche del gruppo." : view === "matches" ? "Calendario, partecipanti e risultati." : view === "players" ? "Ruoli, foto e statistiche dei giocatori." : view === "chat" ? "Messaggi, menzioni e sticker del gruppo." : "Classifiche e statistiche per stagione."}</p></div><div className="heading-actions">{isAdmin && view === "home" && <button className="button secondary season-action" onClick={() => { setSeasonError(""); setModal("season"); }}><Plus size={17} />Nuova stagione</button>}{isAdmin && view === "players" && <button className="button primary" onClick={() => setModal("player")}><Plus size={17} />Nuovo giocatore</button>}{isAdmin && view !== "players" && view !== "chat" && <button className="button primary" onClick={newMatch} disabled={!ready}><Plus size={17} />Nuova partita</button>}{view === "players" && <span className="role-badge"><Users size={14} />{data.players.length} giocatori</span>}</div></div>
        {view === "home" && <>
          <section className="hero-card"><PitchArt /><div className="hero-content"><div className="hero-kicker"><span className="live-dot" />{upcoming.length ? "Prossima partita" : "Partite"}</div><h2 className="hero-title">{upcoming.length ? <>{matchDate(upcoming[0])}<br /><span>{upcoming[0].time}</span></> : <>Nessuna partita<br /><span>in programma</span></>}</h2><p className="hero-description">{upcoming.length ? `${matchDate(upcoming[0])}, ore ${upcoming[0].time} · ${upcoming[0].venue}. ${offline ? "Inserisci squadre, risultato e voti." : "I partecipanti possono confermare la propria disponibilità."}` : "Crea una stagione e aggiungi la prima partita con i partecipanti."}</p><div className="hero-footer">{upcoming.length ? <button className="button primary" onClick={() => openMatch(upcoming[0].id)}>Vai alla partita<ArrowUpRight size={17} /></button> : isAdmin ? <button className="button primary" onClick={() => data.seasons.length ? newMatch() : setModal("season")}>{data.seasons.length ? "Crea partita" : "Crea stagione"}<ArrowUpRight size={17} /></button> : <span className="hero-badge">In attesa della prima partita</span>}<span className="hero-badge"><span />5 CONTRO 5</span></div></div></section>
          <div className="stats-grid">{[{ label: "Giocatori", value: data.players.length, note: "Il nostro gruppo", icon: Users }, { label: "Partite giocate", value: completed.length, note: "Tutte le stagioni", icon: CalendarDays }, { label: "Gol segnati", value: allStats.reduce((s, v) => s + v.goals, 0), note: "Gol registrati", icon: Goal }, { label: "Stagioni", value: data.seasons.length, note: "Stagioni create", icon: Trophy }].map(({ label, value, note, icon: Icon }, i) => <div className={`stat-card ${i === 0 ? "stat-accent" : ""}`} key={label}><div className="stat-top"><span className="stat-label">{label}</span><span className="stat-icon"><Icon size={18} /></span></div><strong className="stat-value">{String(value).padStart(2, "0")}</strong><span className="stat-note">{note}</span></div>)}</div>
          <div className="content-grid"><section className="panel"><div className="panel-header"><div><h2 className="panel-title">Ultime partite</h2><p className="panel-subtitle">Le partite più recenti</p></div><button className="panel-link" onClick={() => go("matches")}>Tutte le partite<ArrowUpRight size={15} /></button></div>{recent.length ? <div className="panel-body match-list">{recent.map((m) => <MatchCard key={m.id} match={m} season={data.seasons.find((s) => s.id === m.seasonId)?.name} onClick={() => openMatch(m.id)} />)}</div> : <EmptyState icon={<CalendarDays size={27} />} title="Nessuna partita conclusa" description="Le partite concluse, con risultati, marcatori e MVP, verranno elencate qui." action={isAdmin ? <button className="button ghost small" onClick={newMatch}>Crea una partita<ChevronRight size={15} /></button> : undefined} />}</section><section className="panel"><div className="panel-header"><div><h2 className="panel-title"><Target size={18} />Marcatori</h2><p className="panel-subtitle">La classifica marcatori</p></div><span className="role-badge">Tutte le stagioni</span></div>{leader ? <div className="panel-body player-list">{allStats.filter((s) => s.goals > 0).slice(0, 5).map((s, i) => <button className="player-row" key={s.player.id} onClick={() => openProfile(s.player.id)}><span className="player-number">{i + 1}</span><Avatar player={s.player} /><span className="player-meta"><strong className="player-name">{s.player.name}</strong><span className="player-role">{s.player.role}</span></span><strong className="stat-highlight">{s.goals}<small> GOL</small></strong></button>)}</div> : <EmptyState icon={<Trophy size={29} />} title="Nessun gol registrato" description="La classifica si aggiorna con i risultati delle partite concluse." />}</section></div>
          <section className="panel group-strip"><div><h2 className="panel-title">Giocatori</h2><p className="panel-subtitle">{roleSummary}</p></div><div className="avatar-stack">{data.players.slice(0, 5).map((p) => <Avatar player={p} key={p.id} />)}</div><button className="button secondary" onClick={() => go("players")}>Vedi giocatori<ArrowUpRight size={16} /></button></section>
        </>}
        {view === "matches" && <><div className="filter-bar"><div className="filter-tabs">{[["all", "Tutte"], ["scheduled", "In programma"], ["completed", "Concluse"]].map(([id, label]) => <button key={id} className={`filter-tab ${matchFilter === id ? "active" : ""}`} onClick={() => setMatchFilter(id)}>{label}</button>)}</div><div className="heading-actions">{seasonSelect}{isAdmin && <button className="button secondary small season-action" onClick={() => setModal("season")}><Plus size={15} />Nuova stagione</button>}</div></div>{data.matches.filter((m) => (!seasonId || m.seasonId === seasonId) && (matchFilter === "all" || m.status === matchFilter)).length ? <div className="matches-grid">{[...data.matches].filter((m) => (!seasonId || m.seasonId === seasonId) && (matchFilter === "all" || m.status === matchFilter)).sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).map((m) => <MatchCard key={m.id} match={m} season={data.seasons.find((s) => s.id === m.seasonId)?.name} onClick={() => openMatch(m.id)} />)}</div> : <section className="panel"><EmptyState icon={<CalendarDays size={34} />} title="Nessuna partita" description={data.seasons.length ? "Nessuna partita con i filtri selezionati." : "Per creare una partita, aggiungi prima una stagione."} action={isAdmin ? <button className="button primary" onClick={() => data.seasons.length ? newMatch() : setModal("season")}><Plus size={16} />{data.seasons.length ? "Nuova partita" : "Crea la prima stagione"}</button> : undefined} /></section>}</>}
        {view === "players" && <><div className="filter-bar"><div className="filter-tabs">{["Tutti", ...roles].map((r) => <button className={`filter-tab ${role === r ? "active" : ""}`} onClick={() => setRole(r)} key={r}>{r}</button>)}</div><label className="search-field"><Search size={16} /><input aria-label="Cerca giocatore" placeholder="Cerca un giocatore…" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div><div className="roster-grid">{data.players.filter((p) => (role === "Tutti" || p.role === role) && p.name.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it"))).map((p) => { const s = allStats.find((v) => v.player.id === p.id)!; return <button className="player-card" key={p.id} onClick={() => openProfile(p.id)}><div className="player-card-top"><span className="role-badge">{p.role}</span><ArrowUpRight size={17} /></div><Avatar player={p} /><h2 className="player-name">{p.name}</h2><p className="player-role">{!isAdmin && p.id === viewerId ? "Il tuo profilo · Personalizza" : "Il nostro gruppo"}</p><div className="player-card-stats">{[[s.played, "Partite"], [s.goals, "Gol"], [formatAverage(s.average), "Media"], [s.mvps, "MVP"]].map(([v, l]) => <div className="player-stat" key={l}><strong>{v}</strong><span>{l}</span></div>)}</div></button>; })}</div>{!data.players.some((p) => (role === "Tutti" || p.role === role) && p.name.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it"))) && <EmptyState icon={<Search size={26} />} title="Nessun giocatore trovato" description="Prova un altro nome o seleziona un ruolo diverso." />}</>}
        {view === "stats" && <><div className="filter-bar"><div className="filter-tabs">{([{ id: "goals", name: "Marcatori" }, { id: "average", name: "Media voto" }, { id: "played", name: "Presenze" }, { id: "mvps", name: "MVP" }] as const).map((s) => <button key={s.id} className={`filter-tab ${sort === s.id ? "active" : ""}`} onClick={() => setSort(s.id)}>{s.name}</button>)}</div>{seasonSelect}</div><section className="panel"><div className="panel-header"><div><h2 className="panel-title">{sort === "goals" ? "Classifica marcatori" : sort === "average" ? "Media voto" : sort === "played" ? "Presenze" : "MVP"}</h2><p className="panel-subtitle">{seasonId ? data.seasons.find((s) => s.id === seasonId)?.name : "Tutte le stagioni"} · Solo partite concluse</p></div><span className="role-badge"><Activity size={13} />{data.matches.filter((m) => m.status === "completed" && (!seasonId || m.seasonId === seasonId)).length} partite</span></div><div className="table-wrap"><table className="stats-table"><thead><tr><th scope="col">POS.</th><th scope="col">GIOCATORE</th><th scope="col">PARTITE</th><th scope="col">GOL</th><th scope="col">MEDIA</th><th scope="col">MVP</th></tr></thead><tbody>{stats.map((s, i) => <tr key={s.player.id}><td className="rank-cell"><span className={s.played && i < 3 ? "rank-badge" : ""}>{s.played ? String(i + 1).padStart(2, "0") : "—"}</span></td><td><button className="player-row" onClick={() => openProfile(s.player.id)}><Avatar player={s.player} small /><span className="player-meta"><strong className="player-name">{s.player.name}</strong><span className="player-role">{s.player.role}</span></span></button></td><td className={sort === "played" ? "stat-highlight" : ""}>{s.played}</td><td className={sort === "goals" ? "stat-highlight" : ""}>{s.goals}</td><td className={sort === "average" ? "stat-highlight" : ""}>{formatAverage(s.average)}</td><td className={sort === "mvps" ? "stat-highlight" : ""}>{s.mvps}</td></tr>)}</tbody></table></div>{!stats.some((s) => s.played) && <div className="table-empty"><Info size={16} />Le classifiche prenderanno forma dopo la prima partita conclusa.</div>}</section><p className="field-hint stats-note">La media usa solo i voti assegnati. Le disponibilità agli inviti non contano come presenze.</p></>}
        {view === "chat" && <GroupChat key={live ? viewerId : isAdmin ? "admin" : viewerId} shared={!!live} players={data.players} messages={data.messages} authorId={live ? viewerId : isAdmin ? "admin" : viewerId} onSend={(message) => live ? live.send(message) : message.authorId === (live ? viewerId : isAdmin ? "admin" : viewerId) && persist({ ...data, messages: [...data.messages, message] })} />}
        <footer className="view-note"><Info size={14} /><span>{offline ? "Salvataggio automatico su questo browser · Esporta un backup per conservare una copia o trasferire i dati." : live ? "Gruppo privato · Dati condivisi tra gli account del gruppo." : "Anteprima interattiva · Le prove restano in questo browser. Account e condivisione non ancora attivi."}</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Navigazione da telefono">{navigation.map(({ id, label, icon: Icon }) => <button className={view === id ? "active" : ""} key={id} onClick={() => go(id)} aria-current={view === id ? "page" : undefined}><Icon size={21} /><span>{label}</span></button>)}</nav>
    {modal === "season" && isAdmin && <Dialog title="Nuova stagione" onClose={() => setModal(null)}><form ref={seasonFormRef} onSubmit={(e) => { e.preventDefault(); createSeason(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) { e.preventDefault(); createSeason(); } }}><div className="dialog-body"><p className="page-description">Inserisci il nome della stagione.</p><label className="form-field"><span className="field-label">Nome della stagione</span><input className="form-input" name="name" required maxLength={60} placeholder="Es. 2026/27 o Autunno 2026" autoComplete="off" onChange={() => setSeasonError("")} /></label>{seasonError && <p className="alert warning" role="alert">{seasonError}</p>}<p className="field-hint">Sarai tu a scegliere la stagione di ogni partita, indipendentemente dalla data.</p></div><div className="dialog-footer"><button className="button secondary" type="button" onClick={() => setModal(null)}>Annulla</button><button className="button primary" type="button" onClick={createSeason}><Plus size={16} />Crea stagione</button></div></form></Dialog>}
    {modal === "match" && isAdmin && <Dialog title="Nuova partita" wide onClose={() => setModal(null)}>{data.seasons.length ? <form ref={matchFormRef} onSubmit={(e) => { e.preventDefault(); createMatch(); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) { e.preventDefault(); createMatch(); } }}><div className="dialog-body"><p className="page-description">{offline ? "Inserisci data, campo e partecipanti della partita." : "Scegli dove, quando e chi gioca. I partecipanti potranno confermare la disponibilità in seguito."}</p><div className="form-grid"><label className="form-field full"><span className="field-label">Stagione</span><select className="form-select" name="season" required defaultValue={seasonId || data.seasons[data.seasons.length - 1].id}>{data.seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="form-field"><span className="field-label">Data</span><input className="form-input" type="date" name="date" required /></label><label className="form-field"><span className="field-label">Ora</span><input className="form-input" type="time" name="time" required /></label><label className="form-field full"><span className="field-label">Campo</span><input className="form-input" name="venue" maxLength={120} required placeholder="Nome del campo o indirizzo" /></label></div><div className="form-field"><span className="field-label">Partecipanti · {newMatchParticipants.length}/10</span><span className="field-hint">{offline ? "Seleziona i dieci giocatori della partita." : "Selezionali subito oppure aggiungili in seguito. La conferma di disponibilità è facoltativa."}</span><MatchParticipantsPicker showAvailability={!offline} players={data.players} selectedIds={newMatchParticipants} onToggle={(id) => setNewMatchParticipants((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < 10 ? [...ids, id] : ids)} /></div><div className="alert"><Users size={18} /><span>5 contro 5 · Potrai modificare i partecipanti e comporre le squadre prima di concludere la partita.</span></div></div><div className="dialog-footer"><button className="button secondary" type="button" onClick={() => setModal(null)}>Annulla</button><button className="button primary" type="button" onClick={createMatch}><Plus size={16} />Crea partita</button></div></form> : <div className="dialog-body"><EmptyState icon={<Trophy size={30} />} title="Crea prima una stagione" description="Ogni partita appartiene a una stagione scelta dall’amministratore." action={<button className="button primary" onClick={() => setModal("season")}><Plus size={16} />Crea stagione</button>} /></div>}</Dialog>}
    {modal === "detail" && selectedMatch && <MatchDetail offline={!!offline} key={selectedMatch.id} match={selectedMatch} data={data} isAdmin={isAdmin} viewerId={viewerId} onSave={updateMatch} onClose={() => setModal(null)} notify={notify} />}
    {modal === "player" && isAdmin && <Dialog title="Nuovo giocatore" onClose={() => setModal(null)}><NewPlayerForm players={data.players} onSave={createPlayer} onCancel={() => setModal(null)} /></Dialog>}
    {modal === "profile" && selectedPlayer && <Profile key={selectedPlayer.id} player={selectedPlayer} stat={allStats.find((s) => s.player.id === selectedPlayer.id)!} canEdit={!!offline || (selectedPlayer.id === viewerId && (!!live || !isAdmin))} onSave={(p, before) => {
      if (live && !equalData(before, data.players.find(v => v.id === p.id))) { notify("Profilo aggiornato. Chiudi e riapri la finestra prima di riprovare."); return false; }
      return persist({ ...data, players: data.players.map((v) => v.id === p.id ? p : v) });
    }} onClose={() => setModal(null)} notify={notify} />}
    {toast && (!live || (live.status !== "Salvataggio in corso…" && !live.error)) && <div className="toast" role="status" aria-live="polite"><Check size={17} /><span>{toast}</span><button className="icon-button" onClick={() => setToast("")} aria-label="Chiudi messaggio"><X size={15} /></button></div>}
  </div>;
}
