'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCEPT_PHOTO_IMPORT, EFFET_ROLE, LIBELLES_MODE_IMAGE, LIBELLES_NATURE_EMPREINTE, LIBELLES_PORTEE, LIBELLES_ROLE, LIBELLES_TRANSFORMATION,
  PORTEES_REFERENCE, ROLES_REFERENCE, TRANSFORMATIONS_PAR_DEFAUT, TRANSFORMATIONS_PRODUIT,
  affichageImportPhoto, raisonAssociation, raisonEpinglage, raisonImportPhoto, verdictFichierPhoto,
  type ErreurStudio, type EtatImportPhoto, type ModeImage, type RecuperationImport, type TransformationProduit,
} from '@tiktrends/core';
import type { VueProduit } from '../../../lib/studios/produit/vue';
import { associerReference, epinglerProduit, importerPhotoProduit, retirerReference } from '../../../app/actions/studios/produit';
import { compresserPhoto } from '../../../lib/studios/produit/compression-photo';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Vue } from '../../communs';
import { EnTeteAtelier } from './Atelier';
import { Message } from './briques';
import { ParcoursImage } from './ParcoursImage';

/**
 * Atelier « Produit » d'un projet (`/studio/projets/[id]/produit`), porté de
 * l'écran V5 « Produit et références » (`EcranProduit`) sur les MÊMES actions :
 *
 *  · le produit épinglé (photo, composants obligatoires, gestes permis, état) ;
 *  · choisir un produit du catalogue puis UNE photo, épingler (nouvelle
 *    version ; conflit de version dit, rien d'écrasé) · ou importer la photo
 *    depuis l'ordinateur (compressée ici, revalidée au serveur) ;
 *  · le parcours image (`ParcoursImage`) · consigne, devis, génération ;
 *  · références · associer un fichier avec un rôle ET une portée choisis
 *    (aucun rôle deviné), retirer un rôle ;
 *  · contrôle avant compilation (prêt ou bloqué par mode, interdits de
 *    transfert d'une annonce concurrente). Ne lance rien.
 * Rien n'est écrit sans un clic explicite · aucun de ces gestes ne coûte, sauf
 * le parcours image, qui annonce son prix avant.
 */

export interface PropsProduit {
  vue: VueProduit;
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
}

const abrege = (sha: string) => `${sha.slice(0, 12)}…`;

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page · rien n’a été écrasé. Recharge pour repartir de la version courante.';
  if (r.violations?.length) return [...new Set(r.violations.map((v) => v.raison))].join(' · ');
  return r.message;
}

