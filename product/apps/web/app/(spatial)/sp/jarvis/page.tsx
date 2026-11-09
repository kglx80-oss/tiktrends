import { redirect } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { annonceConversationJarvis, RELANCE_META, completudeFicheJarvis, encartKpiJarvis, encartKpiJarvisMeta, extraitConversation, iterationsRecentes, lireQuestionJarvis, lireContexteAdresse, REFUS_CONTEXTE_JARVIS, type IterationRecente } from '@tiktrends/core';
import { getSession } from '../../../../lib/auth';
import { refusJarvis, TEXTE_REFUS_JARVIS } from '../../../../lib/jarvis-acces';
import { getActiveBrand } from '../../../../lib/brands';
import { canAccess, FEATURES } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { regimeSession } from '../../../../lib/credits-appels';
import { chatThreadAction, onboardingThreadAction } from '../../../actions/jarvis-chat';
import { projetsPourColonneJarvis } from '../../../../lib/studios/jarvis-projets';
import { ficheMarqueLue } from '../../../../lib/jarvis-fiche';
import { lireChiffresClesMeta } from '../../../../lib/chiffres-cles-meta';
import { resoudreContexteJarvis } from '../../../../lib/jarvis-contexte';
import { gestesPourContexte, lireVariantesEssai } from '../../../../lib/jarvis-gestes';
import { Jarvis, type ContexteJoint, type ConversationArchive } from '../../../../spatial/vues/jarvis/Jarvis';
import { RefusJarvis } from '../../../../spatial/vues/jarvis/RefusJarvis';

export const dynamic = 'force-dynamic';

const RESULTATS = FEATURES.find((f) => f.key === 'adsmap')!;
const ANALYTICS = FEATURES.find((f) => f.key === 'analytics')!;

/**
 * « Jarvis » Spatial · mêmes gardes que `/jarvis` (V5) : session, puis la
 * feature `jarvis` (rôle, offre, matrice d'équipe) AVANT toute lecture. Les
 * conversations viennent de l'action existante (`chatThreadAction`, portée
 * espace + marque + personne) · leur extrait est le dernier message, lu dans la
 * MÊME portée. « Dernières itérations » · les vrais lots de la marque, derrière
 * la feature Résultats (`adsmap`). « Chiffres clés » · LES chiffres clés Meta
 * de la marque (`lireChiffresClesMeta` → `chiffresClesMeta`, la même lecture et
 * la même règle que l'Accueil, Analytics et le Radar · D2), sous le droit
 * Analytics comme sur l'Accueil · sans marque ou sans ce droit, l'encart vide.
 *
 * Vague 3 · la colonne de contexte (projets Studios de la marque, MÊMES gardes
 * que l'écran « Projets » · complétude réelle de la fiche) et, sans marque, le
 * fil d'accueil réel (`onboardingThreadAction`, portée espace + personne).
 *
 * Lot 5 · `?contexte=lot|hypothese|resultats|projet&id=…` · « Demander à Jarvis »
 * depuis un lot, une hypothèse, une page de Résultats ou un projet. L'identifiant
 * est RELU dans la portée (`resoudreContexteJarvis`, marque active et droits) ·
 * refusé, l'écran le dit (`REFUS_CONTEXTE_JARVIS`) et rien n'est joint. Accepté,
 * le contexte s'affiche tel qu'il partira et la question est PRÉPARÉE dans le
 * champ · aucun envoi, aucun appel IA, aucune écriture à l'ouverture. Un projet
 * rouvre son fil lié (plein écran du panneau du projet).
 *
 * Lot 5 bis · un lot ou une hypothèse joints portent, sous la dernière réponse,
 * « Créer l'itération » et « Conclure le lot » (`gestesPourContexte`, relus
 * dans la marque) · chacun OUVRE l'écran existant, pré-rempli à partir de CETTE
 * réponse relue par le serveur · rien n'est créé ni conclu sans le clic là-bas.
 *
 * Lot 5 ter · sous la même réponse, « Autre variable » (la variable SUIVANTE
 * admise, lien vers Itérer `&autre=1`) et « Pourquoi ? » (une question sur la
 * pub de départ, PRÉPARÉE dans le champ) · règle du noyau sur la liste fermée
 * des candidates du plan · aucun envoi, aucune écriture, aucun modèle.
 *
 * Lot 5 quater · « Tester » et « Corriger le texte » sous la même réponse ·
 * la liste fermée des variantes Studio du lot ou de l'hypothèse
 * (`lireVariantesEssai`) · des liens vers la fiche du projet (rattachement, lot
 * d'essai) et son atelier Textes, qui relisent tout · rien n'est appliqué.
 */
