# NOVA TICKET — Bot de tickets de support pour NOVA RP

Bot Discord de gestion complète des tickets de support, avec panneau à
menu déroulant, formulaires par catégorie, contrôles de ticket (claim,
lock, appel staff, ajout de membre, fermeture avec transcript), et **toute
la configuration déportée dans des variables d'environnement** (aucun ID
ni token écrit en dur dans le code).

## 🔧 Corrections apportées par rapport à la version d'origine

En reprenant le code fourni, plusieurs bugs réels ont été corrigés :

1. **`CATEGORY_IDS.unban` était identique à `CATEGORY_IDS.question`** —
   copier-coller resté par erreur, les tickets "unban" atterrissaient dans
   la catégorie "Question". Chaque catégorie a maintenant sa propre
   variable d'environnement, forcément distincte.
2. **La fonction `lock` retrouvait le créateur du ticket en reparsant le
   nom du salon** (`channel.name.split("-")`) — mais des labels comme
   `Report-Staff` ou `Demande-Légal` contiennent eux-mêmes des tirets, ce
   qui cassait complètement ce découpage et pouvait verrouiller le mauvais
   membre. L'ID du créateur est maintenant stocké directement dans le
   **topic du salon** à la création du ticket, et relu depuis là — fiable
   à 100%, plus de parsing de texte.
3. **La vérification "as-tu déjà un ticket ouvert"** comparait le nom du
   salon avec le pseudo Discord **brut**, alors que le nom du salon utilise
   une version nettoyée (`safeUser`) — les pseudos avec emoji ou caractères
   spéciaux ne déclenchaient jamais la détection de doublon. Même fix : on
   se base sur le topic, pas sur le nom.
4. **`channel.callStaffUsed = true`** modifiait directement un objet
   interne de discord.js (fragile, pas une pratique recommandée) — remplacé
   par un simple `Set` en mémoire, nettoyé automatiquement à la fermeture
   du ticket.
5. Ajout de gestion d'erreur si une catégorie n'est pas configurée (au lieu
   de planter silencieusement à la création du salon).
6. Le transcript est maintenant écrit dans le dossier temporaire du système
   (`os.tmpdir()`) plutôt que dans le dossier du projet.

## 📁 Structure du projet

```
nova-ticket-bot/
├── index.js              # Logique principale du bot
├── config.js               # Chargement et validation des variables d'environnement
├── utils/
│   └── ticketStore.js       # Stockage fiable de l'appartenance des tickets (topic du salon)
├── package.json
├── Procfile                 # Pour Railway
├── .env.example
└── .gitignore
```

## 🛠️ Étape 1 — Créer l'application Discord

1. Va sur https://discord.com/developers/applications
2. "New Application" → nomme-la **NOVA TICKET** (ou autre)
3. Onglet **Bot** → "Reset Token" → copie le token (➡️ `DISCORD_TOKEN`)
4. Aucun intent privilégié particulier n'est nécessaire au-delà de ceux
   déjà activés par défaut, SAUF si tu veux garder `MESSAGE CONTENT
   INTENT` actif (nécessaire pour que la commande `!sendpanel` fonctionne
   — active-le dans Bot > Privileged Gateway Intents)
5. Onglet **OAuth2 > URL Generator** :
   - Scopes : `bot`
   - Permissions : `Manage Channels`, `Manage Roles`, `View Channels`,
     `Send Messages`, `Embed Links`, `Attach Files`, `Read Message History`
   - Ouvre l'URL générée pour inviter le bot sur ton serveur

**Important** : le rôle du bot doit être positionné **au-dessus** du rôle
staff et de tout rôle qu'il devra gérer (permissions de salon), sinon
certaines actions échoueront silencieusement (limitation Discord).

## 🛠️ Étape 2 — Créer les catégories et récupérer les IDs

Crée une catégorie Discord pour chaque type de ticket (ou réutilise des
catégories existantes), puis avec le mode développeur activé (Paramètres >
Avancés > Mode développeur), clic droit pour copier :
- L'ID de chaque catégorie (8 au total, voir `.env.example`)
- L'ID du rôle staff
- L'ID du salon où seront envoyés les transcripts
- (Optionnel) L'ID des rôles à ping spécifiquement par type de ticket

## 🛠️ Étape 3 — Configurer les variables d'environnement

Sur Railway : onglet **Variables** de ton service → ajoute toutes les
valeurs listées dans `.env.example`. Toutes les variables `CATEGORY_*_ID`
et `STAFF_ROLE_ID` / `LOG_CHANNEL_ID` / `DISCORD_TOKEN` sont obligatoires ;
les `PING_ROLE_*_ID` sont optionnelles (repli automatique sur
`STAFF_ROLE_ID` si absentes).

## 🚀 Étape 4 — Déployer sur Railway

1. Crée un repo GitHub avec ce projet (le `.gitignore` empêche d'y inclure
   `.env`)
2. Sur [Railway](https://railway.app) : "New Project" → "Deploy from GitHub repo"
3. Vérifie que `package.json` est bien à la racine du repo
4. Ajoute toutes les variables d'environnement (étape 3 ci-dessus)
5. Railway utilise le `Procfile` pour exécuter `node index.js`

Au démarrage, le bot affiche dans les logs Railway un avertissement pour
chaque variable de catégorie manquante — vérifie qu'il n'y en a aucun
avant de considérer le déploiement terminé.

## 💬 Utilisation

- Un administrateur tape `!sendpanel` (ou la valeur de `PANEL_COMMAND`)
  dans un salon → le bot poste le menu de sélection et supprime le message
  de commande.
- Un membre sélectionne une catégorie → un formulaire s'ouvre (ou, pour
  "Report Staff", un sous-menu de sélection du membre à reporter apparaît
  d'abord).
- À la soumission, un salon de ticket privé est créé, avec un menu
  d'actions : **Claim** (staff uniquement), **Lock** (empêche l'auteur
  d'écrire), **Appel Staff** (une seule fois par ticket), **Ajouter un
  membre** (staff uniquement), **Fermer** (avec confirmation et transcript
  automatique envoyé dans `LOG_CHANNEL_ID`).

## ✏️ Personnaliser

- **Nom du serveur affiché** : variable `SERVER_NAME`
- **Couleur des embeds** : variable `THEME_COLOR`
- **Commande du panneau** : variable `PANEL_COMMAND`
- **Libellés des catégories** (français affiché dans les noms de salon et
  les embeds) : objet `CATEGORY_LABELS_FR` dans `config.js`
- **Champs des formulaires par type de ticket** : dans `index.js`, section
  "MODAL → CRÉATION DU TICKET"

## 🔧 Notes techniques

- Le rôle staff et le rôle à ping "par défaut" utilisent la même variable
  (`STAFF_ROLE_ID`). Si tu veux un rôle staff différent du rôle "ping
  question/partenariat/fondation", ajoute une variable dédiée et adapte
  `config.js`.
- La limite Discord de 25 options par menu déroulant est respectée pour le
  sous-menu de report staff (`staffMembers.first(25)`) — si ton serveur a
  plus de 25 membres avec le rôle staff, seuls les 25 premiers (par ordre
  de cache) apparaîtront. Adapte si besoin avec de la pagination.
- L'état "appel staff déjà utilisé" est stocké en mémoire (pas persistant) :
  un redémarrage du bot réinitialise ce verrou pour les tickets encore
  ouverts à ce moment-là. Impact mineur (un appel staff supplémentaire
  resterait possible après un redémarrage), non bloquant pour l'usage
  normal.
