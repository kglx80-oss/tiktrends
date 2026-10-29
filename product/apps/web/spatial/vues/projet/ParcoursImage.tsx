'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  capacitesDuRefus, detailSansEtat, libelleCaseControleVision, libelleCoutTexteEstime, libelleCredits, libellePrix, libelleUsd, phraseCoutDevis,
  LIBELLES_PORTEE, LIBELLES_ROLE, NOTE_BORNE_TEXTE, VALIDITE_DEVIS_MS,
  type ErreurStudio, type ModeImage, type PorteeReference, type RoleReference,
} from '@tiktrends/core';
import type { ConsigneVue, JobImageVue, VueParcoursImage } from '../../../lib/studios/image/parcours';
import {
  approuverEtLancerImage, compilerConsigneImage, controlerMediaImage, demanderDevisImage, lireParcoursImage, retenirConsigneImage,
} from '../../../app/actions/studios/image';
import { annulerJob } from '../../../app/actions/studios/execution';
import { trancherComposants } from '../../../app/actions/studios/produit';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../lib/studios/appel-payant';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Message } from './briques';

/**
 * Le parcours image d'un projet (atelier « Produit »), porté du parcours V5
 * (`ParcoursImage` / `VueParcours`) sur les MÊMES actions serveur :
 *
 *  1. « Préparer mon visuel avec Jarvis » · appel texte PAYANT (compilation de
 *     la consigne) · coût annoncé sous le bouton, puis un second clic de
 *     confirmation · verrou d'appel payant (`useAppelPayant`) ;
 *  2. « Valider et voir le prix » · retient la consigne (gratuit) puis demande
 *     le devis (gratuit, prix figé) ;
 *  3. « Générer mon visuel · N crédits » · débit annoncé, second clic de
 *     confirmation, clé d'idempotence gardée par devis (un double clic ou une
 *     reconnexion retrouvent le même job) ;
 *  4. les visuels · état réel relu toutes les 4 s tant qu'un job travaille,
 *     annulation, relecture des composants obligatoires.
 * Rien n'est lancé à l'ouverture · la page ne fait que lire.
 */

const RELECTURE_MS = 4_000;
const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const messageErreur = (r: ErreurStudio) => `${r.violations?.length ? r.violations.map((v) => v.raison).join(' · ') : r.message}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`;
const CLASSE_ETAT: Record<string, string> = { completed: 'g', failed: 'w', reconciliation_required: 'w', cancel_requested: 'w', cancelled: '' };
const CLASSE_QUALITE: Record<string, string> = { passed: 'g', rejected: 'w', requires_review: 'w', pending: '' };

