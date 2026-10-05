'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BrandSwitcher } from './BrandSwitcher';
import { NotificationBell } from './NotificationBell';
import { SupportWidget } from './SupportWidget';
import { CommandPalette, openCommandPalette, type Command } from './CommandPalette';
import { ProfileModal, type ProfilEnregistre } from './ProfileModal';
import { QuickSettingsModal } from './QuickSettingsModal';
import { CreditsMenu } from './CreditsMenu';
import { Breadcrumb } from './Breadcrumb';
import { LogoHome } from './LogoHome';
import { Icon } from './Icon';
import { useIsMobile } from './useIsMobile';
import { CIBLE_TACTILE_MIN, valeurAffichee, type Enregistre, placementLanceurSupport, hauteurRangeeRail, railEntreeActive, ancresDeclarees, chargementCompletRequis, commandesOuvertes, type RegleChemin } from '@tiktrends/core';
import { chromeCoquille, echapFermeTiroir } from '../lib/chrome-coquille';
import { railCookieString } from '../lib/rail-preference';
import { routeLabel } from '../lib/navigation';
import { ajouterRecent, type EcranRecent } from '../lib/recents';

// Coulisses plateforme (ADMIN+ · fondateur) : fond ambré + accent orange.
// Les pages « espace de travail » du client (marques, connexions, membres,
// abonnement, réglages) gardent la DA magenta standard.
// Navigation dédiée quand le fondateur entre en mode ADMIN+ (remplace le rail client).
export const ADMIN_NAV: Array<{ key: string; label: string; href: string; icon: string }> = [
  { key: 'a-home', label: "Vue d'ensemble", href: '/admin', icon: 'grid' },
  { key: 'a-fin', label: 'Finance · MRR', href: '/admin/finance', icon: 'chart' },
  { key: 'a-signups', label: 'Inscriptions', href: '/admin/signups', icon: 'users' },
  { key: 'a-equipe', label: 'Équipe & droits', href: '/admin/equipe', icon: 'lock' },
  { key: 'a-plans', label: 'Formules & crédits', href: '/admin/plans', icon: 'card' },
  { key: 'a-pay', label: 'Chaîne de paiement', href: '/admin/paiement', icon: 'gauge' },
  { key: 'a-incid', label: 'Incidents', href: '/admin/incidents', icon: 'radar' },
  { key: 'a-spend', label: 'Dépense IA réelle', href: '/admin/depenses', icon: 'coin' },
  { key: 'a-credits', label: 'Coûts & marges', href: '/credits', icon: 'coin' },
  { key: 'a-console', label: 'Console', href: '/console', icon: 'gauge' },
  { key: 'a-intel', label: 'Intelligence marché', href: '/admin/intelligence', icon: 'radar' },
  { key: 'a-connaissances', label: 'Connaissances', href: '/admin/connaissances', icon: 'file' },
];
// Note : /billing et /settings sont des pages CLIENTES. Les lister ici basculait
// toute la coquille en thème ADMIN+ dès qu'un membre du staff les ouvrait · le
// pilotage interne vit maintenant dans /admin/plans.
const ADMIN_CONTENT = {
  '--accent': '#f5a623',
  '--accent-strong': '#ffca6b',
  '--accent-soft': '#2a2110',
  '--grad-accent': 'linear-gradient(135deg,#f5a623 0%,#ff8c42 100%)',
  // Thème admin (fondateur) · distingué par sa couleur et son accent, sans
  // quadrillage ni halo (charte : fond uni, aucun décor).
  backgroundColor: '#130d07',
} as unknown as CSSProperties;

interface NavItem { key: string; label: string; href: string; icon: string; locked: boolean; isSub: boolean; soon?: boolean }
interface Group { group: string; items: NavItem[] }
interface Brand { id: string; name: string; logoUrl?: string | null; url?: string | null }
interface AccountGroup { section: string; items: NavItem[] }
interface Props {
  nav: Group[];
  accountGroups: AccountGroup[];
  /** Ce que le rôle ouvre, rubrique par rubrique (lot 12) · filtre la palette. Absent = tout ouvert. */
  ouvertures?: RegleChemin[];
  isStaff: boolean;
  showUpgrade: boolean;
  brands: Brand[];
  activeBrandId: string | null;
  canManageBrands: boolean;
  creditBalance: number;
  creditsUnlimited: boolean;
  userName: string;
  userEmail: string;
  avatarUrl?: string;
  hidePersonalInfo?: boolean;
  roleLabel: string;
  planLabel: string;
  workspaceName: string;
  /** Rail replié au PREMIER rendu · lu du cookie côté serveur pour que la
   * géométrie soit juste dès le premier pixel (pas de saut après montage). */
  collapsedInitial: boolean;
  logout: () => Promise<void>;
  children: ReactNode;
}

