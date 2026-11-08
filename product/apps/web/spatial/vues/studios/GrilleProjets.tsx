'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { TITRE_PROJET_MAX, cartesFiltreesSpatial, filtresProjetsSpatial, gestesCarteSpatiale, titreProjetValide, type CleFiltreSpatial, type EtapeProjet } from '@tiktrends/core';
import { supprimerProjet, restaurerProjet } from '../../../app/actions/studios/archivage';
import { dupliquerProjet, renommerProjet } from '../../../app/actions/studios/projets';
import { Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { boutonAction, replacerFocus } from '../projet/action-serveur';
import { Message } from '../projet/briques';
import { Creative, TuileVide, type CreativeSpatiale } from './briques';

/**
 * La zone projets des Studios (`section.sec` de la maquette) · filtres par
 * ÉTAPE réelle puis « Archivés », recherche, cartes, archivage. CLIENT · on ne
 * filtre que des cartes déjà chargées sous leur droit (`listerCartesPour`,
 * actives et archivées) ; la règle (compteurs, filtrage, gestes) vient du noyau.
 *
 * Les gestes de la carte (`.pacts`, `gestesCarteSpatiale`) · « Itérer » ouvre
 * les variantes du projet (l'itération réelle part d'une variante, `iterer`),
 * « Archiver » (`supprimerProjet` · statut `archived`, versions et médias
 * conservés) et « Restaurer » (`restaurerProjet`). Lot 8 · « Renommer »
 * (`renommerProjet`, le titre seul) ouvre un champ sous la carte, et
 * « Dupliquer » (`dupliquerProjet`) crée « Copie de … » dans la même marque,
 * sans générations ni exports · la brique `boutonAction` garde le focus du
 * bouton pressé. « Supprimer définitivement » n'a pas de service · il n'est
 * pas rendu.
 */

export interface ProjetSpatial {
  id: string;
  href: string;
  title: string;
  marque: string;
  libelleType: string;
  etape: EtapeProjet;
  couverture: CreativeSpatiale[];
  version: string | null;
  pastille: { libelle: string; classe: string };
  segments: ReadonlyArray<'on' | 'cur' | ''>;
  libelleStp: string;
  reprise: string;
}

export function GrilleProjets({ projets, archives: archivesInitiales = null, nouveau, note, peutArchiver, vide }: {
  projets: ProjetSpatial[];
  /** Les projets archivés relus (`null` · non relus, le filtre « Archivés » n'est pas proposé). */
  archives?: ProjetSpatial[] | null;
  nouveau: { href: string } | null;
  note?: ReactNode;
  peutArchiver: boolean;
  vide: { titre: string; texte: ReactNode } | null;
}) {
  const { toast } = useSpatial();
  const router = useRouter();
  // Lot 8 · renommer (titre saisi, erreur dite sous le champ) et dupliquer (la copie créée, à ouvrir).
  const [renomme, setRenomme] = useState<Record<string, string>>({});
  const [edition, setEdition] = useState<{ id: string; titre: string; erreur: { message: string; horsLigne: boolean } | null } | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [copie, setCopie] = useState<{ id: string; title: string; source: string } | null>(null);
  const titre = (p: ProjetSpatial) => renomme[p.id] ?? p.title;

  async function renommer(p: ProjetSpatial) {
    if (enCours || !edition || edition.id !== p.id) return;
    const t = titreProjetValide(edition.titre);
    if (!t.ok) { setEdition({ ...edition, erreur: { message: t.raison, horsLigne: false } }); return; }
    setEnCours(`renommer:${p.id}`);
    try {
      const r = await renommerProjet({ projectId: p.id, titre: t.titre });
      if (!r.ok) { setEdition((e) => e && { ...e, erreur: { message: `${r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`, horsLigne: false } }); return; }
      setRenomme((m) => ({ ...m, [p.id]: r.projet.title }));
      setEdition(null);
      toast(`Projet renommé · « ${r.projet.title} »`);
      replacerFocus('toujours', `button[data-geste="renommer"][data-pour="${p.id}"]`);
      router.refresh();
    } catch {
      setEdition((e) => e && { ...e, erreur: { message: 'Le serveur n’a pas répondu · le nom n’est pas confirmé. Vérifie ta connexion puis réessaie.', horsLigne: true } });
    } finally { setEnCours(null); }
  }

  async function dupliquer(p: ProjetSpatial) {
    if (enCours) return;
    setEnCours(`dupliquer:${p.id}`);
    try {
      const r = await dupliquerProjet({ projectId: p.id });
      if (!r.ok) { toast(r.message); return; }
      setCopie({ id: r.projet.id, title: r.projet.title, source: titre(p) });
      toast(`« ${r.projet.title} » créé · la structure seule, sans générations ni exports`);
      router.refresh();
    } catch {
      toast('Duplication non confirmée · recharge la page pour vérifier la liste des projets.');
    } finally { setEnCours(null); }
  }
  // Archivés pendant la visite (bandeau « Annuler ») · restaurés pendant la visite (retirés du filtre « Archivés »).
  const [archivesSession, setArchivesSession] = useState<ProjetSpatial[]>([]);
  const [restaures, setRestaures] = useState<ProjetSpatial[]>([]);
  const [cle, setCle] = useState<CleFiltreSpatial>('tous');
  const [recherche, setRecherche] = useState('');
  const [occupe, setOccupe] = useState<string | null>(null);
  const verrou = useRef(false);
  const visibles = useMemo(() => [...restaures.filter((r) => !projets.some((p) => p.id === r.id)), ...projets].filter((p) => !archivesSession.some((a) => a.id === p.id)), [projets, archivesSession, restaures]);
  const archives = useMemo(() => (archivesInitiales === null ? null
    : [...archivesSession, ...archivesInitiales.filter((a) => !archivesSession.some((x) => x.id === a.id))].filter((a) => !restaures.some((r) => r.id === a.id))), [archivesInitiales, archivesSession, restaures]);
  const filtres = useMemo(() => filtresProjetsSpatial(visibles, archives ? archives.length : null), [visibles, archives]);
  const affiches = useMemo(() => cartesFiltreesSpatial(visibles, archives ?? [], { cle, recherche }), [visibles, archives, cle, recherche]);
  const enArchives = cle === 'archive';

  async function geste(p: ProjetSpatial, sens: 'archiver' | 'restaurer') {
    if (verrou.current) return;
    verrou.current = true; setOccupe(p.id);
    try {
      const r = sens === 'archiver' ? await supprimerProjet({ projectId: p.id }) : await restaurerProjet({ projectId: p.id });
      if (!r.ok) { toast(r.message); return; }
      if (sens === 'archiver') {
        setRestaures((l) => l.filter((a) => a.id !== p.id));
        setArchivesSession((l) => [...l.filter((a) => a.id !== p.id), p]);
        toast(`« ${p.title} » archivé · ses versions et créations sont conservées`);
      } else {
        setArchivesSession((l) => l.filter((a) => a.id !== p.id));
        setRestaures((l) => [...l.filter((a) => a.id !== p.id), p]);
        toast(`« ${p.title} » restauré`);
      }
    } catch {
      toast(sens === 'archiver' ? 'Archivage non confirmé · recharge la page pour vérifier le projet.' : 'Restauration non confirmée · recharge la page pour vérifier le projet.');
    } finally { verrou.current = false; setOccupe(null); }
  }

  // Le bandeau « Annuler » des projets archivés pendant la visite · pas dans le filtre « Archivés », où « Restaurer » le remplace.
  const bandeaux = enArchives ? [] : archivesSession;

  return (
    <section className="sec">
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filtrer les projets">
          {filtres.map((f) => <button key={f.cle} type="button" data-pf={f.cle} aria-pressed={cle === f.cle} onClick={() => setCle(f.cle)}>{f.libelle}</button>)}
        </div>
        <label className="jsearch" style={{ minWidth: 200 }}><Ic n="search" /><input type="search" placeholder="Rechercher un projet" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoComplete="off" aria-label="Rechercher un projet par titre, marque ou type" data-recherche-projet="" /></label>
        {nouveau && (
          <Lien className="ctanew" href={nouveau.href}>
            <span className="cn-ic"><Ic n="plus" s={false} /></span>
            <span className="cn-t"><strong>Nouveau projet</strong><small>Le type, le brief, puis le style dans le projet</small></span>
            <Ic n="arrow" />
          </Lien>
        )}
      </div>
      {note}
      {copie && (
        <div className="banner" role="status" data-copie={copie.id}>
          <Ic n="copy" /><span>« {copie.title} » créé à partir de « {copie.source} » · brief, document et réglages repris, sans générations, exports, tests ni mesures.</span>
          <Lien className="btn sm" href={`/studio/projets/${copie.id}`} style={{ marginLeft: 'auto', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Ouvrir la copie</Lien>
        </div>
      )}
      {bandeaux.map((a) => (
        <div className="banner" key={a.id} role="status">
          <Ic n="folder" /><span>« {a.title} » archivé · retiré de la liste, rien n’est perdu.</span>
          <button className="btn sm" type="button" disabled={occupe === a.id} onClick={() => void geste(a, 'restaurer')} style={{ marginLeft: 'auto' }}>Annuler</button>
        </div>
      ))}
      {(() => {
        const p = edition ? [...visibles, ...(archives ?? [])].find((x) => x.id === edition.id) : undefined;
        if (!edition || !p) return null;
        return (
          <form className="tile" data-renommer={p.id} aria-label={`Renommer ${titre(p)}`} style={{ display: 'grid', gap: 8, marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); void renommer(p); }}>
            <label className="field">Nouveau nom de « {titre(p)} »
              <input value={edition.titre} maxLength={TITRE_PROJET_MAX} autoFocus aria-describedby={edition.erreur ? `renommer-erreur-${p.id}` : undefined}
                onChange={(e) => setEdition({ ...edition, titre: e.target.value, erreur: null })} onKeyDown={(e) => { if (e.key === 'Escape') setEdition(null); }} />
            </label>
            <div className="kc">
              <button className="btn sm pri" type="submit" style={{ minHeight: 44 }} {...boutonAction({ presse: enCours === `renommer:${p.id}`, occupe: !!enCours })}>{enCours === `renommer:${p.id}` ? 'Enregistrement…' : 'Enregistrer le nom'}</button>
              <button className="btn sm" type="button" style={{ minHeight: 44 }} {...boutonAction({ occupe: !!enCours, surClic: () => setEdition(null) })}>Annuler</button>
            </div>
            <small className="faint" style={{ fontSize: '11.5px' }}>Le nom seul change · versions, créations et exports restent tels quels. Gratuit.</small>
            {edition.erreur && <div id={`renommer-erreur-${p.id}`}><Message ton="err" horsLigne={edition.erreur.horsLigne}>{edition.erreur.message}</Message></div>}
          </form>
        );
      })()}
      {enArchives
        ? affiches.length === 0 && <TuileVide titre={recherche.trim() ? 'Aucun projet archivé trouvé' : 'Aucun projet archivé'} texte="Un projet archivé garde ses versions et ses créations · il se restaure d’ici." />
        : visibles.length === 0 && vide && <TuileVide titre={vide.titre} texte={vide.texte} />}
      {!enArchives && visibles.length > 0 && affiches.length === 0 ? (
        <TuileVide titre={recherche.trim() ? 'Aucun projet ne correspond' : 'Aucun projet à cette étape'} texte={recherche.trim() ? 'La recherche porte sur le titre, la marque et le type.' : 'Les projets d’une autre étape restent dans « Tous ».'}
          action={<button className="btn sm" type="button" onClick={() => { setCle('tous'); setRecherche(''); }} style={{ marginTop: 12 }}>Voir tous les projets</button>} />
      ) : (affiches.length > 0 || (nouveau && !enArchives)) && (
        <div className="pgrid">
          {affiches.map((p) => {
            const gestes = gestesCarteSpatiale({ id: p.id, archive: enArchives }, peutArchiver);
            return (
              <div className="pwrap" key={p.id} data-projet={p.id} data-archive={enArchives ? '' : undefined}>
                <Lien className="pcard" href={p.href}>
                  <div className="cover">
                    {p.couverture.map((c, i) => <Creative key={i} c={c} />)}
                    {p.version && <span className="pill ver">{p.version}</span>}
                  </div>
                  <div className="meta"><span>{p.libelleType}</span><span className={`pill ${enArchives ? '' : p.pastille.classe}`.trim()}>{enArchives ? 'Archivé' : p.pastille.libelle}</span></div>
                  <h3 title={titre(p)}>{titre(p)}</h3>
                  <div className="steps4">{p.segments.map((s, i) => <i key={i} className={s} />)}</div>
                  <div className="stp"><span>{p.libelleStp}</span><span>{p.reprise}</span></div>
                </Lien>
                {gestes.length > 0 && (
                  <div className="pacts">
                    {gestes.map((g) => g.cle === 'iterer'
                      ? <Lien key="iterer" href={g.href} title="Itérer" aria-label={`Itérer sur ${titre(p)}`}><Ic n="loop" /></Lien>
                      : g.cle === 'renommer'
                        ? <button key="renommer" type="button" title="Renommer" aria-label={`Renommer ${titre(p)}`} aria-expanded={edition?.id === p.id} data-geste="renommer" data-pour={p.id}
                          {...boutonAction({ occupe: !!enCours, surClic: () => setEdition((e) => (e?.id === p.id ? null : { id: p.id, titre: titre(p), erreur: null })) })}><Ic n="text" /></button>
                        : g.cle === 'dupliquer'
                          ? <button key="dupliquer" type="button" title="Dupliquer" aria-label={`${enCours === `dupliquer:${p.id}` ? 'Duplication…' : 'Dupliquer'} ${titre(p)}`} data-geste="dupliquer" data-pour={p.id}
                            {...boutonAction({ presse: enCours === `dupliquer:${p.id}`, occupe: !!enCours, surClic: () => void dupliquer(p) })}><Ic n="copy" /></button>
                          : g.cle === 'archiver'
                            ? <button key="archiver" type="button" title="Archiver" aria-label={`Archiver ${titre(p)}`} disabled={occupe === p.id} onClick={() => void geste(p, 'archiver')}><Ic n="folder" /></button>
                            : <button key="restaurer" type="button" title="Restaurer" aria-label={`Restaurer ${titre(p)}`} disabled={occupe === p.id} onClick={() => void geste(p, 'restaurer')}><Ic n="back" /></button>)}
                  </div>
                )}
              </div>
            );
          })}
          {nouveau && !enArchives && (
            <Lien className="tile dash dashnew" href={nouveau.href}>
              <span className="ico"><Ic n="plus" s={false} /></span>
              <strong>Nouveau projet</strong>
              <small className="faint">Type → brief → création</small>
            </Lien>
          )}
        </div>
      )}
    </section>
  );
}
