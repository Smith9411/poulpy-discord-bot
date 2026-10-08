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
const RENDER_URL = process.env.RENDER_URL || 'https://poulpy-discord-bot.onrender.com';
const PORT = process.env.PORT || 3000;

// Serveur Web pour Uptime / Diagnostic / Cloud Host
http.createServer(async (req, res) => {
  if (req.url === '/diag') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    try {
      const https = require('https');
      const testDiscord = await new Promise((resolve) => {
        const token = process.env.DISCORD_TOKEN || '';
        const options = {
          hostname: 'discord.com',
          path: '/api/v10/gateway/bot',
          method: 'GET',
          headers: {
            'Authorization': `Bot ${token}`,
            'User-Agent': 'DiscordBot (https://poulpy-coaching.vercel.app, 1.0.0)'
          }
        };
        const r = https.request(options, (resp) => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
        });
        r.on('error', (err) => resolve({ error: err.message }));
        r.setTimeout(5000, () => { r.destroy(); resolve({ error: 'Timeout 5s connecting to discord.com' }); });
        r.end();
      });

      return res.end(JSON.stringify({
        uptime: process.uptime(),
        clientStatus: client.ws?.status,
        clientReady: client.isReady(),
        testDiscord
      }, null, 2));
    } catch (e) {
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`🐙 Poulpy Discord Bot is Alive & Running 24/7 ! Status: ${client.isReady() ? 'READY' : 'CONNECTING'}`);
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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// Gestionnaires de connexion et d'erreurs
client.on('error', (err) => console.error('⚠️ Discord Client Error:', err));
client.on('warn', (warning) => console.warn('⚠️ Discord Client Warning:', warning));
client.on('shardReady', (id) => console.log(`🔌 Shard ${id} connecté à Discord Gateway !`));
process.on('unhandledRejection', (reason) => console.error('⚠️ Unhandled Rejection:', reason));
process.on('uncaughtException', (err) => console.error('⚠️ Uncaught Exception:', err));

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

// 5. Supabase Realtime & Polling Listener (Alertes de réservations fiables à 100%)
let lastKnownBookingId = null;

function listenToSupabaseBookings() {
  console.log('📡 Écoute des réservations Supabase sur la table coaching_bookings...');

  // A. Supabase Realtime WebSocket (INSERT & UPDATE)
  supabase
    .channel('discord_bot_coaching_bookings')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'coaching_bookings' },
      async (payload) => {
        const booking = payload.new;
        console.log('🚨 [Realtime] Nouvelle réservation reçue via Supabase :', booking);
        lastKnownBookingId = booking.id;
        await broadcastBookingAlert(booking);
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'coaching_bookings' },
      async (payload) => {
        const oldBooking = payload.old;
        const newBooking = payload.new;
        console.log('🔄 [Realtime] Réservation mise à jour :', newBooking);
        await broadcastBookingUpdate(oldBooking, newBooking);
      }
    )
    .subscribe();

  // B. Fallback Polling (Vérifie toutes les 15 secondes pour garantir 0 réservation manquée)
  setInterval(async () => {
    try {
      const { data: latestBookings, error } = await supabase
        .from('coaching_bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (!error && latestBookings && latestBookings.length > 0) {
        const latest = latestBookings[0];
        if (lastKnownBookingId === null) {
          lastKnownBookingId = latest.id;
        } else if (lastKnownBookingId !== latest.id) {
          console.log('🚨 [Polling Detection] Nouvelle réservation détectée :', latest);
          lastKnownBookingId = latest.id;
          await broadcastBookingAlert(latest);
        }
      }
    } catch (e) {
      console.error('Erreur polling bookings:', e.message);
    }
  }, 15000); // 15 secondes
}

