'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  TRANSFORMATIONS_PRODUIT, TRANSFORMATIONS_PAR_DEFAUT, LIBELLES_TRANSFORMATION, ROLES_REFERENCE, PORTEES_REFERENCE,
  LIBELLES_ROLE, LIBELLES_PORTEE, EFFET_ROLE, raisonEpinglage, raisonAssociation, LIBELLES_MODE_IMAGE, LIBELLES_NATURE_EMPREINTE,
  type TransformationProduit, type ErreurStudio, type ModeImage,
} from '@tiktrends/core';
import type { VueProduit } from '../../../lib/studios/produit/vue';
import { vide } from '../../ui';
import { epinglerProduit, associerReference, retirerReference } from '../../../app/actions/studios/produit';
import { panneau, carte, titre, sousTitre, etiquette, texte, mini, boutonPrimaire, boutonSecondaire, desactive, champ, signal, pastille, rangee, CIBLE } from '../propositions/styles';
import { ParcoursImage } from '../image/ParcoursImage';

/**
 * Écran « Produit et références » d'un projet (cahier §4.4 points 1 et 2).
 *
 *  · Produit : choisir un produit du catalogue EXISTANT puis UNE photo, la
 *    voir, déclarer ses composants obligatoires et les gestes permis, épingler
 *    (nouvelle version ; 409 si le projet a changé depuis l'ouverture).
 *  · Références : associer un fichier avec un rôle ET une portée choisis
 *    explicitement (aucun rôle proposé par défaut) ; deux rôles = deux lignes.
 *  · Contrôle avant compilation : prêt ou bloqué, pour chaque mode, avec les
 *    interdits de transfert d'une annonce concurrente. Ne lance rien.
 *
 * Statut porté par des mots, cibles de 44 px, champs à 16 px, focus visible
 * global. Rien n'est écrit sans un clic explicite.
 */

const abrege = (sha: string) => `${sha.slice(0, 12)}…`;

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page (un autre onglet ou une autre personne) · rien n’a été écrasé. Recharge pour repartir de la version courante.';
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

