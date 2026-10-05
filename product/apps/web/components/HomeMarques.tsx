'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { surface, vide } from './ui';

/**
 * Les marques du compte, façon « Recent Projects » (Kevin, 30/09, inspiration
 * Flora) · on reprend vite une marque là où on l'a laissée.
 *
 * ── Une carte VISUELLE, pas une ligne de liste ───────────────────────────────
 *
 * Chaque carte a une SURFACE D'APERÇU substantielle en haut · le logo/l'image
 * réelle de la marque si elle existe (couvre la surface), sinon un repli soigné
 * (initiale sur un fond dégradé, jamais un faux logo). Sous l'aperçu · le nom et
 * l'invite à reprendre. Grille en desktop, une colonne en mobile.
 *
 * ── Les états, tous réels ────────────────────────────────────────────────────
 *
 * Zéro (invite à créer, aucune fausse carte), une, plusieurs. La marque ACTIVE
 * passe en tête, porte un repère « Active » et `aria-current`. Noms longs
 * tronqués (ellipsis) sans casser la carte.
 */
export interface MarqueCarte {
  id: string;
  name: string;
  logoUrl?: string | null;
}

const carte = {
  display: 'flex', flexDirection: 'column', textDecoration: 'none', minWidth: 0,
  ...surface, overflow: 'hidden', background: 'var(--surface)',
} as const;

const apercu = {
  position: 'relative', aspectRatio: '16 / 10', width: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
} as const;

const pied = { padding: '11px 13px', minHeight: CIBLE_TACTILE_MIN, display: 'grid', gap: 2, alignContent: 'center', minWidth: 0 } as const;

const fondAssise = 'radial-gradient(120% 120% at 30% 20%, rgba(254,44,85,.16), transparent 55%), linear-gradient(160deg, var(--paper), var(--surface))';

/** Le fond derrière un LOGO · une assise NEUTRE intermédiaire, fixe (indépendante
 *  du thème). Un logo SOMBRE (ex. Klorea) sur l'assise sombre de la carte était
 *  illisible (dark-on-dark) · un plateau clair rendait à l'inverse un logo CLAIR
 *  invisible. Un gris moyen (luminance ≈ 0,18) est le neutre qui MAXIMISE le pire
 *  contraste des deux extrêmes · logo noir ET logo blanc y tiennent ≈ 4,6:1 (AA)
 *  SANS retoucher leur dessin (aucun contour universel). Les logos colorés et à
 *  fond propre s'y posent aussi. L'initiale de repli reste sur l'assise sombre. */
const fondLogo = '#767676';

/** Repli soigné · l'initiale de la marque sur un fond dégradé sobre, centrée et
 *  lisible · remplit toute la surface d'aperçu quand il n'y a pas d'image. */