function NavLink({ it, active, inPath = false, onClick, tactile = true }: {
  it: NavItem; active: boolean;
  /** Contient la page courante, sans l'être · rendu plus sobre, jamais le fond plein. */
  inPath?: boolean;
  onClick?: () => void;
  /** Pointeur grossier (mobile · tiroir) → rangée 44. Fin (desktop · souris) →
   *  rangée dense (32-36) · c'est ce qui rend les têtes visibles à 720. */
  tactile?: boolean;
}) {
  const disabled = it.locked || it.soon;
  // La hauteur de rangée DÉCIDÉE par le noyau (règle pure, éprouvée) · 44 au
  // doigt, dense à la souris. Le padding suit, pour que la hauteur RÉELLE colle
  // à la décision (au doigt, minHeight gouverne ; à la souris, un padding plus
  // court laisse la rangée descendre à sa cible).
  const hRangee = hauteurRangeeRail(tactile);
  const padY = tactile ? (it.isSub ? 8 : 10) : (it.isSub ? 5 : 6);
  const inner = (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 11,
      padding: it.isSub ? `${padY}px 10px ${padY}px 30px` : `${padY}px 11px`, borderRadius: 10,
      minHeight: hRangee, boxSizing: 'border-box',
      fontSize: it.isSub ? 13 : 14, fontWeight: active || inPath ? 700 : 500,
      color: disabled ? 'var(--muted)' : active || inPath ? 'var(--ink)' : 'var(--ink-2)',
      // « Je suis ici » se dit d'un liséré accent + une teinte légère, pas d'un
      // pavé plein · on voit où l'on est sans que l'item écrase la liste. Le
      // liséré est logé dans le rayon (inset) pour épouser le coin arrondi.
      position: 'relative',
      background: active ? 'rgba(254,44,85,.10)' : 'transparent',
      boxShadow: active ? 'inset 3px 0 0 var(--accent-strong)' : undefined,
      opacity: disabled ? 0.55 : 1, cursor: disabled ? 'default' : 'pointer',
    }}>
      {it.isSub ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--line-2)' }} /> : <Icon name={it.icon} />}
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
      {it.soon && <span style={pill('#8a6d3b', 'rgba(245,166,35,.15)')}>Bientôt</span>}
      {!it.soon && it.locked && <span style={{ ...pill('var(--muted)', 'rgba(255,255,255,.06)'), display: 'inline-flex', alignItems: 'center', padding: '3px 6px' }}><Icon name="lock" size={12} /></span>}
    </span>
  );
  return disabled
    ? <div title={it.locked ? 'Nécessite un abonnement supérieur' : 'Bientôt disponible'}>{inner}</div>
    // Le lien actif s'annonce · un lecteur d'écran doit savoir « je suis ici »
    // autrement que par la teinte (CDC v7 · N08).
    // `display: block` · une tête de branche est logée dans un conteneur flex et
    // reste sinon `inline` · son anneau de focus (:focus-visible) ne s'y dessine
    // pas en boîte pleine. En bloc, le lien épouse la rangée · l'anneau entoure
    // toute l'entrée, tête comme feuille (recette focus · Aperçu).
    : <Link href={it.href} onClick={onClick} aria-current={active ? 'page' : undefined} style={{ display: 'block', textDecoration: 'none' }}>{inner}</Link>;
}

interface Branch { head: NavItem; subs: NavItem[] }
/** Reconstitue l'arborescence parent → sous-items à partir de la liste plate (ordre : parent puis ses subs). */
function branchesOf(items: NavItem[]): Branch[] {
  const out: Branch[] = [];
  for (const it of items) {
    if (it.isSub && out.length) out[out.length - 1]!.subs.push(it);
    else out.push({ head: it, subs: [] });
  }
  return out;
}

/** Menu dépliable : parent + chevron, sous-items révélés au clic. Ouvert d'office si la branche est active. */
/**
 * Une entrée du rail et ses sous-écrans.
 *
 * ── Ce qui n'allait pas ──────────────────────────────────────────────────────
 *
 * Déplier exigeait de viser la flèche · vingt-six pixels, à côté d'un libellé
 * qui, lui, ne faisait que naviguer. Personne ne devine ça : on clique le nom du
 * module et on s'attend à voir ce qu'il contient.
 *
 * **Cliquer le libellé navigue ET ouvre.** Jamais il ne referme · un libellé qui
 * cache des choses au deuxième clic est une surprise, et on n'en veut pas dans
 * une navigation. La flèche garde le repli, pour qui veut fermer la branche
 * sans la quitter.
 */
function NavBranch({ b, isActive, inPath, open, onToggle, onOpen, tactile = true }: {
  b: Branch;
  isActive: (href: string, isSub: boolean) => boolean;
  inPath: (href: string) => boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** Densité par pointeur · voir NavLink. */
  tactile?: boolean;
}) {
  const headActive = isActive(b.head.href, false);
  if (!b.subs.length) return <NavLink it={b.head} active={headActive} tactile={tactile} />;

  // Le parent contient la page courante · il le montre sobrement, sans lui
  // prendre la sélection.
  const headInPath = inPath(b.head.href) || b.subs.some((su) => isActive(su.href, true));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NavLink it={b.head} active={headActive} inPath={headInPath} onClick={onOpen} tactile={tactile} />
        </div>
        <button type="button" onClick={onToggle} aria-label={`${open ? 'Replier' : 'Déplier'} ${b.head.label}`} aria-expanded={open} style={{
          // Le chevron suit la densité de sa rangée · 44 au doigt, dense à la souris.
          width: 30, minHeight: hauteurRangeeRail(tactile), flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', color: headInPath || headActive ? 'var(--ink-2)' : 'var(--muted)', cursor: 'pointer', borderRadius: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 4, borderLeft: '1px solid var(--line)', paddingLeft: 2 }}>
          {b.subs.map((su) => <NavLink key={su.key} it={su} active={isActive(su.href, true)} tactile={tactile} />)}
        </div>
      )}
    </div>
  );
}

export function AppShell(props: Props) {
  // useSearchParams (pour l'état actif des onglets de marque) nécessite une frontière Suspense.
  return (
    <Suspense fallback={null}>
      <AppShellInner {...props} />
    </Suspense>
  );
}