// Gestion des mises à jour / déplacements / annulations
async function broadcastBookingUpdate(oldBooking, newBooking) {
  const studentName = newBooking.student_name || 'Élève';
  const studentDiscord = newBooking.student_discord || '';
  const game = newBooking.game || 'Valorant';
  const plan = newBooking.plan_name || 'Coaching';
  const date = newBooking.booking_date || '';
  const time = newBooking.booking_time || '';
  const status = newBooking.status;

  const isCancelled = status === 'cancelled' || status === 'annulé';
  const isRescheduled = oldBooking && (oldBooking.booking_date !== newBooking.booking_date || oldBooking.booking_time !== newBooking.booking_time);

  // 1. Embed pour le Coach dans #alertes-réservations
  const embed = new EmbedBuilder()
    .setTitle(isCancelled ? '🔴 RÉSERVATION ANNULÉE !' : '🟡 RÉSERVATION MODIFIÉE / DÉPLACÉE !')
    .setColor(isCancelled ? 0xef4444 : 0xeab308)
    .setThumbnail(`${SITE_URL}/logo.png`)
    .addFields(
      { name: '👤 Élève', value: `**${studentName}** (\`${studentDiscord}\`)`, inline: true },
      { name: '🎮 Jeu & Formule', value: `${game} • ${plan}`, inline: true },
      { name: '📅 Date & Heure', value: `**${date}** à **${time}**`, inline: true },
      { name: '📊 Nouveau Statut', value: `**${status || 'Mis à jour'}**`, inline: true }
    )
    .setFooter({ text: 'Poulpy Coaching System' })
    .setTimestamp();

  if (isRescheduled && oldBooking) {
    embed.addFields({ name: '⏱️ Ancien créneau', value: `${oldBooking.booking_date || ''} à ${oldBooking.booking_time || ''}` });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('📋 Gérer les réservations')
      .setURL(`${SITE_URL}/admin/bookings`)
      .setStyle(ButtonStyle.Link)
  );

  for (const guild of client.guilds.cache.values()) {
    const alertChannel = guild.channels.cache.find(
      c => c.name.includes('alertes-réservations') || c.name.includes('reservations') || c.name.includes('coach-admin')
    );
    if (alertChannel && alertChannel.isTextBased()) {
      try {
        const coachRole = guild.roles.cache.find(r => r.name === '👑・Coach Poulpy');
        const pingMention = coachRole ? `<@&${coachRole.id}>` : (guild.ownerId ? `<@${guild.ownerId}>` : '');
        await alertChannel.send({
          content: `${pingMention} ${isCancelled ? '🔴' : '🟡'} **Notification mise à jour de séance :**`,
          embeds: [embed],
          components: [row]
        });
      } catch (err) {
        console.error('Erreur envoi alerte update:', err);
      }
    }

    // 2. Notification en MP à l'élève
    const cleanHandle = studentDiscord.replace(/^@/, '').trim().toLowerCase();
    if (cleanHandle) {
      try {
        const members = await guild.members.fetch();
        const studentMember = members.find(m =>
          m.user.username.toLowerCase() === cleanHandle ||
          m.user.tag.toLowerCase() === cleanHandle ||
          m.displayName.toLowerCase() === cleanHandle ||
          m.id === cleanHandle
        );

        if (studentMember) {
          const studentEmbed = new EmbedBuilder()
            .setTitle(isCancelled ? '🔴 ANNULATION DE TA SÉANCE • POULPY COACHING' : '🟡 MODIFICATION DE TON COACHING • POULPY COACHING')
            .setColor(isCancelled ? 0xef4444 : 0xeab308)
            .setDescription(
              isCancelled
                ? `Bonjour **${studentName}**,\n\nTa séance de coaching prévue le **${date} à ${time}** a bien été **annulée**.\nPour reprendre un créneau : [Accéder au site](${SITE_URL}/#booking)`
                : `Bonjour **${studentName}** ! 🎉\n\nTa séance de coaching a été mise à jour :\n\n📅 **Nouveau créneau : ${date} à ${time}**\n🎮 **Jeu : ${game}**\n\nÀ très vite sur le vocal !`
            )
            .setTimestamp();

          const studentRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('📊 Mon Espace de Suivi')
              .setURL(`${SITE_URL}/profile/coaching`)
              .setStyle(ButtonStyle.Link)
          );

          await studentMember.send({ embeds: [studentEmbed], components: [studentRow] }).catch(() => {});
        }
      } catch (e) {
        console.error('Erreur MP student update:', e.message);
      }
    }
  }
}

