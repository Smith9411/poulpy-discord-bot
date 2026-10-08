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
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// 3. Définition des Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('setup-server')
    .setDescription('⚡ Crée automatiquement toute la structure du serveur Poulpy Coaching (Admin uniquement)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('🎯 Affiche le panneau interactif pour choisir ses rôles (Apex & Valorant)')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles),

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

// Enregistrement des commandes auprès de Discord
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('🔄 Enregistrement des Slash Commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash Commands enregistrées avec succès !');
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

  // Parcourir tous les serveurs où se trouve le bot pour trouver le salon d'alerte
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
        await interaction.editReply('🏗️ **Création des rôles en cours...**');

        // Création des Rôles (Apex & Valo uniquement)
        const rolesToCreate = [
          { name: '👑・Coach Poulpy', color: 0x06b6d4, hoist: true, mentionable: true },
          { name: '🎓・Élève Poulpy', color: 0x3b82f6, hoist: true, mentionable: true },
          { name: '⭐・VIP / Follower', color: 0xeab308, hoist: true, mentionable: false },
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

        await interaction.editReply('📁 **Création des catégories et salons...**');

        // Catégorie 1 : ACCUEIL & INFOS
        const catInfos = await guild.channels.create({
          name: '📌・ACCUEIL & INFOS',
          type: ChannelType.GuildCategory
        });
        await guild.channels.create({
          name: '📢・annonces',
          type: ChannelType.GuildText,
          parent: catInfos.id
        });
        await guild.channels.create({
          name: '📜・règlement',
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

        // Catégorie 2 : ESPORT & COMMUNAUTÉ (Apex & Valo uniquement)
        const catEsport = await guild.channels.create({
          name: '🎮・ESPORT & COMMUNAUTÉ',
          type: ChannelType.GuildCategory
        });
        await guild.channels.create({ name: '💬・général', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🔥・clips-et-highlights', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🔴・apex-legends', type: ChannelType.GuildText, parent: catEsport.id });
        await guild.channels.create({ name: '🟣・valorant', type: ChannelType.GuildText, parent: catEsport.id });

        // Catégorie 3 : ZONE COACHING (Élèves & Coach)
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

        // Catégorie 4 : ADMIN COACH (Totalement secret)
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
        } catch (e) {
          console.log('Erreur attribution rôle coach:', e);
        }

        // Poster le message des rôles
        await postRoleSelector(chanRoles);

        // Poster le message des liens utiles épuré
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

        await interaction.editReply('✅ **Serveur Poulpy Coaching entièrement configuré avec succès !** Tous les salons, rôles (Apex & Valorant) et permissions sont prêts.');
      } catch (err) {
        console.error('Erreur setup-server :', err);
        await interaction.editReply(`❌ Erreur lors du setup : \`${err.message}\``);
      }
    }

    // 2. COMMANDE /ROLES
    if (commandName === 'roles') {
      await postRoleSelector(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de rôles envoyé !', ephemeral: true });
    }

    // 3. COMMANDE /COACHING
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

    // 4. COMMANDE /DISPOS
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

    // 5. COMMANDE /VOD
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

      // Envoi dans le salon partage-vod si présent
      const vodChannel = interaction.guild.channels.cache.find(c => c.name.includes('partage-vod') || c.name.includes('vod'));
      if (vodChannel) {
        await vodChannel.send({ embeds: [embed] });
      }
    }

    // 6. COMMANDE /PING
    if (commandName === 'ping') {
      await interaction.reply({ content: `🏓 Pong ! Latence : \`${client.ws.ping}ms\``, ephemeral: true });
    }
  }

  // --- B. GESTION DES BOUTONS DE RÔLES INTERACTIFS ---
  if (interaction.isButton()) {
    const customId = interaction.customId;
    if (customId.startsWith('btn_role_')) {
      const roleMapping = {
        btn_role_apex: '🔴・Apex Legends',
        btn_role_valo: '🟣・Valorant'
      };

      const roleName = roleMapping[customId];
      if (!roleName) return;

      const role = interaction.guild.roles.cache.find(r => r.name === roleName);
      if (!role) {
        return interaction.reply({ content: `❌ Le rôle \`${roleName}\` n'existe pas encore sur ce serveur.`, ephemeral: true });
      }

      const member = interaction.member;
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

// Helper pour poster le panneau de rôles (Apex & Valo uniquement)
async function postRoleSelector(channel) {
  const embed = new EmbedBuilder()
    .setTitle('🎯 CHOISIS TES JEUX & INTÉRÊTS')
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

// 7. Message d'accueil pour les nouveaux membres
client.on('guildMemberAdd', async (member) => {
  const generalChannel = member.guild.channels.cache.find(
    c => c.name.includes('général') || c.name.includes('general') || c.name.includes('bienvenue')
  );
  if (generalChannel && generalChannel.isTextBased()) {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('👋 BIENVENUE SUR POULPY COACHING !')
      .setColor(0x06b6d4)
      .setDescription(
        `Bienvenue <@${member.id}> dans la communauté !\n\n` +
        '👉 Va dans <#choisir-ses-jeux> pour sélectionner tes jeux (Apex / Valorant).\n' +
        '👉 Découvre les formules et réserve ta séance avec le bouton ci-dessous !'
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('🌐 Découvrir le site & réserver')
        .setURL(SITE_URL)
        .setStyle(ButtonStyle.Link)
    );

    await generalChannel.send({ embeds: [welcomeEmbed], components: [row] });
  }
});

// Connexion du bot
client.login(process.env.DISCORD_TOKEN);
