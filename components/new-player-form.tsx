"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Camera, Check, Info } from "lucide-react";
import { newId, type Player, type Role } from "../lib/model";

import { compactPhoto } from "../lib/photo";

const roles: Role[] = ["Portiere", "Difensore", "Centrocampista", "Attaccante"];
const icons = ["⚽", "🧤", "🛡️", "⚡", "🎯", "🦁", "🐺", "🦅", "🔥", "🚀", "👑", "⭐"];
const normalizeName = (name: string) => name.trim().replace(/\s+/gu, " ").toLocaleLowerCase("it");

type NewPlayerFormProps = {
  players: Player[];
  onSave: (player: Player) => boolean;
  onCancel: () => void;
};

type FormErrors = { name?: string; role?: string; save?: string };

export default function NewPlayerForm({ players, onSave, onCancel }: NewPlayerFormProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [icon, setIcon] = useState("⚽");
  const [photo, setPhoto] = useState<string>();
  const [photoError, setPhotoError] = useState("");
  const [readingPhoto, setReadingPhoto] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const readerRef = useRef<FileReader | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);

  useEffect(() => () => {
    uploadVersion.current += 1;
    readerRef.current?.abort();
  }, []);

  const chooseIcon = (nextIcon: string) => {
    uploadVersion.current += 1;
    readerRef.current?.abort();
    readerRef.current = null;
    setReadingPhoto(false);
    setPhoto(undefined);
    setPhotoError("");
    setIcon(nextIcon);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadPhoto = (file?: File) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    readerRef.current?.abort();
    readerRef.current = null;
    setReadingPhoto(false);
    setPhoto(undefined);
    setPhotoError("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("La foto non è stata caricata. Scegli un file JPG, PNG o WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("La foto non è stata caricata: il limite è 2 MB.");
      return;
    }

    const reader = new FileReader();
    readerRef.current = reader;
    setReadingPhoto(true);
    reader.onload = async () => {
      if (version !== uploadVersion.current) return;
      readerRef.current = null;
      try {
        if (typeof reader.result !== "string") throw new Error();
        const compact = await compactPhoto(reader.result);
        if (version === uploadVersion.current) setPhoto(compact);
      } catch {
        if (version === uploadVersion.current) setPhotoError("Non è stato possibile leggere la foto. Riprova oppure scegli un’icona.");
      } finally { if (version === uploadVersion.current) setReadingPhoto(false); }
    };
    reader.onerror = () => {
      if (version !== uploadVersion.current) return;
      setReadingPhoto(false);
      readerRef.current = null;
      setPhotoError("Non è stato possibile leggere la foto. Riprova oppure scegli un’icona.");
    };
    reader.readAsDataURL(file);
  };

  const savePlayer = () => {
    if (readingPhoto) return;
    const trimmedName = (nameRef.current?.value ?? name).trim().replace(/\s+/gu, " ");
    const selectedRole = roleRef.current?.value ?? role;
    const nextErrors: FormErrors = {};
    if (!trimmedName) nextErrors.name = "Inserisci il nome del giocatore.";
    else if (trimmedName.length > 60) nextErrors.name = "Il nome può contenere al massimo 60 caratteri.";
    else if (players.some((player) => normalizeName(player.name) === normalizeName(trimmedName))) {
      nextErrors.name = "Un giocatore con questo nome è già presente nel gruppo.";
    }
    if (!roles.includes(selectedRole as Role)) nextErrors.role = "Scegli il ruolo del giocatore.";
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.role) {
      if (nextErrors.name) nameRef.current?.focus();
      else roleRef.current?.focus();
      return;
    }

    const player: Player = { id: newId(), name: trimmedName, role: selectedRole as Role, icon };
    if (photo) player.photo = photo;
    if (!onSave(player)) {
      setErrors({ save: "Il giocatore non è stato salvato. Riprova oppure scegli una foto più piccola." });
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    savePlayer();
  };

  return <form onSubmit={submit} noValidate>
    <div className="dialog-body">
      <p className="page-description">Aggiungi un amico al gruppo. Potrai convocarlo nelle prossime partite.</p>
      <div className="form-grid">
        <label className="form-field full" htmlFor={`${id}-name`}>
          <span className="field-label">Nome del giocatore</span>
          <input ref={nameRef} id={`${id}-name`} className="form-input" name="name" required maxLength={60} value={name} autoComplete="off" placeholder="Nome o soprannome" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${id}-name-error` : undefined} onChange={(event) => { setName(event.target.value); setErrors((previous) => ({ ...previous, name: undefined, save: undefined })); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); if (!event.repeat) savePlayer(); } }} />
          {errors.name && <span id={`${id}-name-error`} className="field-hint" role="alert">{errors.name}</span>}
        </label>
        <label className="form-field full" htmlFor={`${id}-role`}>
          <span className="field-label">Ruolo</span>
          <select ref={roleRef} id={`${id}-role`} className="form-select" name="role" required value={role} aria-invalid={Boolean(errors.role)} aria-describedby={errors.role ? `${id}-role-error` : undefined} onChange={(event) => { setRole(event.target.value as Role | ""); setErrors((previous) => ({ ...previous, role: undefined, save: undefined })); }}>
            <option value="" disabled>Scegli un ruolo</option>
            {roles.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
          {errors.role && <span id={`${id}-role-error`} className="field-hint" role="alert">{errors.role}</span>}
        </label>
        <div className="form-field full">
          <span id={`${id}-icon-label`} className="field-label">Icona del giocatore</span>
          <div className="avatar-picker" role="group" aria-labelledby={`${id}-icon-label`}>
            {icons.map((value) => <button type="button" className={`avatar-option ${!photo && icon === value ? "active" : ""}`} aria-label={`Usa icona ${value}`} aria-pressed={!photo && icon === value} key={value} onClick={() => chooseIcon(value)}>{value}</button>)}
          </div>
          <span className="field-hint">Puoi scegliere un’icona oppure caricare una foto.</span>
        </div>
        <div className="form-field full">
          <label className="photo-upload" htmlFor={`${id}-photo`}>
            <Camera size={21} />
            <span>Carica una foto facoltativa<small>JPG, PNG o WebP · massimo 2 MB</small></span>
            <input ref={fileInputRef} id={`${id}-photo`} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Foto facoltativa del giocatore" aria-invalid={Boolean(photoError)} aria-describedby={photoError ? `${id}-photo-error` : undefined} onChange={(event) => uploadPhoto(event.target.files?.[0])} />
          </label>
          {readingPhoto && <span className="field-hint" role="status">Caricamento foto…</span>}
          {photo && <div className="profile-heading"><span className="player-avatar"><img src={photo} alt="Anteprima della foto del giocatore" /></span><span className="field-hint">Foto selezionata. Per rimuoverla, scegli un’icona.</span></div>}
          {photoError && <div id={`${id}-photo-error`} className="alert warning" role="alert"><Info size={16} /><span>{photoError}</span></div>}
        </div>
      </div>
      {errors.save && <div className="alert warning" role="alert"><Info size={16} /><span>{errors.save}</span></div>}
    </div>
    <div className="dialog-footer">
      <button className="button secondary" type="button" onClick={onCancel}>Annulla</button>
      <button className="button primary" type="button" onClick={savePlayer} disabled={readingPhoto}><Check size={16} />Aggiungi giocatore</button>
    </div>
  </form>;
}
