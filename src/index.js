require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const http = require('http');

const SITE_URL = process.env.SITE_URL || 'https://poulpy-coaching.vercel.app';
const PORT = process.env.PORT || 3000;

// Serveur Web pour Uptime / Render / Cloud Host
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🐙 Poulpy Discord Bot is Alive & Running 24/7 !');
}).listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT}`);
});

// 1. Initialisation Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2. Initialisation Client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// Map pour suivre les salons vocaux temporaires créés
const tempVoiceChannels = new Set();

// 3. Définition des Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('setup-server')
    .setDescription('⚡ Construit TOUT le serveur Poulpy Coaching (Rôles, Salons, Règles, Tickets, Vocaux)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('fix-permissions')
    .setDescription('🔒 Ajuste et verrouille toutes les permissions des salons (Accueil en lecture seule, jeux, etc.)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('📜 Affiche le règlement officiel et le bouton de vérification')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('🎫 Affiche le panneau pour ouvrir un ticket support')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('🎯 Affiche le panneau pour choisir ses jeux (Apex & Valorant)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

  new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('📢 Publier une annonce officielle Poulpy Coaching')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addStringOption(opt =>
      opt.setName('titre')
        .setDescription('Titre de l\'annonce')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Texte complet de l\'annonce')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('mention')
        .setDescription('Mentionner le serveur ?')
        .setRequired(false)
        .addChoices(
          { name: '@everyone (Tout le serveur)', value: 'everyone' },
          { name: '@here (Membres connectés)', value: 'here' },
          { name: 'Aucune mention', value: 'none' }
        )
    ),

  new SlashCommandBuilder()
    .setName('coaching')
    .setDescription('🐙 Affiche les offres de coaching et le lien de réservation'),

  new SlashCommandBuilder()
    .setName('dispos')
    .setDescription('📅 Affiche les horaires et disponibilités de Poulpy'),

  new SlashCommandBuilder()
    .setName('vod')
    .setDescription('📹 Soumettre une VOD pour analyse et coaching')
    .addStringOption(opt =>
      opt.setName('lien')
        .setDescription('Lien YouTube, Twitch ou medal.tv de ta VOD')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('jeu')
        .setDescription('Le jeu concerné')
        .setRequired(true)
        .addChoices(
          { name: 'Apex Legends', value: 'Apex Legends' },
          { name: 'Valorant', value: 'Valorant' },
          { name: 'Aim Training (KovaaKs / Aim Lab)', value: 'Aim Training' }
        )
    )
    .addStringOption(opt =>
      opt.setName('notes')
        .setDescription('Détails : ce sur quoi tu veux progresser ou poser une question')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Vérifie la latence du bot')
];

// Enregistrement des commandes auprès de Discord (Global + Instant Guilds)
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Enregistrement des Slash Commands...');
    const body = commands.map(cmd => cmd.toJSON());

    // 1. Enregistrement global
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body }
    );

    // 2. Enregistrement instantané par serveur (contourne le cache Discord)
    for (const guild of client.guilds.cache.values()) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
          { body }
        );
        console.log(`⚡ Commandes instantanées activées sur le serveur : ${guild.name}`);
      } catch (err) {
        console.error(`Impossible d'enregistrer sur le serveur ${guild.name}:`, err);
      }
    }

    console.log('✅ Slash Commands prêtes et instantanées !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes :', error);
  }
}

// 4. Événement Ready
client.once('ready', async () => {
  console.log(`🤖 Bot connecté en tant que ${client.user.tag} !`);
  client.user.setActivity('poulpy-coaching.vercel.app', { type: 3 }); // Watching
  await registerCommands();
  listenToSupabaseBookings();
});

// 5. Supabase Realtime Listener (Alertes de réservations)
function listenToSupabaseBookings() {
  console.log('📡 Écoute en direct des réservations Supabase activée...');
  supabase
    .channel('discord_bot_bookings')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'bookings' },
      async (payload) => {
        const booking = payload.new;
        console.log('🚨 Nouvelle réservation reçue via Supabase :', booking);
        await broadcastBookingAlert(booking);
      }
    )
    .subscribe();
}

