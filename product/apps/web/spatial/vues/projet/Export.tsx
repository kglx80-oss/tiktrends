'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTRAT_FORMAT, libelleConservation, tailleLisible, type FormatExport, type ViolationExport } from '@tiktrends/core';
import { exporterVersion } from '../../../app/actions/studios/export';
import type { ExportRealise, VueExport } from '../../../lib/studios/export/export';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien, Vue } from '../../communs';
import { EnTeteAtelier } from './Atelier';
import { Message } from './briques';

/**
 * Atelier « Export » d'un projet (`/studio/projets/[id]/export`), porté du
 * panneau V5 (`PanneauExport`) sur la MÊME action (`exporterVersion`) :
 *
 *  · contrôle avant export (préflight) calculé par le serveur à la visite,
 *    sans rien écrire · chaque point bloquant nomme sa cible ;
 *  · PNG / JPEG · n'exporte que si tout est prêt, le serveur refait le contrôle
 *    au clic ; le fichier livré est décodé et mesuré (format, dimensions,
 *    poids, empreinte) ;
 *  · version à exporter, historique des exports · conservé ou refait à la
 *    demande, en toutes lettres.
 * Gratuit · calcul local, aucune génération.
 */

export interface PropsExport {
  vue: VueExport;
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
}

const date = (iso: string | null) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }); } catch { return ''; }
};
const resume = (e: ExportRealise) => `${CONTRAT_FORMAT[e.format].libelle} · ${e.largeur} × ${e.hauteur} · ${tailleLisible(e.octets)}`;

function Violations({ violations }: { violations: ViolationExport[] }) {
  return (
    <div className="tl">
      {violations.map((v, i) => (
        <div className="ev" key={`${i}-${v.cause}-${v.cible.calqueId ?? v.cible.type}`} data-cause={v.cause} data-cible={v.cible.calqueId ?? v.cible.type}>
          <span className="ico"><Ic n="warn" /></span>
          <span>{v.message}{(v.cible.assetId || v.cible.famille) && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.cible.famille ? `Police ${v.cible.famille}` : `Média ${v.cible.assetId}`}</small>}</span>
        </div>
      ))}
    </div>
  );
}

