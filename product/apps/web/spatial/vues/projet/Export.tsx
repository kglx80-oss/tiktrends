'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CONTRAT_FORMAT, POINTS_RELECTURE_EXPORT, etatExportHumain, etatValidationRelecture, libelleConservation, phraseRelectureExport, tailleLisible,
  type FormatExport, type RelectureExport, type ViolationExport,
} from '@tiktrends/core';
import { exporterVersion, validerRelectureExport } from '../../../app/actions/studios/export';
import type { ExportRealise, VueExport } from '../../../lib/studios/export/export';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien, Vue } from '../../communs';
import { EnTeteAtelier } from './Atelier';
import { boutonAction, replacerFocus } from './action-serveur';
import { LienIdentite, Message } from './briques';

/**
 * Atelier « Export » d'un projet (`/studio/projets/[id]/export`), porté du
 * panneau V5 (`PanneauExport`) sur la MÊME action (`exporterVersion`) :
 *
 *  · contrôle avant export (préflight) calculé par le serveur à la visite,
 *    sans rien écrire · chaque point bloquant nomme sa cible ;
 *  · relecture humaine (lot 8 · PC F6, F7) · cinq points cochés par une
 *    personne, validés par `validerRelectureExport` (qui, quand, dans le
 *    journal d'audit) · elle vaut pour CETTE version ;
 *  · PNG / JPEG · n'exporte que si le préflight passe ET que la version est
 *    relue (`etatExportHumain`), le serveur refait les deux contrôles au
 *    clic ; le fichier livré est décodé et mesuré (format, dimensions,
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
/** Le nom d'un « Télécharger » de l'historique · plusieurs lignes portent le même mot, le lecteur d'écran doit les distinguer. */
const nomTelechargement = (e: ExportRealise) => {
  const le = date(e.le);
  return `Télécharger la version ${e.versionN} en ${CONTRAT_FORMAT[e.format].libelle}${le ? `, exportée le ${le}` : ''}`;
};

