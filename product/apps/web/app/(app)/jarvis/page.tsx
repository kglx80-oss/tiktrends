import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { refusJarvis } from '../../../lib/jarvis-acces';
import { getActiveBrand } from '../../../lib/brands';
import { JarvisChat } from './JarvisChat';
import { JarvisOnboarding } from './JarvisOnboarding';
import { cadrePage } from '../../../components/ui';
import { RefusJarvis } from './RefusJarvis';
import { projetsPourColonneJarvis } from '../../../lib/studios/jarvis-projets';
import { ficheMarqueLue } from '../../../lib/jarvis-fiche';

export const dynamic = 'force-dynamic';

/**
 * Jarvis · l'espace où l'on parle.
 *
 * ── Ce qui a changé, et pourquoi ─────────────────────────────────────────────
 *
 * La page portait le nom mais restait un TABLEAU DE BORD · huit blocs de mesures
 * empilés sous une conversation reléguée. On l'a d'abord repliée derrière une
 * révélation · ce n'était qu'une transition. La direction validée tranche :
 * Jarvis est d'abord une conversation, et son détail — mémoire, bilan, sources —
 * vit à SA destination, la page `sources`, atteinte à la demande.
 *
 * Cette page ne fait donc plus qu'une chose : accueillir la conversation. Rien
 * n'est perdu · le détail n'a pas disparu, il a déménagé (voir `sources/page`),
 * avec ses gardes d'accès intactes.
 */
export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  // Les droits de la feature `jarvis` (rôle, offre, matrice d'équipe) AVANT
  // toute lecture · la marque active, le fil et les connaissances ne sont lus
  // qu'une fois l'accès établi (voir lib/jarvis-acces).
  const refus = refusJarvis(s);
  if (refus) return <RefusJarvis titre="Jarvis" why={refus} owner={s.role === 'owner'} />;

  const brand = await getActiveBrand(s.workspaceId);

  // SANS marque active (compte neuf, ou aucune marque) · Jarvis NE se mure PAS.
  // Il reste vivant et guide vers la création de la première marque (référence
  // « Flow ») · hero, vraie conversation d'onboarding, amorces, action « Créer ta
  // première marque ». Jamais « Sélectionne une marque active » (cul-de-sac).
  if (!brand) return <JarvisOnboarding />;

  // La fiche marque, lue pour la carte de complétude de la colonne Jarvis · même
  // source que l'aperçu de `/brands/[id]`, en lecture seule. L'encart « Chiffres
  // clés » reste en état VIDE honnête · nous n'agrégeons pas la dépense pub, donc
  // aucune source n'est passée (jamais un chiffre fictif).
  //
  // Les projets Studios de la marque, pour la colonne secondaire · MÊMES gardes
  // que l'écran « Projets » (portée, capacité) · liste vide sans droit ni projet.
  const [fiche, projets] = await Promise.all([
    ficheMarqueLue(brand.id),
    projetsPourColonneJarvis(brand.id),
  ]);

  return (
    // Écran V5 en deux colonnes · la colonne secondaire (marque, conversations,
    // projets, fiche) et, au centre, la conversation. Le cadre s'aligne sur les
    // bords de l'application (maxWidth 1200, gouttières) · la largeur de LECTURE
    // des messages reste bornée À L'INTÉRIEUR (cf. JarvisChat).
    <main style={cadrePage}>
      <JarvisChat fiche={fiche} brandId={brand.id} brandName={brand.name} kpiSource={null} projets={projets} />

      {/* Personnaliser Jarvis · rejoue l'accueil (usage, expérience pub,
          objectif) à la demande · parcours facultatif, jamais déclenché seul. */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <Link href="/onboarding?redo=1" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
          Personnaliser Jarvis · revoir mes réponses d’accueil
        </Link>
      </div>
    </main>
  );
}