export function EcranProduit({ vue }: { vue: VueProduit }) {
  const router = useRouter();
  const id = useId();
  const e = vue.epingle;
  const [produitId, setProduitId] = useState<string>(e?.productId ?? vue.produitSansPhoto?.productId ?? vue.produits[0]?.id ?? '');
  const produit = vue.produits.find((p) => p.id === produitId) ?? null;
  const [photoId, setPhotoId] = useState<string>(e && e.productId === produitId ? e.photo.assetId : '');
  const [composants, setComposants] = useState<string>((e?.composantsObligatoires ?? []).join(', '));
  const [transfos, setTransfos] = useState<TransformationProduit[]>(e?.transformationsAutorisees ?? [...TRANSFORMATIONS_PAR_DEFAUT]);
  const [fichier, setFichier] = useState('');
  const [role, setRole] = useState('');
  const [portee, setPortee] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; conflit?: boolean } | null>(null);

  const groupes = useMemo(() => {
    const m = new Map<string, VueProduit['fichiers']>();
    for (const f of vue.fichiers) m.set(f.libelleProvenance, [...(m.get(f.libelleProvenance) ?? []), f]);
    return [...m.entries()];
  }, [vue.fichiers]);

  async function agir(nom: string, f: () => Promise<{ ok: true } | ErreurStudio>) {
    setEnCours(true);
    setRetour(null);
    try {
      const r = await f();
      if (r.ok) { setRetour({ ok: true, texte: nom }); router.refresh(); }
      else setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT' });
    } catch {
      setRetour({ ok: false, texte: 'Le serveur n’a pas répondu · rien n’a été enregistré. Réessaie.' });
    } finally {
      setEnCours(false);
    }
  }

  const listeComposants = composants.split(',').map((c) => c.trim()).filter(Boolean);
  // L8-A · la raison d'un geste bloqué vient d'une règle du noyau et nomme TOUT ce qui manque
  // (mesuré : fichier non choisi, « Associer » restait muet).
  const raisonEpingle = raisonEpinglage({ peutModifier: vue.peutModifier, enCours, produitChoisi: !!produit, photoChoisie: !!photoId });
  const raisonAssocie = raisonAssociation({ peutModifier: vue.peutModifier, briefPresent: vue.briefPresent, enCours, fichier, role, portee });
  const epinglageBloque = raisonEpingle !== null;
  const associationBloquee = raisonAssocie !== null;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {retour && (
        <div role={retour.ok ? 'status' : 'alert'} style={signal(retour.ok ? 'ok' : retour.conflit ? 'warn' : 'err')}>
          <span style={{ fontWeight: 600 }}>{retour.ok ? 'Enregistré · ' : retour.conflit ? 'Conflit de version · ' : 'Refusé · '}</span>{retour.texte}
          {retour.conflit && <div style={{ marginTop: 8 }}><button type="button" style={boutonSecondaire} onClick={() => router.refresh()}>Recharger la version courante</button></div>}
        </div>
      )}

      <section aria-labelledby={`${id}-epingle`} style={panneau} data-zone="produit-epingle">
        <h2 id={`${id}-epingle`} style={titre}>Produit épinglé</h2>
        {e ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            {e.apercu
              ? <img src={e.apercu} alt={`${e.nom}, photo ${e.photo.position} épinglée`} width={160} height={160} style={{ width: 160, height: 160, objectFit: 'contain', borderRadius: 12, background: 'var(--rail)', border: '1px solid var(--line-2)', flex: '0 0 auto' }} />
              : <div role="img" aria-label="Photo épinglée indisponible" style={{ ...vide, width: 160, height: 160, display: 'grid', placeItems: 'center', ...mini }}>Photo indisponible</div>}
            <div style={{ display: 'grid', gap: 6, minWidth: 0, flex: '1 1 260px' }}>
              <p style={{ ...texte, color: 'var(--ink)', fontSize: 16, fontWeight: 600 }}>{e.nom}</p>
              <p style={texte}>Photo {e.photo.position} sur {e.photo.total} · {e.variante.libelle}</p>
              <p style={mini} data-champ="empreinte">Version {e.photo.assetVersion} · {LIBELLES_NATURE_EMPREINTE[e.photo.nature]} {abrege(e.photo.sha256)}</p>
              <p style={mini}>Identifiant {e.photo.assetId}</p>
              <div style={rangee} aria-label="Composants obligatoires">
                <span style={{ ...mini, color: 'var(--ink-2)' }}>Composants obligatoires :</span>
                {e.composantsObligatoires.length
                  ? e.composantsObligatoires.map((c) => <span key={c} style={pastille('var(--accent-strong)')} data-composant={c}>{c}</span>)
                  : <span style={mini}>aucun déclaré · le contrôle visuel de l’identité reste exigé</span>}
              </div>
              <p style={mini}>Permis : {e.transformationsAutorisees.map((t) => LIBELLES_TRANSFORMATION[t].toLowerCase()).join(', ') || 'aucun geste'}.</p>
              <p style={{ ...mini, color: e.etat === 'presente' ? 'var(--ok)' : 'var(--warn)' }} data-etat-photo={e.etat}>{e.libelleEtat}</p>
            </div>
          </div>
        ) : (
          <p style={texte} data-etat="sans-photo">
            Aucune photo épinglée.{vue.produitSansPhoto ? ` Le projet vise « ${vue.produitSansPhoto.nom} » sans photo précise : choisis-la ci-dessous.` : ' Choisis un produit et UNE photo ci-dessous.'}
          </p>
        )}
      </section>

      <section aria-labelledby={`${id}-choix`} style={panneau}>
        <h2 id={`${id}-choix`} style={titre}>Choisir le produit et sa photo</h2>
        <p style={sousTitre}>Le catalogue de la marque, tel quel · rien n’est copié ailleurs. La photo choisie est celle que la création utilisera, à l’identique.</p>
        {vue.produits.length === 0 ? (
          <p style={texte} data-etat="catalogue-vide">Le catalogue de la marque n’a aucun produit · ajoute-en un depuis la fiche de la marque.</p>
        ) : (
          <>
            <div>
              <label htmlFor={`${id}-produit`} style={etiquette}>Produit</label>
              <select id={`${id}-produit`} value={produitId} onChange={(x) => { setProduitId(x.target.value); setPhotoId(''); }} style={champ} disabled={!vue.peutModifier}>
                {vue.produits.map((p) => <option key={p.id} value={p.id}>{p.nom} · {p.photos.length} photo{p.photos.length > 1 ? 's' : ''}</option>)}
              </select>
            </div>
            <p style={mini}>Variante : unique · le catalogue n’a pas de variantes.</p>
            <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <legend style={etiquette}>Photo précise</legend>
              {produit && produit.photos.length === 0 && <p style={texte}>Ce produit n’a aucune photo · dépose-en une depuis la fiche de la marque.</p>}
              <div role="radiogroup" aria-label="Photos du produit" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 10 }}>
                {produit?.photos.map((ph) => {
                  const choisie = ph.assetId === photoId;
                  return (
                    <button key={ph.assetId} type="button" role="radio" aria-checked={choisie} disabled={!vue.peutModifier} onClick={() => setPhotoId(ph.assetId)} data-photo={ph.position}
                      style={{ ...carte, padding: 8, gap: 6, cursor: vue.peutModifier ? 'pointer' : 'default', minHeight: CIBLE, border: choisie ? '2px solid var(--accent-strong)' : '1px solid var(--line-2)', textAlign: 'left', color: 'var(--ink)' }}>
                      <img src={ph.apercu} alt={`Photo ${ph.position}`} loading="lazy" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'contain', borderRadius: 8, background: 'var(--rail)' }} />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Photo {ph.position}{choisie ? ' · choisie' : ''}</span>
                      <span style={mini}>{ph.nature === 'contenu' ? 'Contenu' : 'Adresse'} {abrege(ph.sha256)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${id}-composants`} style={etiquette}>Composants obligatoires</label>
              <input id={`${id}-composants`} value={composants} onChange={(x) => setComposants(x.target.value)} disabled={!vue.peutModifier}
                placeholder="Ex. lunettes, bandeau" aria-describedby={`${id}-composants-aide`} style={champ} />
              <p id={`${id}-composants-aide`} style={{ ...mini, marginTop: 6 }}>Séparés par des virgules. Une sortie qui en omet un passe en revue ou en rejet, jamais en succès.</p>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend style={etiquette}>Gestes permis sur la photo</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 4 }}>
                {TRANSFORMATIONS_PRODUIT.map((t) => (
                  <label key={t} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: CIBLE, fontSize: 14, color: 'var(--ink-2)' }}>
                    <input type="checkbox" checked={transfos.includes(t)} disabled={!vue.peutModifier} style={{ width: 20, height: 20 }}
                      onChange={(x) => setTransfos((p) => (x.target.checked ? [...p, t] : p.filter((y) => y !== t)))} />
                    {LIBELLES_TRANSFORMATION[t]}
                  </label>
                ))}
              </div>
              <p style={{ ...mini, marginTop: 6 }}>Toujours interdit : changer la forme, les couleurs ou l’étiquette, ajouter ou retirer un composant.</p>
            </fieldset>
            {vue.peutModifier ? (
              <div style={rangee}>
                <button type="button" disabled={epinglageBloque} aria-busy={enCours} aria-describedby={`${id}-epingle-raison`} style={{ ...boutonPrimaire, ...(epinglageBloque ? desactive : {}) }}
                  onClick={() => agir('Photo épinglée · nouvelle version du projet.', () => epinglerProduit({ projectId: vue.projet.id, baseVersionId: vue.version.id, productId: produitId, photoId, composants: listeComposants, transformations: transfos }))}>
                  {enCours ? 'Épinglage…' : 'Épingler cette photo'}
                </button>
                <span id={`${id}-epingle-raison`} style={mini} data-raison="epinglage">{raisonEpingle ?? 'Crée une nouvelle version · aucun appel, aucun coût.'}</span>
              </div>
            ) : <p style={mini}>Ton rôle permet de consulter, pas d’épingler.</p>}
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-refs`} style={panneau} data-zone="references">
        <h2 id={`${id}-refs`} style={titre}>Références et rôles</h2>
        <p style={sousTitre}>Chaque fichier porte un rôle que tu choisis · aucun rôle n’est deviné. Un même fichier peut porter deux rôles : deux lignes.</p>
        {!vue.briefPresent && <p style={signal('warn')}>Ce projet n’a pas de brief · les références s’y rangent. Crée le projet depuis une source ou un brief.</p>}
        {vue.associations.length === 0 ? <p style={texte} data-etat="sans-reference">Aucune référence associée.</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {vue.associations.map((a) => (
              <li key={`${a.assetId}|${a.role}`} style={{ ...carte, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }} data-association={`${a.assetId}|${a.role}`}>
                <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 4 }}>
                  <span style={{ ...texte, color: 'var(--ink)' }}>{a.libelle}</span>
                  <span style={mini}>{a.provenance === 'concurrent' ? 'Annonce concurrente · ' : ''}Portée : {a.libellePortee}{a.requiredComponents.length ? ` · composants : ${a.requiredComponents.join(', ')}` : ''}</span>
                </div>
                <span style={pastille(a.provenance === 'concurrent' ? 'var(--warn)' : 'var(--accent-strong)')}>{a.libelleRole}</span>
                {a.epinglee ? <span style={mini}>Photo épinglée</span> : vue.peutModifier && (
                  <button type="button" style={boutonSecondaire} disabled={enCours} aria-label={`Retirer le rôle ${a.libelleRole} de ${a.libelle}`}
                    onClick={() => agir('Rôle retiré · nouvelle version du projet.', () => retirerReference({ projectId: vue.projet.id, baseVersionId: vue.version.id, assetId: a.assetId, role: a.role }))}>Retirer</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {vue.peutModifier && vue.briefPresent && (
          <div style={{ ...carte, gap: 12 }}>
            <h3 style={{ ...titre, fontSize: 16 }}>Associer un fichier</h3>
            <div>
              <label htmlFor={`${id}-fichier`} style={etiquette}>Fichier</label>
              <select id={`${id}-fichier`} value={fichier} onChange={(x) => setFichier(x.target.value)} style={champ}>
                <option value="">Choisir un fichier</option>
                {groupes.map(([g, fs]) => (
                  <optgroup key={g} label={g}>{fs.map((f) => <option key={f.assetId} value={f.assetId}>{f.libelle}</option>)}</optgroup>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label htmlFor={`${id}-role`} style={etiquette}>Rôle</label>
                <select id={`${id}-role`} value={role} onChange={(x) => setRole(x.target.value)} style={champ} required>
                  <option value="">Choisir un rôle</option>
                  {ROLES_REFERENCE.map((r) => <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-portee`} style={etiquette}>Portée</label>
                <select id={`${id}-portee`} value={portee} onChange={(x) => setPortee(x.target.value)} style={champ} required>
                  <option value="">Choisir une portée</option>
                  {PORTEES_REFERENCE.map((p) => <option key={p} value={p}>{LIBELLES_PORTEE[p]}</option>)}
                </select>
              </div>
            </div>
            {role && <p style={mini} data-effet-role={role}>{LIBELLES_ROLE[role as keyof typeof LIBELLES_ROLE]} · {EFFET_ROLE[role as keyof typeof EFFET_ROLE]}</p>}
            {vue.fichiers.find((f) => f.assetId === fichier)?.provenance === 'concurrent' && (
              <p style={signal('warn')}>Annonce concurrente · seulement Style ou Composition, sur le décor ou l’image entière. Ni son sujet, ni son produit, ni son logo ne passent.</p>
            )}
            <div style={rangee}>
              <button type="button" disabled={associationBloquee} aria-describedby={raisonAssocie ? `${id}-associer-raison` : undefined} style={{ ...boutonPrimaire, ...(associationBloquee ? desactive : {}) }}
                onClick={() => agir('Référence associée · nouvelle version du projet.', () => associerReference({ projectId: vue.projet.id, baseVersionId: vue.version.id, assetId: fichier, role, scope: portee }))}>
                Associer
              </button>
              {raisonAssocie && <span id={`${id}-associer-raison`} style={mini} data-raison="association">{raisonAssocie}</span>}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby={`${id}-controle`} style={panneau} data-zone="controle-compilation">
        <h2 id={`${id}-controle`} style={titre}>Contrôle avant compilation</h2>
        <p style={sousTitre}>Ce que la consigne image recevra · ce contrôle ne lance rien et ne coûte rien.</p>
        {(['faithful_composite', 'generative_scene'] as ModeImage[]).map((m) => {
          const p = vue.preparation[m];
          return (
            <div key={m} style={carte} data-mode={m} data-pret={p.ok ? 'oui' : 'non'}>
              <div style={rangee}>
                <span style={pastille(p.ok ? 'var(--ok)' : 'var(--err)')}>{p.ok ? 'Prêt' : 'Bloqué'}</span>
                <span style={{ ...texte, color: 'var(--ink)' }}>{LIBELLES_MODE_IMAGE[m]}</span>
              </div>
              {p.violations.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{[...new Set(p.violations.map((v) => v.raison))].map((r) => <li key={r} style={texte}>{r}</li>)}</ul>
              )}
              {p.composantsProteges.length > 0 && <p style={mini}>Composants protégés : {p.composantsProteges.join(', ')}.</p>}
              {p.interditsTransfert.map((t) => <p key={t} style={{ ...mini, color: 'var(--ink-2)' }} data-interdit="transfert">{t}</p>)}
              {p.avertissements.map((a) => <p key={a} style={{ ...mini, color: 'var(--warn)' }}>{a}</p>)}
            </div>
          );
        })}
      </section>

      {/* F-B · consigne compilée → devis → approbation → job → média, après le contrôle qu'elle exige. */}
      <ParcoursImage projectId={vue.projet.id} versionId={vue.version.id} />
    </div>
  );
}
