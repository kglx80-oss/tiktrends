import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  dateCourteUtc, LIBELLES_MODALITE, LIBELLES_ELEMENT, LIBELLES_STATUT_SOURCE, LIBELLES_TYPE_SOURCE, LIBELLES_NATURE_FAIT, CIBLE_TACTILE_MIN,
  type FaitBrief, type NatureFait,
} from '@tiktrends/core';
import type { DetailProjet } from '../../../lib/studios/sources/projet';
import { surface, tuile, h1 } from '../../ui';
import { RetourVeille } from '../../RetourVeille';
import { PastilleEtape } from './CarteProjet';
import { ExporterBrief } from './ExporterBrief';
import { PropositionsProjet } from './PropositionsProjet';

/**
 * La page projet (cahier 01 §4.1, §4.2 point 7, §5) · marque et version
 * visibles, brief complet, sources avec lien retour vers la Veille,
 * hypothèse, variable, produit, complétude, historique des versions, export.
 *
 * Trois zones : en-tête (projet, marque, version, étape), colonne principale
 * (brief), colonne contextuelle (ce qui manque, sources, versions, export).
 * À 390 px les deux colonnes s'empilent (flex-wrap, aucune requête média :
 * styles en ligne). Rien n'est écrit à la visite.
 */

const section: CSSProperties = { ...surface, background: 'var(--surface)', padding: 18, display: 'grid', gap: 10, minWidth: 0 };
const titre: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 500, color: 'var(--ink)' };
const texte: CSSProperties = { margin: 0, fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, overflowWrap: 'anywhere' };
const discret: CSSProperties = { margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, overflowWrap: 'anywhere' };
const etiquette: CSSProperties = { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' };

function Champ({ nom, children, vide = 'Non renseigné' }: { nom: string; children: ReactNode; vide?: string }) {
  const rien = children === null || children === undefined || children === '' || (Array.isArray(children) && children.length === 0);
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      <span style={etiquette}>{nom}</span>
      {rien ? <p style={{ ...discret, color: 'var(--muted)' }}>{vide}</p> : typeof children === 'string' ? <p style={texte}>{children}</p> : children}
    </div>
  );
}

const Liste = ({ items }: { items: string[] }) => (
  <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'grid', gap: 3 }}>{items.map((t, i) => <li key={`${i}-${t}`} style={texte}>{t}</li>)}</ul>
);

