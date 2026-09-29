import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getSession } from '../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../lib/rbac';
import { Bandeau } from '../../../components/Bandeau';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getActiveBrand } from '../../../lib/brands';
import { ttSearchAds, ttSearchTikTok, ttSearchGoogle, SAMPLE_INSPO_ADS, type InspoAd, type AdSort, type AdPlatform } from '@tiktrends/integrations';
import { AdCard, compact } from '../../../components/AdCard';
import { PageInfo } from '../../../components/PageInfo';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { effectiveAccess } from '../../../lib/access';
import { cleRecherche, lireRecherche, ecrireRecherche } from '../../../lib/veille-search-cache';
import { veilleSeedDefaut, NICHE_DEFAUT } from '@tiktrends/core';
import { Icon } from '../../../components/Icon';
import { Empty } from '../../../components/Empty';
import { SectionMarche } from '../jarvis/sections/SectionMarche';
import { baseUrlRecette, cleEffective } from '../../../lib/veille-recette-base';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'inspo')!;
// La mémoire marché de Jarvis suit l'offre Plus (`adsmap`) · sert à savoir si
// le raccourci « Lecture du marché » a une destination (la section ne rend rien
// sans cet accès ni marque active).
const adsmapFeature = FEATURES.find((f) => f.key === 'adsmap')!;
const CHIPS = ['skincare', 'fitness', 'mode', 'maison', 'nutrition', 'beauté', 'gadget'];
const LIMIT = 24;

// Tri Meta (POST /v1/ads/query). NB : « Scaling 7 j » et « Reach » n'affichent que
// les annonceurs avec du reach EU (l'API filtre alors sur min_reach).
const SORTS: Array<[AdSort, string]> = [
  ['newest', 'Récentes'],
  ['longestRunning', 'Plus anciennes'],
  ['reachDelta7d', 'Scaling 7 j (UE)'],
  ['reach', 'Reach (UE)'],
  ['mostDuplicates', 'Plus dupliquées'],
];
const COUNTRIES = ['FR', 'BE', 'CH', 'DE', 'ES', 'IT', 'GB', 'NL', 'PT', 'US', 'CA'];
// Langue, reach mini et ancienneté mini ne sont PAS branchés sur la source
// (le connecteur ne les envoie pas à `/v1/ads/query`, capacités non vérifiées
// ici · CDC v6 · R14). On ne propose pas un filtre qui serait silencieusement
// ignoré · ces contrôles reviendront quand leur prise en charge sera confirmée
// et testée côté fournisseur.

type SP = {
  q?: string; p?: string; searchIn?: string; media?: string; sort?: string; status?: string;
  country?: string; page?: string;
  /** `?refresh=1` court-circuite le cache mémoire · un appel frais à Trendtrack. */
  refresh?: string;
};

const PLATFORMS: [AdPlatform, string][] = [['meta', 'Meta'], ['tiktok', 'TikTok'], ['google', 'Google']];
// Libellés des filtres avancés · servent aux puces « critères actifs » sans
// redéclarer les listes deux fois.
const SEARCHIN_LABEL: Record<string, string> = { ad_copy: 'copy', brand: 'marque', domain: 'domaine' };
const SORT_LABEL: Record<string, string> = Object.fromEntries(SORTS);
const MEDIA_LABEL: Record<string, string> = { video: 'Vidéo', image: 'Image' };

function buildQS(sp: SP, over: Partial<SP>): string {
  const merged = { ...sp, ...over };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
  return '/veille?' + p.toString();
}

