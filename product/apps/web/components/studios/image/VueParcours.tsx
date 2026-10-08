'use client';

import { useId, useState } from 'react';
import {
  libellePrix, libelleCredits, LIBELLES_ROLE, LIBELLES_PORTEE, VALIDITE_DEVIS_MS, phraseCoutDevis, libelleCaseControleVision, libelleUsd,
  type ModeImage, type RoleReference, type PorteeReference,
} from '@tiktrends/core';
import type { ConsigneVue, JobImageVue, VueParcoursImage } from '../../../lib/studios/image/parcours';
import { panneau, carte, titre, sousTitre, etiquette, texte, mini, boutonPrimaire, boutonSecondaire, desactive, signal, pastille, rangee, CIBLE } from '../propositions/styles';

/**
 * Parcours image d'un projet, au rendu (lot F-B) · PRÉSENTATION seule : les
 * données viennent du serveur (`lireParcoursImage`), chaque geste remonte au
 * parent. Quatre gestes séparés et explicites · compiler (appel texte payant,
 * coût annoncé), retenir (nouvelle version, gratuit), demander un devis
 * (gratuit, prix figé), approuver et lancer (débit). Un geste indisponible est
 * un bouton inactif ACCOMPAGNÉ de sa raison, jamais une promesse.
 *
 * Statut porté par des mots, cibles de 44 px, focus visible global.
 */

export interface GestesParcours {
  surMode: (m: ModeImage) => void;
  surCompiler: () => void;
  surRetenir: (runId: string) => void;
  /** R3 · `controleVision: false` si la case du contrôle visuel a été décochée. */
  surDevis: (o?: { controleVision: boolean }) => void;
  surLancer: () => void;
  surAnnuler: (jobId: string) => void;
  surRelire: (jobId: string, constats: Array<{ composant: string; present: boolean | null }>) => void;
}

export interface ProprietesVueParcours extends GestesParcours {
  vue: VueParcoursImage;
  mode: ModeImage | '';
  /** Le geste en cours (un seul à la fois) · `null` au repos. */
  enCours: string | null;
  retour: { ok: boolean; texte: string } | null;
  questions: string[];
}

const heure = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const libelleRole = (r: string) => LIBELLES_ROLE[r as RoleReference] ?? r;
const libellePortee = (p: string) => LIBELLES_PORTEE[p as PorteeReference] ?? p;

const COULEUR_ETAT: Record<string, string> = {
  completed: 'var(--ok)', failed: 'var(--err)', cancelled: 'var(--muted)', reconciliation_required: 'var(--warn)', cancel_requested: 'var(--warn)',
};
const COULEUR_QUALITE: Record<string, string> = { passed: 'var(--ok)', rejected: 'var(--err)', requires_review: 'var(--warn)', pending: 'var(--line-2)' };

function Bouton({ actif, enCours, libelle, libelleEnCours, surClic, primaire = true, nom }: { actif: boolean; enCours: boolean; libelle: string; libelleEnCours: string; surClic: () => void; primaire?: boolean; nom: string }) {
  const base = primaire ? boutonPrimaire : boutonSecondaire;
  return (
    <button type="button" data-bouton={nom} disabled={!actif} aria-busy={enCours} onClick={surClic} style={{ ...base, ...(actif ? {} : desactive) }}>
      {enCours ? libelleEnCours : libelle}
    </button>
  );
}

function DetailsConsigne({ c }: { c: ConsigneVue }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <p style={{ ...texte, color: 'var(--ink)' }} data-champ="instruction">{c.generationInstruction}</p>
      <p style={mini}>Mode : {c.libelleMode} · format {c.format.largeur} × {c.format.hauteur} · compilée le {date(c.compileeLe)}</p>
      {c.protectedComponents.length > 0 && <p style={mini} data-champ="proteges">Composants protégés : {c.protectedComponents.join(', ')}.</p>}
      {c.negativeConstraints.length > 0 && (
        <div>
          <p style={{ ...mini, color: 'var(--ink-2)' }}>À éviter :</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }} data-champ="interdits">
            {c.negativeConstraints.map((n) => <li key={n} style={mini}>{n}</li>)}
          </ul>
        </div>
      )}
      <p style={mini} data-champ="liaisons">
        {c.liaisons.length
          ? `Fichiers transmis au fournisseur : ${c.liaisons.map((l) => `${l.libelle} (rôle ${libelleRole(l.role)}, portée ${libellePortee(l.scope)})`).join(' ; ')}.`
          : 'Aucun fichier transmis au fournisseur · génération à partir du texte seul.'}
      </p>
    </div>
  );
}