async function broadcastBookingAlert(booking) {
  const embed = new EmbedBuilder()
    .setTitle('🚨 NOUVELLE RÉSERVATION DE COACHING !')
    .setColor(0x06b6d4) // Cyan Poulpy
    .setThumbnail(`${SITE_URL}/logo.png`)
    .addFields(
      { name: '👤 Élève / Nom', value: `${booking.name || 'Anonyme'}`, inline: true },
      { name: '💬 Discord', value: `\`${booking.discord_username || booking.discord || 'Non renseigné'}\``, inline: true },
      { name: '🎮 Jeu', value: `${booking.game || 'Non précisé'}`, inline: true },
      { name: '📦 Formule', value: `${booking.plan || booking.session_type || 'Coaching 1h'}`, inline: true },
      { name: '📅 Date & Heure', value: `${booking.date || 'À planifier'} à ${booking.time || ''}`, inline: true },
      { name: '💶 Prix / Statut', value: `${booking.price ? booking.price + '€' : 'Payé'} • **${booking.status || 'Confirmé'}**`, inline: true },
      { name: '🎯 Objectifs de l\'élève', value: booking.notes || booking.goals || 'Aucun objectif saisi.' }
    )
    .setFooter({ text: 'Poulpy Coaching System' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📋 Gérer les réservations')
      .setURL(`${SITE_URL}/admin/bookings`)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('🎓 Fiches Élèves')
      .setURL(`${SITE_URL}/admin/coaching`)
      .setStyle(ButtonStyle.Link)
  );

  for (const guild of client.guilds.cache.values()) {
    const alertChannel = guild.channels.cache.find(
      c => c.name.includes('alertes-réservations') || c.name.includes('reservations') || c.name.includes('coach-admin')
    );
    if (alertChannel && alertChannel.isTextBased()) {
      try {
        await alertChannel.send({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error(`Impossible d'envoyer dans ${guild.name} :`, err);
      }
    }
  }
}

// 6. Gestion des Interactions (Commandes & Boutons)
client.on('interactionCreate', async (interaction) => {
  // --- A. GESTION DES COMMANDES SLASH ---
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    // 1. COMMANDE /SETUP-SERVER
    if (commandName === 'setup-server') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      try {
        await interaction.editReply('🏗️ **1/4 - Création des rôles...**');

        // Création des Rôles
        const rolesToCreate = [
          { name: '👑・Coach Poulpy', color: 0x06b6d4, hoist: true, mentionable: true },
          { name: '🎓・Élève Poulpy', color: 0x3b82f6, hoist: true, mentionable: true },
          { name: '⭐・Membre Vérifié', color: 0x10b981, hoist: true, mentionable: false },
          { name: '🔴・Apex Legends', color: 0xef4444, hoist: false, mentionable: true },
          { name: '🟣・Valorant', color: 0xa855f7, hoist: false, mentionable: true },
        ];

        const createdRoles = {};
        for (const r of rolesToCreate) {
          let role = guild.roles.cache.find(existing => existing.name === r.name);
          if (!role) {
            role = await guild.roles.create({
              name: r.name,
              color: r.color,
              hoist: r.hoist,
              mentionable: r.mentionable,
              reason: 'Initialisation automatique Poulpy Coaching'
            });
          }
          createdRoles[r.name] = role;
        }

        const coachRole = createdRoles['👑・Coach Poulpy'];
        const eleveRole = createdRoles['🎓・Élève Poulpy'];
        const membreRole = createdRoles['⭐・Membre Vérifié'];

        await interaction.editReply('📁 **2/4 - Création des catégories et salons...**');

        // Catégorie 1 : ACCUEIL & INFOS (Seul salon visible avant vérification)
        const catInfos = await guild.channels.create({
          name: '📌・ACCUEIL & INFOS',
          type: ChannelType.GuildCategory
        });
        const chanRegles = await guild.channels.create({
          name: '📜・règlement-et-accès',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });
        const chanAnnonces = await guild.channels.create({
          name: '📢・annonces',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });
        const chanLiens = await guild.channels.create({
          name: '🔗・liens-utiles',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });
        const chanRoles = await guild.channels.create({
          name: '🎯・choisir-ses-jeux',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });
        const chanContact = await guild.channels.create({
          name: '📩・contacter-poulpy',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });

        // Catégorie 2 : ESPORT & COMMUNAUTÉ (Visible par Membre Vérifié)
        const catEsport = await guild.channels.create({
          name: '🎮・ESPORT & COMMUNAUTÉ',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: membreRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
          ]
        });
        await guild.channels.create({ name: '💬・général', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🔥・clips-et-highlights', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🔴・apex-legends', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🟣・valorant', type: ChannelType.GuildText, parent: catEsport.id });

        // Catégorie 3 : SALONS VOCAUX & DUO DYNAMIQUE
        const catVocaux = await guild.channels.create({
          name: '🎙️・SALONS VOCAUX',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: membreRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
            }
          ]
        });
        await guild.channels.create({
          name: '➕ Créer un Salon Vocal',
          type: ChannelType.GuildVoice,
          parent: catVocaux.id
        });
        await guild.channels.create({
          name: '🔊 Chill & Aim Training',
          type: ChannelType.GuildVoice,
          parent: catVocaux.id
        });

        // Catégorie 4 : ZONE COACHING (Élèves & Coach)
        const catCoaching = await guild.channels.create({
          name: '🔒・ESPACE COACHING',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: coachRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.Connect]
            },
            {
              id: eleveRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.Connect]
            }
          ]
        });
        await guild.channels.create({
          name: '📁・partage-vod',
          type: ChannelType.GuildText,
          parent: catCoaching.id
        });
        await guild.channels.create({
          name: '📝・debrief-et-suivi',
          type: ChannelType.GuildText,
          parent: catCoaching.id
        });
        await guild.channels.create({
          name: '🎙️ Coaching 1-on-1',
          type: ChannelType.GuildVoice,
          parent: catCoaching.id
        });
        await guild.channels.create({
          name: '⏳ Salle d\'attente',
          type: ChannelType.GuildVoice,
          parent: catCoaching.id
        });

        // Catégorie 5 : ADMIN COACH (Totalement secret)
        const catAdmin = await guild.channels.create({
          name: '⚙️・ADMIN POULPY',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            },
            {
              id: coachRole.id,
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
            }
          ]
        });
        await guild.channels.create({
          name: '🚨・alertes-réservations',
          type: ChannelType.GuildText,
          parent: catAdmin.id
        });

        // Donner le rôle Coach au créateur
        try {
          const member = await guild.members.fetch(interaction.user.id);
          await member.roles.add(coachRole);
          await member.roles.add(membreRole);
        } catch (e) {
          console.log('Erreur attribution rôle coach:', e);
        }

        await interaction.editReply('📝 **3/4 - Publication des panneaux interactifs...**');

        // 1. Poster le Règlement interactif
        await postRulesPanel(chanRegles);

        // 2. Poster le Panneau de Ticket
        await postTicketPanel(chanContact);

        // 3. Poster le Sélecteur de Rôles
        await postRoleSelector(chanRoles);

        // 4. Poster les Liens Utiles
        const embedLiens = new EmbedBuilder()
          .setTitle('🔗 LIENS OFFICIELS POULPY COACHING')
          .setColor(0x06b6d4)
          .setDescription(
            'Bienvenue sur le serveur officiel de **Poulpy Coaching** !\n\n' +
            'Retrouve tous les accès rapides ci-dessous pour réserver un cours, consulter tes fiches de suivi ou lire les avis des élèves.'
          )
          .setFooter({ text: 'Optimisation Esport & Biomécanique de l\'Aim' });

        const rowLiens = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('📅 Réserver une séance')
            .setURL(`${SITE_URL}/#booking`)
            .setStyle(ButtonStyle.Link),
          new ButtonBuilder()
            .setLabel('⭐ Avis & Retours')
            .setURL(`${SITE_URL}/avis`)
            .setStyle(ButtonStyle.Link),
          new ButtonBuilder()
            .setLabel('🌐 Visiter le Site Web')
            .setURL(SITE_URL)
            .setStyle(ButtonStyle.Link)
        );
        await chanLiens.send({ embeds: [embedLiens], components: [rowLiens] });

        // Appliquer le verrouillage des permissions
        await applyServerPermissions(guild);

        await interaction.editReply('✅ **Serveur Poulpy Coaching 100 % configuré avec succès !**\n- Règlement & Anti-raid en place\n- Permissions verrouillées (Accueil en lecture seule, jeux masqués sans rôle)\n- Système de Tickets prêt\n- Vocaux dynamiques activés');
      } catch (err) {
        console.error('Erreur setup-server :', err);
        await interaction.editReply(`❌ Erreur lors du setup : \`${err.message}\``);
      }
    }

    // 2. COMMANDE /FIX-PERMISSIONS
    if (commandName === 'fix-permissions') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await applyServerPermissions(interaction.guild);
        await interaction.editReply('🔒 **Toutes les permissions ont été verrouillées avec succès !**\n\n- 📌 **Accueil & Infos** : Strictement en lecture seule pour les membres (les boutons restent cliquables).\n- 🎮 **Esport & Jeux** : `#apex-legends` et `#valorant` visibles uniquement par ceux qui ont choisi le jeu.\n- 🎙️ **Vocaux & Coaching** : Totalement sécurisés et réservés aux membres vérifiés / élèves.');
      } catch (err) {
        console.error('Erreur fix-permissions:', err);
        await interaction.editReply(`❌ Erreur lors de l'ajustement des permissions : \`${err.message}\``);
      }
    }

    // 2. COMMANDE /RULES
    if (commandName === 'rules') {
      await postRulesPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de règlement envoyé !', ephemeral: true });
    }

    // 3. COMMANDE /TICKET-PANEL
    if (commandName === 'ticket-panel') {
      await postTicketPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de ticket envoyé !', ephemeral: true });
    }

    // 4. COMMANDE /ROLES
    if (commandName === 'roles') {
      await postRoleSelector(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de rôles envoyé !', ephemeral: true });
    }

    // 5. COMMANDE /ANNONCE
    if (commandName === 'annonce') {
      const titre = interaction.options.getString('titre');
      const message = interaction.options.getString('message');
      const mention = interaction.options.getString('mention') || 'none';

      const embed = new EmbedBuilder()
        .setTitle(`📢 ${titre}`)
        .setColor(0x06b6d4)
        .setDescription(message)
        .setThumbnail(`${SITE_URL}/logo.png`)
        .setFooter({ text: 'Poulpy Coaching • Annonce Officielle' })
        .setTimestamp();

      const targetChannel = interaction.guild.channels.cache.find(c => c.name.includes('annonces')) || interaction.channel;
      
      let mentionText = '';
      if (mention === 'everyone') mentionText = '@everyone';
      if (mention === 'here') mentionText = '@here';

      await targetChannel.send({ content: mentionText || undefined, embeds: [embed] });
      await interaction.reply({ content: `✅ Annonce publiée dans <#${targetChannel.id}> !`, ephemeral: true });
    }

    // 6. COMMANDE /COACHING
    if (commandName === 'coaching') {
      const embed = new EmbedBuilder()
        .setTitle('🐙 POULPY COACHING • DEVIENS LA MEILLEURE VERSION DE TOI-MÊME')
        .setColor(0x06b6d4)
        .setDescription(
          'Coach officiel pour **Atheris Esport**, joueur haut niveau (*Predator Apex, Immortal Valorant*) et passionné d\'aim training (+1000h).\n\n' +
          'En licence STAPS et formé aux méthodes d\'optimisation de la performance (INSEP), j\'adapte les principes du sport de haut niveau à l\'e-sport :\n\n' +
          '🎯 **Analyse VOD chirurgicale & Game Sense**\n' +
          '⚡ **Biomécanique de l\'aim & Routines KovaaK\'s / Aim Lab**\n' +
          '📈 **Fiches de suivi d\'objectifs & Coaching 1-on-1**'
        )
        .addFields(
          { name: '⏱️ Séance Découverte (1h)', value: 'Diagnostic complet de ton gameplay, axes de travail prioritaires et routine personnalisée.', inline: false },
          { name: '🔥 Pack Progression (5h)', value: 'Accompagnement suivi, analyse approfondie et montée en rang garantie.', inline: false }
        )
        .setFooter({ text: 'Réservations et disponibilités en direct' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📅 Réserver une séance')
          .setURL(`${SITE_URL}/#booking`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('🌐 Visiter le Site')
          .setURL(SITE_URL)
          .setStyle(ButtonStyle.Link)
      );

      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // 7. COMMANDE /DISPOS
    if (commandName === 'dispos') {
      const embed = new EmbedBuilder()
        .setTitle('📅 DISPONIBILITÉS & CRÉNEAUX EN DIRECT')
        .setColor(0x06b6d4)
        .setDescription(
          'Les créneaux de coaching sont synchronisés en temps réel avec l\'agenda du site web.\n\n' +
          '👉 **Clique sur le bouton ci-dessous pour choisir ton jour et ton heure :**'
        )
        .setFooter({ text: 'Réservation instantanée & sécurisée' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('📅 Voir les Disponibilités & Réserver')
          .setURL(`${SITE_URL}/#booking`)
          .setStyle(ButtonStyle.Link)
      );
      await interaction.reply({ embeds: [embed], components: [row] });
    }

    // 8. COMMANDE /VOD
    if (commandName === 'vod') {
      const lien = interaction.options.getString('lien');
      const jeu = interaction.options.getString('jeu');
      const notes = interaction.options.getString('notes') || 'Aucune note particulière.';

      const embed = new EmbedBuilder()
        .setTitle(`📹 NOUVELLE VOD SOUMISE • ${jeu}`)
        .setColor(0x3b82f6)
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .addFields(
          { name: '🎮 Jeu', value: jeu, inline: true },
          { name: '🔗 Lien VOD', value: `[Cliquer ici pour regarder la vidéo](${lien})`, inline: true },
          { name: '📝 Objectifs / Remarques', value: notes }
        )
        .setTimestamp();

      await interaction.reply({ content: '✅ Ta VOD a bien été enregistrée et partagée avec Poulpy !', ephemeral: true });

      const vodChannel = interaction.guild.channels.cache.find(c => c.name.includes('partage-vod') || c.name.includes('vod'));
      if (vodChannel) {
        await vodChannel.send({ embeds: [embed] });
      }
    }

    // 9. COMMANDE /PING
    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong ! Latence : \`${client.ws.ping}ms\``, ephemeral: true });
    }
  }

  // --- B. GESTION DES BOUTONS INTERACTIFS ---
  if (interaction.isButton()) {
    const { customId, guild, member, user } = interaction;

    // 1. BOUTON D'ACCEPTATION DU RÈGLEMENT (Vérification Anti-Raid)
    if (customId === 'btn_accept_rules') {
      const membreRole = guild.roles.cache.find(r => r.name === '⭐・Membre Vérifié');
      if (!membreRole) {
        return interaction.reply({ content: '❌ Rôle introuvable. Tapez `/setup-server` d\'abord.', ephemeral: true });
      }
      if (member.roles.cache.has(membreRole.id)) {
        return interaction.reply({ content: '✅ Tu as déjà accepté le règlement et validé ton accès !', ephemeral: true });
      }
      await member.roles.add(membreRole);
      return interaction.reply({
        content: '🎉 **Bienvenue !** Tu as accepté le règlement. Tous les salons de la communauté te sont désormais ouverts !',
        ephemeral: true
      });
    }

    // 2. BOUTON CRÉATION DE TICKET
    if (customId === 'btn_open_ticket') {
      await interaction.deferReply({ ephemeral: true });

      const existingChannel = guild.channels.cache.find(c => c.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
      if (existingChannel) {
        return interaction.editReply(`⚠️ Tu as déjà un ticket ouvert dans <#${existingChannel.id}> !`);
      }

      const coachRole = guild.roles.cache.find(r => r.name === '👑・Coach Poulpy');

      let catTickets = guild.channels.cache.find(c => c.name === '🎫・TICKETS SUPPORT' && c.type === ChannelType.GuildCategory);
      if (!catTickets) {
        catTickets = await guild.channels.create({
          name: '🎫・TICKETS SUPPORT',
          type: ChannelType.GuildCategory
        });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        parent: catTickets.id,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles]
          },
          ...(coachRole ? [{
            id: coachRole.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles]
          }] : [])
        ]
      });

      const ticketEmbed = new EmbedBuilder()
        .setTitle(`🎫 SUPPORT POULPY COACHING • ${user.username}`)
        .setColor(0x06b6d4)
        .setDescription(
          `Bonjour <@${user.id}> !\n\n` +
          'Pose ta question ou décris ta demande ici. **Poulpy** te répondra dès que possible.\n\n' +
          'Une fois l\'échange terminé, clique sur le bouton ci-dessous pour fermer le ticket.'
        )
        .setFooter({ text: 'Salon privé sécurisé' })
        .setTimestamp();

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_close_ticket')
          .setLabel('🔒 Fermer le Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ content: `<@${user.id}>`, embeds: [ticketEmbed], components: [closeRow] });
      return interaction.editReply(`✅ Ton ticket privé a été créé : <#${ticketChannel.id}> !`);
    }

    // 3. BOUTON FERMETURE DE TICKET
    if (customId === 'btn_close_ticket') {
      await interaction.reply('🔒 Ce ticket sera supprimé dans **5 secondes**...');
      setTimeout(async () => {
        try {
          await interaction.channel.delete('Ticket résolu');
        } catch (e) {
          console.error('Erreur suppression salon ticket:', e);
        }
      }, 5000);
      return;
    }

    // 4. BOUTONS DE CHOIX DE RÔLES (Apex & Valo)
    if (customId.startsWith('btn_role_')) {
      const roleMapping = {
        btn_role_apex: '🔴・Apex Legends',
        btn_role_valo: '🟣・Valorant'
      };

      const roleName = roleMapping[customId];
      if (!roleName) return;

      const role = guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        return interaction.reply({ content: `❌ Le rôle \`${roleName}\` n'existe pas encore.`, ephemeral: true });
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.reply({ content: `➖ Tu n'as plus le rôle **${roleName}**.`, ephemeral: true });
      } else {
        await member.roles.add(role);
        await interaction.reply({ content: `➕ Tu as reçu le rôle **${roleName}** !`, ephemeral: true });
      }
    }
  }
});