export default async function InspoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await getSession();
  if (!s) redirect('/login');

  const access = effectiveAccess(s);
  if (!canAccess(access, feature)) {
    const why = denyReason(access, feature);
    return (
      <main style={wrap}>
        <h1 style={h1}>Veille</h1>
        <div style={{ marginTop: 20, padding: 28, border: '1px solid var(--line)', borderRadius: 18, background: 'var(--surface)', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={30} /></div>
          <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>
            {why === 'plan' ? "Fonctionnalité incluse dès l'abonnement Core" : 'Accès réservé'}
          </h2>
          <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
            {why === 'plan'
              ? "La Veille (bibliothèque concurrentielle) est disponible à partir du plan Core. Passe ton espace en Core dans Réglages puis Abonnement."
              : "Ton rôle ne permet pas d'accéder à la Veille."}
          </p>
          {why === 'plan' && s.role === 'owner' && (
            <a href="/settings" style={upgradeBtn}>Gérer l'abonnement →</a>
          )}
        </div>
      </main>
    );
  }

  const sp = await searchParams;
  const query = (sp.q || '').trim();
  const platform: AdPlatform = sp.p === 'tiktok' || sp.p === 'google' ? sp.p : 'meta';
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  // Base de source ALTERNATIVE réservée à la recette locale (mock loopback) ·
  // refusée en production, opt-in explicite, hôte loopback uniquement. Hors
  // recette → undefined → l'intégration garde son URL par défaut.
  const baseUrl = baseUrlRecette();
  // Clé effective · EN RECETTE une clé factice constante (jamais la vraie clé
  // d'environnement, même si elle est posée) · sinon la vraie clé de production.
  const apiKey = cleEffective(baseUrl, process.env.TRENDTRACK_API_KEY);

  // Détection URL/domaine : si l'utilisateur tape une URL ou un domaine,
  // on bascule automatiquement en recherche par domaine (plus pertinent).
  const urlLike = /^https?:\/\//i.test(query) || /^[a-z0-9-]+(\.[a-z0-9-]+){1,}(\/|$)/i.test(query);
  let effSearch = query;
  let effSearchIn = (sp.searchIn as 'ad_copy' | 'brand' | 'domain') || undefined;
  let autoDomain = false;
  if (urlLike) {
    try {
      effSearch = new URL(/^https?:\/\//i.test(query) ? query : 'https://' + query).hostname.replace(/^www\./, '');
    } catch {
      effSearch = query.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/^www\./, '');
    }
    effSearchIn = 'domain';
    autoDomain = true;
  }

  // Marque active · sa catégorie amorce l'affichage par défaut (sans requête).
  const brand = db ? await getActiveBrand(s.workspaceId) : null;

  let ads: InspoAd[] = [];
  let total = 0;
  let error = '';
  let sample = false;
  // Renseigné quand on montre la sélection par défaut (aucune requête tapée).
  let defaut: { seed: string; parCategorie: boolean } | null = null;

  if (!apiKey) {
    ads = SAMPLE_INSPO_ADS;
    sample = true;
  } else if (query) {
    const media = sp.media === 'video' || sp.media === 'image' ? sp.media : undefined;
    // Une même recherche ne repaie pas Trendtrack pendant quelques minutes ·
    // paginer, ou rebasculer un filtre puis l'annuler, tape le cache mémoire.
    // `?refresh=1` force un appel frais (et réécrit le cache).
    const cle = cleRecherche([platform, autoDomain ? 'dom' : 'q', effSearch, effSearchIn, page, media, sp.status, sp.sort, sp.country]);
    const enCache = sp.refresh ? undefined : lireRecherche(cle);
    if (enCache) {
      ads = enCache.ads;
      total = enCache.total;
    } else {
      try {
        let r;
        if (platform === 'tiktok') {
          r = await ttSearchTikTok({ apiKey, baseUrl }, {
            search: autoDomain ? undefined : effSearch,
            domain: autoDomain ? effSearch : undefined,
            limit: LIMIT, page, mediaType: media,
          });
        } else if (platform === 'google') {
          r = await ttSearchGoogle({ apiKey, baseUrl }, { search: effSearch, limit: LIMIT, page, country: sp.country || undefined });
        } else {
          r = await ttSearchAds({ apiKey, baseUrl }, {
            search: effSearch, limit: LIMIT, offset: (page - 1) * LIMIT,
            mediaType: media,
            status: sp.status === 'active' ? 'active' : 'all',
            searchIn: effSearchIn,
            sortBy: (sp.sort as AdSort) || 'newest',
            country: sp.country || undefined,
          });
        }
        ads = r.ads;
        total = r.total;
        ecrireRecherche(cle, { ads, total });
      } catch (e) {
        error = (e as Error).message;
      }
    }
  } else if (platform === 'meta') {
    // Aucune requête · on ne laisse pas l'écran vide. On montre les gagnants
    // installés par le TRI « plus anciennes » sur les actives (le seuil dur de
    // jours n'est pas branché sur la source · on ne le prétend donc pas),
    // amorcés sur la catégorie de la marque active. Le mot-clé et les filtres
    // reprennent la main dès que l'utilisateur cherche.
    const chercherDefaut = async (seed: string) => {
      const cle = cleRecherche(['defaut', platform, seed, page, sp.country]);
      const enCache = sp.refresh ? undefined : lireRecherche(cle);
      if (enCache) return { ads: enCache.ads, total: enCache.total };
      const r = await ttSearchAds({ apiKey, baseUrl }, {
        search: seed, limit: LIMIT, offset: (page - 1) * LIMIT,
        status: 'active', searchIn: 'ad_copy', sortBy: 'longestRunning',
        country: sp.country || undefined,
      });
      ecrireRecherche(cle, { ads: r.ads, total: r.total });
      return { ads: r.ads, total: r.total };
    };
    defaut = veilleSeedDefaut({ category: brand?.category });
    try {
      let r = await chercherDefaut(defaut.seed);
      // La catégorie n'a rien donné (libellé trop spécifique) · on se rabat sur
      // le marché large plutôt que de laisser la Veille vide · elle doit vendre.
      if (r.ads.length === 0 && defaut.parCategorie) {
        defaut = { seed: NICHE_DEFAUT, parCategorie: false };
        r = await chercherDefaut(defaut.seed);
      }
      ads = r.ads;
      total = r.total;
    } catch (e) {
      error = (e as Error).message;
    }
  }

  // État sauvegardé / suivi pour cocher les cartes.
  let savedSet = new Set<string>();
  let followSet = new Set<string>();
  if (db) {
    const savedWhere = brand
      ? and(eq(schema.savedAds.workspaceId, s.workspaceId), eq(schema.savedAds.brandId, brand.id))
      : eq(schema.savedAds.workspaceId, s.workspaceId);
    const followWhere = brand
      ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, brand.id))
      : eq(schema.followedBrands.workspaceId, s.workspaceId);
    const [sv, fl] = await Promise.all([
      db.select({ p: schema.savedAds.platform, e: schema.savedAds.externalId }).from(schema.savedAds).where(savedWhere),
      db.select({ p: schema.followedBrands.platform, n: schema.followedBrands.name }).from(schema.followedBrands).where(followWhere),
    ]);
    savedSet = new Set(sv.map((r) => r.p + ':' + r.e));
    followSet = new Set(fl.map((r) => r.p + ':' + r.n));
  }

  const totalPages = Math.min(Math.ceil(total / LIMIT) || 1, 417);

  // La « Lecture du marché » n'a de destination que si la section peut rendre
  // (offre Plus + marque active) · sinon on ne propose pas d'ancrage vide.
  const marcheDispo = canAccess(access, adsmapFeature) && !!brand;

  // Critères avancés actifs · pour l'étiquette « Filtres (N) » et les puces des
  // critères actifs. On ne compte jamais un filtre que la source n'honore pas.
  const avances: Array<{ cle: keyof SP; texte: string }> = [];
  if (sp.searchIn) avances.push({ cle: 'searchIn', texte: 'Dans : ' + (SEARCHIN_LABEL[sp.searchIn] ?? sp.searchIn) });
  if (platform === 'meta' && sp.sort) avances.push({ cle: 'sort', texte: 'Tri : ' + (SORT_LABEL[sp.sort] ?? sp.sort) });
  if (sp.media && MEDIA_LABEL[sp.media]) avances.push({ cle: 'media', texte: MEDIA_LABEL[sp.media]! });
  if (sp.status === 'active') avances.push({ cle: 'status', texte: 'Actives' });
  if (sp.country) avances.push({ cle: 'country', texte: 'Pays : ' + sp.country });

  return (
    <main style={wrap}>
      {/* En-tête sobre · observer pour préparer un test, pas une promesse. La
          phrase et la note honnête restent, resserrées · sur mobile elles ne
          repoussent pas la première carte. */}
      <h1 style={h1}>Veille</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 14, margin: '6px 0 3px', maxWidth: 640, lineHeight: 1.45 }}>
        Observe les publicités du marché pour préparer tes prochains tests.
      </p>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 12px', maxWidth: 640, lineHeight: 1.45 }}>
        Durée de diffusion et portée sont des <b style={{ color: 'var(--ink-2)' }}>signaux d’observation</b>, pas des preuves de rentabilité.
      </p>

      {/* Accès voisins compacts · une seule rangée · sur mobile elle défile
          horizontalement plutôt que de retomber sur deux lignes et repousser la
          grille (aucun débordement de PAGE · le dépassement reste dans la bande). */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 10, paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
        <LienSec href="/veille/scale" icon="trend">Ce qui scale</LienSec>
        <LienSec href="/radar" icon="radar">Radar produits</LienSec>
        <LienSec href="/saved" icon="bookmark">Sauvegardes</LienSec>
        {marcheDispo && <LienSec href="#lecture-marche" icon="brain">Lecture du marché ↓</LienSec>}
      </div>

      {/* Recherche + plateforme accessibles d'emblée · les 5 autres filtres
          repliés (mais dans le form · ils partent quand même à la soumission). */}
      <form action="/veille" method="get" style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Recherche pleine largeur · plateforme + bouton sur la ligne suivante. */}
          <input name="q" defaultValue={query} placeholder="Ex : skincare, coque téléphone, legging…" style={{ flex: '1 1 100%', minWidth: 0, ...inputBase }} />
          <select name="p" defaultValue={sp.p ?? 'meta'} aria-label="Plateforme" style={{ ...inputBase, padding: '8px 12px', fontSize: 13.5, cursor: 'pointer', flex: '0 0 auto' }}>
            {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {/* Le TRI vit dans la barre PRINCIPALE (hors disclosure) · accessible
              filtres fermés · il réordonne, il ne filtre pas. Meta seul. */}
          {platform === 'meta' && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', minHeight: CIBLE_TACTILE_MIN }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)' }}>Tri</span>
              <select name="sort" defaultValue={sp.sort} aria-label="Trier les créas" style={{ ...inputBase, padding: '8px 12px', fontSize: 13.5, cursor: 'pointer' }}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          )}
          <button type="submit" style={searchBtn}>Rechercher</button>
        </div>

        {/* Critères actifs · compacts, chacun retirable ; réinitialisation globale. */}
        {avances.length > 0 && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            {avances.map((a) => (
              <a key={a.cle} href={buildQS(sp, { [a.cle]: '', page: '1' })} title="Retirer ce critère"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, fontSize: 11.5, fontWeight: 600, padding: '2px 12px', borderRadius: 999, border: '1px solid rgba(255,92,138,.4)', background: 'var(--paper)', color: 'var(--ink)', textDecoration: 'none' }}>
                {a.texte} <span aria-hidden style={{ color: 'var(--muted)' }}>✕</span>
              </a>
            ))}
            <a href="/veille" style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '0 6px', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', textDecoration: 'none' }}>Réinitialiser</a>
          </div>
        )}

        {/* Filtres avancés · repliés par défaut, ne repoussent pas les résultats.
            En <details> natif · les <select> restent dans le DOM et se soumettent
            même fermés · valeurs et réinitialisation préservées via l'URL. */}
        <details style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)' }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>
            <span aria-hidden style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="gauge" size={15} /></span>
            Filtres{avances.length > 0 ? ` · ${avances.length} actif${avances.length > 1 ? 's' : ''}` : ''}
            <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>▾</span>
          </summary>
          <div style={{ padding: '4px 14px 14px' }}>
            {/* Le tri a quitté ce panneau · il vit dans la barre principale,
                accessible filtres fermés. Ici, seulement des filtres. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              <Select name="searchIn" def={sp.searchIn} opts={[['ad_copy', 'Dans : copy'], ['brand', 'Dans : marque'], ['domain', 'Dans : domaine']]} />
              <Select name="media" def={sp.media} opts={[['', 'Média : tous'], ['video', 'Vidéo'], ['image', 'Image']]} />
              <Select name="status" def={sp.status} opts={[['all', 'Statut : toutes'], ['active', 'Actives']]} />
              <Select name="country" def={sp.country} opts={[['', 'Pays : tous'], ...COUNTRIES.map((c) => [c, c])]} />
            </div>
            {/* Honnêteté des filtres (R14) · on n'affiche que ce que la source honore. */}
            <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Filtres langue, reach minimum et ancienneté minimum · non disponibles depuis la source pour l'instant. Ils reviendront une fois pris en charge côté fournisseur.
            </p>
          </div>
        </details>

      </form>

      {/* Aide + suggestions · une même rangée de révélations compactes, repliées
          par défaut · elles ne repoussent pas la grille. L'Aide est en tête (à
          gauche) · son panneau absolu s'ouvre alors dans le viewport, sans
          déborder à droite comme il le ferait depuis une position décalée. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{ flex: '0 1 auto' }}>
          <PageInfo title="Aide" minHeight={CIBLE_TACTILE_MIN}>
            Choisis une <b>plateforme</b> (Meta, TikTok, Google) puis cherche par mot-clé, ou colle une <b>URL de marque</b>
            (ex&nbsp;: gruns.co) : l'app bascule automatiquement en recherche par domaine. Le <b>tri</b> «&nbsp;Plus anciennes&nbsp;»
            fait remonter les créas diffusées depuis longtemps. Clique <b>★</b> pour sauvegarder une
            créa, <b>+ Suivre</b> une marque, et <b>Générer une variante</b> pour l'envoyer au Studio.
            Sans <b>catégorie de marque</b> renseignée, la sélection par défaut est générique · précise la catégorie pour cibler.
          </PageInfo>
        </div>
        <details style={{ flex: '1 1 auto', minWidth: 0 }}>
          <summary style={{ listStyle: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: CIBLE_TACTILE_MIN, fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>
            <Icon name="sparkles" size={14} /> Suggestions de thématiques
          </summary>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {CHIPS.map((c) => (
              <a key={c} href={buildQS(sp, { q: c, page: '1' })} style={{ fontSize: 12, padding: '6px 13px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--ink-2)', textDecoration: 'none', minHeight: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center' }}>{c}</a>
            ))}
          </div>
        </details>
      </div>

      {/* Bandeau source/démo · TOUJOURS avant la grille. */}
      {sample && <Bandeau ton="demo" titre="Mode démonstration">Échantillon réel. La source de données n'est pas encore configurée sur le serveur pour la recherche en direct.</Bandeau>}
      {error && <Bandeau ton="error">Erreur de la source de données : {error}</Bandeau>}
      {!sample && !error && !query && defaut && (
        // Une ligne factuelle · le « pourquoi » (hors catégorie, comment cibler)
        // vit dans l'aide, à la demande · il n'allonge plus le préambule.
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 12px', lineHeight: 1.4 }}>
          Sélection par défaut · <b style={{ color: 'var(--ink-2)' }}>pistes installées</b> · échantillon <b style={{ color: defaut.parCategorie ? 'var(--ink-2)' : '#ffcf8f' }}>« {defaut.seed} »</b>{!defaut.parCategorie && <span style={{ color: 'var(--muted)' }}> · hors catégorie</span>}
        </p>
      )}
      {!sample && !error && !query && !defaut && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Lance une recherche ou choisis une thématique ci-dessus.</p>}
      {!sample && !error && query && <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>≈ {compact(total)} annonce(s) · page {page}/{totalPages}{autoDomain && <> · recherche par domaine <b style={{ color: 'var(--ink-2)' }}>{effSearch}</b></>}</p>}

      {/* Grille aérée · médias prédominants, 3-4 colonnes selon la place, 2 en
          tablette, 1 en mobile · auto-fill garde des cartes de taille normale
          même à deux résultats (pas d'étirement géant). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
        {ads.map((ad) => (
          <AdCard key={ad.id} ad={ad} ctaSobre cibles44
            saved={savedSet.has(ad.platform + ':' + ad.id)}
            following={followSet.has(ad.platform + ':' + (ad.advertiserName || ''))} />
        ))}
      </div>

      {/* Une recherche sans résultat rendait une grille VIDE, sans un mot ·
          l'écran se lisait comme cassé. On dit ce qui s'est passé et on donne
          une sortie · repartir des pistes installées (efface la recherche). */}
      {!sample && !error && ads.length === 0 && (
        <Empty
          tone="todo" icon="search"
          title={query ? `Aucune annonce pour « ${query} ».` : 'Aucune annonce à afficher pour l’instant.'}
          why="Élargis le terme, change de plateforme, ou repars des pistes installées dans ta catégorie."
          action={{ label: 'Voir les pistes installées', href: '/veille' }}
        />
      )}

      {/* Pagination */}
      {!sample && !error && (query || defaut) && ads.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 26 }}>
          {page > 1
            ? <a href={buildQS(sp, { page: String(page - 1) })} style={pageBtn}>← Précédent</a>
            : <span style={{ ...pageBtn, opacity: .4, pointerEvents: 'none' }}>← Précédent</span>}
          <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--muted)' }}>{page} / {totalPages}</span>
          {page < totalPages
            ? <a href={buildQS(sp, { page: String(page + 1) })} style={pageBtn}>Suivant →</a>
            : <span style={{ ...pageBtn, opacity: .4, pointerEvents: 'none' }}>Suivant →</span>}
        </div>
      )}

      {/* Transition vers l'itération · un lien EXPLICITE, sans workflow fictif ·
          il n'y a pas de passage de contexte veille→Adsmap, on ne le prétend pas. */}
      {ads.length > 0 && (
        <div style={{ marginTop: 26, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Une piste t’inspire ?</div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.5 }}>Le test se prépare dans Adsmap · c’est là que tu poses l’hypothèse et lis le verdict. Ce lien ouvre simplement tes tests.</div>
          </div>
          <a href="/adsmap" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: CIBLE_TACTILE_MIN, padding: '10px 16px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            <span aria-hidden style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name="radar" size={16} /></span>
            Ouvrir mes tests dans Adsmap <span aria-hidden>→</span>
          </a>
        </div>
      )}

      {/* La mémoire marché de Jarvis · ce qu'il a retenu des concurrents suivis,
          à sa destination. Self-porté (offre Plus, marque active) · rend null pour
          un compte qui n'y avait pas droit, la Veille reste accessible dès Core. */}
      <SectionMarche />
    </main>
  );
}

