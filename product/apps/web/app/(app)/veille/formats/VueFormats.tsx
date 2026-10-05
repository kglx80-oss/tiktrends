import type { CSSProperties } from 'react';
import type { InspoAd } from '@tiktrends/integrations';
import {
  CIBLE_TACTILE_MIN, FORMAT_INCERTAIN, FORMAT_NON_CLASSE, TRIS_FORMATS, VERSION_FORMATS_CREATIFS,
  compterFormats, criteresActifsFormats, dateCourteFormat, ecrireCriteresFormats, estFormatCreatif, formatCreatif,
  grilleFormat, libellePlateforme, libelleVueFormat, plateformesPresentes,
  type AnnonceFormat, type CriteresFormats, type FormatCreatif,
} from '@tiktrends/core';
import { AdCard } from '../../../../components/AdCard';
import { h1, surface, tuile, vide } from '../../../../components/ui';
import { Empty } from '../../../../components/Empty';
import { FormatChoix } from '../../saved/FormatChoix';
import { PreparerTest } from './PreparerTest';

export interface AnnonceSauvegardee extends AnnonceFormat {
  id: string;
  externalId: string;
  ad: InspoAd;
  auteurNom: string | null;
}

const BASE = '/veille/formats';
const lien = (c: CriteresFormats) => BASE + ecrireCriteresFormats(c);
const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

const puce = (actif: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, padding: '6px 14px', borderRadius: 999,
  fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
  border: '1px solid ' + (actif ? 'transparent' : 'var(--line-2)'),
  background: actif ? 'var(--grad-accent)' : 'var(--surface)', color: actif ? 'var(--on-accent)' : 'var(--ink-2)',
});
const etiquette: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginRight: 2 };
const rangee: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' };

/**
 * Cadres (charte #725 · message 55) · carte de format = `surface` (un bloc de
 * premier niveau, même cliquable) ; « à classer » et « incertaines » = `vide`
 * (pointillé, appellent un geste) ; format sans annonce = `tuile` (dans le
 * dépliant) ; puces, critères et médias restent des contrôles (pilules).
 *
 * L'écran Formats · liste des formats avec le nombre RÉEL d'annonces classées,
 * puis la grille d'un format. Composant serveur sans état · tout vient de
 * l'URL (critères) et de la base (classements) · les comptes et la grille sont
 * calculés au noyau (`compterFormats`, `grilleFormat`).
 */
export function VueFormats({ annonces, criteres: c, marque, suivis, adsmap }: {
  annonces: AnnonceSauvegardee[]; criteres: CriteresFormats; marque: string | null; suivis: string[]; adsmap: boolean;
}) {
  const compte = compterFormats(annonces, c);
  const plateformes = plateformesPresentes(annonces);
  const actifs = criteresActifsFormats(c);
  const filtre = !!(c.media || c.plateforme);
  // Aucune sauvegarde du tout · ni compteurs à zéro, ni filtres qui ne
  // trouveraient rien · l'état vide explique et donne la sortie.
  const rien = annonces.length === 0;

  return (
    <>
      <h1 id="formats-titre" tabIndex={-1} style={{ ...h1, outline: 'none' }}>Formats créatifs</h1>
      <p data-perimetre style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 6, lineHeight: 1.5, maxWidth: 760 }}>
        Périmètre · <b>tes sauvegardes classées</b> à la main{marque ? <>, marque <b>{marque}</b></> : null}. Ce n’est pas toute la bibliothèque de la Veille · rien n’est classé automatiquement.
      </p>
      {!rien && <p data-compteurs style={{ color: 'var(--muted)', fontSize: 12.5, margin: '0 0 16px' }}>
        {pluriel(compte.total, 'sauvegarde', 'sauvegardes')}{filtre ? ' dans ces critères' : ''} · {pluriel(compte.classees, 'classée', 'classées')} · {pluriel(compte.nonClassees, 'non classée', 'non classées')}
        {compte.incertaines > 0 ? <> · {pluriel(compte.incertaines, 'incertaine', 'incertaines')}</> : null}
      </p>}

      {/* Filtres de périmètre · liens, l'URL fait foi. */}
      {!rien && <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        <div role="group" aria-label="Média" style={rangee}>
          <span style={etiquette}>Média</span>
          {([[null, 'Tous'], ['image', 'Image'], ['video', 'Vidéo']] as const).map(([m, l]) => (
            <a key={l} href={lien({ ...c, media: m })} aria-current={c.media === m ? 'true' : undefined} style={puce(c.media === m)}>{l}</a>
          ))}
        </div>
        {plateformes.length > 1 && (
          <div role="group" aria-label="Source" style={rangee}>
            <span style={etiquette}>Source</span>
            <a href={lien({ ...c, plateforme: null })} aria-current={!c.plateforme ? 'true' : undefined} style={puce(!c.plateforme)}>Toutes</a>
            {plateformes.map((p) => (
              <a key={p} href={lien({ ...c, plateforme: p })} aria-current={c.plateforme === p ? 'true' : undefined} style={puce(c.plateforme === p)}>{libellePlateforme(p)}</a>
            ))}
          </div>
        )}
        {actifs.length > 0 && (
          <div role="group" aria-label="Critères actifs" style={rangee}>
            <span style={etiquette}>Critères</span>
            {actifs.map((a) => (
              <a key={a.cle} href={BASE + a.sansLui} aria-label={`Retirer le critère ${a.libelle}`} style={{ ...puce(false), background: 'var(--accent-soft)', color: 'var(--accent-strong)', borderColor: 'transparent' }}>
                {a.libelle} <span aria-hidden>✕</span>
              </a>
            ))}
            {actifs.length > 1 && <a href={BASE} style={{ ...puce(false), border: 'none', background: 'transparent', textDecoration: 'underline' }}>Tout retirer</a>}
          </div>
        )}
      </div>}

      {c.format ? <Grille annonces={annonces} c={c} total={compte} suivis={suivis} adsmap={adsmap} /> : <Liste compte={compte} c={c} filtre={filtre} />}

      <p style={{ marginTop: 28, fontSize: 11.5, color: 'var(--muted)' }}>
        Liste des formats · version {VERSION_FORMATS_CREATIFS} · 25 formats et Autre, filtrés par média au moment du choix. <a href="/saved" style={{ color: 'var(--ink-2)' }}>Toutes tes sauvegardes</a>
      </p>
    </>
  );
}