export default async function JarvisSpatial({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis raison={TEXTE_REFUS_JARVIS[refus]} plan={refus === 'plan'} proprietaire={s.role === 'owner'} />;

  const params = (await searchParams) ?? {};
  // `?q=` · la question saisie dans la barre Jarvis de l'Accueil · un brouillon, aucun envoi ni appel IA à l'ouverture.
  const question = lireQuestionJarvis(params.q);
  const demande = lireContexteAdresse(params);
  const demandeMalFormee = !demande && (params.contexte !== undefined || params.id !== undefined);
  const maintenant = new Date();
  const kpi = encartKpiJarvis(null);
  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) {
    // Sans marque, Jarvis ne se mure pas · la vraie conversation d'accueil (lecture seule à l'ouverture).
    const a = await onboardingThreadAction();
    const accueil = a.thread ? { tours: a.thread.turns, amorces: a.thread.starters } : undefined;
    return <Jarvis marque={null} conversations={[]} iterations={null} measuredAds={0} kpi={kpi} cout={annonceConversationJarvis(regimeSession(s))} maintenant={maintenant.toISOString()} brouillon={question} accueil={accueil} refusContexte={demande || demandeMalFormee ? REFUS_CONTEXTE_JARVIS : null} />;
  }

  const chiffresOuverts = canAccess(effectiveAccess(s), ANALYTICS);
  const [r, fiche, projets, lus, resolu] = await Promise.all([
    chatThreadAction(null), ficheMarqueLue(brand.id), projetsPourColonneJarvis(brand.id),
    chiffresOuverts ? lireChiffresClesMeta(brand.id, s.workspaceId, maintenant).catch(() => null) : Promise.resolve(null),
    resoudreContexteJarvis(s, brand, demande, maintenant),
  ]);
  let contexte: ContexteJoint | null = null;
  if (resolu) {
    // Un projet rouvre SON fil (la conversation liée, lecture seule) · sans fil lié, le premier envoi le crée.
    const filProjet = resolu.type === 'projet' ? (await chatThreadAction({ projectId: resolu.id })).thread ?? null : null;
    // Lot 5 bis · un lot ou une hypothèse portent les gestes « Créer l'itération » et « Conclure le lot » (relus dans la marque, rien n'est appliqué).
    const lotOuHypothese = resolu.type === 'lot' || resolu.type === 'hypothese';
    const [gestes, essai] = lotOuHypothese
      ? await Promise.all([gestesPourContexte(s, brand.id, { type: resolu.type, id: resolu.id }, maintenant), lireVariantesEssai(s, brand.id, { type: resolu.type, id: resolu.id }, maintenant)])
      : [null, null];
    contexte = {
      type: resolu.type, id: resolu.id, libelle: resolu.libelle, lignes: resolu.lignes, questions: resolu.questions,
      ...(filProjet?.conversationId ? { fil: { conversationId: filProjet.conversationId, tours: filProjet.turns } } : {}),
      // Lot 5 ter · « Autre variable » et « Pourquoi ? » lisent la liste FERMÉE des candidates (plan de la marque) sous chaque réponse.
      ...(gestes ? { gestes: { iterer: gestes.iterer, conclure: gestes.conclure }, suite: { candidats: gestes.candidats, exclus: gestes.exclus } } : {}),
      // Lot 5 quater · « Tester » et « Corriger le texte » lisent la liste FERMÉE des variantes Studio du contexte sous la réponse.
      ...(gestes && essai ? { essai } : {}),
    };
  }
  // La question de l'adresse (`q`) l'emporte · sinon celle que le contexte prépare. Jamais envoyée seule.
  const brouillon = question || resolu?.question || '';
  const kpiMarque = lus ? encartKpiJarvisMeta(lus.chiffres, lus.connexion.action ?? RELANCE_META) : kpi;
  const completude = fiche ? completudeFicheJarvis(fiche, brand.id) : null;
  const t = r.thread ?? null;
  const nommees = t?.conversations ?? [];
  const extraits = new Map<string, string>();
  if (db && nommees.length) {
    const M = schema.jarvisMessages;
    const rows = await db.select({ cid: M.conversationId, content: M.content }).from(M)
      .where(and(eq(M.workspaceId, s.workspaceId), eq(M.brandId, brand.id), eq(M.userId, s.user.id), inArray(M.conversationId, nommees.map((c) => c.id))))
      .orderBy(desc(M.createdAt)).limit(400);
    for (const m of rows) if (m.cid && !extraits.has(m.cid)) extraits.set(m.cid, extraitConversation(m.content));
  }
  const conversations: ConversationArchive[] = nommees.map((c) => ({ id: c.id, titre: c.titre, extrait: extraits.get(c.id) ?? '', majLe: c.majLe }));
  // Le fil principal (messages d'avant les conversations nommées) · listé s'il existe, jamais inventé.
  const dernier = t?.turns[t.turns.length - 1];
  if (dernier) conversations.push({ id: null, titre: 'Fil principal', extrait: extraitConversation(dernier.content), majLe: dernier.at });

  let iterations: IterationRecente[] | null = null;
  if (db && canAccess(effectiveAccess(s), RESULTATS)) {
    const B = schema.batches;
    const lots = await db.select({ id: B.id, number: B.number, goal: B.goal, status: B.status, createdAt: B.createdAt }).from(B)
      .where(and(eq(B.workspaceId, s.workspaceId), eq(B.brandId, brand.id))).orderBy(desc(B.createdAt)).limit(4);
    iterations = iterationsRecentes(lots.map((l) => ({ ...l, createdAt: (l.createdAt as Date).toISOString() })), maintenant);
  }

  return (
    <Jarvis
      marque={{ id: brand.id, nom: brand.name }}
      conversations={conversations}
      iterations={iterations}
      measuredAds={t?.measuredAds ?? 0}
      kpi={kpiMarque}
      cout={annonceConversationJarvis(regimeSession(s))}
      maintenant={maintenant.toISOString()}
      brouillon={brouillon}
      annexes={{ projets, completude: completude && { score: completude.score, faits: completude.faits, total: completude.total, ficheHref: completude.ficheHref } }}
      contexte={contexte}
      refusContexte={(demande && !resolu) || demandeMalFormee ? REFUS_CONTEXTE_JARVIS : null}
    />
  );
}
