import Link from 'next/link';
import { redirect } from 'next/navigation';
import { aPermissionPlateforme } from '@tiktrends/core';
import { gardePlateforme } from '../../../../lib/studios/prompts/garde-prompts';
import { environnementPrompts } from '../../../../lib/studios/prompts/environnement';
import { cadrePage, h1 } from '../../../../components/ui';
import { EcranVersions, EcranReleases, EcranEvaluations, EcranRoutage, EcranExecutions, EcranConnaissances, Erreur, surfaceBloc } from './Ecrans';
import { vueVersions, vueReleases, vueEvaluations, vueRoutage, vueExecutions, vueConnaissances } from './donnees';

export const dynamic = 'force-dynamic';

/**
 * ADMIN · « IA et Studios » (cahier §8.1) · le registre de prompts.
 *
 * Réservé à l'accès total plateforme (permission `prompt.read`, calculée par la
 * garde L1 depuis les droits existants). Un owner ou un admin d'ESPACE, un
 * membre, un lecteur voient l'écran de refus, sans aucune donnée du registre
 * (SEC-09) · la même garde est reposée dans chaque commande serveur.
 *
 * Sept onglets : Prompts, Releases, Recettes de style, Connaissances (lien vers
 * l'espace existant, pas de copie), Évaluations, Routage (lecture seule),
 * Exécutions (traces expurgées, `run.inspect_redacted`).
 */

const ONGLETS = [
  { id: 'prompts', libelle: 'Prompts' },
  { id: 'releases', libelle: 'Releases' },
  { id: 'recettes', libelle: 'Recettes de style' },
  { id: 'connaissances', libelle: 'Connaissances' },
  { id: 'evaluations', libelle: 'Évaluations' },
  { id: 'routage', libelle: 'Routage' },
  { id: 'executions', libelle: 'Exécutions' },
] as const;
type Onglet = (typeof ONGLETS)[number]['id'];

type SP = { onglet?: string; cle?: string; v?: string; comparer?: string; run?: string };

function Entete() {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={h1}>IA et Studios</h1>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, color: 'var(--on-accent)', background: 'var(--grad-accent)' }}>ADMIN+</span>
        <Link href="/admin" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 16px', borderRadius: 999, border: '1px solid var(--line-2)', color: 'var(--ink)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>← Tableau de bord</Link>
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 720 }}>
        Le registre des prompts que Jarvis et les studios résolvent · versions, releases, évaluations et traces. Rien n’est actif tant qu’une release n’est pas publiée.
      </p>
    </div>
  );
}

export default async function IaStudiosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const g = await gardePlateforme('prompt.read');
  if (!g.ok && g.code === 'AUTH_REQUIRED') redirect('/login');
  if (!g.ok) {
    return (
      <main style={cadrePage}>
        <Entete />
        <div role="alert" style={{ ...surfaceBloc, borderColor: 'var(--line-2)' }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Accès réservé à l’équipe de la plateforme.</p>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.55 }}>Les prompts globaux, leurs releases et leurs traces se gèrent avec un accès total d’équipe. Un administrateur d’espace ne les modifie pas.</p>
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const onglet: Onglet = (ONGLETS.find((o) => o.id === sp.onglet)?.id ?? 'prompts');
  const peut = (p: Parameters<typeof aPermissionPlateforme>[1]) => aPermissionPlateforme(g.ctx.permissions, p);
  const environnement = environnementPrompts(process.env);

  let contenu: React.ReactNode;
  try {
    if (onglet === 'prompts' || onglet === 'recettes') {
      const types = onglet === 'recettes' ? (['recette'] as const) : (['template', 'conversation', 'socle', 'rendu'] as const);
      const v = await vueVersions(types, sp.cle ?? null, sp.v ?? null, sp.comparer ?? null);
      contenu = <EcranVersions onglet={onglet} cles={v.cles} detail={v.detail} peutEditer={peut('prompt.draft')} plan={v.plan} />;
    } else if (onglet === 'releases') {
      const r = await vueReleases();
      contenu = <EcranReleases releases={r.releases} pointee={r.pointee} environnement={environnement} selection={r.selection}
        peutPublier={peut('prompt.publish')} peutRevenir={peut('prompt.rollback')} peutEvaluer={peut('prompt.evaluate')} peutCreer={peut('prompt.draft')} />;
    } else if (onglet === 'evaluations') {
      contenu = <EcranEvaluations evaluations={await vueEvaluations()} />;
    } else if (onglet === 'routage') {
      contenu = <EcranRoutage lignes={vueRoutage()} />;
    } else if (onglet === 'executions') {
      if (!peut('run.inspect_redacted')) contenu = <div role="alert" style={surfaceBloc}>Les traces d’exécution demandent la permission run.inspect_redacted.</div>;
      else { const e = await vueExecutions(sp.run ?? null); contenu = <EcranExecutions runs={e.runs} detail={e.detail} />; }
    } else {
      contenu = <EcranConnaissances {...await vueConnaissances()} />;
    }
  } catch (e) {
    console.error(`[ia-studios] ${g.ctx.traceId}`, (e as Error).message);
    contenu = <Erreur message="Lecture du registre impossible pour le moment." traceId={g.ctx.traceId} />;
  }

  return (
    <main style={cadrePage}>
      <Entete />
      <nav aria-label="Onglets IA et Studios" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {ONGLETS.map((o) => (
          <Link key={o.id} href={`?onglet=${o.id}`} aria-current={o.id === onglet ? 'page' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 999, fontSize: 14, fontWeight: o.id === onglet ? 700 : 500, textDecoration: 'none', color: o.id === onglet ? 'var(--on-accent)' : 'var(--ink)', background: o.id === onglet ? 'var(--grad-accent)' : 'transparent', border: o.id === onglet ? '1px solid transparent' : '1px solid var(--line-2)' }}>
            {o.libelle}
          </Link>
        ))}
      </nav>
      {contenu}
    </main>
  );
}