async function broadcastBookingAlert(booking) {
  const studentName = booking.student_name || booking.name || 'Anonyme';
  const studentDiscord = booking.student_discord || booking.discord_username || booking.discord || 'Non renseigné';
  const studentEmail = booking.student_email || booking.email || 'Non renseigné';
  const game = booking.game || 'Non précisé';
  const plan = booking.plan_name || booking.plan || booking.session_type || 'Coaching 1h';
  const price = booking.plan_price || (booking.price ? booking.price + '€' : 'Gratuit / Payé');
  const date = booking.booking_date || booking.date || 'À planifier';
  const time = booking.booking_time || booking.time || '';
  const notes = booking.notes || booking.goals || 'Aucun objectif saisi.';

  const embed = new EmbedBuilder()
    .setTitle('🚨 NOUVELLE RÉSERVATION DE COACHING !')
    .setColor(0x06b6d4) // Cyan Poulpy
    .setThumbnail(`${SITE_URL}/logo.png`)
    .addFields(
      { name: '👤 Élève / Nom', value: `**${studentName}**`, inline: true },
      { name: '💬 Discord', value: `\`${studentDiscord}\``, inline: true },
      { name: '📧 Email', value: `\`${studentEmail}\``, inline: true },
      { name: '🎮 Jeu', value: `${game}`, inline: true },
      { name: '📦 Formule', value: `${plan}`, inline: true },
      { name: '📅 Date & Heure', value: `${date} à ${time}`, inline: true },
      { name: '💶 Prix / Statut', value: `${price} • **${booking.status || 'Confirmé'}**`, inline: true },
      { name: '🎯 Objectifs de l\'élève', value: notes }
    )
    .setFooter({ text: 'Poulpy Coaching System • poulpy-coaching.vercel.app' })
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
        const coachRole = guild.roles.cache.find(r => r.name === '👑・Coach Poulpy');
        const pingMention = coachRole ? `<@&${coachRole.id}>` : (guild.ownerId ? `<@${guild.ownerId}>` : '');
        await alertChannel.send({
          content: `${pingMention} 🚨 **Nouvelle réservation de coaching !**`,
          embeds: [embed],
          components: [row]
        });
        console.log(`✅ Alerte de réservation avec ping Coach postée dans ${guild.name} -> #${alertChannel.name}`);
      } catch (err) {
        console.error(`Impossible d'envoyer dans ${guild.name} :`, err);
      }
    }

    // 2. Recherche et notification en Message Privé (MP) de l'élève + Attribution du rôle Élève
    const cleanHandle = studentDiscord.replace(/^@/, '').trim().toLowerCase();
    if (cleanHandle && cleanHandle !== 'non renseigné') {
      try {
        const members = await guild.members.fetch();
        const studentMember = members.find(m =>
          m.user.username.toLowerCase() === cleanHandle ||
          m.user.tag.toLowerCase() === cleanHandle ||
          m.displayName.toLowerCase() === cleanHandle ||
          m.id === cleanHandle
        );

        if (studentMember) {
          console.log(`👤 Élève trouvé sur Discord : ${studentMember.user.tag} (Serveur : ${guild.name})`);

          // Attribution automatique du rôle Élève Poulpy
          const eleveRole = guild.roles.cache.find(r => r.name === '🎓・Élève Poulpy');
          if (eleveRole && !studentMember.roles.cache.has(eleveRole.id)) {
            await studentMember.roles.add(eleveRole).catch(e => console.log('Erreur ajout rôle élève:', e.message));
          }

          // Message Privé de Confirmation
          const studentEmbed = new EmbedBuilder()
            .setTitle('🐙 CONFIRMATION DE TA RÉSERVATION • POULPY COACHING')
            .setColor(0x06b6d4)
            .setDescription(
              `Salut **${studentName}** ! 🎉\n\n` +
              `Ta réservation pour une séance de coaching sur **${game}** a bien été enregistrée et confirmée avec **Poulpy**.`
            )
            .addFields(
              { name: '📦 Formule', value: `**${plan}** (${price})`, inline: true },
              { name: '📅 Date & Heure', value: `**${date}** à **${time}**`, inline: true },
              { name: '🎙️ Où se déroule le coaching ?', value: 'Sur le serveur Discord dans le salon vocal **`🎙️ Coaching 1-on-1`** (tu as désormais accès aux salons privés élèves).' },
              { name: '📝 Comment bien te préparer ?', value: '• Connecte-toi sur Discord 5 minutes avant l\'heure prévue.\n• Si tu as des VODs ou des questions, tu peux utiliser la commande `/vod` sur le serveur ou les partager dans le salon `#📁・partage-vod`.' }
            )
            .setFooter({ text: 'Poulpy Coaching • À très vite en session !' })
            .setTimestamp();

          const studentRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel('📊 Mon Espace de Suivi')
              .setURL(`${SITE_URL}/profile/coaching`)
              .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
              .setLabel('🌐 Site Web')
              .setURL(SITE_URL)
              .setStyle(ButtonStyle.Link)
          );

          await studentMember.send({ embeds: [studentEmbed], components: [studentRow] }).catch(err => {
            console.warn(`Impossible d'envoyer le MP à ${studentMember.user.tag} (DMs fermés) :`, err.message);
          });
          console.log(`✉️ MP de confirmation envoyé à l'élève : ${studentMember.user.tag}`);
        }
      } catch (err) {
        console.error('Erreur recherche membre élève pour MP:', err.message);
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
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;

      try {
        await interaction.editReply('🏗️ **1/4 - Création des rôles...**');

        // Création des Rôles
        const rolesToCreate = [
          { name: '👑・Coach Poulpy', color: 0x06b6d4, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
          { name: '🛡️・Admin', color: 0xe11d48, hoist: true, mentionable: true, permissions: [PermissionsBitField.Flags.Administrator] },
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
        const chanBienvenue = await guild.channels.create({
          name: '👋・bienvenue',
          type: ChannelType.GuildText,
          parent: catInfos.id
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

        // Donner le rôle Coach & Membre Vérifié au PROPRIÉTAIRE (Owner) du serveur
        try {
          const owner = await guild.fetchOwner();
          if (coachRole) await owner.roles.add(coachRole);
          if (membreRole) await owner.roles.add(membreRole);
          console.log(`👑 Rôle Coach attribué au Propriétaire du serveur : ${owner.user.tag}`);
        } catch (e) {
          console.log('Erreur attribution rôle coach au propriétaire:', e);
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
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        await applyServerPermissions(interaction.guild);
        await interaction.editReply('🔒 **Toutes les permissions ont été verrouillées avec succès !**\n\n- 📌 **Accueil & Infos** : Strictement en lecture seule pour les membres (les boutons restent cliquables).\n- 🎮 **Esport & Jeux** : `#apex-legends` et `#valorant` visibles uniquement par ceux qui ont choisi le jeu.\n- 🎙️ **Vocaux & Coaching** : Totalement sécurisés et réservés aux membres vérifiés / élèves.');
      } catch (err) {
        console.error('Erreur fix-permissions:', err);
        await interaction.editReply(`❌ Erreur lors de l'ajustement des permissions : \`${err.message}\``);
      }
    }

    // 3. COMMANDE /RULES
    if (commandName === 'rules') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
      await postRulesPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de règlement envoyé !', ephemeral: true });
    }

    // 4. COMMANDE /TICKET-PANEL
    if (commandName === 'ticket-panel') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
      await postTicketPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de ticket envoyé !', ephemeral: true });
    }

    // 5. COMMANDE /ROLES
    if (commandName === 'roles') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
      await postRoleSelector(interaction.channel);
      await interaction.reply({ content: '✅ Panneau de rôles envoyé !', ephemeral: true });
    }

    // 6. COMMANDE /ANNONCE
    if (commandName === 'annonce') {
      if (!interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: '⛔ Cette commande est strictement réservée à Poulpy (Admin) !', ephemeral: true });
      }
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
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      try {
        const roles = await guild.roles.fetch();
        const membreRole = roles.find(r => r.name === '⭐・Membre Vérifié');
        if (!membreRole) {
          return interaction.editReply('❌ Rôle `⭐・Membre Vérifié` introuvable. Tapez `/setup-server` d\'abord.');
        }
        if (member.roles.cache.has(membreRole.id)) {
          return interaction.editReply('✅ Tu as déjà accepté le règlement et validé ton accès !');
        }
        await member.roles.add(membreRole);
        return interaction.editReply('🎉 **Bienvenue !** Tu as accepté le règlement. Tous les salons de la communauté te sont désormais ouverts !');
      } catch (e) {
        console.error('Erreur accept rules:', e);
        return interaction.editReply('❌ Une erreur est survenue.');
      }
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
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
      const roleMapping = {
        btn_role_apex: '🔴・Apex Legends',
        btn_role_valo: '🟣・Valorant'
      };

      const roleName = roleMapping[customId];
      if (!roleName) return;

      const roles = await guild.roles.fetch();
      const role = roles.find(r => r.name === roleName);
      if (!role) {
        return interaction.editReply(`❌ Le rôle \`${roleName}\` n'existe pas encore.`);
      }

      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        await interaction.editReply(`➖ Tu n'as plus le rôle **${roleName}**.`);
      } else {
        await member.roles.add(role);
        await interaction.editReply(`➕ Tu as reçu le rôle **${roleName}** !`);
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
    if (channel.name.includes('ACCUEIL') || ['👋・bienvenue', '📜・règlement-et-accès', '📢・annonces', '🔗・liens-utiles', '🎯・choisir-ses-jeux', '📩・contacter-poulpy'].includes(channel.name)) {
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

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

// Générateur d'image de bienvenue style DraftBot
async function generateWelcomeCard(avatarUrl, username, serverName) {
  const width = 700;
  const height = 250;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond stylé sombre avec coins arrondis
  ctx.fillStyle = '#232428';
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 20);
  ctx.fill();

  // Bordure cyan Poulpy
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#06b6d4';
  ctx.stroke();

  // Photo de profil circulaire
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 125, 75, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 50, 50, 150, 150);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(125, 125, 75, 0, Math.PI * 2, true);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#06b6d4';
    ctx.stroke();
  } catch (e) {
    console.error('Erreur chargement avatar canvas:', e);
  }

  // Textes
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('Bienvenue', 240, 95);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '22px sans-serif';
  ctx.fillText('sur le serveur Discord', 240, 135);

  ctx.fillStyle = '#06b6d4';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(serverName || 'Poulpy Coaching', 240, 180);

  return canvas.toBuffer('image/png');
}