export function Produit({ vue, atelier }: PropsProduit) {
  const router = useRouter();
  const { toast } = useSpatial();
  const e = vue.epingle;
  const [produitId, setProduitId] = useState<string>(e?.productId ?? vue.produitSansPhoto?.productId ?? vue.produits[0]?.id ?? '');
  const produit = vue.produits.find((p) => p.id === produitId) ?? null;
  const [photoId, setPhotoId] = useState<string>(e && e.productId === produitId ? e.photo.assetId : produit?.photos.length === 1 ? produit.photos[0]!.assetId : '');
  const [composants, setComposants] = useState<string>((e?.composantsObligatoires ?? []).join(', '));
  const [transfos, setTransfos] = useState<TransformationProduit[]>(e?.transformationsAutorisees ?? [...TRANSFORMATIONS_PAR_DEFAUT]);
  const [fichier, setFichier] = useState('');
  const [role, setRole] = useState('');
  const [portee, setPortee] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string; recharger?: boolean } | null>(null);

  const groupes = useMemo(() => {
    const m = new Map<string, VueProduit['fichiers']>();
    for (const f of vue.fichiers) m.set(f.libelleProvenance, [...(m.get(f.libelleProvenance) ?? []), f]);
    return [...m.entries()];
  }, [vue.fichiers]);

  async function agir(succes: string, f: () => Promise<{ ok: true } | ErreurStudio>) {
    setEnCours(true); setRetour(null);
    try {
      const r = await f();
      if (r.ok) { setRetour({ ton: 'ok', texte: succes }); toast(succes); router.refresh(); }
      else setRetour({ ton: 'err', texte: messageErreur(r), recharger: r.code === 'VERSION_CONFLICT' });
    } catch {
      setRetour({ ton: 'err', texte: 'La connexion a été interrompue · l’enregistrement a peut-être abouti. Recharge la page pour vérifier avant de recommencer.', recharger: true });
    } finally { setEnCours(false); }
  }

  const listeComposants = composants.split(',').map((c) => c.trim()).filter(Boolean);
  const raisonEpingle = raisonEpinglage({ peutModifier: vue.peutModifier, enCours: enCours || importEnCours, produitChoisi: !!produit, photoChoisie: !!photoId });
  const raisonAssocie = raisonAssociation({ peutModifier: vue.peutModifier, briefPresent: vue.briefPresent, enCours, fichier, role, portee });
  const concurrent = vue.fichiers.find((f) => f.assetId === fichier)?.provenance === 'concurrent';

  return (
    <Vue>
      <EnTeteAtelier titre="Produit et références" projet={{ id: vue.projet.id, title: vue.projet.title, marque: vue.projet.marque, versionN: vue.version.n }} atelier={atelier}
        actif={`/studio/projets/${vue.projet.id}/produit`} aide="La photo produit sert de référence au visuel · rien n’est généré sans ton geste, le prix est montré avant." />
      {retour && (
        <div className="sec">
          <Message ton={retour.ton}>{retour.texte}</Message>
          {retour.recharger && <button className="btn sm" type="button" onClick={() => router.refresh()} style={{ marginTop: 8 }}>Recharger la version courante</button>}
        </div>
      )}

      <div className="grid2">
        <section className="tile" data-zone="produit-epingle">
          <div className="lbl">{e ? 'Ton produit est prêt' : 'Produit du visuel'}</div>
          {e ? (
            <div className="prow" style={{ alignItems: 'flex-start' }}>
              {e.apercu ? <img src={e.apercu} alt={`${e.nom}, photo ${e.photo.position} épinglée`} /> : <span className="pill w">Photo indisponible</span>}
              <div className="t">
                <strong style={{ fontSize: 13 }}>{e.nom}</strong>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Photo {e.photo.position} sur {e.photo.total} · {e.variante.libelle}</small>
                <small style={{ display: 'block', fontSize: '11.5px' }} data-etat-photo={e.etat}><span className={`pill ${e.etat === 'presente' ? 'g' : 'w'}`}>{e.libelleEtat}</span></small>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-champ="composants">Composants obligatoires · {e.composantsObligatoires.length ? e.composantsObligatoires.join(', ') : 'aucun déclaré · le contrôle visuel de l’identité reste exigé'}</small>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Permis · {e.transformationsAutorisees.map((t) => LIBELLES_TRANSFORMATION[t].toLowerCase()).join(', ') || 'aucun geste'}.</small>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-champ="empreinte">Version {e.photo.assetVersion} · {LIBELLES_NATURE_EMPREINTE[e.photo.nature]} {abrege(e.photo.sha256)}</small>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-photo">
              {vue.produitSansPhoto ? `La création utilisera « ${vue.produitSansPhoto.nom} ». Confirme sa photo pour continuer.` : 'Choisis un produit de ta marque, puis confirme sa photo.'}
            </p>
          )}
        </section>

        <section className="tile" data-zone="controle-compilation">
          <div className="lbl">Contrôle avant compilation</div>
          <p className="faint" style={{ fontSize: '11.5px', marginBottom: 8 }}>Ce que la consigne image recevra · ce contrôle ne lance rien et ne coûte rien.</p>
          <div className="tl">
            {(['faithful_composite', 'generative_scene'] as ModeImage[]).map((m) => {
              const p = vue.preparation[m];
              return (
                <div className="ev" key={m} data-mode={m} data-pret={p.ok ? 'oui' : 'non'}>
                  <span className="ico"><Ic n={p.ok ? 'check' : 'warn'} /></span>
                  <span>{LIBELLES_MODE_IMAGE[m]}
                    {[...new Set(p.violations.map((v) => v.raison))].map((r) => <small key={r} className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{r}</small>)}
                    {p.composantsProteges.length > 0 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Composants protégés · {p.composantsProteges.join(', ')}.</small>}
                    {p.interditsTransfert.map((t) => <small key={t} className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-interdit="transfert">{t}</small>)}
                    {p.avertissements.map((a) => <small key={a} className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{a}</small>)}
                  </span>
                  <span className={`pill ${p.ok ? 'g' : 'w'}`}>{p.ok ? 'Prêt' : 'Bloqué'}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="tile sec" data-zone="choix-produit" style={{ display: 'grid', gap: 12 }}>
        <div className="sech" style={{ margin: 0 }}><h2>{e ? 'Changer le produit ou la photo' : 'Confirme la photo produit'}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Cette photo servira de référence pour ton visuel</span></div>
        {vue.produits.length === 0 ? (
          <p className="muted" style={{ fontSize: '12.5px' }} data-etat="catalogue-vide">Le catalogue de la marque n’a aucun produit · ajoute-en un depuis la fiche de la marque.</p>
        ) : (
          <>
            <label className="field" style={{ maxWidth: 420 }}>Produit
              <select value={produitId} disabled={!vue.peutModifier} onChange={(x) => { setProduitId(x.target.value); const photos = vue.produits.find((p) => p.id === x.target.value)?.photos ?? []; setPhotoId(photos.length === 1 ? photos[0]!.assetId : ''); }}>
                {vue.produits.map((p) => <option key={p.id} value={p.id}>{p.nom} · {p.photos.length} photo{p.photos.length > 1 ? 's' : ''}</option>)}
              </select>
            </label>
            {produit && produit.photos.length === 0 && <p className="muted" style={{ fontSize: '12.5px' }} data-etat="produit-sans-photo">Ce produit n’a aucune photo · {vue.peutModifier ? 'importe-la depuis ton ordinateur, plus bas.' : 'une personne qui peut modifier le projet peut l’importer.'}</p>}
            {produit && produit.photos.length > 0 && (
              <div className="lib2" role="radiogroup" aria-label="Photos du produit">
                {produit.photos.map((ph) => {
                  const choisie = ph.assetId === photoId;
                  return (
                    <figure key={ph.assetId} data-photo={ph.position}>
                      <button type="button" className="ad nob" role="radio" aria-checked={choisie} disabled={!vue.peutModifier} onClick={() => setPhotoId(ph.assetId)} style={{ padding: 0, border: 0, width: '100%', cursor: vue.peutModifier ? 'pointer' : 'default' }}>
                        <span className="ph"><img src={ph.apercu} alt={`Photo ${ph.position}`} loading="lazy" style={{ objectFit: 'contain' }} /></span>
                      </button>
                      <div className="rights"><strong>Photo {ph.position}</strong>{choisie ? <span className="pill g">Choisie</span> : <span className="faint">À choisir</span>}</div>
                    </figure>
                  );
                })}
              </div>
            )}
            <details>
              <summary className="faint" style={{ cursor: 'pointer', fontSize: '12.5px' }}>Réglages avancés du produit</summary>
              <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                <label className="field" style={{ maxWidth: 520 }}>Composants obligatoires
                  <input value={composants} disabled={!vue.peutModifier} onChange={(x) => setComposants(x.target.value)} placeholder="Ex. lunettes, bandeau" />
                  <small className="faint" style={{ fontSize: '11.5px', fontWeight: 500 }}>Séparés par des virgules. Une sortie qui en omet un passe en revue ou en rejet, jamais en succès.</small>
                </label>
                <div>
                  <div className="lbl">Gestes permis sur la photo</div>
                  <div className="kc">
                    {TRANSFORMATIONS_PRODUIT.map((t) => (
                      <button key={t} type="button" className="chip" aria-pressed={transfos.includes(t)} disabled={!vue.peutModifier} data-transformation={t}
                        onClick={() => setTransfos((p) => (p.includes(t) ? p.filter((y) => y !== t) : [...p, t]))}>{LIBELLES_TRANSFORMATION[t]}</button>
                    ))}
                  </div>
                  <small className="faint" style={{ display: 'block', fontSize: '11.5px', marginTop: 6 }}>Toujours interdit · changer la forme, les couleurs ou l’étiquette, ajouter ou retirer un composant.</small>
                </div>
              </div>
            </details>
            {vue.peutModifier ? (
              <div className="kc">
                <button className="btn sm pri" type="button" data-geste="epingler" disabled={raisonEpingle !== null} aria-busy={enCours}
                  onClick={() => void agir('Photo enregistrée · tu peux maintenant préparer ton visuel.', () => epinglerProduit({ projectId: vue.projet.id, baseVersionId: vue.version.id, productId: produitId, photoId, composants: listeComposants, transformations: transfos }))}>
                  <Ic n="check" />{enCours ? 'Enregistrement…' : 'Utiliser cette photo et continuer'}
                </button>
                <small className="faint" style={{ fontSize: '11.5px' }} data-raison="epinglage">{raisonEpingle ?? 'Gratuit · aucune génération à cette étape.'}</small>
              </div>
            ) : <small className="faint" style={{ fontSize: '11.5px' }}>Ton rôle permet de consulter, pas d’épingler.</small>}
            {vue.peutModifier && (
              <ImportPhoto projectId={vue.projet.id} versionId={vue.version.id} produit={produit ? { id: produit.id, nom: produit.nom } : null}
                composants={listeComposants} transformations={transfos} occupe={enCours} onOccupe={setImportEnCours} onReussi={(photo) => { setPhotoId(photo); setRetour(null); }} />
            )}
          </>
        )}
      </section>

      {e && <ParcoursImage projectId={vue.projet.id} versionId={vue.version.id} />}

      <section className="tile sec" data-zone="references" style={{ display: 'grid', gap: 12 }}>
        <div className="sech" style={{ margin: 0 }}><h2>Références et rôles</h2><span className="faint" style={{ fontSize: '12.5px' }}>Chaque fichier porte un rôle que tu choisis · aucun n’est deviné</span></div>
        {!vue.briefPresent && <Message ton="info">Ce projet n’a pas de brief · les références s’y rangent. Crée le projet depuis une source ou un brief.</Message>}
        {vue.associations.length === 0 ? <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-reference">Aucune référence associée.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {vue.associations.map((a) => (
              <div className="prow" key={`${a.assetId}|${a.role}`} data-association={`${a.assetId}|${a.role}`}>
                <div className="t">
                  <strong style={{ fontSize: '12.5px' }}>{a.libelle}</strong>
                  <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{a.provenance === 'concurrent' ? 'Annonce concurrente · ' : ''}Portée · {a.libellePortee}{a.requiredComponents.length ? ` · composants : ${a.requiredComponents.join(', ')}` : ''}</small>
                </div>
                <span className={`pill ${a.provenance === 'concurrent' ? 'w' : 'c'}`}>{a.libelleRole}</span>
                {a.epinglee ? <span className="faint" style={{ fontSize: '11.5px' }}>Photo épinglée</span> : vue.peutModifier && (
                  <button className="btn sm" type="button" disabled={enCours} aria-label={`Retirer le rôle ${a.libelleRole} de ${a.libelle}`}
                    onClick={() => void agir('Rôle retiré · nouvelle version du projet.', () => retirerReference({ projectId: vue.projet.id, baseVersionId: vue.version.id, assetId: a.assetId, role: a.role }))}>Retirer</button>
                )}
              </div>
            ))}
          </div>
        )}
        {vue.peutModifier && vue.briefPresent && (
          <div className="sugg" style={{ display: 'grid', gap: 10 }} data-zone="associer">
            <strong style={{ fontSize: 13 }}>Associer un fichier</strong>
            <div className="fields">
              <label className="field">Fichier
                <select value={fichier} onChange={(x) => setFichier(x.target.value)}>
                  <option value="">Choisir un fichier</option>
                  {groupes.map(([g, fs]) => <optgroup key={g} label={g}>{fs.map((f) => <option key={f.assetId} value={f.assetId}>{f.libelle}</option>)}</optgroup>)}
                </select>
              </label>
              <label className="field">Rôle
                <select value={role} onChange={(x) => setRole(x.target.value)} required>
                  <option value="">Choisir un rôle</option>
                  {ROLES_REFERENCE.map((r) => <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>)}
                </select>
              </label>
              <label className="field">Portée
                <select value={portee} onChange={(x) => setPortee(x.target.value)} required>
                  <option value="">Choisir une portée</option>
                  {PORTEES_REFERENCE.map((p) => <option key={p} value={p}>{LIBELLES_PORTEE[p]}</option>)}
                </select>
              </label>
            </div>
            {role && <small className="faint" style={{ fontSize: '11.5px' }} data-effet-role={role}>{LIBELLES_ROLE[role as keyof typeof LIBELLES_ROLE]} · {EFFET_ROLE[role as keyof typeof EFFET_ROLE]}</small>}
            {concurrent && <Message ton="info">Annonce concurrente · seulement Style ou Composition, sur le décor ou l’image entière. Ni son sujet, ni son produit, ni son logo ne passent.</Message>}
            <div className="kc">
              <button className="btn sm pri" type="button" data-geste="associer" disabled={raisonAssocie !== null}
                onClick={() => void agir('Référence associée · nouvelle version du projet.', () => associerReference({ projectId: vue.projet.id, baseVersionId: vue.version.id, assetId: fichier, role, scope: portee }))}>Associer</button>
              {raisonAssocie && <small className="faint" style={{ fontSize: '11.5px' }} data-raison="association">{raisonAssocie}</small>}
            </div>
          </div>
        )}
      </section>
    </Vue>
  );
}

