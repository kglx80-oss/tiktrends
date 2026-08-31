'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * La barre de composition · une seule pour tous les studios.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Chaque studio avait son formulaire : un petit champ de texte, puis des cases à
 * cocher, des sélecteurs et des boutons de ratio éparpillés autour. Le prompt —
 * la seule chose qui décide vraiment de l'image — se retrouvait à égalité avec
 * un menu déroulant de quantité.
 *
 * ── Le renversement ──────────────────────────────────────────────────────────
 *
 * **La description prend toute la barre. Les réglages deviennent des pastilles.**
 * On écrit d'abord, on règle ensuite · c'est l'ordre dans lequel on pense une
 * créa, et l'inverse de l'ordre dans lequel un formulaire est habituellement
 * construit.
 *
 * ── Le prix est SUR le bouton ────────────────────────────────────────────────
 *
 * Il vivait dans une phrase grise à côté. Sur le bouton, il est lu au moment où
 * l'on décide · à côté, il est lu après, ou jamais.
 *
 * ── Les scènes enregistrées ──────────────────────────────────────────────────
 *
 * Elles remplacent la rubrique « Tes prompts », qui obligeait à quitter le
 * studio pour écrire sa direction artistique puis à revenir. Elles gardent leur
 * bilan · « 3 gagnantes sur 9 tests tranchés » est la seule chose qu'un
 * générateur d'images ne saura jamais dire, et ce n'était pas une raison de
 * garder un écran entier pour elle.
 */

export interface ComposerOption { value: string; label: string }

export interface ComposerControl {
  key: string;
  /** Ce que le réglage règle · sert l'infobulle, pas la pastille. */
  title: string;
  icon?: string;
  options: ComposerOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export interface ComposerToggle {
  key: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export interface ComposerScene {
  id: string;
  name: string;
  prompt: string;
  /** Bilan mesuré · vide tant qu'aucun test n'a tranché. */
  summary?: string | null;
}

export interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  controls?: ComposerControl[];
  toggles?: ComposerToggle[];
  /** Scènes enregistrées · l'ancienne rubrique, ramenée là où l'on écrit. */
  scenes?: ComposerScene[];
  /**
   * Appelé APRÈS `onChange` quand une scène est reprise · c'est ce qui permet
   * au studio de consigner la scène utilisée, donc de lui bâtir un bilan.
   * Sans lui, une scène reprise serait indiscernable d'un texte tapé à la main.
   */
  onPickScene?: (scene: ComposerScene) => void;
  onSaveScene?: (name: string, prompt: string) => void | Promise<void>;
  /** Références visuelles · le `+` de la barre. */
  onAttach?: () => void;
  attachLabel?: string;
  attachedCount?: number;
  /**
   * Ce que la mémoire dit de la scène choisie · calculé, jamais rédigé.
   * Vide quand il n'y a rien de mieux à proposer : une phrase affichée à chaque
   * choix devient un bruit qu'on cesse de lire au bout de trois jours.
   */
  advice?: string | null;
  /** Ce que coûte le clic · affiché SUR le bouton. */
  cost?: { credits?: number; note?: string };
  onGenerate: () => void;
  busy?: boolean;
  disabled?: boolean;
  /**
   * Faut-il une description pour lancer ? Vrai partout sauf là où la consigne
   * est facultative · animer une image sans rien préciser est une demande
   * légitime, et griser le bouton reviendrait à exiger un texte dont le moteur
   * n'a pas besoin.
   */
  requireText?: boolean;
  generateLabel?: string;
  /** Actions secondaires · « proposer une description », par exemple. */
  extra?: ReactNode;
}

const pastille: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line-2)',
  background: 'var(--paper)', color: 'var(--ink-2)',
  fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
};