function ReplInitiale({ name }: { name: string }) {
  const initiales = name.trim().replace(/\s+/g, ' ').split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '·';
  return (
    <div style={{ ...apercu, background: fondAssise }}>
      <span aria-hidden style={{ fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)', opacity: 0.9 }}>{initiales}</span>
    </div>
  );
}

/**
 * Le contenu de la surface d'aperçu · un LOGO n'est pas une COUVERTURE.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Le vrai logo d'une marque était affiché en `object-fit: cover`, étiré pour
 * remplir la surface 16/10 · un logo (souvent carré/large, avec transparence)
 * s'y retrouvait agrandi et recadré · on n'en voyait qu'un fragment (observé en
 * prod, marque Klorea). La fixture « LOGO » (une image de couverture large)
 * masquait le défaut.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * Le logo se pose ENTIER (`contain`), centré, avec de la marge (padding) sur un
 * fond assis · large, haut ou transparent, il se lit en entier sans découpe. Si
 * l'image ne charge pas, repli LOCAL sur l'initiale · aucune surface vide.
 */
function ContenuApercu({ logoUrl, name }: { logoUrl?: string | null; name: string }) {
  const [erreur, setErreur] = useState(false);
  if (!logoUrl || erreur) return <ReplInitiale name={name} />;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fondLogo, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)', padding: '13%' }}>
      <img
        src={logoUrl}
        alt=""
        onError={() => setErreur(true)}
        ref={(el) => {
          // `onError` seul ne suffit PAS avec le rendu serveur · l'image est
          // rendue avec son `src` dès le HTML, donc une URL cassée échoue AVANT
          // l'hydratation, avant que `onError` soit attaché · l'événement est
          // manqué et l'icône brisée reste (observé sur la carte « Cassée » ·
          // aucun repli). On rattrape l'état « déjà cassée » à l'hydratation ·
          // `complete` avec `naturalWidth` à 0 = chargée mais indécodable.
          if (el && el.complete && el.naturalWidth === 0) setErreur(true);
        }}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

/**
 * `gererMarques` (lot 11) · le rôle ouvre-t-il les fiches et la création de
 * marque (admins) ? Sinon, les marques restent visibles mais en cartes sans
 * lien · un membre ou un client en lecture n'était renvoyé qu'à l'accueil.
 */
export function HomeMarques({ marques, activeId, gererMarques = true }: { marques: MarqueCarte[]; activeId: string | null; gererMarques?: boolean }) {
  // La marque active d'abord · le reste garde l'ordre reçu (récent en premier
  // côté serveur). Tri stable · on ne déplace QUE l'active en tête.
  const ordre = [...marques].sort((a, b) => (a.id === activeId ? -1 : b.id === activeId ? 1 : 0));

  return (
    <section aria-label="Tes marques" style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Tes marques</h2>
        {gererMarques && (
          <Link href="/brands" style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
            Toutes les marques ›
          </Link>
        )}
      </div>

      {marques.length === 0 && !gererMarques ? (
        // État zéro sans droit de création · on le dit, sans lien mort.
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>Aucune marque dans cet espace pour l’instant · ce sont ses admins qui les ajoutent.</p>
      ) : marques.length === 0 ? (
        // État zéro · aucune fausse carte, on invite à créer la première marque.
        <Link href="/brands/new" style={{ ...carte, maxWidth: 300 }}>
          <div style={{ ...apercu, background: 'linear-gradient(160deg, var(--paper), var(--surface))' }}>
            <span aria-hidden style={{ fontSize: 34, fontWeight: 800, color: 'var(--accent-strong)' }}>+</span>
          </div>
          <div style={pied}>
            <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Crée ta première marque</b>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Observe, teste, itère marque par marque</span>
          </div>
        </Link>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
          {ordre.map((m) => {
            const actif = m.id === activeId;
            const contenu = (
              <>
                <div style={apercu}>
                  <ContenuApercu logoUrl={m.logoUrl} name={m.name} />
                  {actif && (
                    <span style={{ position: 'absolute', top: 8, left: 8, padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>Active</span>
                  )}
                </div>
                <div style={pied}>
                  {/* Lot 13 · le nom complet se LIT, au doigt comme au clavier · il passe à
                      la ligne (plus d'ellipse rattrapée par un survol). */}
                  <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere', lineHeight: 1.3 }}>{m.name}</b>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{gererMarques ? (actif ? 'Marque active · reprendre' : 'Ouvrir') : (actif ? 'Marque active' : 'Marque de l’espace')}</span>
                </div>
              </>
            );
            return gererMarques
              ? <Link key={m.id} href={`/brands/${m.id}`} aria-current={actif ? 'true' : undefined} style={carte}>{contenu}</Link>
              : <div key={m.id} aria-current={actif ? 'true' : undefined} style={{ ...carte, cursor: 'default' }}>{contenu}</div>;
          })}
          {/* Ajouter une marque · action réelle, même gabarit de carte · seulement si le rôle l'ouvre. */}
          {gererMarques && <Link href="/brands/new" style={{ ...carte, ...vide }}>
            <div style={{ ...apercu, background: 'linear-gradient(160deg, var(--paper), var(--surface))' }}>
              <span aria-hidden style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent-strong)' }}>+</span>
            </div>
            <div style={pied}>
              <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Nouvelle marque</b>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ajouter au compte</span>
            </div>
          </Link>}
        </div>
      )}
    </section>
  );
}