function AppShellInner(props: Props) {
  const { nav, accountGroups, ouvertures = [], isStaff, showUpgrade, brands, activeBrandId, canManageBrands, creditBalance, creditsUnlimited, userName: userNameServeur, userEmail, avatarUrl: avatarUrlServeur, hidePersonalInfo: hideServeur, roleLabel, planLabel, workspaceName: workspaceNameServeur, collapsedInitial, logout, children } = props;
  // Lot 16 · ce que l'utilisateur vient d'enregistrer (profil, nom d'espace)
  // s'affiche TOUT DE SUITE, sans attendre le rendu serveur · la transition du
  // routeur qui l'apporte peut caler (lot 14). Dès que le serveur renvoie
  // autre chose que ce qu'il montrait à l'enregistrement, il fait foi
  // (`valeurAffichee`, noyau).
  const [profilLocal, setProfilLocal] = useState<{ name: Enregistre<string>; avatarUrl: Enregistre<string>; hide: Enregistre<boolean> } | null>(null);
  const [espaceLocal, setEspaceLocal] = useState<Enregistre<string> | null>(null);
  const userName = valeurAffichee(userNameServeur, profilLocal?.name);
  const avatarUrl = valeurAffichee(avatarUrlServeur ?? '', profilLocal?.avatarUrl) || undefined;
  const hidePersonalInfo = valeurAffichee(!!hideServeur, profilLocal?.hide);
  const workspaceName = valeurAffichee(workspaceNameServeur, espaceLocal);
  const profilEnregistre = (p: ProfilEnregistre) => setProfilLocal({
    name: { valeur: p.name, serveurAvant: userNameServeur },
    avatarUrl: { valeur: p.avatarUrl, serveurAvant: avatarUrlServeur ?? '' },
    hide: { valeur: p.hidePersonalInfo, serveurAvant: !!hideServeur },
  });
  // Les fenêtres rendent le focus à ce qui l'avait à l'ouverture · l'entrée de
  // menu cliquée disparaît avec le menu (focus sur <body>, mesuré au lot 16).
  // On le pose d'abord sur le bouton qui ouvre ce menu.
  const compteBtnRef = useRef<HTMLButtonElement>(null);
  const espaceBtnRef = useRef<HTMLButtonElement>(null);
  // Menu profil : « Compte » (personnel) + « Espace de travail » (marques, membres,
  // connexions, abonnement, réglages). Les coulisses plateforme (ADMIN+) restent
  // réservées au fondateur/staff.
  const personalItems = accountGroups.find((g) => g.section === 'Compte')?.items ?? [];
  const workspaceItems = accountGroups.find((g) => g.section === 'Espace')?.items ?? [];
  const pathname = usePathname();
  // Le support est ANCRÉ (zone de commandes en pied) sur les écrans denses en
  // commandes bas-de-page · ailleurs il reste flottant, /jarvis le masque.
  // Où vit le lanceur de support · règle au noyau (`placementLanceurSupport`).
  const lanceurSupport = placementLanceurSupport(pathname);
  const supportAncre = lanceurSupport === 'ancre';
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Barre repliable (« plus d'espace ») · préférence mémorisée par navigateur.
  // L'état part de la valeur SERVEUR (cookie) · le premier rendu client et le
  // rendu serveur coïncident, donc le rail ne saute plus de 184 à 64px après
  // montage. Le basculement réécrit le cookie · au prochain chargement, le
  // serveur rendra directement la bonne largeur (cf. lib/rail-preference).
  const [collapsed, setCollapsed] = useState(collapsedInitial);
  const toggleCollapsed = () => setCollapsed((c) => { const n = !c; try { document.cookie = railCookieString(n); } catch { /* cookie indispo */ } return n; });
  // Sur écran étroit, le rail sort du flux en tiroir · un hamburger l'ouvre.
  const mobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);
  // Le contrat de navigation mobile (CDC v7 · N08) · le déclencheur et le tiroir
  // se répondent · Escape ferme, le focus entre dans le tiroir à l'ouverture et
  // revient au déclencheur à la fermeture.
  const burgerRef = useRef<HTMLButtonElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const fermerTiroir = () => { setDrawer(false); burgerRef.current?.focus(); };
  // On referme le tiroir dès qu'on navigue · sinon il masque la page qu'on vient
  // d'ouvrir.
  useEffect(() => { setDrawer(false); }, [pathname]);
  // Tiroir ouvert · Escape ferme (et rend le focus au déclencheur), et le focus
  // entre dans le panneau · au clavier seul, on n'est jamais coincé au bouton.
  useEffect(() => {
    if (!drawer) return;
    const surTouche = (e: KeyboardEvent) => {
      const dialogue = (e.target as Element | null)?.closest?.('[role="dialog"]');
      if (echapFermeTiroir({ touche: e.key, dejaTraite: e.defaultPrevented, dansAutreDialogue: !!dialogue && dialogue !== railRef.current })) fermerTiroir();
    };
    document.addEventListener('keydown', surTouche);
    railRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    return () => document.removeEventListener('keydown', surTouche);
  }, [drawer]);
  const chrome = chromeCoquille({ mobile, collapsed, drawerOuvert: drawer });
  // Écrans récents · pour reprendre une tâche d'un raccourci. Mémorisés par
  // navigateur · l'écran courant passe en tête à chaque navigation.
  const [recents, setRecents] = useState<EcranRecent[]>([]);
  useEffect(() => { try { const raw = localStorage.getItem('tt_recents'); if (raw) setRecents(JSON.parse(raw)); } catch { /* stockage indispo */ } }, []);
  useEffect(() => {
    const label = routeLabel(pathname);
    if (!label) return; // écran caché ou inconnu · on ne le mémorise pas
    setRecents((cur) => {
      const next = ajouterRecent(cur, { path: pathname, label });
      try { localStorage.setItem('tt_recents', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [pathname]);
  // Mode ADMIN+ (fondateur uniquement) : navigation + DA dédiées sur les routes plateforme.
  const onAdminPath = ADMIN_NAV.some((x) => pathname === x.href || pathname.startsWith(x.href + '/'));
  const inAdmin = isStaff && onAdminPath;

  // État actif d'un item de nav : gère les routes imbriquées, l'onglet (?tab=) et
  // l'ANCRE (#…) des marques · trois entrées « Marque » visent la même route+onglet
  // (Aperçu / Couleurs / Charte) et ne se départagent qu'à l'ancre.
  const currentTab = search.get('tab') || 'overview';
  // L'ancre courante · absente de `usePathname`/`useSearchParams`, on la suit
  // côté client. Elle part de '' (le rendu serveur n'a pas d'ancre · pas de
  // désaccord d'hydratation), puis se synchronise au montage et à chaque
  // `hashchange` (cliquer Couleurs↔Charte ne change QUE l'ancre) et à chaque
  // navigation (changer d'onglet efface l'ancre).
  const [currentHash, setCurrentHash] = useState('');
  const searchStr = search.toString();
  useEffect(() => {
    const lire = () => setCurrentHash(typeof window !== 'undefined' ? window.location.hash : '');
    lire();
    // Un `<Link>` Next qui ne change QUE l'ancre passe par `history.pushState` ·
    // AUCUN `hashchange` n'est émis (recette H4 · clic « Charte » au tiroir ·
    // l'URL portait #charte mais « Aperçu » restait allumé). On prend donc l'ancre
    // à la SOURCE · le lien cliqué (souris ou Entrée), en phase de capture, avant
    // que Next n'empêche le comportement natif. `popstate` couvre précédent/suivant.
    const surClic = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self')) return;
      const url = new URL(a.getAttribute('href') ?? '', window.location.href);
      // Rail · même chemin, autre recherche (« Veille » depuis /veille?q=…) · le
      // routeur client ne termine pas cette transition (mesuré, recette #106b) ·
      // on confie la remise à zéro au navigateur (noyau `chargementCompletRequis`).
      if (a.closest('#nav-rail') && chargementCompletRequis(window.location, url)) {
        e.preventDefault();
        window.location.assign(url.href);
        return;
      }
      if (url.origin === window.location.origin) setCurrentHash(url.hash);
      // Le tiroir mobile ne se refermait qu'au CHANGEMENT de route · un saut
      // d'ancre sur la même page (Couleurs, Charte) le laissait ouvert, par-dessus
      // la section atteinte (recette H4 · 390). Une entrée du rail cliquée le ferme.
      if (a.closest('#nav-rail')) setDrawer(false);
    };
    window.addEventListener('hashchange', lire);
    window.addEventListener('popstate', lire);
    document.addEventListener('click', surClic, true);
    return () => {
      window.removeEventListener('hashchange', lire);
      window.removeEventListener('popstate', lire);
      document.removeEventListener('click', surClic, true);
    };
  }, [pathname, searchStr]);
  // Les ancres que le rail DÉCLARE lui-même · seules celles-ci départagent
  // l'entrée nue (« Aperçu ») de ses sœurs ancrées. Aucune valeur codée en dur.
  const ancresRail = ancresDeclarees(nav.flatMap((g) => g.items.map((it) => it.href)));
  /**
   * « Je suis ICI » · exact, et un seul élément à la fois.
   *
   * Le parent d'une page ouverte était marqué actif lui aussi, avec le MÊME
   * fond que l'élément courant · deux entrées paraissaient sélectionnées, et on
   * ne savait plus laquelle on lisait. Contenir la page courante et être la page
   * courante sont deux états différents · ils ont maintenant deux rendus. La
   * règle (route + onglet + ancre) vit dans le noyau (`railEntreeActive`).
   */
  const isNavActive = (href: string, _isSub: boolean): boolean =>
    railEntreeActive(href, { pathname, tab: currentTab, hash: currentHash, ancres: ancresRail });

  /** « La branche où je suis » · le parent, sans lui voler la sélection. */
  const isNavInPath = (href: string): boolean => {
    const path = href.split('?')[0]!;
    return pathname !== path && pathname.startsWith(path + '/');
  };

  // Commandes de la palette ⌘K : navigation (rail + compte) + actions + admin.
  // Chaque commande porte un NOM d'icône du jeu premium · jamais un emoji. Les
  // items de nav/compte en ont déjà un (`it.icon`, celui du rail), les actions et
  // l'admin le déclarent en clair ci-dessous.
  // En tête de la palette · les derniers écrans visités (jamais celui où l'on
  // est déjà), pour reprendre là où on s'était arrêté.
  const recentCommands: Command[] = recents
    .filter((r) => r.path !== pathname)
    .slice(0, 5)
    .map((r) => ({ id: 'recent-' + r.path, label: r.label, group: 'Récents', href: r.path, icon: 'clock', keywords: 'récent ' + r.label }));
  const commands: Command[] = [...recentCommands];
  for (const g of nav) for (const it of g.items) commands.push({ id: 'nav-' + it.key, label: it.label, group: g.group, href: it.href, icon: it.icon, locked: it.locked, keywords: it.label });
  // Verbes d'action : lancer une tâche directement depuis ⌘K (pas seulement naviguer).
  // Lot 12 · filtrés comme le rail (`commandesOuvertes`) · un client en lecture
  // ne se voit plus proposer de générer, ni un membre de créer une marque.
  commands.push(...commandesOuvertes<Command>([
    { id: 'do-home', label: 'Accueil', group: 'Actions', href: '/dashboard', icon: 'grid', keywords: 'accueil dashboard maison home retour tableau de bord' },
    { id: 'do-ads', label: 'Générer des pubs IA', group: 'Actions', href: '/studio/ads', icon: 'sparkles', keywords: 'créer pub génération ads publicité' },
    { id: 'do-clone', label: 'Cloner une pub qui tient', group: 'Actions', href: '/studio/ads?mode=clone', icon: 'layers', keywords: 'cloner copier pub concurrent référence' },
    { id: 'do-image', label: 'Générer une image', group: 'Actions', href: '/studio/image', icon: 'image', keywords: 'image visuel produit scène' },
    { id: 'do-video', label: 'Générer une vidéo', group: 'Actions', href: '/studio/video', icon: 'film', keywords: 'vidéo animation clip' },
    { id: 'do-jarvis', label: 'Ce que Jarvis sait', group: 'Actions', href: '/jarvis', icon: 'brain', keywords: 'jarvis ia memoire accroches regles couches etat' },
    { id: 'do-inspo', label: 'Chercher dans la veille', group: 'Actions', href: '/veille', icon: 'search', keywords: 'veille concurrent recherche pub' },
    { id: 'do-scale', label: 'Voir ce qui scale', group: 'Actions', href: '/veille/scale', icon: 'trend', keywords: 'scale tendance croissance winner' },
    { id: 'act-brand', label: 'Nouvelle marque', group: 'Actions', href: '/brands/new', icon: 'plus', keywords: 'créer marque ajouter' },
  ], ouvertures));
  // Sauter à une marque de l'espace · la fiche est réservée aux admins (lot 12).
  if (canManageBrands) for (const b of brands) commands.push({ id: 'brand-' + b.id, label: b.name, group: 'Marques', href: `/brands/${b.id}`, icon: 'tag', keywords: 'marque ' + b.name });
  commands.push({ id: 'act-profile', label: 'Mon profil', group: 'Compte', href: '/profile', icon: 'user', keywords: 'profil compte photo' });
  for (const it of personalItems) commands.push({ id: 'acc-' + it.key, label: it.label, group: 'Compte', href: it.href, icon: it.icon, locked: it.locked, keywords: it.label });
  for (const it of workspaceItems) commands.push({ id: 'ws-' + it.key, label: it.label, group: 'Espace de travail', href: it.href, icon: it.icon, locked: it.locked, keywords: it.label });
  if (isStaff) {
    commands.push(
      { id: 'adm-home', label: 'ADMIN+ · Coulisses', group: 'Plateforme', href: '/admin', icon: 'gauge', keywords: 'admin backstage console' },
      { id: 'adm-fin', label: 'Finance · MRR & marges', group: 'Plateforme', href: '/admin/finance', icon: 'chart', keywords: 'mrr revenu marge chiffre' },
      { id: 'adm-signups', label: 'Inscriptions & onboarding', group: 'Plateforme', href: '/admin/signups', icon: 'users', keywords: 'inscriptions comptes profils' },
      { id: 'adm-equipe', label: 'Équipe & droits', group: 'Plateforme', href: '/admin/equipe', icon: 'lock', keywords: 'equipe role droits rubrique admin manager dev membre lecture freelance moderateur' },
      { id: 'nav-adsmap', label: 'Adsmap · carte des tests', group: 'Analyse', href: '/adsmap', icon: 'map', keywords: 'adsmap test verdict hypothese iteration batch lot' },
      { id: 'adm-plans', label: 'Formules & crédits · pilotage', group: 'Plateforme', href: '/admin/plans', icon: 'card', keywords: 'formule plan crédit offrir ajuster' },
      { id: 'adm-pay', label: 'Vérifier la chaîne de paiement', group: 'Plateforme', href: '/admin/paiement', icon: 'card', keywords: 'stripe paiement webhook prix test carte' },
      { id: 'adm-incid', label: 'Incidents techniques', group: 'Plateforme', href: '/admin/incidents', icon: 'alert', keywords: 'erreur panne echec quota fournisseur log' },
      { id: 'adm-spend', label: 'Dépense IA réelle', group: 'Plateforme', href: '/admin/depenses', icon: 'coin', keywords: 'plafond budget dollars facture anthropic fal cout reel' },
      { id: 'adm-credits', label: 'Coûts & marges', group: 'Plateforme', href: '/credits', icon: 'coin', keywords: 'crédits coût marge rentabilité' },
      { id: 'adm-intel', label: 'Intelligence marché', group: 'Plateforme', href: '/admin/intelligence', icon: 'radar', keywords: 'concurrents atria' },
      { id: 'adm-connaissances', label: 'Connaissances · ce que Jarvis lit', group: 'Plateforme', href: '/admin/connaissances', icon: 'file', keywords: 'connaissances jarvis consigne methode iteration savoir donnees' },
      { id: 'adm-console', label: 'Console', group: 'Plateforme', href: '/console', icon: 'gauge', keywords: 'console système diagnostics' },
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: chrome.colonnes, minHeight: '100vh' }}>
      <CommandPalette commands={commands} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} onSaved={profilEnregistre} init={{ name: userName, email: userEmail, avatarUrl: avatarUrl || '', hidePersonalInfo: !!hidePersonalInfo }} />
      <QuickSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={(nom) => setEspaceLocal({ valeur: nom, serveurAvant: workspaceNameServeur })} workspaceName={workspaceName} showAdvanced={workspaceItems.some((i) => i.key === 'settings')} />
      <aside ref={railRef} id="nav-rail" inert={chrome.railInerte || undefined}
        // En tiroir (mobile), le rail est une fenêtre modale nommée · le lecteur
        // d'écran l'annonce comme telle et sait qu'elle recouvre la page.
        {...(chrome.railTiroir ? { role: 'dialog' as const, 'aria-modal': true, 'aria-label': 'Navigation' } : {})}
        style={{
        background: 'var(--rail)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column',
        padding: collapsed ? '16px 10px' : '8px 12px', top: 0, height: '100vh',
        // Desktop : rail collé, inchangé. Mobile : tiroir hors-flux, glissé hors
        // écran quand fermé, au-dessus du contenu quand ouvert.
        ...(chrome.railTiroir
          ? { position: 'fixed', left: 0, width: chrome.largeurRail, zIndex: 90, transform: chrome.railVisible ? 'none' : 'translateX(-100%)', transition: 'transform .22s ease', boxShadow: chrome.railVisible ? '0 0 40px rgba(0,0,0,.55)' : 'none' }
          : { position: 'sticky' }),
      }}>
        {/* En-tête COMPACT (14 pouces) · l'identité (retour à l'accueil), la
            bascule Réduire juste à côté, puis un sélecteur d'espace DISTINCT, puis
            (plus bas) la marque et la recherche.

            Kevin, 29/09 · la bascule Réduire REVIENT en tête, en petite icône à
            côté du logo · l'ancien bouton de pied éloignait la commande de
            l'identité. Le mot « TikTrends » ne se tronque pas et ne
            chevauche pas l'icône · l'identité prend la place qu'il lui faut
            (flex 0 1 auto, sans ellipse), un ressort la sépare de l'icône. */}
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 2px 0 4px', minHeight: CIBLE_TACTILE_MIN }}>
            {/* Le logo ET le mot « TikTrends » ramènent à l'accueil · un seul lien. */}
            <Link href="/dashboard" aria-label="Accueil" title="Accueil"
              style={{ flex: '0 1 auto', minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, textDecoration: 'none' }}>
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--grad-accent)', flexShrink: 0, display: 'block' }} />
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)', whiteSpace: 'nowrap' }}>TikTrends</span>
            </Link>
            <span style={{ flex: 1 }} />
            {/* Petite icône Réduire · cible 44 réelle, infobulle + nom accessible,
                état déplié annoncé. Discrète (sans fond ni bordure). */}
            <button type="button" onClick={toggleCollapsed} title="Réduire la barre" aria-label="Réduire la barre" aria-expanded={!collapsed}
              style={{ ...collapseBtn, flex: '0 0 auto', background: 'transparent', border: 'none', color: 'var(--muted)' }}>
              <CollapseIcon dir="left" />
            </button>
          </div>
        ) : (
          // Replié (64 px) · Kevin 29/09 · le logo reste un lien ACCUEIL (comme
          // déplié), et l'expansion de la barre est une icône SÉPARÉE, empilée
          // dessous · deux cibles 44 distinctes, jamais deux gestes sur un même
          // bouton.
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <LogoHome collapsed />
            <button type="button" onClick={toggleCollapsed} title="Développer la barre" aria-label="Développer la barre" aria-expanded={false}
              style={{ ...collapseBtn, background: 'transparent', border: 'none', color: 'var(--muted)' }}>
              <CollapseIcon dir="right" />
            </button>
          </div>
        )}

        {/* Espace de travail · sélecteur DISTINCT de la marque, sur sa propre
            ligne compacte de 44 px. Le nom peut se tronquer ici, le libellé
            COMPLET se lit dans son menu (et dans l'infobulle). On ne supprime pas
            le changement d'espace. */}
        {!collapsed && (
          <div style={{ position: 'relative', marginTop: 6 }}>
            <button ref={espaceBtnRef} type="button" onClick={() => setWsMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={wsMenuOpen} title={`Espace · ${workspaceName}`}
              style={{ width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 10, border: '1px solid var(--line)', background: wsMenuOpen ? 'var(--surface)' : 'transparent', cursor: 'pointer' }}>
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--paper)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--ink-2)', flexShrink: 0 }}>{(workspaceName || '?').trim().slice(0, 1).toUpperCase()}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspaceName}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, flexShrink: 0 }}>⌄</span>
            </button>

            {/* Menu d'espace · le libellé complet s'y lit en entier (pas de coupe). */}
            {wsMenuOpen && (
              <>
                <div onClick={() => setWsMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 14px 34px -10px rgba(0,0,0,.6)', overflow: 'hidden' }}>
                  <div style={{ padding: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--grad-accent)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3, wordBreak: 'break-word' }}>{workspaceName}</span>
                      <span style={{ color: 'var(--accent-strong)', fontSize: 13, flexShrink: 0 }}>✓</span>
                    </div>
                    {workspaceItems.length > 0 && <div style={{ height: 1, background: 'var(--line)', margin: '4px 0' }} />}
                    {workspaceItems.map((it) => {
                      if (it.locked || it.soon) return <div key={it.key} style={{ ...menuItemIcon, color: 'var(--muted)', opacity: .6, cursor: 'default' }}><Icon name={it.icon} />{it.label}{it.soon && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>Bientôt</span>}</div>;
                      if (it.key === 'settings') return <button key={it.key} type="button" onClick={() => { espaceBtnRef.current?.focus(); setWsMenuOpen(false); setSettingsOpen(true); }} style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name={it.icon} />{it.label}</button>;
                      return <Link key={it.key} href={it.href} onClick={() => setWsMenuOpen(false)} style={menuItemIcon}><Icon name={it.icon} />{it.label}</Link>;
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Sélecteur de marque (masqué en mode replié ou en mode ADMIN+) */}
        {!collapsed && !inAdmin && <BrandSwitcher brands={brands} activeId={activeBrandId} canManage={canManageBrands} />}

        {/* La recherche GLOBALE a quitté le rail · elle vit dans la barre
            supérieure commune (voir le lanceur en tête du contenu). Le raccourci
            ⌘/Ctrl K reste actif partout (CommandPalette). Ici, le rail passe
            directement à la navigation · plus de pavé de recherche. */}

        {/* Navigation · rail client OU rail ADMIN+ (fondateur en coulisses) */}
        {/* Lot 15 · `minHeight: 0` · sans lui, l'élément flex refuse de rétrécir
            sous son contenu · avec un nom de marque long (sélecteur haut) les
            rubriques du bas sortaient du rail, hors d'atteinte. La liste défile. */}
        <nav aria-label="Navigation principale" style={{ marginTop: 2, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: collapsed ? 4 : (inAdmin ? 2 : 6), alignItems: collapsed ? 'center' : 'stretch', overflowY: 'auto', overflowX: 'hidden', flex: 1, minHeight: 0 }}>
          {inAdmin ? (
            <>
              {/* Retour à la vue SaaS (app) */}
              <Link href="/dashboard" title="Retour à l'app" style={collapsed
                ? { ...railIconBtn, marginBottom: 6 }
                : { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, marginBottom: 8, textDecoration: 'none', border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, fontWeight: 700 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                {!collapsed && <span>Retour à l'app</span>}
              </Link>
              {!collapsed && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '6px 10px 5px' }}>ADMIN+ · Plateforme</div>}
              {ADMIN_NAV.map((it) => {
                const active = pathname === it.href;
                return collapsed ? (
                  <Link key={it.key} href={it.href} title={it.label} style={{ ...railIconBtn, color: active ? 'var(--ink)' : 'var(--ink-2)', background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <Icon name={it.icon} />
                  </Link>
                ) : (
                  <Link key={it.key} href={it.href} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 10, fontSize: 14, fontWeight: active ? 700 : 500, color: active ? 'var(--ink)' : 'var(--ink-2)', background: active ? 'var(--accent-soft)' : 'transparent', textDecoration: 'none' }}>
                    <Icon name={it.icon} /><span>{it.label}</span>
                  </Link>
                );
              })}
            </>
          ) : collapsed
            ? nav.flatMap((grp) => branchesOf(grp.items).map((b) => {
                // En replié, il n'y a plus d'enfant à allumer · l'icône du
                // parent doit donc porter les DEUX états, sinon être sur un
                // sous-écran n'allume plus rien du tout.
                const ici = isNavActive(b.head.href, false);
                const dedans = isNavInPath(b.head.href) || b.subs.some((su) => isNavActive(su.href, true));
                const sousEcran = dedans ? b.subs.find((su) => isNavActive(su.href, true)) : undefined;
                // Un item verrouillé (plan) ou « bientôt » ne mène nulle part ·
                // en déplié il est rendu inerte (un <div>, pas de lien). Le repli
                // doit tenir la MÊME promesse : cliquer une icône grisée ne peut
                // pas partir sur « # » (un saut en haut de page qui se lit comme
                // un bug). On rend alors un <div> inerte, pas un <Link>.
                const bloque = b.head.locked || b.head.soon;
                const railStyle = {
                  ...railIconBtn,
                  color: ici || dedans ? 'var(--ink)' : 'var(--ink-2)',
                  background: ici ? 'var(--accent-soft)' : 'transparent',
                  // « Je suis dans cette branche » sans y être exactement · un
                  // liseré, pas un fond, la même distinction qu'en déplié.
                  boxShadow: !ici && dedans ? 'inset 2px 0 0 var(--accent-strong)' : 'none',
                  opacity: bloque ? .5 : 1,
                  cursor: bloque ? 'default' : 'pointer',
                };
                // Le repli masque les libellés · l'infobulle dit l'écran exact.
                // Bloqué, elle dit AUSSI pourquoi (comme en déplié), sans quoi
                // l'icône grisée reste inexpliquée.
                const titre = bloque
                  ? `${b.head.label} · ${b.head.locked ? 'Nécessite un abonnement supérieur' : 'Bientôt disponible'}`
                  : sousEcran ? `${b.head.label} · ${sousEcran.label}` : b.head.label;
                return bloque ? (
                  <div key={b.head.key} title={titre} style={railStyle}>
                    <Icon name={b.head.icon} />
                  </div>
                ) : (
                <Link key={b.head.key} href={b.head.href} title={titre} style={railStyle}>
                  <Icon name={b.head.icon} />
                </Link>
                );
              }))
            : nav.map((grp) => (
              <div key={grp.group || 'accueil'} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* « Accueil » MÈNE le rail en entrée AUTONOME · son groupe n'a pas
                    de libellé de section (chaîne vide), donc pas d'en-tête au-dessus. */}
                {grp.group && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--muted)', padding: '1px 10px 1px' }}>{grp.group}</div>}
                {branchesOf(grp.items).map((b) => {
                  // Une branche s'ouvre d'office quand on est dedans · sinon on
                  // arrive sur une page dont les voisines sont cachées.
                  const dedans = isNavActive(b.head.href, false) || isNavInPath(b.head.href)
                    || b.subs.some((su) => isNavActive(su.href, true));
                  const open = expanded[b.head.key] ?? dedans;
                  return (
                    <NavBranch
                      key={b.head.key} b={b} isActive={isNavActive} inPath={isNavInPath} open={open}
                      tactile={mobile}
                      onToggle={() => setExpanded((e) => ({ ...e, [b.head.key]: !(e[b.head.key] ?? dedans) }))}
                      onOpen={() => setExpanded((e) => ({ ...e, [b.head.key]: true }))}
                    />
                  );
                })}
              </div>
            ))}
        </nav>

        {/* La bascule Réduire/Développer a REJOINT l'en-tête (petite icône à côté
            de l'identité) · elle n'est plus au pied. En replié, c'est le logo qui
            rouvre la barre (cf. LogoHome). */}

        {/* Crédits (solde réel) · visible en direct, clic = recharge / offre */}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginBottom: 6 }}>
          <CreditsMenu balance={creditBalance} unlimited={creditsUnlimited} planLabel={planLabel} showUpgrade={showUpgrade} collapsed={collapsed} />
        </div>

        {/* Compte : chip + menu déroulant */}
        <div style={{ position: 'relative' }}>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, width: collapsed ? 240 : 'auto', right: collapsed ? 'auto' : 0, zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: 'var(--sh-lift, 0 14px 34px -10px rgba(0,0,0,.6))', overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{userName || workspaceName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
                </div>
                <div style={{ padding: 6 }}>
                  <button type="button" onClick={() => { compteBtnRef.current?.focus(); setMenuOpen(false); setProfileOpen(true); }} style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', cursor: 'pointer' }}><Icon name="user" />Mon profil</button>
                  {personalItems.map((it) => (it.locked || it.soon)
                    ? <div key={it.key} style={{ ...menuItemIcon, color: 'var(--muted)', opacity: .6, cursor: 'default' }}><Icon name={it.icon} />{it.label}{it.soon && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--warn)' }}>Bientôt</span>}</div>
                    : <Link key={it.key} href={it.href} onClick={() => setMenuOpen(false)} style={menuItemIcon}><Icon name={it.icon} />{it.label}</Link>)}

                  {/* ADMIN+ · coulisses plateforme, réservées au fondateur/staff. */}
                  {isStaff && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', margin: '8px 0 2px', borderRadius: 11, textDecoration: 'none', background: 'linear-gradient(135deg, rgba(245,166,35,.16), rgba(255,140,66,.08))', border: '1px solid rgba(245,166,35,.32)' }}>
                      <span style={{ display: 'inline-flex' }}><Icon name="gauge" size={15} /></span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#ffca6b' }}>ADMIN+ · Coulisses</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>MRR, inscriptions, console, IA maison</span>
                      </span>
                      <span style={{ color: '#ffca6b', fontSize: 13 }}>›</span>
                    </Link>
                  )}

                  <div style={{ ...menuItem, color: 'var(--muted)', opacity: .6, cursor: 'default', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>Langue<span style={{ fontSize: 11 }}>FR</span></div>
                </div>
                <form action={logout} style={{ borderTop: '1px solid var(--line)', padding: 6, margin: 0 }}>
                  <button type="submit" style={{ ...menuItemIcon, width: '100%', textAlign: 'left', border: 'none', background: 'transparent', color: '#ff9db0', cursor: 'pointer' }}><Icon name="logout" />Déconnexion</button>
                </form>
              </div>
            </>
          )}
          <button ref={compteBtnRef} type="button" onClick={() => setMenuOpen((o) => !o)} title={collapsed ? (userName || userEmail) : undefined} style={{ width: '100%', minHeight: CIBLE_TACTILE_MIN, display: 'flex', alignItems: 'center', gap: 10, padding: 6, borderRadius: 10, border: 'none', background: menuOpen ? 'var(--surface)' : 'transparent', cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
              {avatarUrl
                 
                ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (userName || userEmail).slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ lineHeight: 1.2, minWidth: 0, textAlign: 'left', flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || userEmail}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{roleLabel} · {planLabel}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{menuOpen ? '▾' : '▴'}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Voile du tiroir mobile · referme le rail quand on clique à côté. */}
      {chrome.voile && (
        <div onClick={fermerTiroir} style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(0,0,0,.5)' }} />
      )}

      <div style={{ minWidth: 0, minHeight: '100vh', ...(inAdmin ? ADMIN_CONTENT : null) }}>
        {/* Barre supérieure COMMUNE (desktop ET mobile) · Kevin 29/09 · la
            recherche GLOBALE sort du rail et vit ici, atteignable quel que soit
            l'état du rail (déplié, réduit, tiroir). Le raccourci ⌘/Ctrl K reste
            actif partout. Sur mobile, la barre porte AUSSI le hamburger (le rail
            est en tiroir) et l'identité-accueil · le hamburger reste distinct.
            La cloche de notification flotte à droite (fixed, top:16 right:20) ·
            on lui réserve la place à droite (paddingRight) pour ne pas la
            chevaucher. */}
        <header style={{ position: 'sticky', top: 0, zIndex: 70, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', paddingRight: 64, minHeight: 56, boxSizing: 'border-box', background: 'var(--rail)', borderBottom: '1px solid var(--line)' }}>
          {chrome.hamburger && (
            <>
              <button ref={burgerRef} type="button" onClick={() => setDrawer((o) => !o)} aria-label={drawer ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={drawer} aria-controls="nav-rail" style={{ width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              </button>
              <Link href="/dashboard" aria-label="Accueil" style={{ display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN, gap: 8, textDecoration: 'none', flexShrink: 0 }}>
                <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--grad-accent)', display: 'block' }} />
                <b style={{ fontSize: 15, color: 'var(--ink)' }}>TikTrends</b>
              </Link>
            </>
          )}
          {/* Recherche globale · loupe + « Rechercher » + indice ⌘K (desktop).
              Ouvre la palette · le raccourci reste global. Aucune fonction
              retirée · les recherches LOCALES (Veille, galerie) ne bougent pas. */}
          <button type="button" onClick={openCommandPalette} aria-label="Rechercher" aria-keyshortcuts="Meta+K Control+K"
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, flex: '0 1 340px', minWidth: 44 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Rechercher</span>
            {!mobile && <kbd style={{ ...kbdRail, flexShrink: 0, minWidth: 26 }}>⌘K</kbd>}
          </button>
        </header>
        <NotificationBell />
        {/* Le fil d'Ariane est posé ICI, une fois pour toutes · vingt et une pages
            portaient le leur, écrit à la main, et ils avaient divergé. */}
        <Breadcrumb brandName={brands.find((b) => b.id === activeBrandId)?.name ?? null} brandId={activeBrandId} brands={brands} />
        {children}
        {/* Le lanceur de support (bulle flottante, coin bas-droit) est une
            fonction DISTINCTE de Jarvis. Sur l'écran de conversation `/jarvis`,
            sa position fixe recouvrait le bas du bouton « Envoyer » et le bloc de
            saisie (mesuré à 390 et 360 px) · il est masqué là pour ne recouvrir
            aucun contrôle. Le support reste joignable hors saisie · page `/support`
            (et ses entrées console/erreur). Les sous-pages de Jarvis le gardent. */}
        {/* Sur les écrans denses en commandes bas-de-page (galerie de Pubs IA,
            accueil), la bulle FIXE recouvrait des contrôles au défilement
            (filtres, chat, actions) · on l'ancre dans une zone de commandes en
            PIED, qui défile avec la page. Le rail et les AUTRES routes gardent
            la bulle flottante inchangée. */}
        {supportAncre ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4px clamp(16px, 4vw, 32px) 28px' }}>
            <SupportWidget anchored firstName={(userName || 'toi').trim().split(/\s+/)[0] || 'toi'} />
          </div>
        ) : lanceurSupport === 'flottant' ? (
          <SupportWidget firstName={(userName || 'toi').trim().split(/\s+/)[0] || 'toi'} />
        ) : null}
      </div>
    </div>
  );
}

const menuItem = { display: 'block', padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' } as const;
const menuItemIcon = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', textDecoration: 'none' } as const;
// Bouton icône (rail replié) : carré centré, tooltip via title.
const railIconBtn = { width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', textDecoration: 'none', flexShrink: 0 } as const;
const collapseBtn = { width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--muted)', cursor: 'pointer' } as const;
/** Icône « replier / déplier le panneau » (barre verticale + flèche). */
function CollapseIcon({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {dir === 'left' ? <path d="M16 9l-3 3 3 3" /> : <path d="M14 9l3 3-3 3" />}
    </svg>
  );
}
const kbdRail = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, fontSize: 10, fontWeight: 700, color: 'var(--ink-2)', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4 } as const;
function pill(color: string, bg: string) {
  return { fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color, background: bg } as const;
}