export function Export({ vue, atelier }: PropsExport) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [encours, setEncours] = useState<FormatExport | null>(null);
  const [fait, setFait] = useState<ExportRealise | null>(null);
  const [erreur, setErreur] = useState<{ message: string; traceId: string; violations: ViolationExport[] } | null>(null);
  const pret = vue.preflight.ok && vue.peutExporter;

  async function exporter(format: FormatExport) {
    setEncours(format); setErreur(null); setFait(null);
    try {
      const r = await exporterVersion({ projectId: vue.projet.id, versionId: vue.version.id, format });
      if (!r.ok) { setErreur({ message: r.message, traceId: r.traceId, violations: 'preflight' in r && r.preflight ? r.preflight : [] }); return; }
      setFait(r.export);
      // Téléchargement · l'adresse désigne la version et l'empreinte vérifiée.
      const a = document.createElement('a');
      a.href = r.export.url; a.download = r.export.nomFichier;
      document.body.appendChild(a); a.click(); a.remove();
      toast(`Fichier vérifié · ${resume(r.export)}`);
      router.refresh();
    } catch {
      setErreur({ message: 'Le serveur n’a pas répondu · aucun fichier n’est confirmé. Vérifie ta connexion puis réessaie.', traceId: '', violations: [] });
    } finally { setEncours(null); }
  }

  return (
    <Vue>
      <EnTeteAtelier titre="Exporter l’image" projet={{ id: vue.projet.id, title: vue.projet.title, marque: vue.projet.marque, versionN: vue.version.n }} atelier={atelier}
        actif={`/studio/projets/${vue.projet.id}/export`} aide="Fichier vérifié, dérivé de la version, sans génération." />
      <div className="grid2">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <section className="tile" data-preflight={vue.preflight.ok ? 'ok' : 'refus'} style={{ display: 'grid', gap: 8 }}>
            <div className="lbl" style={{ margin: 0 }}>Contrôle avant export</div>
            {vue.document && <small className="faint" style={{ fontSize: '11.5px' }}>Version {vue.version.n} · document {vue.document.largeur} × {vue.document.hauteur} · {vue.document.calques} calque{vue.document.calques > 1 ? 's' : ''}</small>}
            {vue.preflight.ok ? (
              <Message ton="ok">Tout est prêt · {vue.preflight.medias} média{vue.preflight.medias > 1 ? 's' : ''} relu{vue.preflight.medias > 1 ? 's' : ''} et décodé{vue.preflight.medias > 1 ? 's' : ''}, {vue.preflight.polices} police{vue.preflight.polices > 1 ? 's' : ''} embarquée{vue.preflight.polices > 1 ? 's' : ''}.</Message>
            ) : (
              <>
                <Message ton="err">Export impossible pour l’instant · {vue.preflight.violations.length} point{vue.preflight.violations.length > 1 ? 's' : ''} à corriger. Aucun fichier ne sera produit tant qu’il en reste.</Message>
                <Violations violations={vue.preflight.violations} />
                <div className="kc"><Lien className="btn sm" href={`/studio/projets/${vue.projet.id}/image`}><Ic n="brush" />Corriger dans l’éditeur</Lien></div>
              </>
            )}
          </section>

          <section className="tile" style={{ display: 'grid', gap: 8 }}>
            <div className="lbl" style={{ margin: 0 }}>Fichier</div>
            {vue.peutExporter ? (
              <div className="kc">
                <button className="btn sm pri" type="button" data-format="png" disabled={!pret || encours !== null} onClick={() => void exporter('png')}><Ic n="down" />{encours === 'png' ? 'Export PNG en cours…' : 'Exporter en PNG'}</button>
                <button className="btn sm" type="button" data-format="jpeg" disabled={!pret || encours !== null} onClick={() => void exporter('jpeg')}><Ic n="down" />{encours === 'jpeg' ? 'Export JPEG en cours…' : 'Exporter en JPEG'}</button>
              </div>
            ) : <small className="faint" style={{ fontSize: '11.5px' }}>Ton rôle permet de consulter ce contrôle, pas d’exporter · demande un rôle Membre.</small>}
            <small className="faint" style={{ fontSize: '11.5px' }}>Gratuit · calcul local, aucune génération. Le fichier est dérivé de la version {vue.version.n} · il ne la modifie pas, et le projet reste éditable. PNG sans perte, identique à l’aperçu ; JPEG aplati sur fond blanc.</small>
            {fait && (
              <div className="sugg" role="status" data-export={fait.sha256}>
                <p style={{ fontSize: '12.5px' }}>Fichier vérifié · {resume(fait)}</p>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Empreinte {fait.empreinteCourte} · <span data-conserve={fait.conserve === true ? 'oui' : 'non'}>{libelleConservation(fait.conserve === true)}</span></small>
                <a className="btn sm" href={fait.url} download={fait.nomFichier} style={{ marginTop: 8 }}><Ic n="down" />Télécharger {fait.nomFichier}</a>
              </div>
            )}
            {erreur && (
              <div role="alert" style={{ display: 'grid', gap: 6 }}>
                <Message ton="err">{erreur.message}{erreur.traceId ? ` · identifiant support ${erreur.traceId}` : ''}</Message>
                {erreur.violations.length > 0 && <Violations violations={erreur.violations} />}
              </div>
            )}
          </section>
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0, alignContent: 'start' }}>
          <section className="tile">
            <div className="lbl">Version à exporter</div>
            <div className="tl">
              {vue.versions.map((v) => (
                <div className="ev" key={v.id} data-version-n={v.n}>
                  <span className="ico"><Ic n={v.courante ? 'check' : 'loop'} /></span>
                  <span>Version {v.n}{v.courante ? <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>courante</small> : null}</span>
                  {v.id === vue.version.id
                    ? <span className="pill c" aria-current="page">Choisie</span>
                    : <Lien className="btn sm" href={`/studio/projets/${vue.projet.id}/export${v.courante ? '' : `?version=${v.id}`}`}>Choisir</Lien>}
                </div>
              ))}
            </div>
          </section>
          <section className="tile">
            <div className="lbl">Exports de ce projet</div>
            {vue.historique.length === 0 ? <p className="muted" style={{ fontSize: '12.5px' }}>Aucun export pour l’instant.</p> : (
              <div className="tl">
                {vue.historique.map((e) => (
                  <div className="ev" key={`${e.versionId}-${e.format}-${e.sha256}`} data-historique={e.versionId}>
                    <span className="ico"><Ic n="down" /></span>
                    <span>Version {e.versionN} · {resume(e)}
                      <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{date(e.le)}{e.le ? ' · ' : ''}empreinte {e.empreinteCourte}</small>
                      <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-conserve={e.conserve === true ? 'oui' : 'non'}>{libelleConservation(e.conserve === true)}</small>
                    </span>
                    <a className="btn sm" href={e.url} download={e.nomFichier}>Télécharger</a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Vue>
  );
}