/** `identite` · la fiche Identité de la marque, pour qui peut y réimporter un logo (le message dit qui peut, sinon). */
function Violations({ violations, identite }: { violations: ViolationExport[]; identite: string | null }) {
  return (
    <div className="tl">
      {violations.map((v, i) => (
        <div className="ev" key={`${i}-${v.cause}-${v.cible.calqueId ?? v.cible.type}`} data-cause={v.cause} data-cible={v.cible.calqueId ?? v.cible.type}>
          <span className="ico"><Ic n="warn" /></span>
          <span>{v.message}{(v.cible.assetId || v.cible.famille) && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.cible.famille ? `Police ${v.cible.famille}` : `Média ${v.cible.assetId}`}</small>}
            {v.cause === 'logo_a_reimporter' && identite && <span style={{ display: 'block', marginTop: 6 }}><LienIdentite href={identite} /></span>}</span>
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
  // La relecture de CETTE version · validée ici, elle s'affiche tout de suite (la page se relit ensuite).
  const [relecture, setRelecture] = useState<RelectureExport | null>(vue.relecture ?? null);
  useEffect(() => { setRelecture(vue.relecture ?? null); }, [vue.relecture, vue.version.id]);
  const [coches, setCoches] = useState<string[]>([]);
  useEffect(() => { setCoches([]); }, [vue.version.id]);
  const [validation, setValidation] = useState<'attente' | null>(null);
  const [erreurRelecture, setErreurRelecture] = useState<{ message: string; horsLigne: boolean } | null>(null);
  const ouverture = etatExportHumain({ peutExporter: vue.peutExporter, preflightOk: vue.preflight.ok, relue: !!relecture });
  const pret = ouverture.ouvert;
  const validable = etatValidationRelecture(coches);
  const id = useId();
  const titres = { controle: `${id}-controle`, humain: `${id}-humain`, fichier: `${id}-fichier`, version: `${id}-version`, historique: `${id}-historique` };

  async function validerRelecture() {
    setValidation('attente'); setErreurRelecture(null);
    try {
      const r = await validerRelectureExport({ projectId: vue.projet.id, versionId: vue.version.id, points: coches });
      if (!r.ok) {
        setErreurRelecture({ message: `${r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`, horsLigne: false });
        return;
      }
      setRelecture(r.relecture);
      toast(phraseRelectureExport(r.relecture));
      // Le bouton disparaît · le focus passe au premier export ouvert, sinon à la phrase qui dit qui a relu.
      replacerFocus('toujours', '[data-format="png"]', '[data-relecture="faite"]');
      router.refresh();
    } catch {
      setErreurRelecture({ message: 'Le serveur n’a pas répondu · la relecture n’est pas confirmée. Vérifie ta connexion puis réessaie.', horsLigne: true });
    } finally { setValidation(null); }
  }

  /**
   * Un bouton d'export (brique `boutonAction`) · pendant l'export, celui qu'on
   * a pressé reste FOCALISABLE, son second clic est ignoré · l'autre format est
   * fermé (`disabled`) comme avant.
   */
  const bouton = (format: FormatExport) => ({
    'data-format': format,
    ...boutonAction({ presse: encours === format, occupe: encours !== null, ferme: !pret, surClic: () => void exporter(format) }),
  });

  /** Le chemin de sortie d'un refus · les points à corriger vivent dans le document de la version. */
  const corriger = <Lien className="btn sm" href={`/studio/projets/${vue.projet.id}/image`} data-sortie="editeur"><Ic n="brush" />Corriger dans l’éditeur</Lien>;

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
          <section className="tile" data-preflight={vue.preflight.ok ? 'ok' : 'refus'} aria-labelledby={titres.controle} style={{ display: 'grid', gap: 8 }}>
            <div className="lbl" id={titres.controle} style={{ margin: 0 }}>Contrôle avant export</div>
            {vue.document && <small className="faint" style={{ fontSize: '11.5px' }}>Version {vue.version.n} · document {vue.document.largeur} × {vue.document.hauteur} · {vue.document.calques} calque{vue.document.calques > 1 ? 's' : ''}</small>}
            {vue.preflight.ok ? (
              <Message ton="ok" etiquette="Prêt">Tout est prêt · {vue.preflight.medias} média{vue.preflight.medias > 1 ? 's' : ''} relu{vue.preflight.medias > 1 ? 's' : ''} et décodé{vue.preflight.medias > 1 ? 's' : ''}, {vue.preflight.polices} police{vue.preflight.polices > 1 ? 's' : ''} embarquée{vue.preflight.polices > 1 ? 's' : ''}.</Message>
            ) : (
              <>
                <Message ton="err" etiquette="Bloqué">Export impossible pour l’instant · {vue.preflight.violations.length} point{vue.preflight.violations.length > 1 ? 's' : ''} à corriger. Aucun fichier ne sera produit tant qu’il en reste.</Message>
                <Violations violations={vue.preflight.violations} identite={vue.identiteMarque ?? null} />
                <div className="kc">{corriger}</div>
              </>
            )}
          </section>

          <section className="tile" data-relecture-humaine={relecture ? 'faite' : 'a-faire'} aria-labelledby={titres.humain} style={{ display: 'grid', gap: 8 }}>
            <div className="lbl" id={titres.humain} style={{ margin: 0 }}>Relecture humaine</div>
            {relecture ? (
              <>
                <p className="muted" role="status" tabIndex={-1} data-relecture="faite" style={{ fontSize: '12.5px' }}><span className="pill g">Relue</span> {phraseRelectureExport(relecture)}</p>
                <small className="faint" style={{ fontSize: '11.5px' }}>Les cinq points ont été vérifiés par une personne. Une nouvelle version demandera une nouvelle relecture.</small>
              </>
            ) : (
              <>
                <small className="faint" style={{ fontSize: '11.5px' }}>Avant tout export, une personne relit la création et coche chaque point · le contrôle technique ci-dessus ne voit pas ce que tu vois.</small>
                <div role="group" aria-label="Points de la relecture humaine" style={{ display: 'grid', gap: 2 }}>
                  {POINTS_RELECTURE_EXPORT.map((pt) => (
                    <label key={pt.cle} data-point={pt.cle} className="kc" style={{ alignItems: 'center', minHeight: 44, fontSize: '12.5px', cursor: vue.peutExporter ? 'pointer' : 'default' }}>
                      <input type="checkbox" checked={coches.includes(pt.cle)} disabled={!vue.peutExporter}
                        onChange={(e) => { const c = e.target.checked; setCoches((l) => (c ? [...l.filter((x) => x !== pt.cle), pt.cle] : l.filter((x) => x !== pt.cle))); }}
                        style={{ width: 18, height: 18 }} />
                      <span>{pt.libelle}</span>
                    </label>
                  ))}
                </div>
                {vue.peutExporter ? (
                  <>
                    <div className="kc">
                      <button className="btn sm pri" type="button" data-geste="valider-relecture" style={{ minHeight: 44 }}
                        {...boutonAction({ presse: validation === 'attente', occupe: validation !== null || encours !== null, ferme: !validable.ouvert, surClic: () => void validerRelecture() })}>
                        <Ic n="check" />{validation === 'attente' ? 'Validation…' : 'Valider la relecture'}
                      </button>
                    </div>
                    {!validable.ouvert && <small className="faint" data-raison-ferme="relecture" style={{ fontSize: '11.5px' }}>{validable.raison}</small>}
                  </>
                ) : <small className="faint" style={{ fontSize: '11.5px' }}>Ton rôle permet de consulter ce contrôle, pas de valider la relecture · demande un rôle Membre.</small>}
                {erreurRelecture && <Message ton="err" horsLigne={erreurRelecture.horsLigne}>{erreurRelecture.message}</Message>}
              </>
            )}
          </section>

          <section className="tile" aria-labelledby={titres.fichier} style={{ display: 'grid', gap: 8 }}>
            <div className="lbl" id={titres.fichier} style={{ margin: 0 }}>Fichier</div>
            {vue.peutExporter ? (
              <>
                <div className="kc">
                  <button className="btn sm pri" type="button" {...bouton('png')}><Ic n="down" />{encours === 'png' ? 'Export PNG en cours…' : 'Exporter en PNG'}</button>
                  <button className="btn sm" type="button" {...bouton('jpeg')}><Ic n="down" />{encours === 'jpeg' ? 'Export JPEG en cours…' : 'Exporter en JPEG'}</button>
                </div>
                {ouverture.raison && <small className="faint" data-raison-ferme="" style={{ fontSize: '11.5px' }}>{ouverture.raison}</small>}
              </>
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
                <Message ton="err" annonce={false}>{erreur.message}{erreur.traceId ? ` · identifiant support ${erreur.traceId}` : ''}</Message>
                {erreur.violations.length > 0 && <><Violations violations={erreur.violations} identite={vue.identiteMarque ?? null} /><div className="kc">{corriger}</div></>}
              </div>
            )}
          </section>
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0, alignContent: 'start' }}>
          <section className="tile" aria-labelledby={titres.version}>
            <div className="lbl" id={titres.version}>Version à exporter</div>
            <div className="tl">
              {vue.versions.map((v) => (
                <div className="ev" key={v.id} data-version-n={v.n}>
                  <span className="ico"><Ic n={v.courante ? 'check' : 'loop'} /></span>
                  <span>Version {v.n}{v.courante ? <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>courante</small> : null}</span>
                  {v.id === vue.version.id
                    ? <span className="pill c" aria-current="page">Choisie</span>
                    : <Lien className="btn sm" href={`/studio/projets/${vue.projet.id}/export${v.courante ? '' : `?version=${v.id}`}`} aria-label={`Choisir la version ${v.n}`}>Choisir</Lien>}
                </div>
              ))}
            </div>
          </section>
          <section className="tile" aria-labelledby={titres.historique}>
            <div className="lbl" id={titres.historique}>Exports de ce projet</div>
            {vue.historique.length === 0 ? <p className="muted" style={{ fontSize: '12.5px' }}>Aucun export pour l’instant.</p> : (
              <div className="tl">
                {vue.historique.map((e) => (
                  <div className="ev" key={`${e.versionId}-${e.format}-${e.sha256}`} data-historique={e.versionId}>
                    <span className="ico"><Ic n="down" /></span>
                    <span>Version {e.versionN} · {resume(e)}
                      <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{date(e.le)}{e.le ? ' · ' : ''}empreinte {e.empreinteCourte}</small>
                      <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-conserve={e.conserve === true ? 'oui' : 'non'}>{libelleConservation(e.conserve === true)}</small>
                    </span>
                    <a className="btn sm" href={e.url} download={e.nomFichier} aria-label={nomTelechargement(e)}>Télécharger</a>
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
