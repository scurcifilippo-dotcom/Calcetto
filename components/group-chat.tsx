"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { AtSign, Check, ChevronDown, MessageCircle, Search, Send, Shield, Smile, Users, X } from "lucide-react";
import { STICKERS, findMentionIds, newId, type ChatAttachment, type ChatMessage, type Player } from "../lib/model";
import "./chat.css";

type GroupChatProps = {
  shared?: boolean;
  players: Player[];
  messages: ChatMessage[];
  authorId: string;
  onSend: (message: ChatMessage) => boolean | Promise<boolean>;
};
type MentionRange = { start: number; end: number; query: string };
type Drawer = "mentions" | "stickers" | null;

const normalize = (value: string) => value.toLocaleLowerCase("it").normalize("NFKC");

function Avatar({ player, admin = false }: { player?: Player; admin?: boolean }) {
  return <span className={`chat-avatar ${admin ? "chat-avatar-admin" : ""}`} aria-hidden="true">{admin ? <Shield size={16} /> : player?.icon || <Users size={16} />}</span>;
}

function highlightedText(text: string, players: Player[]): ReactNode {
  const names = players.filter((player) => player.name.trim()).sort((a, b) => b.name.length - a.name.length).map((player) => player.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return text;
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}\\p{M}_@])(@(?:${names.join("|")}))(?![\\p{L}\\p{N}\\p{M}_])`, "giu");
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index! + match[1].length;
    parts.push(text.slice(end, start));
    parts.push(<mark className="chat-mention" key={start}>{match[2]}</mark>);
    end = start + match[2].length;
  }
  parts.push(text.slice(end));
  return parts;
}

function timeLabel(date: string) {
  return new Date(date).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

function dayLabel(date: string) {
  return new Date(date).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

export default function GroupChat({ players, messages, authorId, onSend, shared = false }: GroupChatProps) {
  const id = useId();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [text, setText] = useState("");
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [error, setError] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(true);
  const cursorRef = useRef(0);
  const activePlayer = players.find((player) => player.id === authorId);
  const mentionCandidates = useMemo(() => players.filter((player) => normalize(player.name).includes(normalize(mentionQuery.trim()))), [players, mentionQuery]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (shouldScroll.current) {
      timeline.scrollTop = timeline.scrollHeight;
      setShowLatest(false);
    } else setShowLatest(true);
  }, [messages.length]);

  const closeDrawer = () => {
    setDrawer(null);
    setMentionRange(null);
    setMentionQuery("");
  };

  const openDrawer = (next: Exclude<Drawer, null>) => {
    if (drawer === next) { closeDrawer(); return; }
    setDrawer(next);
    setMentionIndex(0);
    if (next === "mentions") {
      const cursor = textareaRef.current?.selectionStart ?? cursorRef.current;
      setMentionRange({ start: cursor, end: cursor, query: "" });
      setMentionQuery("");
    } else setMentionRange(null);
  };

  const updateMention = (value: string, cursor: number) => {
    cursorRef.current = cursor;
    const match = /(?:^|[\s([{])@([^@\n]{0,60})$/u.exec(value.slice(0, cursor));
    if (!match || (/\s$/u.test(match[1]) && players.some((player) => normalize(player.name) === normalize(match[1].trim())))) {
      if (drawer === "mentions") { setDrawer(null); setMentionRange(null); }
      return;
    }
    const start = cursor - match[1].length - 1;
    setMentionRange({ start, end: cursor, query: match[1] });
    setMentionQuery(match[1]);
    setMentionIndex(0);
    setDrawer("mentions");
  };

  const insertMention = (player: Player) => {
    const range = mentionRange ?? { start: cursorRef.current, end: cursorRef.current, query: "" };
    const prefix = text.slice(0, range.start);
    const spacer = prefix && !/\s$/u.test(prefix) ? " " : "";
    const inserted = `${spacer}@${player.name} `;
    const next = `${prefix}${inserted}${text.slice(range.end)}`;
    if (next.length > 2000) { setError("La menzione supera il limite di 2000 caratteri."); return; }
    setText(next);
    setError("");
    closeDrawer();
    const cursor = prefix.length + inserted.length;
    cursorRef.current = cursor;
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(cursor, cursor); });
  };

  const sendMessage = async (selectedAttachment?: ChatAttachment) => {
    const media = selectedAttachment;
    const content = text.trim();
    if ((!content && !media) || sendingRef.current) return;
    if (authorId !== "admin" && !activePlayer) { setError("Seleziona il tuo giocatore per inviare un messaggio."); return; }
    const message: ChatMessage = { id: newId(), authorId, text: content, createdAt: new Date().toISOString(), mentionIds: findMentionIds(content, players), ...(media ? { attachment: media } : {}) };
    sendingRef.current = true; setSending(true);
    try {
      if (!await onSend(message)) { setError("Messaggio non salvato. Riprova."); return; }
    } catch {
      setError("Non è stato possibile salvare il messaggio. Riprova.");
      return;
    } finally { sendingRef.current = false; setSending(false); }
    shouldScroll.current = true;
    setText("");
    setError("");
    cursorRef.current = 0;
    closeDrawer();
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return <section className="chat-shell" aria-label="Chat del gruppo">
    <header className="chat-header">
      <span className="chat-header-icon"><MessageCircle size={21} /></span>
      <div className="chat-header-copy"><h2>Chat del gruppo</h2><span><Users size={12} />{players.length} giocatori<span className="chat-header-divider" />{shared ? "Messaggi condivisi" : "Messaggi locali"}</span></div>
      <span className="chat-local-tag"><span />{shared ? "Gruppo privato" : "Anteprima"}</span>
    </header>

    <div className="chat-timeline-wrap">
      <div className="chat-timeline" ref={timelineRef} role="log" aria-label="Messaggi del gruppo" aria-live="polite" aria-relevant="additions" onScroll={() => {
        const element = timelineRef.current;
        if (!element) return;
        shouldScroll.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        if (shouldScroll.current) setShowLatest(false);
      }}>
        {!messages.length ? <div className="chat-empty"><span><MessageCircle size={30} strokeWidth={1.3} /></span><h3>Nessun messaggio</h3><p>Scrivi al gruppo, menziona un giocatore o invia uno sticker.</p></div> : messages.map((message, index) => {
          const player = players.find((item) => item.id === message.authorId);
          const own = message.authorId === authorId;
          const author = message.authorId === "admin" ? "Amministratore" : player?.name || "Giocatore";
          const media = message.attachment;
          const sticker = media?.type === "sticker" ? STICKERS.find((item) => item.id === media.stickerId) : undefined;
          const day = dayLabel(message.createdAt);
          const newDay = index === 0 || dayLabel(messages[index - 1].createdAt) !== day;
          return <div className="chat-entry" key={message.id}>
            {newDay && <div className="chat-date"><span>{day}</span></div>}
            <article className={`chat-message ${own ? "chat-message-own" : ""}`} aria-label={`Messaggio di ${author}`}>
              <Avatar player={player} admin={message.authorId === "admin"} />
              <div className="chat-message-content"><div className="chat-message-meta"><strong>{author}</strong>{own && <span>Tu</span>}<time dateTime={message.createdAt}>{timeLabel(message.createdAt)}</time></div>
                <div className={`chat-bubble ${sticker ? "chat-bubble-sticker" : ""}`}>
                  {sticker && <div className={`chat-sticker chat-sticker-${sticker.id}`} aria-label={`Sticker: ${sticker.label}`}><span aria-hidden="true">{sticker.emoji}</span><strong>{sticker.label}</strong></div>}
                  {message.text && <p className="chat-message-text">{highlightedText(message.text, players)}</p>}
                </div>
              </div>
            </article>
          </div>;
        })}
      </div>
      {showLatest && <button type="button" className="chat-latest" onClick={() => { shouldScroll.current = true; if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight; setShowLatest(false); }}><ChevronDown size={14} />Ultimi messaggi</button>}
    </div>

    <div className="chat-compose-area">
      {drawer && <div className={`chat-tool-panel chat-tool-panel-${drawer}`}>
        <div className="chat-tool-heading"><strong>{drawer === "mentions" ? "Menziona un giocatore" : "Sticker"}</strong><button type="button" className="chat-icon-button" aria-label="Chiudi pannello" onClick={closeDrawer}><X size={16} /></button></div>
        {drawer === "mentions" && <>
          <label className="chat-search"><Search size={15} /><input value={mentionQuery} placeholder="Cerca un giocatore" aria-label="Cerca un giocatore da menzionare" onChange={(event) => { setMentionQuery(event.target.value); setMentionIndex(0); }} /></label>
          <div className="chat-mention-list" role="listbox" aria-label="Giocatori da menzionare" id={`${id}-mentions`}>{mentionCandidates.map((player, index) => <button type="button" role="option" aria-selected={index === mentionIndex} id={`${id}-mention-${index}`} className={index === mentionIndex ? "chat-mention-option chat-mention-option-active" : "chat-mention-option"} key={player.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(player)}><Avatar player={player} /><span><strong>{player.name}</strong><small>{player.role}</small></span><AtSign size={14} /></button>)}{!mentionCandidates.length && <p className="chat-tool-note">Nessun giocatore trovato.</p>}</div>
        </>}
        {drawer === "stickers" && <><p className="chat-tool-note">Seleziona uno sticker per inviarlo.</p><div className="chat-sticker-picker">{STICKERS.map((sticker) => <button type="button" key={sticker.id} aria-label={`Invia sticker: ${sticker.label}`} onClick={() => sendMessage({ type: "sticker", stickerId: sticker.id })} disabled={sending}><span className={`chat-sticker chat-sticker-${sticker.id}`}><span aria-hidden="true">{sticker.emoji}</span><strong>{sticker.label}</strong></span></button>)}</div></>}
      </div>}

      {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" className="chat-icon-button" aria-label="Chiudi errore" onClick={() => setError("")}><X size={14} /></button></div>}
      <div className="chat-composer">
        <textarea disabled={sending} ref={textareaRef} rows={2} maxLength={2000} value={text} placeholder="Scrivi un messaggio…" aria-label="Messaggio per il gruppo" aria-controls={drawer === "mentions" ? `${id}-mentions` : undefined} aria-activedescendant={drawer === "mentions" && mentionCandidates.length ? `${id}-mention-${mentionIndex}` : undefined} onChange={(event) => { setText(event.target.value); setError(""); updateMention(event.target.value, event.target.selectionStart); }} onSelect={(event) => { cursorRef.current = event.currentTarget.selectionStart; }} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && drawer) { event.preventDefault(); closeDrawer(); return; }
          if (drawer === "mentions" && mentionCandidates.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setMentionIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + mentionCandidates.length) % mentionCandidates.length); return; }
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (event.repeat) return; if (drawer === "mentions" && mentionCandidates.length) insertMention(mentionCandidates[mentionIndex] ?? mentionCandidates[0]); else sendMessage(); }
        }} />
        <div className="chat-composer-bottom"><div className="chat-tools"><button type="button" className={drawer === "mentions" ? "chat-tool-button chat-tool-button-active" : "chat-tool-button"} aria-label="Menziona un giocatore" aria-pressed={drawer === "mentions"} onClick={() => openDrawer("mentions")}><AtSign size={16} /><span>Menziona</span></button><button type="button" className={drawer === "stickers" ? "chat-tool-button chat-tool-button-active" : "chat-tool-button"} aria-label="Scegli uno sticker" aria-pressed={drawer === "stickers"} onClick={() => openDrawer("stickers")}><Smile size={16} /><span>Sticker</span></button></div><span className="chat-counter" aria-label={`${text.length} caratteri su 2000`}>{text.length > 1600 ? `${text.length}/2000` : ""}</span><button type="button" className="chat-send" aria-label="Invia messaggio" disabled={!text.trim() || sending} onClick={() => sendMessage()}><span>Invia</span><Send size={15} /></button></div>
      </div>
      <div className="chat-compose-hint"><span><Check size={11} />{authorId === "admin" ? "Amministratore" : activePlayer?.name || "Seleziona un giocatore"}</span><span>Invio per inviare · Shift + Invio per andare a capo</span></div>
    </div>
  </section>;
}