function Relecture({ job, composants, surRelire, occupe }: { job: JobImageVue; composants: string[]; surRelire: GestesParcours['surRelire']; occupe: boolean }) {
  const id = useId();
  const [choix, setChoix] = useState<Record<string, boolean | null>>({});
  const complet = composants.every((c) => typeof choix[c] === 'boolean');
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 8 }} data-relecture={job.id}>
      <legend style={etiquette}>Relire les composants obligatoires</legend>
      {composants.map((c) => (
        <div key={c} role="radiogroup" aria-label={`Composant ${c}`} style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, alignItems: 'center' }}>
          <span style={{ ...texte, color: 'var(--ink)', flex: '1 0 100%' }}>{c}</span>
          {([true, false] as const).map((v) => (
            <label key={String(v)} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', minHeight: CIBLE, fontSize: 14, color: 'var(--ink-2)' }}>
              <input type="radio" name={`${id}-${c}`} checked={choix[c] === v} onChange={() => setChoix((p) => ({ ...p, [c]: v }))} style={{ width: 20, height: 20 }} />
              {v ? 'Présent' : 'Absent'}
            </label>
          ))}
        </div>
      ))}
      <div style={rangee}>
        <Bouton nom="relire" primaire={false} actif={complet && !occupe} enCours={false} libelle="Enregistrer la relecture" libelleEnCours="" surClic={() => surRelire(job.id, composants.map((c) => ({ composant: c, present: choix[c] ?? null })))} />
        {!complet && <span style={mini}>Coche chaque composant · aucun n’est présumé présent.</span>}
      </div>
    </fieldset>
  );
}

function CarteJob({ j, p }: { j: JobImageVue; p: ProprietesVueParcours }) {
  const v = p.vue;
  return (
    <article style={carte} data-job={j.id} data-etat-job={j.etat}>
      <div style={rangee}>
        <span style={pastille(COULEUR_ETAT[j.etat] ?? 'var(--accent-strong)')}>{j.libelleEtat}</span>
        <span style={mini}>Lancée le {date(j.creeLe)} · {libelleCredits(j.creditsReserves)} réservé{j.creditsReserves > 1 ? 's' : ''}{j.creditsRendus ? ` · ${libelleCredits(j.creditsRendus)} rendu${j.creditsRendus > 1 ? 's' : ''}` : ''}</span>
      </div>
      <p style={texte} data-champ="message">{j.message}</p>
      {j.raisonEchec && <p style={signal('err')} data-champ="raison">Raison : {j.raisonEchec}</p>}
      {j.annulable && v.disponibilite.devis.disponible && (
        <div style={rangee}>
          <Bouton nom="annuler" primaire={false} actif={!p.enCours} enCours={p.enCours === `annuler:${j.id}`} libelle="Annuler" libelleEnCours="Annulation…" surClic={() => p.surAnnuler(j.id)} />
          <span style={mini}>Si l’envoi est déjà parti, le fournisseur peut facturer · le coût réel est réconcilié.</span>
        </div>
      )}
      {j.media ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }} data-media={j.media.assetId}>
          <img src={j.media.url} alt={`Image générée${j.media.largeur && j.media.hauteur ? `, ${j.media.largeur} × ${j.media.hauteur}` : ''}`} loading="lazy"
            style={{ width: 'min(100%, 280px)', height: 'auto', aspectRatio: j.media.largeur && j.media.hauteur ? `${j.media.largeur} / ${j.media.hauteur}` : '4 / 5', objectFit: 'contain', borderRadius: 12, background: 'var(--rail)' }} />
          <div style={{ display: 'grid', gap: 8, flex: '1 1 220px', minWidth: 0 }}>
            <div style={rangee}>
              <span style={pastille(COULEUR_QUALITE[j.qualite] ?? 'var(--line-2)')} data-qualite={j.qualite}>Qualité</span>
              <span style={{ ...texte, color: 'var(--ink)' }}>{j.libelleQualite}</span>
            </div>
            <p style={mini}>Le média est rangé dans les médias du projet · pose-le comme calque dans l’éditeur.</p>
            <a href={`/studio/projets/${v.projet.id}/image`} style={{ ...boutonSecondaire, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', width: 'fit-content' }}>Ouvrir l’éditeur d’image</a>
            {j.qualite === 'requires_review' && v.peutRelire && v.composantsObligatoires.length > 0 && (
              <Relecture job={j} composants={v.composantsObligatoires} surRelire={p.surRelire} occupe={!!p.enCours} />
            )}
          </div>
        </div>
      ) : j.etat === 'completed' ? <p style={signal('warn')}>Le fichier n’est pas lisible dans les médias du projet · contacte le support avec l’identifiant {j.id}.</p> : null}
    </article>
  );
}