export function VueProjet({ detail, exportAutorise, variantes = null }: { detail: DetailProjet; exportAutorise: boolean; variantes?: ReactNode }) {
  const { projet, version, brief, hypothese, produit, sources, completude, versions } = detail;
  const retour = sources.find((s) => s.statut === 'active' && s.retourVeille)?.retourVeille ?? null;
  const ancienne = !versions.find((v) => v.id === version.id)?.courante;
  const courante = versions.find((v) => v.courante) ?? null;
  const faitsSansHypothese = (k: NatureFait): FaitBrief[] => (brief?.facts ?? []).filter((f) => f.kind === k && !(hypothese && (f.id === hypothese.id || f.id.startsWith(`${hypothese.id}.`))));

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/studio/projets" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>‹ Projets</Link>
          {retour && <RetourVeille rv={retour} libelle="Revenir à la recherche de Veille" />}
        </div>
        <h1 style={{ ...h1, overflowWrap: 'anywhere' }}>{projet.title}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
          <span data-marque={projet.brandId}>Marque <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{projet.marque}</b></span>
          <span aria-hidden>·</span><span>{projet.libelleType}</span>
          <span aria-hidden>·</span><span data-version={version.id}>Version {version.n} du {dateCourteUtc(version.createdAt)}</span>
          <PastilleEtape etape={completude.etape} libelle={completude.libelleEtape} />
        </div>
        <nav aria-label="Atelier du projet" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { href: `/studio/projets/${projet.id}/image`, libelle: 'Éditer l’image' },
            { href: `/studio/projets/${projet.id}/produit`, libelle: 'Produit et références' },
            { href: `/studio/projets/${projet.id}/textes`, libelle: 'Textes liés au brief' },
            { href: `/studio/projets/${projet.id}/video`, libelle: 'Vidéo · storyboard et montage' },
          ].map((l) => (
            <Link key={l.href} href={l.href} data-atelier={l.href.split('/').pop()} style={{ ...tuile, padding: '0 14px', fontSize: 13, fontWeight: 650, color: 'var(--ink)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>
              {l.libelle}
            </Link>
          ))}
        </nav>
        {ancienne && (
          <p role="status" style={{ ...discret, ...tuile, padding: '8px 12px', background: 'rgba(59,130,246,.10)' }}>
            Tu consultes une version antérieure · lecture seule. <Link href={`/studio/projets/${projet.id}`} style={{ color: 'var(--accent-strong)' }}>Revenir à la version courante</Link>
          </p>
        )}
      </header>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gap: 18 }}>
          <section aria-labelledby="pj-brief" style={section}>
            <h2 id="pj-brief" style={titre}>Brief</h2>
            {detail.briefIllisible && <p role="alert" style={{ ...discret, color: '#ff9db0' }}>Le brief de cette version n’a pas la forme attendue · il n’est pas affiché.</p>}
            {!brief && !detail.briefIllisible && <p style={discret}>Pas encore de brief pour cette version.</p>}
            {brief && (
              <>
                <Champ nom="Objectif">{brief.objective}</Champ>
                <Champ nom="Audience">{brief.audience}</Champ>
                <div style={{ ...tuile, padding: 14, background: 'var(--bg)', display: 'grid', gap: 8 }} data-hypothese={hypothese?.id ?? ''}>
                  <span style={etiquette}>Hypothèse</span>
                  {hypothese ? (
                    <>
                      <p style={{ ...texte, fontWeight: 600 }}>{hypothese.statement}</p>
                      <p style={discret}><b style={{ color: 'var(--ink)' }}>Variable testée</b> · {brief.testedVariable || 'à préciser'}</p>
                      {hypothese.control && <p style={discret}><b style={{ color: 'var(--ink)' }}>Témoin</b> · {hypothese.control}</p>}
                      {hypothese.treatment && <p style={discret}><b style={{ color: 'var(--ink)' }}>Traitement</b> · {hypothese.treatment}</p>}
                      {hypothese.metric && <p style={discret}><b style={{ color: 'var(--ink)' }}>Mesure</b> · {hypothese.metric}</p>}
                      {hypothese.decisionRule && <p style={discret}><b style={{ color: 'var(--ink)' }}>Règle de décision</b> · {hypothese.decisionRule}</p>}
                      {hypothese.limitations.map((l) => <p key={l} style={discret}><b style={{ color: 'var(--ink)' }}>Limite</b> · {l}</p>)}
                    </>
                  ) : <p style={{ ...discret, color: '#ffcf8f' }}>Aucune hypothèse · à choisir ou rédiger.</p>}
                </div>
                <Champ nom="Invariants">{brief.invariants.length ? <Liste items={brief.invariants} /> : null}</Champ>
                <Champ nom="Composition (structure importée)">{brief.composition}</Champ>
                <Champ nom="Formats">{brief.formats.length ? <Liste items={brief.formats} /> : null}</Champ>
                <Champ nom="Textes" vide="Aucun texte imposé">{brief.texts.length ? <Liste items={brief.texts} /> : null}</Champ>
                <Champ nom="Intention de style">{brief.styleIntent}</Champ>
                <Champ nom="Exclusions">{brief.exclusions.length ? <Liste items={brief.exclusions} /> : null}</Champ>
                {(['observed', 'measured', 'declared'] as const).map((k) => {
                  const f = faitsSansHypothese(k);
                  return f.length ? (
                    <Champ key={k} nom={`Faits · ${LIBELLES_NATURE_FAIT[k].toLowerCase()}s`}>
                      <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'grid', gap: 3 }}>{f.map((x) => <li key={x.id} style={discret}>{x.claim}</li>)}</ul>
                    </Champ>
                  ) : null;
                })}
              </>
            )}
          </section>

          <section aria-labelledby="pj-produit" style={section}>
            <h2 id="pj-produit" style={titre}>Produit</h2>
            {produit ? (
              <>
                <p style={{ ...texte, fontWeight: 600 }}>{produit.nom}</p>
                <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'grid', gap: 3 }}>
                  {produit.faits.filter((f) => f.cle !== 'nom').map((f) => <li key={f.cle} style={discret}>{f.libelle} · {f.valeur}</li>)}
                  {produit.manques.map((m) => <li key={m.cle} style={{ ...discret, color: '#ffcf8f' }}>{m.libelle} · manquant</li>)}
                </ul>
                <p style={{ ...discret, color: 'var(--muted)' }}>Instantané du {dateCourteUtc(produit.instantaneLe)} · les faits ne bougent pas si la fiche produit change.</p>
              </>
            ) : <p style={{ ...discret, color: '#ffcf8f' }}>Aucun produit choisi · le scénario attendra un produit de la marque.</p>}
          </section>

          {/* Propositions (L4-A) · ciblent la version COURANTE, pas celle affichée. */}
          {courante && (
            <div data-emplacement="propositions">
              <PropositionsProjet projectId={projet.id} versionCourante={{ id: courante.id, n: courante.n }} />
            </div>
          )}

          {/* Variantes, tests et apprentissage (L4-C) · rendu serveur par la page. */}
          {variantes && <div data-emplacement="variantes-tests">{variantes}</div>}
        </div>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gap: 18 }}>
          <section aria-labelledby="pj-manques" style={section}>
            <h2 id="pj-manques" style={titre}>Ce qui manque</h2>
            {completude.manques.length === 0 ? <p style={discret}>Rien · le brief est complet.</p> : (
              <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', display: 'grid', gap: 4 }}>
                {completude.manques.map((m) => (
                  <li key={m.cle} data-manque={m.cle} style={discret}>{m.libelle}{m.bloquant ? <b style={{ color: '#ffcf8f' }}> · à faire</b> : <span style={{ color: 'var(--muted)' }}> · conseillé</span>}</li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="pj-sources" style={section}>
            <h2 id="pj-sources" style={titre}>Sources</h2>
            {sources.length === 0 && <p style={discret}>Aucune source liée.</p>}
            {detail.sourcesIllisibles > 0 && <p style={{ ...discret, color: '#ffcf8f' }}>{detail.sourcesIllisibles} référence(s) de source illisible(s) · ignorée(s).</p>}
            {sources.map((s) => (
              <div key={s.sourceId} data-source={s.sourceId} data-statut={s.statut} style={{ ...tuile, padding: 12, background: 'var(--bg)', display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {s.apercu && <img src={s.apercu} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                  <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{s.annonceur || 'Annonceur inconnu'}</span>
                    <span style={discret}>{LIBELLES_TYPE_SOURCE[s.type]} · {s.plateforme} · observée le {dateCourteUtc(s.observeLe)}</span>
                    <span style={{ ...discret, color: s.statut === 'active' ? '#7ee8bf' : '#ffcf8f' }}>
                      {LIBELLES_STATUT_SOURCE[s.statut]}{s.revoqueeLe && s.statut !== 'active' ? ` · depuis le ${dateCourteUtc(s.revoqueeLe)} · observations conservées` : ''}
                    </span>
                  </div>
                </div>
                <span style={discret}>Droit · observation publique, structure seulement · empreinte <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{s.empreinte.slice(0, 12)}</code></span>
                <span style={discret}>Ressources · {s.modalites.length ? s.modalites.map((m) => LIBELLES_MODALITE[m]).join(', ') : 'aucune'}</span>
                {s.absents.some((a) => a.element === 'narration') && <span style={discret}>{LIBELLES_ELEMENT.narration} · absente · {s.absents.find((a) => a.element === 'narration')!.raison}</span>}
                {s.extraitAutorise && <p style={{ ...discret, color: 'var(--muted)' }}>Extrait autorisé · « {s.extraitAutorise} »</p>}
                {s.lienSource ? (
                  <a href={s.lienSource} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>
                    {s.type === 'veille_ad' ? 'Voir la source dans la Veille ›' : 'Voir la sauvegarde ›'}
                  </a>
                ) : s.statut !== 'active' ? <span style={{ ...discret, color: 'var(--muted)' }}>La source n’est plus accessible · aucun lien.</span> : null}
              </div>
            ))}
          </section>

          <section aria-labelledby="pj-versions" style={section}>
            <h2 id="pj-versions" style={titre}>Historique des versions</h2>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4, minWidth: 0 }}>
              {versions.map((v) => (
                <li key={v.id} data-version-n={v.n} style={{ minWidth: 0 }}>
                  <a href={v.courante ? `/studio/projets/${projet.id}` : `/studio/projets/${projet.id}?version=${v.id}`}
                    aria-current={v.id === version.id ? 'page' : undefined}
                    style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 0, alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, minWidth: 0, fontSize: 13, color: v.id === version.id ? 'var(--ink)' : 'var(--ink-2)', textDecoration: 'none', fontWeight: v.id === version.id ? 600 : 400 }}>
                    <span>Version {v.n}</span><span aria-hidden>·</span><span>{dateCourteUtc(v.createdAt)}</span>
                    {v.courante && <span style={{ color: 'var(--muted)' }}>· courante</span>}
                    {v.reason && <span style={{ color: 'var(--muted)', overflowWrap: 'anywhere', minWidth: 0 }}>· {v.reason}</span>}
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="pj-export" style={section}>
            <h2 id="pj-export" style={titre}>Produire ailleurs</h2>
            {brief ? <ExporterBrief projectId={projet.id} versionId={version.id} autorise={exportAutorise} /> : <p style={discret}>Pas de brief à exporter pour cette version.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
