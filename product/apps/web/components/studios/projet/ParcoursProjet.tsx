import Link from 'next/link';
import type { DetailProjet } from '../../../lib/studios/sources/projet';
import type { LienAtelier } from '../../../lib/navigation';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { h1 } from '../../ui';
import { PastilleEtape } from './CarteProjet';

/** Orientation avant la conversation ; les droits et devis restent dans les ateliers. */
export function ParcoursProjet({ detail, atelier, exportAutorise, generationActive }: { detail: DetailProjet; atelier: LienAtelier[]; exportAutorise: boolean; generationActive: boolean }) {
  const { projet, brief, produit, version } = detail;
  const ancienne = !detail.versions.some(v => v.id === version.id && v.courante);
  const cible = projet.kind === 'video' ? 'video' : projet.kind === 'text' ? 'textes' : 'image';
  const production = atelier.find(a => a.segment === cible);
  const exportLien = exportAutorise ? atelier.find(a => a.segment === 'export')?.href : null;
  const produitLien = atelier.find(a => a.segment === 'produit')?.href;
  const cadre = !!brief && !!(brief.composition.trim() || brief.objective.trim());
  const prochaine = ancienne
    ? { href: `/studio/projets/${projet.id}`, label: 'Reprendre la version courante', aide: 'Tu consultes une version antérieure en lecture seule.' }
    : cadre && production?.href && (generationActive || cible === 'textes')
      ? { href: production.href, label: cible === 'image' ? 'Préparer mon image' : cible === 'video' ? 'Préparer ma vidéo' : 'Préparer mes textes', aide: 'Retrouve tes choix dans l’atelier, puis vérifie le devis avant de lancer.' }
      : { href: '#conversation-projet', label: 'Préparer avec Jarvis', aide: cadre ? 'Précise tes choix avec Jarvis avant de poursuivre dans l’atelier.' : 'Décris ta création à Jarvis, puis choisis la proposition à appliquer.' };
  return <header data-parcours="projet" style={{ display: 'grid', gap: 14, marginBottom: 22, minWidth: 0 }}>
    <Link href="/studio/projets" style={{ color: 'var(--ink-2)', width: 'fit-content', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', fontSize: 13 }}>Retour aux projets</Link>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ display: 'grid', gap: 8, flex: '1 1 260px', minWidth: 0 }}>
        <h1 style={{ ...h1, overflowWrap: 'anywhere' }}>{projet.title}</h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', color: 'var(--ink-2)', fontSize: 13 }}>
          <span>{projet.marque}</span><span>Version {version.n}</span><PastilleEtape etape={detail.completude.etape} libelle={detail.completude.libelleEtape} />
        </div>
      </div>
      <Link data-action-principale href={prochaine.href} style={{ minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', padding: '10px 20px', boxSizing: 'border-box', borderRadius: 12, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, textDecoration: 'none', maxWidth: '100%', overflowWrap: 'anywhere' }}>{prochaine.label}</Link>
    </div>
    <p role={ancienne ? 'status' : undefined} style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.5, maxWidth: '70ch' }}>{prochaine.aide}</p>
    {!generationActive && cible !== 'textes' && <p role="status" style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13 }}>La génération n’est pas activée pour cet espace. La préparation reste accessible.</p>}
    <nav aria-label="Parcours de création" style={{ display: 'flex', gap: '6px 24px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line-2)', borderBottom: '1px solid var(--line-2)', padding: '4px 0', fontSize: 13 }}>
      <Link href="#conversation-projet" style={lien}>Préparer la création</Link>
      {production?.href ? <Link href={production.href} style={lien}>{cible === 'textes' ? 'Écrire les textes' : generationActive ? `Générer ${cible === 'video' ? 'la vidéo' : 'l’image'}` : 'Ouvrir l’atelier'}</Link> : <span aria-disabled="true" style={{ ...lien, color: 'var(--muted)' }}>Génération non activée</span>}
      {exportLien ? <Link href={exportLien} style={lien}>Exporter</Link> : <span aria-disabled="true" style={{ ...lien, color: 'var(--muted)' }}>Export indisponible</span>}
    </nav>
    <div style={{ display: 'flex', gap: '8px 24px', flexWrap: 'wrap', color: 'var(--ink-2)', fontSize: 13, minWidth: 0 }}>
      <span style={{ overflowWrap: 'anywhere' }}>Produit : {produit?.nom || 'à préciser si nécessaire'}{produitLien && <> · <Link href={produitLien} style={{ color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN }}>Choisir les photos</Link></>}</span>
      <span style={{ overflowWrap: 'anywhere', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN }}>Format : {brief?.formats?.join(', ') || 'à choisir dans l’atelier'}</span>
    </div>
    {detail.briefIllisible && <p role="alert" style={{ margin: 0, color: 'var(--err-text)', fontSize: 14 }}>Le brief de cette version est illisible. Ouvre les détails du projet pour le vérifier.</p>}
  </header>;
}
const lien = { minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', color: 'var(--ink)', textDecoration: 'none' } as const;