const LIBELLES_RECUPERATION: Readonly<Record<RecuperationImport, string>> = {
  choisir: 'Choisir une autre photo',
  reessayer: 'Réessayer l’envoi',
  recharger: 'Recharger la version courante',
};

/**
 * Importer une photo produit depuis l'ordinateur, DANS le projet (V5 lot 3a,
 * `ImportPhotoProduit`) · compressée dans le navigateur, revalidée au serveur
 * par la même règle du noyau, ajoutée au catalogue du produit puis épinglée
 * (`importerPhotoProduit`). Chaque échec offre un geste de récupération.
 */
function ImportPhoto({ projectId, versionId, produit, composants, transformations, occupe, onOccupe, onReussi }: {
  projectId: string; versionId: string; produit: { id: string; nom: string } | null; composants: string[]; transformations: TransformationProduit[];
  occupe: boolean; onOccupe: (b: boolean) => void; onReussi: (photoId: string) => void;
}) {
  const router = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const prete = useRef<{ dataUri: string; nom: string } | null>(null);
  const [etat, setEtat] = useState<EtatImportPhoto>({ etape: 'repos' });
  const enCours = etat.etape === 'preparation' || etat.etape === 'envoi';
  const raison = raisonImportPhoto({ peutModifier: true, produitChoisi: !!produit, enCours: enCours || occupe });
  const affichage = affichageImportPhoto(etat);

  async function envoyer(dataUri: string, nom: string) {
    if (!produit) return;
    setEtat({ etape: 'envoi', fichier: nom }); onOccupe(true);
    try {
      const r = await importerPhotoProduit({ projectId, baseVersionId: versionId, productId: produit.id, dataUri, composants, transformations });
      if (r.ok) { prete.current = null; setEtat({ etape: 'reussi', ajoutee: r.ajoutee, fichier: nom }); onReussi(r.photoId); router.refresh(); }
      else if (r.code === 'VERSION_CONFLICT') setEtat({ etape: 'echec', motif: 'conflit', fichier: nom });
      else { prete.current = null; setEtat({ etape: 'echec', motif: 'serveur', message: messageErreur(r), fichier: nom }); }
    } catch {
      // La photo préparée est gardée · « Réessayer l'envoi » la renvoie telle quelle.
      setEtat({ etape: 'echec', motif: 'reseau', fichier: nom });
    } finally { onOccupe(false); }
  }

  async function traiter(f: File | undefined) {
    if (!f || raison) return;
    const v = verdictFichierPhoto({ type: f.type, taille: f.size });
    if (!v.ok) { prete.current = null; setEtat({ etape: 'echec', motif: v.motif, fichier: f.name }); return; }
    setEtat({ etape: 'preparation', fichier: f.name }); onOccupe(true);
    let c: Awaited<ReturnType<typeof compresserPhoto>>;
    try { c = await compresserPhoto(f); } catch { c = { ok: false, motif: 'illisible' }; }
    if (!c.ok) { onOccupe(false); prete.current = null; setEtat({ etape: 'echec', motif: c.motif, fichier: f.name }); return; }
    prete.current = { dataUri: c.dataUri, nom: f.name };
    await envoyer(c.dataUri, f.name);
  }

  function recuperer(g: RecuperationImport) {
    if (g === 'choisir') { champ.current?.click(); return; }
    if (g === 'reessayer') { if (prete.current) void envoyer(prete.current.dataUri, prete.current.nom); else champ.current?.click(); return; }
    setEtat({ etape: 'repos' }); router.refresh();
  }

  return (
    <div className="tile dash" data-zone="import-photo" data-etape={etat.etape} style={{ display: 'grid', gap: 8, textAlign: 'left' }}
      onDragOver={(ev) => { if (!raison) ev.preventDefault(); }} onDrop={(ev) => { ev.preventDefault(); void traiter(ev.dataTransfer.files?.[0]); }}>
      <strong style={{ fontSize: 13 }}><Ic n="img" />Importer une photo depuis l’ordinateur</strong>
      <small className="faint" style={{ fontSize: '11.5px' }}>JPG, PNG ou WebP, compressée dans ton navigateur. Elle rejoint le catalogue {produit ? `de « ${produit.nom} »` : 'du produit'} et devient la photo épinglée · nouvelle version, aucun appel, aucun coût. Tu peux aussi la glisser ici.</small>
      <input ref={champ} type="file" accept={ACCEPT_PHOTO_IMPORT} tabIndex={-1} aria-hidden="true" style={{ display: 'none' }}
        onChange={(ev) => { const f = ev.target.files?.[0]; ev.currentTarget.value = ''; void traiter(f); }} />
      <div className="kc">
        <button className="btn sm" type="button" data-geste="importer" disabled={!!raison} aria-busy={enCours} onClick={() => champ.current?.click()}>{enCours ? 'Import…' : 'Choisir une photo et l’épingler'}</button>
        {raison && <small className="faint" style={{ fontSize: '11.5px' }} data-raison="import">{raison}</small>}
      </div>
      {affichage && (
        <div role={affichage.role} data-import={etat.etape} data-motif={etat.motif} style={{ display: 'grid', gap: 6 }}>
          <Message ton={affichage.ton === 'ok' ? 'ok' : affichage.ton === 'info' ? 'info' : 'err'}><b>{affichage.titre}</b> · {affichage.texte}</Message>
          {affichage.recuperations.length > 0 && (
            <div className="kc">{affichage.recuperations.map((g) => <button key={g} className="btn sm" type="button" onClick={() => recuperer(g)} data-recuperation={g}>{LIBELLES_RECUPERATION[g]}</button>)}</div>
          )}
        </div>
      )}
    </div>
  );
}
