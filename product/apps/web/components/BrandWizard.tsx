'use client';

import { useActionState, useState, useTransition } from 'react';
import { input, lbl } from './ui';
import { BrandGuidelines } from './BrandGuidelines';
import { createBrandAction, generateBrandDraftAction, type BrandDraftState } from '../app/actions/brands';

interface Persona { name: string; description: string; pains: string; desires: string }
interface Scenario { title: string; context: string }

const STEPS = ['Profil', 'Charte', 'Audience', 'Concurrents', 'Comptes pub'] as const;

const area = { ...input, minHeight: 78, resize: 'vertical' as const, lineHeight: 1.5, fontFamily: 'inherit' };
const cardStyle = { border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: 14, marginBottom: 12 } as const;
const chip = { fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' } as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={lbl}>{label}{hint && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {hint}</span>}</label>
      {children}
    </div>
  );
}

export function BrandWizard({ aiReady, draftCost = 5, embedded = false }: { aiReady: boolean; draftCost?: number; embedded?: boolean }) {
  const [step, setStep] = useState(0);
  // Écran d'entrée « IA d'abord » : nom + site -> Jarvis pré-remplit tout, on révise ensuite.
  const [gate, setGate] = useState(true);
  const [pending, startCreate] = useTransition();

  // Champs texte simples (contrôlés pour permettre le pré-remplissage IA).
  const [f, setF] = useState({
    name: '', url: '', logoUrl: '', industry: '', description: '', usp: '', audience: '',
    category: '', categoryNeeds: '', moreAbout: '', tone: '', industryTags: '', colors: '',
    fonts: '', preferredWords: '', avoidWords: '', competitors: '', languages: 'Français',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [logos, setLogos] = useState<string[]>([]);
  // Couleurs / polices : stockées en texte (compat POST) mais éditées en listes.
  const splitList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const colorList = splitList(f.colors);
  const fontList = splitList(f.fonts);

  const [draftState, runDraft, drafting] = useActionState<BrandDraftState, FormData>(async (_p, fd) => {
    const res = await generateBrandDraftAction(_p, fd);
    if (res.draft) {
      const d = res.draft;
      setF((s) => ({
        ...s,
        description: d.description || s.description,
        usp: d.usp || s.usp,
        audience: d.audience || s.audience,
        category: d.category || s.category,
        categoryNeeds: d.categoryNeeds || s.categoryNeeds,
        tone: d.tone || s.tone,
        industryTags: d.industryTags?.join(', ') || s.industryTags,
        preferredWords: d.preferredWords?.join(', ') || s.preferredWords,
        avoidWords: d.avoidWords?.join(', ') || s.avoidWords,
        competitors: d.competitors?.join('\n') || s.competitors,
      }));
      if (d.personas?.length) setPersonas(d.personas.map((p) => ({ name: p.name, description: p.description, pains: (p.pains || []).join(', '), desires: (p.desires || []).join(', ') })));
      if (d.scenarios?.length) setScenarios(d.scenarios.map((x) => ({ title: x.title, context: x.context })));
    }
    return res;
  }, {});

  const canNext = step > 0 || f.name.trim().length > 0;

  const personasJson = JSON.stringify(personas.filter((p) => p.name.trim()).map((p) => ({
    name: p.name, description: p.description,
    pains: p.pains.split(',').map((x) => x.trim()).filter(Boolean),
    desires: p.desires.split(',').map((x) => x.trim()).filter(Boolean),
  })));
  const scenariosJson = JSON.stringify(scenarios.filter((x) => x.title.trim()));

  // ---- Écran d'entrée : Jarvis pré-remplit depuis le site (ou saisie manuelle) ----
  if (gate) {
    const ready = aiReady && f.name.trim().length > 0;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) minmax(0,1fr)', gap: 0, ...shell(embedded) }}>
        {/* Panneau valeur */}
        <div style={{ background: 'linear-gradient(180deg, rgba(254,44,85,.10), var(--paper))', padding: '26px 22px', borderRight: '1px solid var(--line)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 14 }}>✦</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.35 }}>Jarvis pré-remplit depuis ton site</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 11 }}>
            {[['🎨', 'Charte de marque'], ['👥', 'Audience & personas'], ['🔭', 'Concurrents']].map(([e, t]) => (
              <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: 'var(--ink-2)' }}>
                <span style={{ fontSize: 15 }}>{e}</span>{t}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 18, fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ color: '#7ee8bf' }}>✓</span> Tu n'as plus qu'à vérifier
          </div>
        </div>

        {/* Formulaire minimal */}
        <div style={{ padding: '26px 26px 24px' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Présente ta marque</h2>
          <p style={{ margin: '6px 0 20px', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            On part de l'essentiel. Ton site suffit à bâtir le profil complet.
          </p>
          <div style={{ display: 'grid', gap: 14, maxWidth: 420 }}>
            <div><label style={lbl}>Nom de la marque *</label><input value={f.name} onChange={set('name')} placeholder="Ex : Studio Nova" style={input} autoFocus /></div>
            <div><label style={lbl}>Site web</label><input value={f.url} onChange={set('url')} placeholder="ta-marque.com" style={input} /></div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 18 }}>
            <button type="button" disabled={!ready || drafting}
              onClick={() => { const fd = new FormData(); fd.set('name', f.name); fd.set('url', f.url); runDraft(fd); setGate(false); }}
              title={aiReady ? `Analyse le site et déduit le profil · ${draftCost} crédits` : 'IA non configurée sur le serveur'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, border: 'none',
                background: ready ? 'var(--grad-accent)' : 'var(--line-2)', color: ready ? '#0d070c' : 'var(--muted)',
                fontWeight: 800, fontSize: 13.5, cursor: ready && !drafting ? 'pointer' : 'default' }}>
              ✦ {drafting ? 'Analyse…' : 'Générer avec Jarvis'}
              <span style={{ fontSize: 11, fontWeight: 700, opacity: .75 }}>· {draftCost} cr.</span>
            </button>
            <button type="button" onClick={() => setGate(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline' }}>
              Ou remplir le profil manuellement
            </button>
          </div>
          {!aiReady && <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--muted)' }}>IA non configurée sur le serveur · la saisie manuelle reste disponible.</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 220px) minmax(0,1fr)', gap: 0, ...shell(embedded) }}>
      {/* Étapes · barre latérale */}
      <aside style={{ background: 'var(--paper)', borderRight: '1px solid var(--line)', padding: '22px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', marginBottom: 16 }}>Créer une marque</div>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4, flex: 1 }}>
          {STEPS.map((label, i) => {
            const done = i < step, active = i === step;
            return (
              <li key={label}>
                <button type="button" onClick={() => (i <= step || f.name.trim()) && setStep(i)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                  border: 'none', background: active ? 'var(--accent-soft)' : 'transparent', textAlign: 'left',
                  color: active ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--muted)', fontWeight: active ? 800 : 600, fontSize: 13,
                }}>
                  <span style={{ width: 21, height: 21, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
                    background: active ? 'var(--grad-accent)' : done ? 'rgba(126,232,191,.18)' : 'var(--line-2)',
                    color: active ? '#0d070c' : done ? '#7ee8bf' : 'var(--muted)' }}>{done ? '✓' : i + 1}</span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Étape {step + 1} sur {STEPS.length}</div>
          <div style={{ height: 4, borderRadius: 999, background: 'var(--line-2)', overflow: 'hidden' }}>
            <div style={{ width: `${((step + 1) / STEPS.length) * 100}%`, height: '100%', background: 'var(--grad-accent)' }} />
          </div>
        </div>
      </aside>

      <form action={(fd) => startCreate(() => createBrandAction(fd))} style={{ padding: '24px 26px 22px', minWidth: 0 }}>
        {/* Champs nom/site saisis à l'entrée : conservés pour le POST. */}
        <input type="hidden" name="name" value={f.name} />
        <input type="hidden" name="url" value={f.url} />
        {/* On garde tous les steps montés (display none) pour préserver les valeurs du POST. */}

        {/* STEP 1 · Profil */}
        <section style={{ display: step === 0 ? 'block' : 'none' }}>
          <h2 style={hStep}>{f.name.trim() ? f.name : 'Parle-nous de la marque'}</h2>
          <p style={pStep}>C'est le socle sur lequel Jarvis construit tout le reste. Vérifie et ajuste.</p>

          {/* État de la génération IA lancée à l'entrée */}
          {drafting && <div style={noticeBox('rgba(245,166,35,.4)', 'rgba(245,166,35,.10)', '#f5b043')}>✦ Jarvis analyse ton site et compose le profil…</div>}
          {draftState.error && <div style={noticeBox('rgba(255,77,109,.4)', 'rgba(255,77,109,.10)', '#ff9db0')}>{draftState.error}</div>}
          {draftState.draft && !drafting && <div style={noticeBox('rgba(24,204,140,.4)', 'rgba(24,204,140,.08)', '#7ee8bf')}>Profil pré-rempli par Jarvis{draftState.cost ? ` · ${draftState.cost} crédits` : ''}. Vérifie et ajuste ci-dessous.</div>}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
            <div style={{ flex: '2 1 220px' }}><label style={lbl}>Nom de la marque *</label><input value={f.name} onChange={set('name')} placeholder="Ex : Studio Nova" style={input} /></div>
            <div style={{ flex: '2 1 220px' }}><label style={lbl}>Site web</label><input value={f.url} onChange={set('url')} placeholder="ta-marque.com" style={input} /></div>
          </div>

          <Field label="Description produit / service"><textarea name="description" value={f.description} onChange={set('description')} placeholder="Ce que vend la marque, en quelques phrases." style={area} /></Field>
          <Field label="Propositions de valeur uniques (USP)" hint="une par ligne"><textarea name="usp" value={f.usp} onChange={set('usp')} placeholder={'Ex : 60+ ingrédients en une gorgée\nSans mélange à préparer'} style={area} /></Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}><Field label="Audience cible"><input name="audience" value={f.audience} onChange={set('audience')} placeholder="Ex : actifs 25-40 soucieux de leur santé" style={input} /></Field></div>
            <div style={{ flex: '1 1 160px' }}><Field label="Catégorie"><input name="category" value={f.category} onChange={set('category')} placeholder="Complément alimentaire" style={input} /></Field></div>
          </div>
          <Field label="Besoins de la catégorie" hint="ce que la catégorie doit résoudre"><input name="categoryNeeds" value={f.categoryNeeds} onChange={set('categoryNeeds')} placeholder="Énergie, digestion, praticité…" style={input} /></Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}><Field label="Secteur (principal)"><input name="industry" value={f.industry} onChange={set('industry')} placeholder="Nutrition" style={input} /></Field></div>
            <div style={{ flex: '1 1 240px' }}><Field label="Tags secteur / vertical" hint="séparés par des virgules"><input name="industryTags" value={f.industryTags} onChange={set('industryTags')} placeholder="Santé, Bien-être, DTC" style={input} /></Field></div>
          </div>
          <Field label="En savoir plus sur la marque" hint="histoire, mission, contexte"><textarea name="moreAbout" value={f.moreAbout} onChange={set('moreAbout')} style={area} /></Field>
        </section>

        {/* STEP 2 · Charte */}
        <section style={{ display: step === 1 ? 'block' : 'none' }}>
          <h2 style={hStep}>Charte de marque</h2>
          <p style={pStep}>Le style et le langage que l'IA doit respecter dans chaque créa.</p>
          {/* Identité visuelle · édition directe (logos, pastilles de couleur, polices) */}
          <BrandGuidelines
            logos={logos} onLogos={setLogos}
            defaultLogo={f.logoUrl} onDefaultLogo={(v) => setF((s) => ({ ...s, logoUrl: v }))}
            colors={colorList} onColors={(v) => setF((s) => ({ ...s, colors: v.join(', ') }))}
            fonts={fontList} onFonts={(v) => setF((s) => ({ ...s, fonts: v.join(', ') }))}
          />

          <div style={{ height: 18 }} />
          <Field label="Ton de voix"><input name="tone" value={f.tone} onChange={set('tone')} placeholder="Chaleureux, expert, direct" style={input} /></Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px' }}><Field label="Mots à privilégier" hint="virgules"><input name="preferredWords" value={f.preferredWords} onChange={set('preferredWords')} placeholder="naturel, simple, énergie" style={input} /></Field></div>
            <div style={{ flex: '1 1 240px' }}><Field label="Mots à éviter" hint="virgules"><input name="avoidWords" value={f.avoidWords} onChange={set('avoidWords')} placeholder="miracle, garanti" style={input} /></Field></div>
          </div>
          <Field label="Langue(s) par défaut" hint="virgules"><input name="languages" value={f.languages} onChange={set('languages')} placeholder="Français" style={input} /></Field>
        </section>

        {/* STEP 3 · Audience */}
        <section style={{ display: step === 2 ? 'block' : 'none' }}>
          <h2 style={hStep}>À qui parles-tu&nbsp;?</h2>
          <p style={pStep}>Scénarios d'usage et personas pour adapter chaque créa au bon contexte et à la bonne personne.</p>

          <Row title="Scénarios" count={scenarios.length} onAdd={() => setScenarios((s) => [...s, { title: '', context: '' }])} addLabel="Ajouter un scénario" />
          {scenarios.map((sc, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <input value={sc.title} onChange={(e) => setScenarios((s) => s.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Titre (ex : Session de travail nocturne)" style={{ ...input, fontWeight: 700 }} />
                <button type="button" onClick={() => setScenarios((s) => s.filter((_, j) => j !== i))} style={chip}>Retirer</button>
              </div>
              <input value={sc.context} onChange={(e) => setScenarios((s) => s.map((x, j) => j === i ? { ...x, context: e.target.value } : x))} placeholder="Contexte : lieu, moment, situation" style={input} />
            </div>
          ))}
          {scenarios.length === 0 && <p style={emptyHint}>Aucun scénario. L'IA en propose, ou ajoute-en un.</p>}

          <div style={{ height: 18 }} />
          <Row title="Personas" count={personas.length} onAdd={() => setPersonas((s) => [...s, { name: '', description: '', pains: '', desires: '' }])} addLabel="Ajouter un persona" />
          {personas.map((p, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <input value={p.name} onChange={(e) => setPersonas((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Nom (ex : L'étudiante déterminée)" style={{ ...input, fontWeight: 700 }} />
                <button type="button" onClick={() => setPersonas((s) => s.filter((_, j) => j !== i))} style={chip}>Retirer</button>
              </div>
              <textarea value={p.description} onChange={(e) => setPersonas((s) => s.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" style={{ ...area, minHeight: 56, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}><label style={lbl}>Frustrations <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(virgules)</span></label><input value={p.pains} onChange={(e) => setPersonas((s) => s.map((x, j) => j === i ? { ...x, pains: e.target.value } : x))} style={input} /></div>
                <div style={{ flex: '1 1 200px' }}><label style={lbl}>Désirs <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(virgules)</span></label><input value={p.desires} onChange={(e) => setPersonas((s) => s.map((x, j) => j === i ? { ...x, desires: e.target.value } : x))} style={input} /></div>
              </div>
            </div>
          ))}
          {personas.length === 0 && <p style={emptyHint}>Aucun persona. L'IA en propose, ou ajoute-en un.</p>}
        </section>

        {/* STEP 4 · Concurrents */}
        <section style={{ display: step === 3 ? 'block' : 'none' }}>
          <h2 style={hStep}>Avec qui es-tu en concurrence&nbsp;?</h2>
          <p style={pStep}>On surveille ces marques pour que tu saches toujours où tu te situes, et garder une longueur d'avance.</p>
          <Field label="Marques concurrentes" hint="une par ligne"><textarea name="competitors" value={f.competitors} onChange={set('competitors')} placeholder={'Norway Omega\nplnktn.\nNorsan'} style={{ ...area, minHeight: 140 }} /></Field>
          <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Tu pourras les suivre en direct depuis l'Inspo une fois les bibliothèques branchées.</p>
        </section>

        {/* STEP 5 · Comptes pub */}
        <section style={{ display: step === 4 ? 'block' : 'none' }}>
          <h2 style={hStep}>Où tournent tes pubs&nbsp;?</h2>
          <p style={pStep}>Branche tes régies pour que l'analyse travaille sur tes vraies performances, pas des estimations.</p>
          <div style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: 16, color: 'var(--ink-2)', fontSize: 13.5, marginBottom: 8 }}>
            La connexion Meta / TikTok se fait en OAuth sécurisé depuis <b>Connexions</b>, marque par marque. Tu pourras la brancher juste après la création.
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--surface)', padding: '14px 16px' }}>
            <b style={{ color: 'var(--ink)', fontSize: 14 }}>Récapitulatif</b>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--ink-2)', fontSize: 13, lineHeight: 1.8 }}>
              <li>Marque : <b>{f.name || '·'}</b>{f.category ? ` · ${f.category}` : ''}</li>
              <li>{scenarios.filter((x) => x.title.trim()).length} scénario(s), {personas.filter((p) => p.name.trim()).length} persona(s)</li>
              <li>{f.competitors.split('\n').map((x) => x.trim()).filter(Boolean).length} concurrent(s) suivi(s)</li>
            </ul>
          </div>
        </section>

        {/* Hidden payloads pour personas / scénarios */}
        <input type="hidden" name="personas" value={personasJson} />
        <input type="hidden" name="scenarios" value={scenariosJson} />

        {/* Barre d'actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <button type="button" onClick={() => (step > 0 ? setStep((s) => s - 1) : setGate(true))} style={{ ...chip, padding: '9px 15px', fontSize: 13 }}>‹ Retour</button>
          <span style={{ flex: 1 }} />
          {step < STEPS.length - 1 ? (
            <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)} style={{ ...primaryBtn, opacity: canNext ? 1 : .5, cursor: canNext ? 'pointer' : 'default' }}>Continuer ›</button>
          ) : (
            <button type="submit" disabled={pending || !f.name.trim()} style={{ ...primaryBtn, opacity: pending || !f.name.trim() ? .6 : 1 }}>{pending ? 'Création…' : 'Terminer et créer la marque'}</button>
          )}
        </div>
      </form>
    </div>
  );
}

function Row({ title, count, onAdd, addLabel }: { title: string; count: number; onAdd: () => void; addLabel: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <b style={{ color: 'var(--ink)', fontSize: 15 }}>{title}</b>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{count}</span>
      <span style={{ flex: 1 }} />
      <button type="button" onClick={onAdd} style={{ ...chip, padding: '7px 13px', fontSize: 12.5, color: 'var(--accent-strong)', borderColor: 'var(--line-2)' }}>+ {addLabel}</button>
    </div>
  );
}

/** Coquille du wizard : encadrée en page, à nu dans une pop-up (la modale porte déjà le cadre). */
const shell = (embedded: boolean): React.CSSProperties => (embedded
  ? { margin: '-4px -4px 0', minHeight: 380 }
  : { border: '1px solid var(--line-2)', borderRadius: 20, overflow: 'hidden', background: 'var(--surface)' });
const noticeBox = (border: string, bg: string, color: string) => ({
  border: `1px solid ${border}`, background: bg, color, borderRadius: 12, padding: '10px 13px', fontSize: 13, marginBottom: 16,
} as const);
const hStep = { margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--ink)' } as const;
const pStep = { margin: '0 0 18px', fontSize: 13.5, color: 'var(--ink-2)' } as const;
const emptyHint = { fontSize: 13, color: 'var(--muted)', margin: '0 0 4px' } as const;
const primaryBtn = { padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' } as const;
