const {
  Client,
  GatewayIntentBits,
  Partials,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

const config = require("./config");
const {
  buildTopic,
  getOwnerIdFromTopic,
  getReportedStaffIdFromTopic,
  findExistingTicket,
} = require("./utils/ticketStore");

const {
  TOKEN,
  THEME_COLOR,
  STAFF_ROLE,
  LOG_CHANNEL,
  PING_ROLES,
  CATEGORY_IDS,
  CATEGORY_LABELS_FR,
  SERVER_NAME,
  PANEL_COMMAND,
} = config;

// État en mémoire : un seul appel staff autorisé par ticket.
// (clé = ID du salon). Remplace l'ancienne pratique consistant à muter
// directement l'objet Channel de discord.js.
const callStaffUsedByChannel = new Set();

// ─────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

client.once("clientReady", () => {
  console.log(`✅ NOVA TICKET connecté en tant que ${client.user.tag}`);

  client.user.setActivity("🔗〃NOVA RP | EHRP", { type: 3 });

  const missing = Object.entries(CATEGORY_IDS).filter(([, id]) => !id);
  if (missing.length > 0) {
    console.warn(
      `[NOVA TICKET] ⚠️ Catégories non configurées : ${missing.map(([k]) => k).join(", ")}`
    );
  }
});

function errorEmbed(description) {
  return new EmbedBuilder().setColor(THEME_COLOR).setDescription(`❌ ${description}`);
}

function infoEmbed(description) {
  return new EmbedBuilder().setColor(THEME_COLOR).setDescription(description);
}

// ─────────────────────────────────────────────
// PANEL : commande définie par PANEL_COMMAND (par défaut "!sendpanel")
// ─────────────────────────────────────────────

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.content !== PANEL_COMMAND) return;
  if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket_menu")
    .setPlaceholder("Choisissez une catégorie de ticket ici !")
    .addOptions([
      { label: "— Question", value: "question", emoji: "<:Question:1522992583134019759>" },
      { label: "— Partenariat", value: "partenariat", emoji: "<:387547bluetick:1522993154398224394>" },
      { label: "— Report Staff", value: "reportstaff", emoji: "<:Staff:1522993607282393150>" },
      { label: "— Report Joueur", value: "reportjoueur", emoji: "<:hammer:1522994093645500507>" },
      { label: "— Demande Légal", value: "legal", emoji: "📘" },
      { label: "— Demande Illégal", value: "illegal", emoji: "📕" },
      { label: "— Direction", value: "fondation", emoji: "<a:17472bluecrown:1522994754336460990>" },
      { label: "— Demande d'unban", value: "unban", emoji: "<:835996webicon1:1522997678936424569>" },
    ]);

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR)
    .setTitle(`<:431007ticketicon1:1522995123258916925>〃NOVɅ — TICKET `)
    .setDescription("Sélectionne une catégorie ci-dessous pour ouvrir un ticket.");

  await message.channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
  });

  await message.delete().catch(() => {});
});

