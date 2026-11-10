'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  AIDE_MENTIONS, VIDE_MENTIONS_AUCUN, VIDE_MENTIONS_REQUETE, filtrerMentionnables, insererMention, optionMentionSuivante, requeteMention,
  type MembreMentionnable,
} from '@tiktrends/core';

/**
 * Le champ d'un commentaire avec MENTIONS · un `<textarea>` combobox
 * (`role="combobox"`, `aria-autocomplete="list"`) et la liste des membres qui
 * voient le projet (`role="listbox"`), ouverte en tapant « @ » · règles au
 * noyau (`requeteMention`, `filtrerMentionnables`, `insererMention`,
 * `optionMentionSuivante`, `C/studios/activite/mentions.ts`).
 *
 * Clavier · ↓ et ↑ parcourent la liste (en boucle), Entrée choisit, Échap la
 * ferme · liste fermée, ces touches gardent leur rôle de champ (Entrée va à la
 * ligne). Le choix insère « @Nom » et retient l'IDENTIFIANT (`surChoix`) · le
 * serveur relit tout · un nom effacé du texte n'est plus une mention. Le
 * curseur est replacé dans un effet, une fois le texte RENDU (jamais par un
 * `setTimeout(0)`). Aucun HTML · les noms sont du texte.
 */
export function ChampMentions({ libelle, valeur, surChange, surChoix, mentionnables, champ, rows = 3, maxLength, placeholder }: {
  libelle: string;
  valeur: string;
  surChange: (texte: string) => void;
  surChoix: (id: string) => void;
  mentionnables: readonly MembreMentionnable[];
  /** `data-champ` du textarea · les écrans et les gardes le visent. */
  champ: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [requete, setRequete] = useState<{ debut: number; requete: string; curseur: number } | null>(null);
  const [actif, setActif] = useState(0);
  const curseurApres = useRef<number | null>(null);
  const options = requete ? filtrerMentionnables(mentionnables, requete.requete) : [];
  const ouvert = !!requete && options.length > 0;
  const idOption = (i: number) => `${id}-option-${i}`;

  // Le curseur après l'insertion · posé quand le texte inséré est RENDU dans le champ.
  useEffect(() => {
    const c = curseurApres.current;
    const el = ref.current;
    if (c === null || !el || el.value !== valeur) return;
    curseurApres.current = null;
    el.focus();
    el.setSelectionRange(c, c);
  }, [valeur]);

  function relire(el: HTMLTextAreaElement) {
    const r = requeteMention(el.value, el.selectionStart ?? el.value.length);
    setRequete(r ? { ...r, curseur: el.selectionStart ?? el.value.length } : null);
    if (!r || r.requete !== requete?.requete) setActif(0);
  }

  function choisir(m: MembreMentionnable) {
    if (!requete) return;
    const r = insererMention(valeur, requete.debut, requete.curseur, m.nom);
    curseurApres.current = r.curseur;
    setRequete(null);
    surChoix(m.id);
    surChange(r.texte);
  }

  function clavier(ev: KeyboardEvent<HTMLTextAreaElement>) {
    if (!ouvert) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActif((a) => optionMentionSuivante(a, ev.key === 'ArrowDown' ? 1 : -1, options.length));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const m = options[actif] ?? options[0];
      if (m) choisir(m);
    } else if (ev.key === 'Escape') {
      // La liste seule se ferme · ni le formulaire, ni la fenêtre autour.
      ev.preventDefault(); ev.stopPropagation();
      setRequete(null);
    }
  }

  return (
    <span style={{ display: 'grid', gap: 4, position: 'relative' }} data-champ-mentions="">
      <label className="field">{libelle}
      <textarea
        ref={ref} className="ta" data-champ={champ} rows={rows} maxLength={maxLength} value={valeur} placeholder={placeholder}
        role="combobox" aria-autocomplete="list" aria-expanded={ouvert} aria-controls={`${id}-liste`} aria-haspopup="listbox"
        aria-activedescendant={ouvert ? idOption(Math.min(actif, options.length - 1)) : undefined} aria-describedby={`${id}-aide`}
        onChange={(ev) => { surChange(ev.target.value); relire(ev.target); }}
        onSelect={(ev) => relire(ev.currentTarget)}
        onKeyDown={clavier}
        onBlur={() => setRequete(null)}
      />
      </label>
      <small className="faint" id={`${id}-aide`} data-aide-mentions="" style={{ fontSize: '11.5px' }}>{AIDE_MENTIONS}</small>
      <ul className="tile fpanel" role="listbox" id={`${id}-liste`} aria-label="Membres qui voient ce projet" data-liste-mentions="" hidden={!ouvert}
        style={{ gridTemplateColumns: 'minmax(0,1fr)', margin: 0, listStyle: 'none', maxHeight: 240 }}>
        {ouvert && options.map((m, i) => (
          <li key={m.id} id={idOption(i)} role="option" aria-selected={i === actif} data-mention-option={m.id} className="fopt"
            style={{ minHeight: 44, alignContent: 'center', ...(i === actif ? { background: 'color-mix(in srgb, var(--acc) 22%, transparent)', borderColor: 'color-mix(in srgb, var(--acc) 60%, transparent)' } : {}) }}
            // Le clic choisit sans retirer le focus du champ (sinon la liste se fermerait avant).
            onMouseDown={(ev) => ev.preventDefault()} onClick={() => choisir(m)}>
            <span>@{m.nom}</span>
          </li>
        ))}
      </ul>
      {requete && !ouvert && (
        <small className="faint" role="status" data-mentions-vide="" style={{ fontSize: '11.5px' }}>{mentionnables.length ? VIDE_MENTIONS_REQUETE : VIDE_MENTIONS_AUCUN}</small>
      )}
    </span>
  );
}
