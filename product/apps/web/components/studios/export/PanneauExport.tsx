'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, CONTRAT_FORMAT, tailleLisible, libelleConservation, type FormatExport, type ViolationExport } from '@tiktrends/core';
import { exporterVersion } from '../../../app/actions/studios/export';
import type { ExportRealise, VueExport } from '../../../lib/studios/export/export';
import { btn, btnGhost, surface, tuile } from '../../ui';

/**
 * Studios · L7-A · panneau d'export image (EXPORT-01, 04, 05).
 *
 * Le contrôle avant export (préflight) est calculé par le serveur à la visite,
 * sans rien écrire : chaque point bloquant nomme sa CIBLE (calque, média,
 * police). Le bouton n'exporte que si tout est prêt, et le serveur refait le
 * contrôle au clic (droits et ressources relus). Le fichier livré a été
 * décodé et mesuré : format, dimensions, poids, empreinte. L'historique garde
 * chaque export, désigné par sa version et son empreinte, jamais par son nom.
 *
 * R4 · chaque export dit s'il est CONSERVÉ (le téléchargement sert le fichier
 * archivé, même après un changement de média) ou refait à la demande · en
 * toutes lettres, jamais par la seule couleur.
 */

const section: CSSProperties = { ...surface, background: 'var(--surface)', padding: 18, display: 'grid', gap: 12, minWidth: 0 };
const titre: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 500, color: 'var(--ink)' };
const discret: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' };
const lien: CSSProperties = { fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' };

const date = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); } catch { return ''; }
};

function resume(e: ExportRealise): string {
  return `${CONTRAT_FORMAT[e.format].libelle} · ${e.largeur} × ${e.hauteur} · ${tailleLisible(e.octets)}`;
}