function cleDuClic(quoteId: string): string {
  const k = `tt-studio-image-cle-${quoteId}`;
  try {
    const deja = window.sessionStorage.getItem(k);
    if (deja) return deja;
    const cle = `img-${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, cle);
    return cle;
  } catch { return `img-${quoteId}`; }
}

export function ParcoursImage({ projectId, versionId, initial = null }: { projectId: string; versionId: string; initial?: VueParcoursImage | null }) {
  const router = useRouter();
  const { toast } = useSpatial();
  const appel = useAppelPayant(projectId, 'compilation-image');
  const [vue, setVue] = useState<VueParcoursImage | null>(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nonActive, setNonActive] = useState<string | null>(null);
  const [mode, setMode] = useState<ModeImage | ''>('');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string } | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  // Un geste payant armé (premier clic) · le second clic le lance.
  const [arme, setArme] = useState<'compiler' | 'lancer' | null>(null);
  const [controleVision, setControleVision] = useState(true);
  const operation = useRef(false);
  const controles = useRef(new Set<string>());

  const charger = useCallback(async () => {
    try {
      const r = await lireParcoursImage({ projectId });
      if (r.ok) { setVue(r.vue); setErreur(null); setNonActive(null); }
      else if (capacitesDuRefus(r).length) setNonActive(r.message);
      else setErreur(messageErreur(r));
    } catch { setErreur('Le serveur n’a pas répondu · recharge la page.'); }
  }, [projectId]);

  useEffect(() => { if (!initial) void charger(); }, [charger, versionId, initial]);
  useEffect(() => {
    if (vue && !mode) {
      const voulu = vue.enAttente?.mode ?? vue.retenue?.mode ?? 'generative_scene';
      const m = vue.modes.find((x) => x.mode === voulu && x.pret) ?? vue.modes.find((x) => x.pret);
      if (m) setMode(m.mode);
    }
  }, [vue, mode]);
  useEffect(() => {
    if (!vue || !vue.jobs.some((j) => !j.terminal)) return;
    const t = setTimeout(() => { void charger(); }, RELECTURE_MS);
    return () => clearTimeout(t);
  }, [vue, charger]);
  useEffect(() => {
    if (!vue?.peutRelire) return;
    for (const j of vue.jobs) {
      if (j.etat === 'completed' && j.qualite === 'pending' && !controles.current.has(j.id)) {
        controles.current.add(j.id);
        // Un refus (issue incertaine, plafond…) est DIT, jamais avalé.
        void controlerMediaImage({ jobId: j.id }).then((r) => { if (!r.ok) setRetour({ ton: 'err', texte: r.message }); return charger(); }).catch(() => undefined);
      }
    }
  }, [vue, charger]);

  async function agir(nom: string, f: () => Promise<{ ok: true } | ErreurStudio>, succes: string) {
    if (operation.current) return;
    const tentative = nom === 'compiler' ? appel.commencer() : null;
    if (nom === 'compiler' && !tentative) return;
    operation.current = true; setEnCours(nom); setRetour(null); setArme(null);
    try {
      const r = await f();
      if (tentative) appel.terminer(tentative, resultatPayantIncertain(r));
      if (r.ok) { setRetour({ ton: 'ok', texte: succes }); toast(succes); } else setRetour({ ton: 'err', texte: messageErreur(r) });
    } catch {
      if (tentative) appel.terminer(tentative, true);
      setRetour({ ton: 'err', texte: tentative ? MESSAGE_APPEL_PAYANT : 'Le serveur n’a pas répondu · rien n’a été confirmé. Recharge avant de réessayer.' });
    } finally {
      setEnCours(null); await charger(); operation.current = false;
    }
  }

  if (nonActive) {
    return (
      <section className="tile sec" data-zone="parcours-image" data-etat="non-active">
        <div className="lbl"><Ic n="lock" />Génération d’images · non activée pour cet espace</div>
        <p className="muted" style={{ fontSize: '12.5px' }} role="status">{nonActive}</p>
        <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>Le produit, les références et l’éditeur de calques restent disponibles. L’ouverture se fait d’abord pour des espaces pilotes, puis pour tous après recette.</p>
      </section>
    );
  }
  if (!vue || erreur) {
    return (
      <section className="tile sec" data-zone="parcours-image" aria-busy={!erreur}>
        {erreur ? <Message ton="err">{erreur}</Message> : <p className="muted" style={{ fontSize: '12.5px' }}>Chargement de l’état de l’image…</p>}
        <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>Rien n’est lancé à l’ouverture de la page.</p>
        {erreur && <button className="btn sm" type="button" onClick={() => void charger()} style={{ marginTop: 8 }}>Actualiser l’état du visuel</button>}
      </section>
    );
  }

  const d = appel.bloque ? { ...vue.disponibilite, compilation: { disponible: false, raison: MESSAGE_APPEL_PAYANT } } : vue.disponibilite;
  const modeChoisi = vue.modes.find((m) => m.mode === mode);
  const compilable = d.compilation.disponible && !!modeChoisi?.pret && !enCours;
  const ancienneFidele = vue.enAttente?.mode === 'faithful_composite';
  const propositionDisponible = !!vue.enAttente && !ancienneFidele;
  const verdictOk = !!vue.retenue && vue.retenue.verdict.ok;
  const raisonDevis = !vue.retenue ? 'Retiens d’abord une consigne compilée.' : !vue.retenue.verdict.ok ? vue.retenue.verdict.motif : !d.devis.disponible ? d.devis.raison : '';
  const titre = vue.jobs.some((j) => !j.terminal) ? 'Ton visuel est en cours de création' : vue.devis && verdictOk ? 'Générer ton visuel' : propositionDisponible ? 'Valide ta direction créative' : verdictOk ? 'Ton visuel est prêt à être généré' : 'Préparer ton visuel';
  const coutCompilation = `${libelleCoutTexteEstime(vue.coutCompilationUsd)} · ${NOTE_BORNE_TEXTE}`;

  const compiler = () => agir('compiler', async () => {
    setQuestions([]);
    const r = await compilerConsigneImage({ projectId, mode });
    // Des questions · rien n'est compilé, le geste n'a pas réussi (même lecture que la V5).
    if (r.ok && r.statut === 'questions') {
      setQuestions(r.questions);
      return { ok: false, code: 'INVALID_SCHEMA', status: 422, message: 'La consigne n’est pas compilée · réponds aux questions dans le brief puis recompile.', targetIds: [], recoverable: true, traceId: '' } as ErreurStudio;
    }
    return r;
  }, 'Ta direction créative est prête à être relue.');
  const retenir = (runId: string) => agir('retenir', async () => {
    const r = await retenirConsigneImage({ projectId, baseVersionId: vue.version.id, runId });
    if (!r.ok) return r;
    router.refresh();
    return demanderDevisImage({ projectId, controleVision: !!vue.controleVision?.disponible });
  }, 'Direction validée · vérifie le prix avant de générer.');
  const lancer = () => {
    const x = vue.devis;
    if (!x) return;
    void agir('lancer', () => approuverEtLancerImage({ quoteId: x.id, inputHash: x.inputHash, creditsAnnonces: x.credits, idempotencyKey: cleDuClic(x.id) }), 'Ton image est en cours de création · elle apparaîtra ici dès qu’elle sera prête.');
  };

  return (
    <section className="tile sec" data-zone="parcours-image" style={{ display: 'grid', gap: 12 }}>
      <div className="sech" style={{ margin: 0 }}><h2>{titre}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Jarvis prépare, tu vérifies le prix avant de lancer, puis le produit sur l’image</span></div>
      {appel.bloque && <div className="banner" role="status" style={{ margin: 0 }}><span className="orb" style={{ width: 32, height: 32, fontSize: '12.5px' }}>J</span><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${projectId}#taches`}>Voir le suivi</Lien></span></div>}
      {retour && <div data-retour={retour.ton === 'ok' ? 'ok' : 'refus'}><Message ton={retour.ton}>{retour.texte}</Message></div>}
      <small className="faint" style={{ fontSize: '11.5px' }}>Format {vue.format.largeur} × {vue.format.hauteur} · {vue.format.libelle}{vue.format.depuisBrief ? ' · lu dans le brief' : ' · défaut, le brief ne précise pas de format'}.</small>

      {!(propositionDisponible || verdictOk) && (
        <div style={{ display: 'grid', gap: 10 }} data-etape="consigne">
          <div className="kc" role="group" aria-label="Méthode de création">
            {vue.modes.map((m) => (
              <button key={m.mode} type="button" className="chip" aria-pressed={m.mode === mode} data-mode={m.mode} disabled={!m.pret || !!enCours} onClick={() => setMode(m.mode)}>
                {m.mode === 'faithful_composite' ? 'Conserver la photo du produit, créer le décor' : 'Créer une mise en scène à partir de la photo'}{m.pret ? '' : ' · indisponible'}
              </button>
            ))}
          </div>
          {arme === 'compiler' ? (
            <div className="sugg" data-confirmation="compiler">
              <p style={{ fontSize: '12.5px' }}>Appel texte payant · {coutCompilation} · préparation uniquement, l’image sera facturée séparément.</p>
              <div className="kc" style={{ marginTop: 8 }}>
                <button className="btn sm pri" type="button" disabled={!compilable} onClick={() => void compiler()}>{enCours === 'compiler' ? 'Jarvis prépare…' : 'Confirmer la préparation'}</button>
                <button className="btn sm" type="button" onClick={() => setArme(null)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="kc">
              <button className="btn sm pri" type="button" data-bouton="compiler" disabled={!compilable} onClick={() => setArme('compiler')}><Ic n="spark" />{enCours === 'compiler' ? 'Jarvis prépare…' : 'Préparer mon visuel avec Jarvis'}</button>
              <small className="faint" style={{ fontSize: '11.5px' }} data-cout="compilation">Appel texte payant · {coutCompilation} · préparation uniquement, l’image sera facturée séparément.</small>
            </div>
          )}
          {!d.compilation.disponible && <small className="faint" style={{ fontSize: '11.5px' }} data-indisponible="compilation">Indisponible · {d.compilation.raison}</small>}
          {questions.length > 0 && (
            <div className="sugg" data-champ="questions">
              <p style={{ fontSize: '12.5px' }}>La consigne n’est pas compilée · il manque des informations.</p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '12.5px' }}>{questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <Lien className="btn sm" href={`/studio/projets/${projectId}#brief`} style={{ marginTop: 8 }}>Préciser le brief</Lien>
            </div>
          )}
        </div>
      )}

      {ancienneFidele && <Message ton="info">Cette ancienne direction demandait une conservation exacte de la photo, non disponible ici. Pour une mise en scène, prépare une nouvelle direction avec Jarvis · son coût est indiqué avant le clic.</Message>}
      {propositionDisponible && vue.enAttente && (
        <div className="sugg" data-consigne="en-attente">
          <div className="rights"><strong style={{ fontSize: 13 }}>La direction proposée pour ton image</strong><span className="pill c">À valider</span></div>
          <DetailsConsigne c={vue.enAttente} />
          <div className="kc" style={{ marginTop: 8 }}>
            <button className="btn sm pri" type="button" data-bouton="retenir" disabled={!d.retenir.disponible || !!enCours} onClick={() => void retenir(vue.enAttente!.runId)}>{enCours === 'retenir' ? 'Enregistrement…' : 'Valider et voir le prix'}</button>
            <small className="faint" style={{ fontSize: '11.5px' }}>{d.retenir.disponible ? 'Validation gratuite · aucune génération.' : d.retenir.raison}</small>
          </div>
        </div>
      )}
      {vue.retenue ? (
        <details className="sugg" data-consigne="retenue" data-pret={vue.retenue.verdict.ok ? 'oui' : 'non'}>
          <summary style={{ cursor: 'pointer', fontSize: '12.5px' }}><span className={`pill ${vue.retenue.verdict.ok ? 'g' : 'w'}`}>{vue.retenue.verdict.ok ? 'Prête' : 'Bloquée'}</span> Direction créative validée</summary>
          {!vue.retenue.verdict.ok && <p style={{ fontSize: '12.5px', marginTop: 6 }} data-champ="verdict">{vue.retenue.verdict.motif}</p>}
          <DetailsConsigne c={vue.retenue} />
        </details>
      ) : !vue.enAttente && <small className="faint" style={{ fontSize: '11.5px' }} data-consigne="aucune">Aucune consigne retenue pour ce projet.</small>}

      {verdictOk && (
        <div style={{ display: 'grid', gap: 8 }} data-etape="devis">
          <div className="lbl" style={{ margin: 0 }}>Prix de ton image</div>
          <p style={{ fontSize: '12.5px' }} data-prix="annonce">Une image · {libellePrix(vue.prix)} · barème du produit.</p>
          {vue.controleVision?.disponible && (
            <button type="button" className="chip" aria-pressed={controleVision} data-case="controle-vision" onClick={() => setControleVision((c) => !c)}>
              <Ic n={controleVision ? 'check' : 'x'} />{libelleCaseControleVision(vue.controleVision.borneParImageUsdMicros)}
            </button>
          )}
          <div className="kc">
            <button className="btn sm" type="button" data-bouton="devis" disabled={!d.devis.disponible || !!enCours} onClick={() => void agir('devis', () => demanderDevisImage({ projectId, controleVision: !!vue.controleVision?.disponible && controleVision }), 'Devis prêt · relis le prix avant d’approuver.')}>
              {enCours === 'devis' ? 'Devis…' : vue.devis ? 'Actualiser le prix' : 'Voir le prix de la génération'}
            </button>
            <small className="faint" style={{ fontSize: '11.5px' }}>{raisonDevis || `Le devis ne débite rien · il fige le prix pendant ${Math.round(VALIDITE_DEVIS_MS / 60_000)} minutes.`}</small>
          </div>
          {vue.devis && (
            <div className="sugg" data-devis={vue.devis.id}>
              <p style={{ fontSize: '12.5px' }} data-prix="devis">Devis · {libelleCredits(vue.devis.credits)} · {phraseCoutDevis(vue.devis.usdMicros, vue.devis.qualification)} · valable jusqu’à {heure(vue.devis.expiresAt)}.</p>
              {vue.devis.lignes.length > 1 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '11.5px' }} data-lignes="devis">
                  {vue.devis.lignes.map((l, i) => <li key={i} data-ligne-nature={l.natureCout}>{l.libelle} · {libelleUsd(l.usdMicros)} · {l.natureCout === 'borne' ? 'borne' : `estimation (${l.motifEstimation ?? 'non bornée'})`}</li>)}
                </ul>
              )}
              <div className="kc" style={{ marginTop: 8 }}>
                {arme === 'lancer'
                  ? <>
                    <button className="btn sm pri" type="button" data-confirmation="lancer" disabled={!d.lancement.disponible || !!enCours} onClick={lancer}>{enCours === 'lancer' ? 'Lancement…' : `Confirmer · débiter ${libelleCredits(vue.devis.credits)}`}</button>
                    <button className="btn sm" type="button" onClick={() => setArme(null)}>Annuler</button>
                  </>
                  : <button className="btn sm pri" type="button" data-bouton="lancer" disabled={!d.lancement.disponible || !!enCours} onClick={() => setArme('lancer')}><Ic n="spark" />Générer mon visuel · {libelleCredits(vue.devis.credits)}</button>}
                <small className="faint" style={{ fontSize: '11.5px' }}>{d.lancement.disponible ? `Débite ${libelleCredits(vue.devis.credits)} au second clic · rendus si aucune image n’est livrée.` : d.lancement.raison}</small>
              </div>
            </div>
          )}
          {!d.lancement.disponible && !vue.devis && <small className="faint" style={{ fontSize: '11.5px' }} data-indisponible="lancement">Lancement indisponible · {d.lancement.raison}</small>}
        </div>
      )}

      {vue.jobs.length === 0 && <small className="faint" style={{ fontSize: '11.5px' }} data-etat="sans-job">Aucune génération lancée pour ce projet.</small>}
      {vue.jobs.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }} data-etape="generation">
          <div className="lbl" style={{ margin: 0 }}>Tes visuels</div>
          {vue.jobs.map((j) => <CarteJob key={j.id} j={j} vue={vue} enCours={enCours} devisPossible={d.devis.disponible}
            surAnnuler={() => void agir(`annuler:${j.id}`, () => annulerJob({ jobId: j.id }), 'Annulation demandée.')}
            surRelire={(constats) => void agir('relire', () => trancherComposants({ jobId: j.id, constats }), 'Relecture enregistrée.')} />)}
        </div>
      )}
    </section>
  );
}