// 7. Gestionnaire des Salons Vocaux Temporaires ("Join to Create")
client.on('voiceStateUpdate', async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;

  // A. L'utilisateur rejoint le salon déclencheur "➕ Créer un Salon Vocal"
  if (newState.channel && newState.channel.name === '➕ Créer un Salon Vocal') {
    try {
      const member = newState.member;
      const category = newState.channel.parent;

      const tempChannel = await guild.channels.create({
        name: `🔊・Duo de ${member.displayName}`,
        type: ChannelType.GuildVoice,
        parent: category ? category.id : undefined,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers]
          }
        ]
      });

      tempVoiceChannels.add(tempChannel.id);
      await member.voice.setChannel(tempChannel);
    } catch (err) {
      console.error('Erreur création vocal temporaire:', err);
    }
  }

  // B. Nettoyage : si un salon vocal temporaire devient vide, on le supprime
  if (oldState.channel && tempVoiceChannels.has(oldState.channel.id)) {
    if (oldState.channel.members.size === 0) {
      tempVoiceChannels.delete(oldState.channel.id);
      try {
        await oldState.channel.delete('Salon vocal temporaire vide');
      } catch (err) {
        console.error('Erreur suppression vocal temporaire:', err);
      }
    }
  }
});

// Helper pour poster le règlement interactif
async function postRulesPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('📜 RÈGLEMENT DE LA COMMUNAUTÉ POULPY')
    .setColor(0x06b6d4)
    .setDescription(
      'Bienvenue chez **Poulpy Coaching** ! Pour maintenir un environnement sain et propice à la progression, merci de respecter ces règles simples :\n\n' +
      '**1. 🤝 Respect & Bienveillance**\n' +
      'Aucun propos toxique, haineux, raciste ou discriminant. L\'entraide est la priorité.\n\n' +
      '**2. 🚫 Pas de Spam ni de Publicité**\n' +
      'Les liens d\'invitation vers d\'autres serveurs et la pub en MP sont strictement interdits.\n\n' +
      '**3. 🎯 Fair-Play & Esprit Compétitif**\n' +
      'Partage de clips, recherche de coéquipiers et discussions constructives.\n\n' +
      '**4. 🔒 Respect des Espaces Coaching**\n' +
      'Les salons réservés aux élèves sont des espaces privés et bienveillants.\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '👉 **Clique sur le bouton vert ci-dessous pour accepter le règlement et débloquer l\'accès à l\'ensemble du serveur !**'
    )
    .setFooter({ text: 'Système de vérification automatique Poulpy' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_accept_rules')
      .setLabel('✅ J\'ai lu et j\'accepte le règlement')
      .setStyle(ButtonStyle.Success)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// Helper pour poster le panneau de Ticket Support
async function postTicketPanel(channel) {
  const embed = new EmbedBuilder()
    .setTitle('📩 CONTACTER POULPY / SUPPORT')
    .setColor(0x06b6d4)
    .setDescription(
      'Tu as une question sur les coachings, un besoin sur-mesure ou une demande particulière ?\n\n' +
      '👉 **Clique sur le bouton ci-dessous pour ouvrir un salon privé direct avec Poulpy !**'
    )
    .setFooter({ text: 'Réponse rapide & échange personnalisé' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_ticket')
      .setLabel('🎫 Ouvrir un Ticket Support')
      .setEmoji('📩')
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// Helper pour poster le panneau de rôles (Apex & Valo)
async function postRoleSelector(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎯 CHOISIS TES JEUX')
    .setColor(0x06b6d4)
    .setDescription(
      'Clique sur les boutons ci-dessous pour débloquer l\'accès aux salons dédiés à tes jeux !\n\n' +
      '🔴 **Apex Legends**\n' +
      '🟣 **Valorant**'
    )
    .setFooter({ text: 'Clique à nouveau sur un bouton pour retirer le rôle.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_role_apex').setLabel('Apex Legends').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_role_valo').setLabel('Valorant').setEmoji('🟣').setStyle(ButtonStyle.Primary)
  );

  await channel.send({ embeds: [embed], components: [row] });
}

// Helper pour verrouiller et ajuster précisément toutes les permissions du serveur
async function applyServerPermissions(guild) {
  const roles = await guild.roles.fetch();
  const coachRole = roles.find(r => r.name === '👑・Coach Poulpy');
  const eleveRole = roles.find(r => r.name === '🎓・Élève Poulpy');
  const membreRole = roles.find(r => r.name === '⭐・Membre Vérifié');
  const apexRole = roles.find(r => r.name === '🔴・Apex Legends');
  const valoRole = roles.find(r => r.name === '🟣・Valorant');
  const everyone = guild.roles.everyone;

  const channels = await guild.channels.fetch();

  for (const [, channel] of channels) {
    if (!channel) continue;

    // 1. Catégorie & Salons ACCUEIL & INFOS
    // Règle : @everyone peut voir et lire les messages et cliquer sur les boutons, mais NE PEUT PAS écrire
    if (channel.name.includes('ACCUEIL') || ['📜・règlement-et-accès', '📢・annonces', '🔗・liens-utiles', '🎯・choisir-ses-jeux', '📩・contacter-poulpy'].includes(channel.name)) {
      await channel.permissionOverwrites.edit(everyone, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        AddReactions: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false
      }).catch(() => {});

      if (coachRole) {
        await channel.permissionOverwrites.edit(coachRole, {
          ViewChannel: true,
          SendMessages: true,
          ManageMessages: true,
          EmbedLinks: true,
          AttachFiles: true
        }).catch(() => {});
      }
    }

    // 2. Salons Spécifiques par Jeu
    // #🔴・apex-legends : Visible uniquement si rôle Apex Legends
    if (channel.name === '🔴・apex-legends') {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) await channel.permissionOverwrites.edit(membreRole, { ViewChannel: false }).catch(() => {});
      if (apexRole) {
        await channel.permissionOverwrites.edit(apexRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        }).catch(() => {});
      }
    }

    // #🟣・valorant : Visible uniquement si rôle Valorant
    if (channel.name === '🟣・valorant') {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) await channel.permissionOverwrites.edit(membreRole, { ViewChannel: false }).catch(() => {});
      if (valoRole) {
        await channel.permissionOverwrites.edit(valoRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        }).catch(() => {});
      }
    }

    // 3. Salons Généraux Communauté (#💬・général, #🔥・clips-et-highlights)
    if (['💬・général', '🔥・clips-et-highlights'].includes(channel.name)) {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) {
        await channel.permissionOverwrites.edit(membreRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true
        }).catch(() => {});
      }
    }

    // 4. Salons Vocaux
    if (channel.name === '➕ Créer un Salon Vocal' || channel.name === '🔊 Chill & Aim Training') {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) {
        await channel.permissionOverwrites.edit(membreRole, {
          ViewChannel: true,
          Connect: true,
          Speak: true
        }).catch(() => {});
      }
    }

    // 5. Zone Coaching (Élèves & Coach uniquement)
    if (['📁・partage-vod', '📝・debrief-et-suivi', '🎙️ Coaching 1-on-1', '⏳ Salle d\'attente'].includes(channel.name)) {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) await channel.permissionOverwrites.edit(membreRole, { ViewChannel: false }).catch(() => {});
      if (eleveRole) {
        await channel.permissionOverwrites.edit(eleveRole, {
          ViewChannel: true,
          SendMessages: true,
          Connect: true,
          Speak: true,
          AttachFiles: true
        }).catch(() => {});
      }
      if (coachRole) {
        await channel.permissionOverwrites.edit(coachRole, {
          ViewChannel: true,
          SendMessages: true,
          Connect: true,
          Speak: true,
          ManageChannels: true
        }).catch(() => {});
      }
    }

    // 6. Admin Poulpy (Secret)
    if (channel.name === '🚨・alertes-réservations') {
      await channel.permissionOverwrites.edit(everyone, { ViewChannel: false }).catch(() => {});
      if (membreRole) await channel.permissionOverwrites.edit(membreRole, { ViewChannel: false }).catch(() => {});
      if (eleveRole) await channel.permissionOverwrites.edit(eleveRole, { ViewChannel: false }).catch(() => {});
      if (coachRole) {
        await channel.permissionOverwrites.edit(coachRole, {
          ViewChannel: true,
          SendMessages: true
        }).catch(() => {});
      }
    }
  }
}

// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
