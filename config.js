require("dotenv").config();

/**
 * Toutes les valeurs de configuration du bot viennent des variables
 * d'environnement (Railway "Variables", ou fichier .env en local).
 * Rien n'est écrit en dur dans le code.
 */

function readVar(name, { required = false, fallback = "" } = {}) {
  const value = process.env[name];
  if (!value && required) {
    console.warn(`[NOVA TICKET] ⚠️ Variable d'environnement manquante : ${name}`);
  }
  return value || fallback;
}

const CATEGORY_IDS = {
  question: readVar("CATEGORY_QUESTION_ID", { required: true }),
  partenariat: readVar("CATEGORY_PARTENARIAT_ID", { required: true }),
  reportstaff: readVar("CATEGORY_REPORTSTAFF_ID", { required: true }),
  reportjoueur: readVar("CATEGORY_REPORTJOUEUR_ID", { required: true }),
  legal: readVar("CATEGORY_LEGAL_ID", { required: true }),
  illegal: readVar("CATEGORY_ILLEGAL_ID", { required: true }),
  fondation: readVar("CATEGORY_FONDATION_ID", { required: true }),
  unban: readVar("CATEGORY_UNBAN_ID", { required: true }),
};

const STAFF_ROLE = readVar("STAFF_ROLE_ID", { required: true });

const PING_ROLES = {
  unban: readVar("PING_ROLE_UNBAN_ID", { fallback: STAFF_ROLE }),
  legal: readVar("PING_ROLE_LEGAL_ID", { fallback: STAFF_ROLE }),
  illegal: readVar("PING_ROLE_ILLEGAL_ID", { fallback: STAFF_ROLE }),
  reportstaff: readVar("PING_ROLE_REPORTSTAFF_ID", { fallback: STAFF_ROLE }),
  partenariat: readVar("PING_ROLE_PARTENARIAT_ID", { fallback: STAFF_ROLE }),
  default: STAFF_ROLE,
};

const CATEGORY_LABELS_FR = {
  question: "Question",
  partenariat: "Partenariat",
  reportstaff: "Report-Staff",
  reportjoueur: "Report-Joueur",
  legal: "Demande-Légal",
  illegal: "Demande-Illégal",
  fondation: "Fondation",
  unban: "Demande-Unban",
};

module.exports = {
  TOKEN: readVar("DISCORD_TOKEN", { required: true }),
  THEME_COLOR: readVar("THEME_COLOR", { fallback: "#5865F2" }),
  STAFF_ROLE,
  LOG_CHANNEL: readVar("LOG_CHANNEL_ID", { required: true }),
  PING_ROLES,
  CATEGORY_IDS,
  CATEGORY_LABELS_FR,
  SERVER_NAME: readVar("SERVER_NAME", { fallback: "NOVA RP" }),
  PANEL_COMMAND: readVar("PANEL_COMMAND", { fallback: "!sendpanel" }),
};