function DetailsConsigne({ c }: { c: ConsigneVue }) {
  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 6, fontSize: '12.5px' }}>
      <p data-champ="instruction">{c.generationInstruction}</p>
      <small className="faint" style={{ fontSize: '11.5px' }}>Mode · {c.libelleMode} · format {c.format.largeur} × {c.format.hauteur} · compilée le {date(c.compileeLe)}</small>
      {c.protectedComponents.length > 0 && <small className="faint" style={{ fontSize: '11.5px' }} data-champ="proteges">Composants protégés · {c.protectedComponents.join(', ')}.</small>}
      {c.negativeConstraints.length > 0 && <small className="faint" style={{ fontSize: '11.5px' }} data-champ="interdits">À éviter · {c.negativeConstraints.join(' · ')}</small>}
      <small className="faint" style={{ fontSize: '11.5px' }} data-champ="liaisons">
        {c.liaisons.length
          ? `Fichiers transmis au fournisseur · ${c.liaisons.map((l) => `${l.libelle} (rôle ${LIBELLES_ROLE[l.role as RoleReference] ?? l.role}, portée ${LIBELLES_PORTEE[l.scope as PorteeReference] ?? l.scope})`).join(' ; ')}.`
          : 'Aucun fichier transmis au fournisseur · génération à partir du texte seul.'}
      </small>
    </div>
  );
}