// 8. Message d'accueil automatique avec carte personnalisée dans #👋・bienvenue
client.on('guildMemberAdd', async (member) => {
  const bienvenueChannel = member.guild.channels.cache.find(
    c => c.name.includes('bienvenue')
  );
  if (bienvenueChannel && bienvenueChannel.isTextBased()) {
    try {
      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const cardBuffer = await generateWelcomeCard(avatarUrl, member.user.username, member.guild.name);
      const attachment = new AttachmentBuilder(cardBuffer, { name: 'welcome-card.png' });

      const welcomeEmbed = new EmbedBuilder()
        .setTitle('Ho ! Un nouveau membre !')
        .setColor(0xe11d48)
        .setDescription(`🎉 Bienvenue **${member.user.username}** 🎉 !\n\n👉 Va dans <#📜・règlement-et-accès> pour accepter le règlement et débloquer les salons.\n👉 Choisis tes jeux dans <#🎯・choisir-ses-jeux> !`)
        .setImage('attachment://welcome-card.png')
        .setTimestamp();

      await bienvenueChannel.send({
        content: `<@${member.id}>`,
        embeds: [welcomeEmbed],
        files: [attachment]
      });
    } catch (err) {
      console.error('Erreur envoi carte de bienvenue:', err);
    }
  }

  // 9. Vérification si le nouveau membre a déjà réservé un cours sur le site
  try {
    const cleanUsername = member.user.username.toLowerCase();
    const cleanTag = member.user.tag.toLowerCase();

    const { data: existingBookings, error } = await supabase
      .from('coaching_bookings')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false });

    if (!error && existingBookings) {
      const match = existingBookings.find(b => {
        const d = (b.student_discord || '').replace(/^@/, '').trim().toLowerCase();
        return d && (d === cleanUsername || d === cleanTag || cleanUsername.includes(d) || d.includes(cleanUsername));
      });

      if (match) {
        console.log(`🎓 Nouveau membre avec réservation existante détecté : ${member.user.tag}`);

        // Attribuer le rôle Élève
        const eleveRole = member.guild.roles.cache.find(r => r.name === '🎓・Élève Poulpy');
        if (eleveRole && !member.roles.cache.has(eleveRole.id)) {
          await member.roles.add(eleveRole).catch(console.error);
        }

        // Envoyer le MP de récapitulatif
        const recapEmbed = new EmbedBuilder()
          .setTitle('🐙 BIENVENUE SUR LE DISCORD • TON COACHING EST CONFIRMÉ')
          .setColor(0x06b6d4)
          .setDescription(
            `Salut **${match.student_name || member.user.username}** ! 🎉\n\n` +
            `Tu avais déjà réservé une séance de coaching sur **${match.game || 'Valorant'}** avant de rejoindre le serveur.`
          )
          .addFields(
            { name: '📦 Formule', value: `**${match.plan_name || 'Coaching'}**`, inline: true },
            { name: '📅 Date & Heure', value: `**${match.booking_date || ''}** à **${match.booking_time || ''}**`, inline: true },
            { name: '🎙️ Où se déroule le coaching ?', value: 'Dans le salon vocal **`🎙️ Coaching 1-on-1`** (le rôle Élève t\'a été attribué automatiquement).' }
          )
          .setFooter({ text: 'Poulpy Coaching • À très vite en session !' })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('📊 Mon Espace de Suivi')
            .setURL(`${SITE_URL}/profile/coaching`)
            .setStyle(ButtonStyle.Link)
        );

        await member.send({ embeds: [recapEmbed], components: [row] }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Erreur vérification réservation nouveau membre:', err);
  }
});

// Connexion du bot
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ ERREUR CRITIQUE: DISCORD_TOKEN est manquant dans l'environnement ! Configurez-le dans le dashboard Render (onglet Environment).");
} else {
  console.log("🔑 DISCORD_TOKEN trouvé, connexion à la passerelle Discord en cours...");
  client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log("⚡ Authentification Discord validée par les serveurs Discord !");
  }).catch(err => {
    console.error("❌ Erreur client.login :", err);
  });
}