export function Composer(props: ComposerProps) {
  const {
    value, onChange, placeholder = 'Décris la scène que tu imagines',
    controls = [], toggles = [], scenes = [],
    onPickScene, onSaveScene, onAttach, attachLabel, attachedCount = 0,
    advice, cost, onGenerate, busy, disabled, generateLabel = 'Générer', extra,
    requireText = true,
  } = props;

  const [menu, setMenu] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const zone = useRef<HTMLTextAreaElement>(null);

  // La zone grandit avec le texte · une description de six lignes dans un champ
  // de deux lignes se relit mal, et on ne relit pas ce qu'on ne voit pas.
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const pret = !disabled && !busy && (!requireText || value.trim().length > 0);

  return (
    <div style={{
      border: '1px solid var(--line-2)', borderRadius: 20, background: 'var(--surface)',
      padding: '14px 16px', display: 'grid', gap: 12,
    }}>
      {/* La description, seule, en grand. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        {onAttach && (
          <button
            type="button" onClick={onAttach} title={attachLabel ?? 'Ajouter des références visuelles'}
            style={{
              flexShrink: 0, width: 34, height: 34, borderRadius: 11, cursor: 'pointer',
              border: `1px solid ${attachedCount > 0 ? 'var(--accent-strong)' : 'var(--line-2)'}`,
              background: 'transparent', color: attachedCount > 0 ? 'var(--accent-strong)' : 'var(--ink-2)',
              fontSize: 17, fontWeight: 600, lineHeight: 1,
            }}
          >
            {attachedCount > 0 ? attachedCount : '+'}
          </button>
        )}
        <textarea
          ref={zone} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} disabled={disabled}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Entrée lance · Entrée seule passe à la ligne, parce
            // qu'une description tient rarement sur une phrase.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pret) { e.preventDefault(); onGenerate(); }
          }}
          rows={2}
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', resize: 'none',
            background: 'transparent', color: 'var(--ink)', fontSize: 15, lineHeight: 1.55,
            fontFamily: 'inherit', padding: '5px 0',
          }}
        />
      </div>

      {/* Les réglages · secondaires, en pastilles, sur une ligne. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {scenes.length > 0 && (
          <Menu
            ouvert={menu === 'scenes'} onToggle={() => setMenu(menu === 'scenes' ? null : 'scenes')}
            libelle="Scènes" icone="✦"
          >
            {scenes.map((s) => (
              <button
                key={s.id} type="button"
                onClick={() => { onChange(s.prompt); onPickScene?.(s); setMenu(null); }}
                style={ligneMenu}
              >
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{s.name}</span>
                {/* Le bilan AVANT le texte · c'est lui qui fait choisir. */}
                {s.summary && (
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.summary}</span>
                )}
              </button>
            ))}
          </Menu>
        )}

        {controls.map((c) => (
          <Menu
            key={c.key} ouvert={menu === c.key}
            onToggle={() => setMenu(menu === c.key ? null : c.key)}
            libelle={c.options.find((o) => o.value === c.value)?.label ?? c.title}
            icone={c.icon} titre={c.title} disabled={c.disabled || disabled}
          >
            {c.options.map((o) => (
              <button
                key={o.value} type="button"
                onClick={() => { c.onChange(o.value); setMenu(null); }}
                style={{ ...ligneMenu, color: o.value === c.value ? 'var(--accent-strong)' : 'var(--ink-2)' }}
              >
                {o.label}
              </button>
            ))}
          </Menu>
        ))}

        {toggles.map((t) => (
          <button
            key={t.key} type="button" onClick={() => t.onChange(!t.value)} disabled={t.disabled || disabled}
            style={{
              ...pastille,
              borderColor: t.value ? 'var(--accent-strong)' : 'var(--line-2)',
              color: t.value ? 'var(--accent-strong)' : 'var(--ink-2)',
              opacity: (t.disabled || disabled) ? 0.5 : 1,
            }}
          >
            <span style={{
              width: 26, height: 15, borderRadius: 999, flexShrink: 0, position: 'relative',
              background: t.value ? 'var(--accent-strong)' : 'var(--line-2)', transition: 'background .15s',
            }}>
              <span style={{
                position: 'absolute', top: 2, left: t.value ? 13 : 2, width: 11, height: 11,
                borderRadius: 999, background: 'var(--surface)', transition: 'left .15s',
              }} />
            </span>
            {t.label}
          </button>
        ))}

        {extra}

        <span style={{ flex: 1 }} />

        {onSaveScene && value.trim().length > 20 && nom === null && (
          <button
            type="button" onClick={() => setNom('')}
            style={{ ...pastille, background: 'transparent', color: 'var(--muted)' }}
          >
            Enregistrer la scène
          </button>
        )}

        {/* Le prix EST le bouton · à côté, il se lit après la décision. */}
        <button
          type="button" onClick={onGenerate} disabled={!pret}
          style={{
            padding: '11px 20px', borderRadius: 14, border: 'none',
            background: pret ? 'var(--grad-accent)' : 'var(--line-2)',
            color: pret ? '#0d070c' : 'var(--muted)',
            fontWeight: 800, fontSize: 14, cursor: pret ? 'pointer' : 'default',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          {busy ? 'Génération…' : generateLabel}
          {!busy && cost?.credits !== undefined && (
            <span style={{ fontSize: 12.5, opacity: 0.75 }}>✦ {cost.credits}</span>
          )}
        </button>
      </div>

      {/* Nommer la scène · en ligne, pas dans une boîte de dialogue du
          navigateur : celle-ci vole le focus et efface la barre de l'écran au
          moment précis où l'on veut relire ce qu'on enregistre. */}
      {onSaveScene && nom !== null && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            autoFocus value={nom} onChange={(e) => setNom(e.target.value)}
            placeholder="Nom de cette scène · c’est ce que tu reverras dans la liste"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNom(null);
              if (e.key === 'Enter' && nom.trim()) { void onSaveScene(nom.trim(), value.trim()); setNom(null); }
            }}
            style={{
              flex: 1, minWidth: 0, padding: '8px 11px', borderRadius: 10,
              border: '1px solid var(--line-2)', background: 'var(--paper)',
              color: 'var(--ink)', fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            type="button" disabled={!nom.trim()}
            onClick={() => { void onSaveScene(nom.trim(), value.trim()); setNom(null); }}
            style={{ ...pastille, opacity: nom.trim() ? 1 : 0.5, color: 'var(--accent-strong)' }}
          >
            Enregistrer
          </button>
          <button type="button" onClick={() => setNom(null)} style={{ ...pastille, background: 'transparent', color: 'var(--muted)' }}>
            Annuler
          </button>
        </div>
      )}

      {/* Ce que la mémoire sait de la scène choisie · elle éclaire, elle
          n'interdit pas. Placée sous la barre, elle se lit avant de cliquer. */}
      {advice && (
        <p style={{
          margin: 0, fontSize: 12, lineHeight: 1.55, color: '#ffcf8f',
          borderLeft: '2px solid rgba(245,166,35,.5)', paddingLeft: 10,
        }}>{advice}</p>
      )}

      {cost?.note && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{cost.note}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const ligneMenu: CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px',
  border: 'none', background: 'transparent', color: 'var(--ink-2)',
  fontSize: 12.5, cursor: 'pointer', borderRadius: 8,
};

function Menu({ ouvert, onToggle, libelle, icone, titre, disabled, children }: {
  ouvert: boolean; onToggle: () => void; libelle: string;
  icone?: string; titre?: string; disabled?: boolean; children: ReactNode;
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button" onClick={onToggle} disabled={disabled} title={titre}
        style={{ ...pastille, opacity: disabled ? 0.5 : 1, borderColor: ouvert ? 'var(--accent-strong)' : 'var(--line-2)' }}
      >
        {icone && <span aria-hidden>{icone}</span>}
        {libelle}
        <span aria-hidden style={{ fontSize: 9, opacity: 0.7 }}>▾</span>
      </button>
      {ouvert && (
        <>
          {/* Un clic n'importe où referme · sans ça le menu reste ouvert et
              recouvre ce qu'on essayait de lire. */}
          <span onClick={onToggle} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <span style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 30,
            minWidth: 190, maxWidth: 320, maxHeight: 280, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12,
            boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', padding: 5, display: 'block',
          }}>
            {children}
          </span>
        </>
      )}
    </span>
  );
}