/** R4 · état de conservation, en toutes lettres. */
function Conservation({ e }: { e: ExportRealise }) {
  const oui = e.conserve === true;
  return (
    <span data-conserve={oui ? 'oui' : 'non'} style={{ fontSize: 11.5, color: oui ? 'var(--ink-2)' : 'var(--muted)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
      {libelleConservation(oui)}
    </span>
  );
}

function ListeViolations({ violations }: { violations: ViolationExport[] }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
      {violations.map((v, i) => (
        <li key={`${i}-${v.cause}-${v.cible.calqueId ?? v.cible.type}`} data-cause={v.cause} data-cible={v.cible.calqueId ?? v.cible.type}
          style={{ ...tuile, padding: '8px 12px', display: 'grid', gap: 2, background: 'rgba(255,92,138,.08)', minWidth: 0 }}>
          <span style={{ fontSize: 13, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{v.message}</span>
          {(v.cible.assetId || v.cible.famille) && (
            <span style={{ fontSize: 11.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
              {v.cible.famille ? `Police ${v.cible.famille}` : `Média ${v.cible.assetId}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function PanneauExport({ vue }: { vue: VueExport }) {
  const router = useRouter();
  const [encours, setEncours] = useState<FormatExport | null>(null);
  const [fait, setFait] = useState<ExportRealise | null>(null);
  const [erreur, setErreur] = useState<{ message: string; traceId: string; violations: ViolationExport[] } | null>(null);
  const pret = vue.preflight.ok && vue.peutExporter;

  async function exporter(format: FormatExport) {
    setEncours(format);
    setErreur(null);
    setFait(null);
    const r = await exporterVersion({ projectId: vue.projet.id, versionId: vue.version.id, format });
    setEncours(null);
    if (!r.ok) {
      setErreur({ message: r.message, traceId: r.traceId, violations: 'preflight' in r && r.preflight ? r.preflight : [] });
      return;
    }
    setFait(r.export);
    // Téléchargement · l'adresse désigne la version et l'empreinte vérifiée.
    const a = document.createElement('a');
    a.href = r.export.url; a.download = r.export.nomFichier;
    document.body.appendChild(a); a.click(); a.remove();
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 520px', minWidth: 0, display: 'grid', gap: 18 }}>
        <section aria-labelledby="ex-controle" style={section} data-preflight={vue.preflight.ok ? 'ok' : 'refus'}>
          <h2 id="ex-controle" style={titre}>Contrôle avant export</h2>
          {vue.document && (
            <p style={discret}>Version {vue.version.n} · document {vue.document.largeur} × {vue.document.hauteur} · {vue.document.calques} calque{vue.document.calques > 1 ? 's' : ''}</p>
          )}
          {vue.preflight.ok ? (
            <p role="status" style={{ ...discret, ...tuile, padding: '8px 12px', color: 'var(--ink)', background: 'rgba(126,232,191,.10)' }}>
              Tout est prêt · {vue.preflight.medias} média{vue.preflight.medias > 1 ? 's' : ''} relu{vue.preflight.medias > 1 ? 's' : ''} et décodé{vue.preflight.medias > 1 ? 's' : ''}, {vue.preflight.polices} police{vue.preflight.polices > 1 ? 's' : ''} embarquée{vue.preflight.polices > 1 ? 's' : ''}.
            </p>
          ) : (
            <>
              <p role="alert" style={{ ...discret, color: '#ff9db0' }}>
                Export impossible pour l’instant · {vue.preflight.violations.length} point{vue.preflight.violations.length > 1 ? 's' : ''} à corriger. Aucun fichier ne sera produit tant qu’il en reste.
              </p>
              <ListeViolations violations={vue.preflight.violations} />
              <Link href={`/studio/projets/${vue.projet.id}/image`} style={lien}>Corriger dans l’éditeur d’image ›</Link>
            </>
          )}
        </section>

        <section aria-labelledby="ex-fichier" style={section}>
          <h2 id="ex-fichier" style={titre}>Fichier</h2>
          {vue.peutExporter ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" data-format="png" disabled={!pret || encours !== null} onClick={() => exporter('png')} style={{ ...btn, opacity: pret ? 1 : 0.45, cursor: pret ? 'pointer' : 'not-allowed' }}>
                {encours === 'png' ? 'Export PNG en cours…' : 'Exporter en PNG'}
              </button>
              <button type="button" data-format="jpeg" disabled={!pret || encours !== null} onClick={() => exporter('jpeg')} style={{ ...btnGhost, fontSize: 13, opacity: pret ? 1 : 0.45, cursor: pret ? 'pointer' : 'not-allowed' }}>
                {encours === 'jpeg' ? 'Export JPEG en cours…' : 'Exporter en JPEG'}
              </button>
            </div>
          ) : (
            <p style={discret}>Ton rôle permet de consulter ce contrôle, pas d’exporter · demande un rôle Membre.</p>
          )}
          <p style={{ ...discret, color: 'var(--muted)' }}>
            Gratuit · calcul local, aucune génération. Le fichier est dérivé de la version {vue.version.n} : il ne la modifie pas, et le projet reste éditable. PNG sans perte, identique à l’aperçu ; JPEG aplati sur fond blanc.
          </p>
          {fait && (
            <div role="status" data-export={fait.sha256} style={{ ...tuile, padding: '10px 12px', display: 'grid', gap: 4, background: 'rgba(126,232,191,.10)' }}>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>Fichier vérifié · {resume(fait)}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>Empreinte {fait.empreinteCourte}</span>
              <a href={fait.url} download={fait.nomFichier} style={lien}>Télécharger {fait.nomFichier}</a>
              <Conservation e={fait} />
            </div>
          )}
          {erreur && (
            <div role="alert" style={{ display: 'grid', gap: 8 }}>
              <p style={{ ...discret, color: '#ff9db0' }}>{erreur.message}</p>
              {erreur.violations.length > 0 && <ListeViolations violations={erreur.violations} />}
              <p style={{ ...discret, fontSize: 12, color: 'var(--muted)' }}>Identifiant support : {erreur.traceId}</p>
            </div>
          )}
        </section>
      </div>

      <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 18 }}>
        <section aria-labelledby="ex-versions" style={section}>
          <h2 id="ex-versions" style={titre}>Version à exporter</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
            {vue.versions.map((v) => (
              <li key={v.id} data-version-n={v.n}>
                <a href={`/studio/projets/${vue.projet.id}/export${v.courante ? '' : `?version=${v.id}`}`} aria-current={v.id === vue.version.id ? 'page' : undefined}
                  style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 13, textDecoration: 'none', color: v.id === vue.version.id ? 'var(--ink)' : 'var(--ink-2)', fontWeight: v.id === vue.version.id ? 600 : 400 }}>
                  <span>Version {v.n}</span>{v.courante && <span style={{ color: 'var(--muted)' }}>· courante</span>}
                </a>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="ex-historique" style={section}>
          <h2 id="ex-historique" style={titre}>Exports de ce projet</h2>
          {vue.historique.length === 0 ? (
            <p style={{ ...discret, color: 'var(--muted)' }}>Aucun export pour l’instant.</p>
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
              {vue.historique.map((e) => (
                <li key={`${e.versionId}-${e.format}-${e.sha256}`} data-historique={e.versionId} style={{ ...tuile, padding: '8px 12px', display: 'grid', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>Version {e.versionN} · {resume(e)}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
                    {date(e.le)}{e.le ? ' · ' : ''}empreinte <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{e.empreinteCourte}</span>
                  </span>
                  <Conservation e={e} />
                  <a href={e.url} download={e.nomFichier} style={lien}>Télécharger</a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