function CarteJob({ j, vue, enCours, devisPossible, surAnnuler, surRelire }: {
  j: JobImageVue; vue: VueParcoursImage; enCours: string | null; devisPossible: boolean;
  surAnnuler: () => void; surRelire: (constats: Array<{ composant: string; present: boolean | null }>) => void;
}) {
  const [choix, setChoix] = useState<Record<string, boolean>>({});
  const complet = vue.composantsObligatoires.every((c) => typeof choix[c] === 'boolean');
  return (
    <div className="prow" data-job={j.id} data-etat-job={j.etat} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {j.media && <img src={j.media.url} alt={`Image générée${j.media.largeur && j.media.hauteur ? `, ${j.media.largeur} × ${j.media.hauteur}` : ''}`} loading="lazy" />}
      <div className="t">
        <strong style={{ fontSize: '12.5px' }}><span className={`pill ${CLASSE_ETAT[j.etat] ?? 'c'}`}>{j.libelleEtat}</span> <span data-champ="message">{detailSansEtat(j.libelleEtat, j.message)}</span></strong>
        <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Lancée le {date(j.creeLe)} · {libelleCredits(j.creditsReserves)} réservé{j.creditsReserves > 1 ? 's' : ''}{j.creditsRendus ? ` · ${libelleCredits(j.creditsRendus)} rendu${j.creditsRendus > 1 ? 's' : ''}` : ''}</small>
        {j.raisonEchec && <small style={{ display: 'block', fontSize: '11.5px' }} data-champ="raison">Raison · {j.raisonEchec}</small>}
        {j.media && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Ton image est enregistrée dans le projet.</small>}
        {j.media && <small style={{ display: 'block', fontSize: '11.5px' }}><span className={`pill ${CLASSE_QUALITE[j.qualite] ?? ''}`} data-qualite={j.qualite}>Qualité</span> {j.libelleQualite}</small>}
        {!j.media && j.etat === 'completed' && <small style={{ display: 'block', fontSize: '11.5px' }}>Le fichier n’est pas lisible dans les médias du projet · écris au support avec l’identifiant {j.id}.</small>}
        {j.qualite === 'requires_review' && vue.peutRelire && vue.composantsObligatoires.length > 0 && (
          <div className="sugg" data-relecture={j.id} style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            <span style={{ fontSize: '12.5px' }}>Relis les composants obligatoires · aucun n’est présumé présent.</span>
            {vue.composantsObligatoires.map((c) => (
              <div className="kc" key={c} role="group" aria-label={`Composant ${c}`}>
                <span style={{ fontSize: '12.5px', minWidth: 120 }}>{c}</span>
                {([true, false] as const).map((v) => <button key={String(v)} type="button" className="chip" aria-pressed={choix[c] === v} onClick={() => setChoix((p) => ({ ...p, [c]: v }))}>{v ? 'Présent' : 'Absent'}</button>)}
              </div>
            ))}
            <div className="kc"><button className="btn sm" type="button" data-bouton="relire" disabled={!complet || !!enCours} onClick={() => surRelire(vue.composantsObligatoires.map((c) => ({ composant: c, present: choix[c] ?? null })))}>Enregistrer la relecture</button></div>
          </div>
        )}
      </div>
      <div className="kc">
        {j.media && <a className="btn sm" href={j.media.url} download>Télécharger mon visuel</a>}
        {j.media && <Lien className="btn sm" href={`/studio/projets/${vue.projet.id}/image`}>Modifier dans l’éditeur</Lien>}
        {j.annulable && devisPossible && <button className="btn sm" type="button" data-bouton="annuler" disabled={!!enCours} title="Si l’envoi est déjà parti, le fournisseur peut facturer · le coût réel est réconcilié" onClick={surAnnuler}>{enCours === `annuler:${j.id}` ? 'Annulation…' : 'Annuler'}</button>}
      </div>
    </div>
  );
}
