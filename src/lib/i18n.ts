export type Locale = "en" | "fr" | "ar";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "fr", "ar"] as const;

export function normalizeLocale(raw: string | undefined | null): Locale {
  if (!raw) return "en";
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("ar")) return "ar";
  return "en";
}

export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export type WorkspaceCopy = {
  // Workspaces & Switcher
  fanWorkspaceBadge: string;
  studioWorkspaceBadge: string;
  ownerWorkspaceBadge: string;
  switchToFanView: string;
  switchToCreatorStudio: string;
  fanRoleBadge: string;
  creatorStudioRoleBadge: string;
  ownerRoleBadge: string;
  signOut: string;
  notifications: string;
  // Fan View Navigation (5 primary destinations)
  fanNav: {
    home: string;
    explore: string;
    messages: string;
    myAccess: string;
    account: string;
    inviteFriends: string;
    applyCreator: string;
  };
  // Creator Studio Navigation (11 destinations)
  studioNav: {
    overview: string;
    posts: string;
    mediaVault: string;
    inbox: string;
    blasts: string;
    members: string;
    tiers: string;
    earnings: string;
    referrals: string;
    notifications: string;
    settings: string;
    participants: string;
  };
  // Sidebar footers
  fanSanctuaryTitle: string;
  fanSanctuaryBody: string;
  studioSanctuaryTitle: string;
  studioSanctuaryBody: string;
};

const DICTIONARY: Record<Locale, WorkspaceCopy> = {
  en: {
    fanWorkspaceBadge: "Fan View",
    studioWorkspaceBadge: "Creator Studio",
    ownerWorkspaceBadge: "Owner Console",
    switchToFanView: "Switch to Fan View",
    switchToCreatorStudio: "Switch to Creator Studio",
    fanRoleBadge: "FAN",
    creatorStudioRoleBadge: "CREATOR STUDIO",
    ownerRoleBadge: "OWNER",
    signOut: "Sign out",
    notifications: "Notifications",
    fanNav: {
      home: "Home",
      explore: "Explore",
      messages: "Messages",
      myAccess: "My Access",
      account: "Account",
      inviteFriends: "Invite fans",
      applyCreator: "Apply to become a creator",
    },
    studioNav: {
      overview: "Overview",
      posts: "Posts",
      mediaVault: "Media Vault",
      inbox: "Inbox",
      blasts: "Blasts",
      members: "Members",
      tiers: "Tiers",
      earnings: "Earnings",
      referrals: "Referrals",
      notifications: "Notifications",
      settings: "Settings",
      participants: "Participants",
    },
    fanSanctuaryTitle: "Fan Sanctuary",
    fanSanctuaryBody: "Subscriptions, unlocked posts, and unlocked messages stay available in My Access.",
    studioSanctuaryTitle: "Creator Studio",
    studioSanctuaryBody: "Manage your posts, Media Vault, member inbox, earnings, and referrals.",
  },
  fr: {
    fanWorkspaceBadge: "Espace Fan",
    studioWorkspaceBadge: "Studio Créateur",
    ownerWorkspaceBadge: "Console Propriétaire",
    switchToFanView: "Passer à l'Espace Fan",
    switchToCreatorStudio: "Passer au Studio Créateur",
    fanRoleBadge: "FAN",
    creatorStudioRoleBadge: "STUDIO CRÉATEUR",
    ownerRoleBadge: "PROPRIÉTAIRE",
    signOut: "Déconnexion",
    notifications: "Notifications",
    fanNav: {
      home: "Accueil",
      explore: "Explorer",
      messages: "Messages",
      myAccess: "Mes Accès",
      account: "Compte",
      inviteFriends: "Inviter des fans",
      applyCreator: "Devenir créatrice",
    },
    studioNav: {
      overview: "Aperçu",
      posts: "Publications",
      mediaVault: "Coffre Média",
      inbox: "Boîte de réception",
      blasts: "Diffusions",
      members: "Membres",
      tiers: "Abonnements",
      earnings: "Revenus",
      referrals: "Parrainages",
      notifications: "Notifications",
      settings: "Paramètres",
      participants: "Participants",
    },
    fanSanctuaryTitle: "Sanctuaire Membre",
    fanSanctuaryBody: "Vos abonnements, publications débloquées et messages privés restent dans Mes Accès.",
    studioSanctuaryTitle: "Studio Créateur",
    studioSanctuaryBody: "Gérez vos publications, votre Coffre Média, votre messagerie, vos revenus et parrainages.",
  },
  ar: {
    fanWorkspaceBadge: "واجهة المعجبين",
    studioWorkspaceBadge: "استوديو الفنانة",
    ownerWorkspaceBadge: "لوحة المالك",
    switchToFanView: "التبديل إلى واجهة المعجبين",
    switchToCreatorStudio: "التبديل إلى استوديو الفنانة",
    fanRoleBadge: "معجب",
    creatorStudioRoleBadge: "استوديو الفنانة",
    ownerRoleBadge: "المالك",
    signOut: "تسجيل الخروج",
    notifications: "الإشعارات",
    fanNav: {
      home: "الرئيسية",
      explore: "استكشاف",
      messages: "الرسائل",
      myAccess: "مشترياتي واشتراكاتي",
      account: "الحساب",
      inviteFriends: "دعوة معجبين",
      applyCreator: "التقديم كفنانة",
    },
    studioNav: {
      overview: "نظرة عامة",
      posts: "المنشورات",
      mediaVault: "خزنة الوسائط",
      inbox: "صندوق الوارد",
      blasts: "الرسائل الجماعية",
      members: "الأعضاء",
      tiers: "الباقات",
      earnings: "الأرباح",
      referrals: "الإحالات والدعوات",
      notifications: "التنبيهات",
      settings: "الإعدادات",
      participants: "المشاركون",
    },
    fanSanctuaryTitle: "مساحة الأعضاء",
    fanSanctuaryBody: "جميع اشتراكاتك والمنشورات والرسائل المفتوحة متاحة دائماً في مشترياتي.",
    studioSanctuaryTitle: "استوديو الفنانة",
    studioSanctuaryBody: "إدارة المنشورات، خزنة الوسائط، رسائل الأعضاء، الأرباح، وروابط الإحالة.",
  },
};

export function getWorkspaceCopy(locale: Locale = "en"): WorkspaceCopy {
  return DICTIONARY[locale] ?? DICTIONARY.en;
}