function Liste({ compte, c, filtre }: { compte: ReturnType<typeof compterFormats>; c: CriteresFormats; filtre: boolean }) {
  const versNonClassees = lien({ ...c, format: FORMAT_NON_CLASSE });
  if (compte.total === 0) {
    return filtre
      ? <Empty tone="todo" icon="search" title="Aucune sauvegarde pour ces critères." why="Rien ne correspond au média ou à la source choisis · retire un critère." action={{ label: 'Retirer les filtres', href: BASE, rechargement: true }} />
      : <Empty tone="todo" icon="bookmark" title="Aucune annonce sauvegardée." why="Les formats se rangent à partir de tes sauvegardes · dans la Veille, ★ garde une annonce, puis classe-la ici." action={{ label: 'Ouvrir la veille', href: '/veille' }} />;
  }
  if (compte.classees === 0) {
    return (
      <Empty
        tone="todo" icon="tag" title="Aucune sauvegarde classée pour l’instant."
        why={`Les compteurs par format se remplissent quand tu classes tes sauvegardes, une à une · rien n’est deviné. ${compte.nonClassees > 1 ? `${compte.nonClassees} annonces attendent leur format.` : `${compte.nonClassees} annonce attend son format.`}`}
        action={{ label: compte.nonClassees > 0 ? `Classer mes ${pluriel(compte.nonClassees, 'sauvegarde', 'sauvegardes')}` : 'Voir les incertaines', href: compte.nonClassees > 0 ? versNonClassees : lien({ ...c, format: FORMAT_INCERTAIN }),
          // Même chemin, autre recherche · le routeur client ne termine pas
          // toujours cette transition (mesuré en recette 19C, comme #106b) ·
          // navigation complète, comme les autres sorties de cet écran.
          rechargement: true }}
      />
    );
  }
  return (
    <>
      {compte.nonClassees > 0 && (
        <div data-a-classer style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px', marginBottom: 18, ...vide }}>
          <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{pluriel(compte.nonClassees, 'sauvegarde à classer', 'sauvegardes à classer')} · comptées à part, dans aucun format</span>
          <a href={versNonClassees} style={{ ...puce(true) }}>Classer maintenant</a>
        </div>
      )}
      <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Formats présents dans tes sauvegardes</h2>
      <ul data-formats-presents style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 10 }}>
        {compte.avecAnnonces.map(({ format, n }) => (
          <li key={format.id}>
            <a href={lien({ ...c, format: format.id })} data-format={format.id} data-compte={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: CIBLE_TACTILE_MIN, padding: '12px 14px', ...surface, background: 'var(--surface)', textDecoration: 'none' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{format.libelle}</span>
                <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>{format.definition}</span>
                <Medias f={format} />
              </span>
              <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{pluriel(n, 'annonce', 'annonces')}</span>
            </a>
          </li>
        ))}
        {compte.incertaines > 0 && (
          <li>
            <a href={lien({ ...c, format: FORMAT_INCERTAIN })} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, padding: '12px 14px', ...vide, textDecoration: 'none', color: 'var(--ink-2)', fontSize: 13 }}>
              <span style={{ flex: 1 }}>Incertaines · exclues des formats</span><b>{compte.incertaines}</b>
            </a>
          </li>
        )}
      </ul>
      {compte.sansAnnonce.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
            Formats sans annonce classée ({compte.sansAnnonce.length})
          </summary>
          <ul data-formats-vides style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 8 }}>
            {compte.sansAnnonce.map((f) => (
              <li key={f.id} style={{ padding: '8px 10px', ...tuile, fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
                <b style={{ color: 'var(--ink-2)' }}>{f.libelle}</b> · {f.definition}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function Medias({ f }: { f: FormatCreatif }) {
  return (
    <span style={{ display: 'flex', gap: 4, marginTop: 6 }}>
      {f.medias.map((m) => <span key={m} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--muted)' }}>{m === 'video' ? 'Vidéo' : 'Image'}</span>)}
    </span>
  );
}

function Grille({ annonces, c, total, suivis, adsmap }: { annonces: AnnonceSauvegardee[]; c: CriteresFormats; total: ReturnType<typeof compterFormats>; suivis: string[]; adsmap: boolean }) {
  const vue = c.format!;
  const grille = grilleFormat(annonces, c);
  const retour = lien({ ...c, format: null, tri: 'recent' });
  const suiviSet = new Set(suivis);
  const def = estFormatCreatif(vue) ? formatCreatif(vue).definition
    : vue === FORMAT_NON_CLASSE ? 'Choisis le format de chaque annonce puis « Enregistrer » · l’annonce quitte cette liste et rejoint son format.'
      : 'Classements sous le seuil de confiance · exclus des résultats d’un format.';
  return (
    <section aria-labelledby="formats-vue">
      <a href={retour} style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 13, fontWeight: 700, color: 'var(--ink-2)', textDecoration: 'none' }}>← Tous les formats</a>
      <h2 id="formats-vue" style={{ margin: '4px 0 4px', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
        {libelleVueFormat(vue)} <span data-compte-vue={grille.length} style={{ color: 'var(--muted)', fontWeight: 600 }}>· {pluriel(grille.length, 'annonce', 'annonces')}</span>
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)' }}>{def}</p>

      {grille.length > 1 && (
        <div role="group" aria-label="Tri" style={{ ...rangee, marginBottom: 14 }}>
          <span style={etiquette}>Tri</span>
          {TRIS_FORMATS.map((t) => (
            <a key={t.id} href={lien({ ...c, tri: t.id })} aria-current={c.tri === t.id ? 'true' : undefined} style={puce(c.tri === t.id)}>{t.libelle}</a>
          ))}
        </div>
      )}

      {grille.length === 0 ? (
        vue === FORMAT_NON_CLASSE && total.total > 0
          ? <Empty tone="good" icon="check" title="Toutes tes sauvegardes sont classées." why="Chaque annonce de ce périmètre porte un format · les compteurs sont à jour." action={{ label: 'Voir les formats', href: retour, rechargement: true }} />
          : <Empty tone="todo" icon="search" title={`Aucune sauvegarde classée « ${libelleVueFormat(vue)} »${c.media || c.plateforme ? ' dans ces critères' : ''}.`}
              why="Ce format n’a encore aucune annonce de ton périmètre · classe une sauvegarde depuis la liste des non classées, ou retire un critère."
              action={{ label: 'Tous les formats', href: retour, rechargement: true }} />
      ) : (
        <div data-grille style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 16 }}>
          {grille.map((a) => {
            const classeLe = dateCourteFormat(a.format.date);
            return (
              <article key={a.platform + ':' + a.externalId} data-annonce={a.externalId} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <AdCard ad={a.ad} saved cloneRef={a.id} cibles44 following={suiviSet.has(a.ad.platform + ':' + (a.ad.advertiserName || ''))} />
                <p data-source style={{ margin: 0, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                  Source · {libellePlateforme(a.platform)} · sauvegardée le {dateCourteFormat(a.sauvegardeLe) ?? 'n/c'}
                  {classeLe ? <> · classée le {classeLe}{a.auteurNom ? <> par {a.auteurNom}</> : null}</> : null}
                </p>
                <FormatChoix platform={a.platform} externalId={a.externalId} mediaType={a.mediaType} initial={a.format.id} versionAncienne={a.format.versionAncienne} vue={vue} />
                {adsmap && <PreparerTest platform={a.platform} externalId={a.externalId} />}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