function LienSec({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  return (
    <a href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, whiteSpace: 'nowrap', minHeight: CIBLE_TACTILE_MIN, padding: '8px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 600, textDecoration: 'none' }}>
      <span aria-hidden style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name={icon} size={15} /></span>
      {children}
    </a>
  );
}

function Select({ name, def, opts }: { name: string; def?: string; opts: string[][] }) {
  return (
    <select name={name} defaultValue={def ?? opts[0]?.[0] ?? ''} style={{ ...inputBase, width: '100%', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}>
      {opts.map((o) => <option key={o[0] || 'any'} value={o[0]}>{o[1]}</option>)}
    </select>
  );
}

// Marge latérale fluide · 36px sur large écran, 16px sur mobile · le contenu ne
// se colle plus aux bords du téléphone.
const wrap = { padding: 'clamp(16px, 4vw, 32px) clamp(16px, 4vw, 32px) 60px', maxWidth: 1200, margin: '0 auto' } as const;
const h1 = { margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, letterSpacing: '-.01em', color: 'var(--ink)' } as const;
// minHeight: CIBLE_TACTILE_MIN · le champ de recherche ET les filtres <Select>
// partagent inputBase · un seul endroit les porte tous deux à la cible tactile.
const inputBase = { padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, outline: 'none', minHeight: CIBLE_TACTILE_MIN } as const;
const searchBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '11px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, cursor: 'pointer' } as const;
const upgradeBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, marginTop: 16, padding: '10px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 13, textDecoration: 'none' } as const;
const pageBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, padding: '9px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 600, textDecoration: 'none' } as const;