export function VueParcours(p: ProprietesVueParcours) {
  const id = useId();
  const v = p.vue;
  const d = v.disponibilite;
  // R3 · contrôle visuel coché par défaut (décision du propriétaire), décochable avant le devis.
  const [controleVision, setControleVision] = useState(true);
  const modeChoisi = v.modes.find((m) => m.mode === p.mode);
  const compilable = d.compilation.disponible && !!modeChoisi?.pret && !p.enCours;
  const verdictOk = !!v.retenue && v.retenue.verdict.ok;
  const raisonDevis = !v.retenue ? 'Retiens d’abord une consigne compilée.'
    : !v.retenue.verdict.ok ? v.retenue.verdict.motif
    : !d.devis.disponible ? d.devis.raison : '';
  const minutes = Math.round(VALIDITE_DEVIS_MS / 60_000);

  return (
    <section aria-labelledby={`${id}-titre`} style={panneau} data-zone="parcours-image">
      <div style={{ display: 'grid', gap: 6 }}>
        <h2 id={`${id}-titre`} style={titre}>Image générée</h2>
        <p style={sousTitre}>Quatre gestes séparés : compiler la consigne, la retenir, demander un devis, approuver et lancer. Rien ne part sans ton clic.</p>
      </div>

      {p.retour && (
        <div role={p.retour.ok ? 'status' : 'alert'} style={signal(p.retour.ok ? 'ok' : 'err')} data-retour={p.retour.ok ? 'ok' : 'refus'}>
          <span style={{ fontWeight: 600 }}>{p.retour.ok ? 'Fait · ' : 'Refusé · '}</span>{p.retour.texte}
        </div>
      )}

      <div style={carte} data-etape="consigne">
        <h3 style={{ ...titre, fontSize: 16 }}>1 · Consigne image</h3>
        <p style={mini}>Format {v.format.largeur} × {v.format.hauteur} · {v.format.libelle}{v.format.depuisBrief ? ' · lu dans le brief' : ' · défaut, le brief ne précise pas de format'}.</p>
        <div role="radiogroup" aria-label="Mode de la consigne" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          {v.modes.map((m) => {
            const choisi = m.mode === p.mode;
            return (
              <button key={m.mode} type="button" role="radio" aria-checked={choisi} disabled={!m.pret || !!p.enCours} onClick={() => p.surMode(m.mode)} data-mode={m.mode}
                style={{ ...boutonSecondaire, justifyContent: 'flex-start', textAlign: 'left', border: choisi ? '2px solid var(--accent-strong)' : boutonSecondaire.border, ...(m.pret ? {} : desactive) }}>
                {m.libelle}{choisi ? ' · choisi' : ''}{m.pret ? '' : ' · bloqué par le contrôle'}
              </button>
            );
          })}
        </div>
        <div style={rangee}>
          <Bouton nom="compiler" actif={compilable} enCours={p.enCours === 'compiler'} libelle="Compiler la consigne" libelleEnCours="Compilation…" surClic={p.surCompiler} />
          <span style={mini} data-cout="compilation">Appel texte payant · {v.coutCompilationUsd.toFixed(2).replace('.', ',')} $ au plus · aucun crédit débité, aucun média produit.</span>
        </div>
        {!d.compilation.disponible && <p style={signal('warn')} data-indisponible="compilation">Indisponible · {d.compilation.raison}</p>}
        {p.questions.length > 0 && (
          <div style={signal('info')} data-champ="questions">
            <p style={{ ...texte, color: 'var(--ink)' }}>La consigne n’est pas compilée : il manque des informations.</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{p.questions.map((q) => <li key={q} style={texte}>{q}</li>)}</ul>
          </div>
        )}

        {v.enAttente && (
          <div style={{ ...carte, background: 'var(--surface)' }} data-consigne="en-attente">
            <div style={rangee}>
              <span style={pastille('var(--accent-strong)')}>Compilée</span>
              <span style={{ ...texte, color: 'var(--ink)' }}>Consigne validée par le serveur · pas encore retenue</span>
            </div>
            <DetailsConsigne c={v.enAttente} />
            <div style={rangee}>
              <Bouton nom="retenir" actif={d.retenir.disponible && !p.enCours} enCours={p.enCours === 'retenir'} libelle="Retenir cette consigne" libelleEnCours="Enregistrement…" surClic={() => p.surRetenir(v.enAttente!.runId)} />
              <span style={mini}>{d.retenir.disponible ? 'Crée une nouvelle version du projet · aucun appel, aucun coût.' : d.retenir.raison}</span>
            </div>
          </div>
        )}

        {v.retenue ? (
          <div style={{ ...carte, background: 'var(--surface)' }} data-consigne="retenue" data-pret={v.retenue.verdict.ok ? 'oui' : 'non'}>
            <div style={rangee}>
              <span style={pastille(v.retenue.verdict.ok ? 'var(--ok)' : 'var(--warn)')}>{v.retenue.verdict.ok ? 'Prête' : 'Bloquée'}</span>
              <span style={{ ...texte, color: 'var(--ink)' }}>Consigne retenue dans la version {v.version.n}</span>
            </div>
            {!v.retenue.verdict.ok && <p style={signal('warn')} data-champ="verdict">{v.retenue.verdict.motif}</p>}
            <DetailsConsigne c={v.retenue} />
          </div>
        ) : !v.enAttente && <p style={texte} data-consigne="aucune">Aucune consigne retenue pour ce projet.</p>}
      </div>

      <div style={carte} data-etape="devis">
        <h3 style={{ ...titre, fontSize: 16 }}>2 · Devis</h3>
        <p style={texte} data-prix="annonce">Une image · {libellePrix(v.prix)} · barème du produit.</p>
        {v.controleVision?.disponible && (
          <label style={{ ...texte, display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }} data-case="controle-vision">
            <input type="checkbox" checked={controleVision} onChange={(e) => setControleVision(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>{libelleCaseControleVision(v.controleVision.borneParImageUsdMicros)}</span>
          </label>
        )}
        <div style={rangee}>
          <Bouton nom="devis" primaire={false} actif={verdictOk && d.devis.disponible && !p.enCours} enCours={p.enCours === 'devis'} libelle="Demander un devis" libelleEnCours="Devis…" surClic={() => p.surDevis({ controleVision: !!v.controleVision?.disponible && controleVision })} />
          <span style={mini}>{raisonDevis || `Le devis ne débite rien · il fige le prix pendant ${minutes} minutes.`}</span>
        </div>
        {v.devis && (
          <div style={{ ...carte, background: 'var(--surface)' }} data-devis={v.devis.id}>
            <p style={{ ...texte, color: 'var(--ink)' }} data-prix="devis">Devis · {libelleCredits(v.devis.credits)} · {phraseCoutDevis(v.devis.usdMicros, v.devis.qualification)} · valable jusqu’à {heure(v.devis.expiresAt)}.</p>
            {v.devis.lignes.length > 1 && (
              <ul style={{ ...mini, margin: 0, paddingLeft: 18 }} data-lignes="devis">
                {v.devis.lignes.map((l, i) => (
                  <li key={i} data-ligne-nature={l.natureCout}>{l.libelle} · {libelleUsd(l.usdMicros)} · {l.natureCout === 'borne' ? 'borne' : `estimation (${l.motifEstimation ?? 'non bornée'})`}</li>
                ))}
              </ul>
            )}
            <div style={rangee}>
              <Bouton nom="lancer" actif={d.lancement.disponible && !p.enCours} enCours={p.enCours === 'lancer'} libelle={`Approuver et lancer · ${libelleCredits(v.devis.credits)}`} libelleEnCours="Lancement…" surClic={p.surLancer} />
              <span style={mini}>{d.lancement.disponible ? `Débite ${libelleCredits(v.devis.credits)} maintenant · rendus si aucune image n’est livrée.` : d.lancement.raison}</span>
            </div>
          </div>
        )}
        {!d.lancement.disponible && !v.devis && <p style={signal('warn')} data-indisponible="lancement">Lancement indisponible · {d.lancement.raison}</p>}
      </div>

      <div style={carte} data-etape="generation">
        <h3 style={{ ...titre, fontSize: 16 }}>3 · Génération et média</h3>
        {v.jobs.length === 0
          ? <p style={texte} data-etat="sans-job">Aucune génération lancée pour ce projet.</p>
          : v.jobs.map((j) => <CarteJob key={j.id} j={j} p={p} />)}
      </div>
    </section>
  );
}