// ─────────────────────────────────────────────
// INTERACTIONS
// ─────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  try {
    // ───────── MENU PRINCIPAL → MODAL OU SOUS-MENU ─────────
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_menu") {
      const type = interaction.values[0];

      // ───────── REPORT STAFF : CHOIX DU STAFF À REPORTER ─────────
      if (type === "reportstaff") {
        // On ne re-fetch tous les membres que si le cache semble incomplet,
        // pour éviter un appel API coûteux à chaque report.
        if (interaction.guild.members.cache.size < interaction.guild.memberCount) {
          await interaction.guild.members.fetch();
        }

        const staffMembers = interaction.guild.members.cache.filter(
          (m) => m.roles.cache.has(STAFF_ROLE) && !m.user.bot
        );

        if (!staffMembers.size) {
          return interaction.reply({
            embeds: [errorEmbed("Aucun staff trouvé à reporter.")],
            ephemeral: true,
          });
        }

        const staffMenu = new StringSelectMenuBuilder()
          .setCustomId("select_report_staff")
          .setPlaceholder("<:Staff:1522993607282393150> ・ Quel staff veux-tu reporter ?")
          .addOptions(
            staffMembers.first(25).map((m) => ({
              label: m.user.tag,
              value: m.id,
            }))
          );

        return interaction.reply({
          embeds: [infoEmbed("<:431007ticketicon1:1522995123258916925> ・ Sélectionne le membre du staff que tu souhaites reporter.")],
          components: [new ActionRowBuilder().addComponents(staffMenu)],
          ephemeral: true,
        });
      }

      // ───────── AUTRES TYPES : OUVERTURE DU MODAL DIRECT ─────────
      const modal = new ModalBuilder()
        .setCustomId(`ticket_form_${type}`)
        .setTitle("🎫 ・ Création d'un ticket.");

      if (type === "reportjoueur") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_joueur")
              .setLabel("Nom du joueur")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_raison")
              .setLabel("Raison du report")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_preuve")
              .setLabel("Preuve (facultatif)")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      } else if (type === "unban") {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_unban_nom")
              .setLabel("Nom RP / Discord")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_unban_raison")
              .setLabel("Pourquoi à tu été ban, par qui, combien de temps ?")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      } else {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("ticket_details")
              .setLabel("Détails de la demande")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
      }

      return interaction.showModal(modal);
    }

    // ───────── SOUS-MENU : CHOIX DU STAFF À REPORTER ─────────
    if (interaction.isStringSelectMenu() && interaction.customId === "select_report_staff") {
      const staffId = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`ticket_form_reportstaff_${staffId}`)
        .setTitle("🛡️ Report Staff");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("ticket_raison")
            .setLabel("Raison du report")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("ticket_preuve")
            .setLabel("Preuve (facultatif)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }

    // ───────── MODAL → CRÉATION DU TICKET ─────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket_form_")) {
      let type = interaction.customId.replace("ticket_form_", "");
      let reportedStaffId = null;

      if (type.startsWith("reportstaff_")) {
        reportedStaffId = type.split("_")[1];
        type = "reportstaff";
      }

      const categoryId = CATEGORY_IDS[type];
      if (!categoryId) {
        return interaction.reply({
          embeds: [
            errorEmbed(
              `La catégorie pour ce type de ticket n'est pas configurée. Préviens un administrateur (variable Railway manquante).`
            ),
          ],
          ephemeral: true,
        });
      }

      // Vérifier si un ticket existe déjà (basé sur le topic, pas le nom)
      const existing = findExistingTicket(interaction.guild, interaction.user.id);
      if (existing) {
        return interaction.reply({
          embeds: [errorEmbed(`Tu as déjà un ticket ouvert : ${existing}`)],
          ephemeral: true,
        });
      }

      // ───────── DESCRIPTION DU TICKET ─────────
      let description;

      if (type === "reportjoueur") {
        description =
          `**Type : Report Joueur**\n` +
          `**Joueur :** ${interaction.fields.getTextInputValue("ticket_joueur")}\n` +
          `**Raison :** ${interaction.fields.getTextInputValue("ticket_raison")}\n` +
          `**Preuve :** ${interaction.fields.getTextInputValue("ticket_preuve") || "Aucune"}`;
      } else if (type === "unban") {
        description =
          `**Type : Demande d'unban**\n` +
          `**Nom :** ${interaction.fields.getTextInputValue("ticket_unban_nom")}\n` +
          `**Raison :** ${interaction.fields.getTextInputValue("ticket_unban_raison")}`;
      } else if (type === "reportstaff") {
        description =
          `**Type : Report Staff**\n` +
          `**Staff reporté :** <@${reportedStaffId}>\n` +
          `**Raison :** ${interaction.fields.getTextInputValue("ticket_raison")}\n` +
          `**Preuve :** ${interaction.fields.getTextInputValue("ticket_preuve") || "Aucune"}`;
      } else {
        description =
          `**Type : ${CATEGORY_LABELS_FR[type]}**\n` +
          `**Détails :**\n${interaction.fields.getTextInputValue("ticket_details")}`;
      }

      // ───────── PERMISSIONS DU TICKET ─────────
      const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: STAFF_ROLE,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
      ];

      if (reportedStaffId) {
        overwrites.push({
          id: reportedStaffId,
          deny: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        });
      }

      // ───────── NOM DU SALON ─────────
      const catLabel = CATEGORY_LABELS_FR[type];
      const safeUser = interaction.user.username.replace(/[^a-zA-Z0-9-_]/g, "");
      const channelName = `・🎫・${catLabel}-${safeUser || interaction.user.id}`;

      // ───────── CRÉATION DU SALON ─────────
      let channel;
      try {
        channel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId,
          topic: buildTopic({ ownerId: interaction.user.id, type, reportedStaffId }),
          permissionOverwrites: overwrites,
        });
      } catch (err) {
        console.error("[NOVA TICKET] Erreur de création du salon:", err);
        return interaction.reply({
          embeds: [
            errorEmbed(
              "Impossible de créer le salon du ticket. Vérifie que le bot a la permission « Gérer les salons » et que la catégorie configurée existe."
            ),
          ],
          ephemeral: true,
        });
      }

      // ───────── EMBED DU TICKET ─────────
      const embedTicket = new EmbedBuilder()
        .setColor(THEME_COLOR)
        .setTitle(`🟦 Bienvenue sur le support de ${SERVER_NAME} 🟦`)
        .setDescription(description)
        .setFooter({ text: "NOVA TICKET — Support" })
        .setTimestamp();

      const controlMenu = new StringSelectMenuBuilder()
        .setCustomId("ticket_controls")
        .setPlaceholder("⚙️ Actions du ticket")
        .addOptions([
          { label: "🧷 Claim", value: "claim" },
          { label: "🔒 Lock", value: "lock" },
          { label: "🔔 Appel Staff", value: "call" },
          { label: "➕ Ajouter un membre", value: "adduser" },
          { label: "🗑️ Fermer", value: "close" },
        ]);

      const pingRole = PING_ROLES[type] || PING_ROLES.default;

      await channel.send({
        content: `<@&${pingRole}> <@${interaction.user.id}>`,
        embeds: [embedTicket],
        components: [new ActionRowBuilder().addComponents(controlMenu)],
      });

      return interaction.reply({
        embeds: [infoEmbed(`🎫 Ton ticket a été créé : ${channel}`)],
        ephemeral: true,
      });
    }

    // ───────── MENU DE CONTRÔLE DU TICKET ─────────
    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_controls") {
      const action = interaction.values[0];
      const channel = interaction.channel;
      const member = interaction.member;

      // ───────── CLAIM ─────────
      if (action === "claim") {
        if (!member.roles.cache.has(STAFF_ROLE)) {
          return interaction.reply({
            embeds: [errorEmbed("Tu n'es pas staff.")],
            ephemeral: true,
          });
        }
        return interaction.reply({
          embeds: [infoEmbed(`🧷 Ticket pris en charge par <@${interaction.user.id}>.`)],
        });
      }

      // ───────── LOCK ─────────
      if (action === "lock") {
        if (!member.roles.cache.has(STAFF_ROLE)) {
          return interaction.reply({
            embeds: [errorEmbed("Tu n'as pas la permission de lock ce ticket.")],
            ephemeral: true,
          });
        }

        const ownerId = getOwnerIdFromTopic(channel.topic);
        if (ownerId) {
          await channel.permissionOverwrites.edit(ownerId, { SendMessages: false });
        }

        return interaction.reply({
          embeds: [infoEmbed("🔒 Ticket verrouillé pour l'utilisateur.")],
        });
      }

      // ───────── APPEL STAFF (UNE SEULE FOIS) ─────────
      if (action === "call") {
        if (callStaffUsedByChannel.has(channel.id)) {
          return interaction.reply({
            embeds: [errorEmbed("Un appel staff a déjà été effectué dans ce ticket.")],
            ephemeral: true,
          });
        }

        callStaffUsedByChannel.add(channel.id);

        return interaction.reply({
          embeds: [infoEmbed(`<@&${STAFF_ROLE}> 🔔 Un staff est demandé sur ce ticket.`)],
        });
      }

      // ───────── AJOUTER UN MEMBRE (STAFF UNIQUEMENT) ─────────
      if (action === "adduser") {
        if (!member.roles.cache.has(STAFF_ROLE)) {
          return interaction.reply({
            embeds: [errorEmbed("Seul un membre du staff peut ajouter quelqu'un au ticket.")],
            ephemeral: true,
          });
        }

        const modal = new ModalBuilder()
          .setCustomId("add_user_modal")
          .setTitle("➕ Ajouter un membre au ticket");

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("user_id")
              .setLabel("ID du membre à ajouter")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }

      // ───────── FERMER LE TICKET ─────────
      if (action === "close") {
        if (!member.roles.cache.has(STAFF_ROLE)) {
          return interaction.reply({
            embeds: [errorEmbed("Tu dois être staff pour fermer ce ticket.")],
            ephemeral: true,
          });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("confirm_close")
            .setLabel("Confirmer")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚠️"),
          new ButtonBuilder()
            .setCustomId("cancel_close")
            .setLabel("Annuler")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌")
        );

        return interaction.reply({
          embeds: [infoEmbed("⚠️ Es-tu sûr de vouloir fermer ce ticket ?")],
          components: [row],
        });
      }
    }

    // ───────── MODAL : AJOUT D'UN MEMBRE ─────────
    if (interaction.isModalSubmit() && interaction.customId === "add_user_modal") {
      const userId = interaction.fields.getTextInputValue("user_id").trim();

      try {
        await interaction.channel.permissionOverwrites.edit(userId, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });

        return interaction.reply({
          embeds: [infoEmbed(`➕ <@${userId}> a été ajouté au ticket.`)],
        });
      } catch (err) {
        return interaction.reply({
          embeds: [errorEmbed("Impossible d'ajouter ce membre. Vérifie l'ID.")],
          ephemeral: true,
        });
      }
    }

    // ───────── BOUTONS : FERMETURE DU TICKET ─────────
    if (interaction.isButton()) {
      if (interaction.customId === "cancel_close") {
        return interaction.update({
          embeds: [errorEmbed("Fermeture annulée.")],
          components: [],
        });
      }

      if (interaction.customId === "confirm_close") {
        await interaction.update({
          embeds: [infoEmbed("🗑️ Fermeture du ticket dans 2 secondes…")],
          components: [],
        });

        // Transcript
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = messages
          .reverse()
          .map((m) => `${m.createdAt.toISOString()} | ${m.author.tag}: ${m.content}`)
          .join("\n");

        const fileName = path.join(os.tmpdir(), `transcript-${interaction.channel.id}.txt`);
        fs.writeFileSync(fileName, transcript || "Aucun message dans ce ticket.");

        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
        if (logChannel) {
          const embedLog = new EmbedBuilder()
            .setColor(THEME_COLOR)
            .setDescription(`📄 Transcript du ticket **${interaction.channel.name}**`);

          await logChannel.send({ embeds: [embedLog], files: [fileName] }).catch((err) => {
            console.error("[NOVA TICKET] Impossible d'envoyer le transcript:", err);
          });
        }

        const channelId = interaction.channel.id;
        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
          fs.unlink(fileName, () => {});
          callStaffUsedByChannel.delete(channelId);
        }, 2000);
      }
    }
  } catch (err) {
    console.error("Erreur interaction :", err);

    try {
      if ("reply" in interaction && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed("Une erreur est survenue.")],
          ephemeral: true,
        });
      }
    } catch (_) {
      // rien de plus à faire si même la réponse d'erreur échoue
    }
  }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

if (!TOKEN) {
  console.error("[NOVA TICKET] ❌ DISCORD_TOKEN n'est pas défini. Impossible de démarrer.");
  process.exit(1);
}

client.login(TOKEN).catch((err) => {
  console.error("Erreur de connexion :", err);
  process.exit(1);
});
