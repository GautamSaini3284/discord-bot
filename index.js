require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, Partials } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const PREFIX = process.env.PREFIX || '!';

// ─── Safe color: discord.js v14 needs a valid #hex string or falls back ──────
function resolveColor(hex) {
  if (!hex || typeof hex !== 'string') return '#5865F2';
  const clean = hex.trim();
  // ensure it starts with #
  return clean.startsWith('#') ? clean : `#${clean}`;
}

const EMBED_COLOR = resolveColor(process.env.EMBED_COLOR);
const ERROR_COLOR = '#FF0000';

// ─── Embed Helpers ────────────────────────────────────────────────────────────
function buildEmbed(guildName) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setFooter({ text: guildName });
  if (process.env.THUMBNAIL_URL) embed.setThumbnail(process.env.THUMBNAIL_URL);
  if (process.env.BANNER_URL) embed.setImage(process.env.BANNER_URL);
  return embed;
}

function buildErrorEmbed(guildName, title, description) {
  const embed = new EmbedBuilder()
    .setColor(ERROR_COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: guildName });
  if (process.env.THUMBNAIL_URL) embed.setThumbnail(process.env.THUMBNAIL_URL);
  if (process.env.BANNER_URL) embed.setImage(process.env.BANNER_URL);
  return embed;
}

// ─── Permission Helpers ───────────────────────────────────────────────────────
function isOwner(member) {
  return member.roles.cache.has(process.env.OWNER_ROLE_ID);
}

function hasSeller(member) {
  return member.roles.cache.has(process.env.SELLER_ROLE_ID);
}

// ─── Error handler ────────────────────────────────────────────────────────────
client.on('error', (err) => console.error('Discord client error:', err));

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`🎨 Embed color: ${EMBED_COLOR}`);
});

// ─── Message Handler ──────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  if (!message.guild) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const { guild, member, author, channel } = message;

  // ── !help ──────────────────────────────────────────────────────────────────
  if (command === 'help') {
    const embed = buildEmbed(guild.name)
      .setTitle('📋 Command List')
      .setDescription('Here are all available commands:')
      .addFields(
        {
          name: '🏷️ Seller Commands',
          value: [
            `\`${PREFIX}done <@client>\` — Send an order completion vouch`,
            `\`${PREFIX}client <@user>\` — Grant a user the Client role`,
          ].join('\n'),
        },
        {
          name: '👑 Owner Commands',
          value: [
            `\`${PREFIX}seller <@user>\` — Grant a user the Seller role`,
            `\`${PREFIX}warn <@user> <reason>\` — Warn a user in channel + DMs`,
            `\`${PREFIX}restrict <@seller>\` — Remove Seller role & add Restricted role`,
          ].join('\n'),
        },
        {
          name: '📖 General',
          value: `\`${PREFIX}help\` — Show this command list`,
        }
      );
    return channel.send({ embeds: [embed] });
  }

  // ── !done <@client> ───────────────────────────────────────────────────────
  // Seller only
  if (command === 'done') {
    if (!hasSeller(member)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Access Denied', `You need the **Seller** role to use \`${PREFIX}done\`.`)],
      });
    }

    const clientMention = message.mentions.members.first();
    if (!clientMention) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Missing Argument', `**Usage:** \`${PREFIX}done <@client>\``)],
      });
    }

    const embed = buildEmbed(guild.name)
      .setTitle('✅ Order Completed')
      .setDescription(
        `Hey ${clientMention}! 🎉\n\nThank you so much for your purchase — it was a pleasure doing business with you!\nWe hope to see you again soon. Feel free to leave a vouch if you enjoyed your experience!\n\n> **Seller:** ${author}`
      );
    return channel.send({ embeds: [embed] });
  }

  // ── !client <@user> ───────────────────────────────────────────────────────
  // Seller only
  if (command === 'client') {
    if (!hasSeller(member)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Access Denied', `You need the **Seller** role to use \`${PREFIX}client\`.`)],
      });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Missing Argument', `**Usage:** \`${PREFIX}client <@user>\``)],
      });
    }

    const clientRole = guild.roles.cache.get(process.env.CLIENT_ROLE_ID);
    if (!clientRole) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Role Not Found', 'Client role not found. Check your `.env` configuration.')],
      });
    }

    if (target.roles.cache.has(process.env.CLIENT_ROLE_ID)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Already a Client', `${target} already has the **Client** role.`)],
      });
    }

    try {
      await target.roles.add(clientRole);
    } catch {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Permission Error', "I don't have permission to manage this member's roles. Make sure my role is above the Client role.")],
      });
    }

    const embed = buildEmbed(guild.name)
      .setTitle('🎫 Client Role Assigned')
      .setDescription(`✅ Successfully made ${target} a **Client**!\n\n> **Assigned by:** ${author}`);
    return channel.send({ embeds: [embed] });
  }

  // ── !seller <@user> ───────────────────────────────────────────────────────
  // Owner only
  if (command === 'seller') {
    if (!isOwner(member)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Access Denied', `Only the **Owner** can use \`${PREFIX}seller\`.`)],
      });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Missing Argument', `**Usage:** \`${PREFIX}seller <@user>\``)],
      });
    }

    const sellerRole = guild.roles.cache.get(process.env.SELLER_ROLE_ID);
    if (!sellerRole) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Role Not Found', 'Seller role not found. Check your `.env` configuration.')],
      });
    }

    if (target.roles.cache.has(process.env.SELLER_ROLE_ID)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Already a Seller', `${target} already has the **Seller** role.`)],
      });
    }

    try {
      await target.roles.add(sellerRole);
    } catch {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Permission Error', "I don't have permission to manage this member's roles. Make sure my role is above the Seller role.")],
      });
    }

    const embed = buildEmbed(guild.name)
      .setTitle('🏷️ Seller Role Assigned')
      .setDescription(`✅ Successfully made ${target} a **Seller**!\n\n> **Assigned by:** ${author}`);
    return channel.send({ embeds: [embed] });
  }

  // ── !warn <@user> <reason> ────────────────────────────────────────────────
  // Owner only
  if (command === 'warn') {
    if (!isOwner(member)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Access Denied', `Only the **Owner** can use \`${PREFIX}warn\`.`)],
      });
    }

    const target = message.mentions.members.first();
    const reason = args.slice(1).join(' ');

    if (!target || !reason) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Missing Arguments', `**Usage:** \`${PREFIX}warn <@user> <reason>\``)],
      });
    }

    const warnEmbed = buildEmbed(guild.name)
      .setTitle('⚠️ Warning Issued')
      .setDescription(`${target} has been warned.\n\n> **Reason:** ${reason}\n> **Moderator:** ${author}`);

    await channel.send({ embeds: [warnEmbed] });

    const dmEmbed = buildEmbed(guild.name)
      .setTitle('⚠️ You Have Been Warned')
      .setDescription(
        `You have received a warning in **${guild.name}**.\n\n> **Reason:** ${reason}\n> **Moderator:** ${author.tag}`
      );

    try {
      await target.send({ embeds: [dmEmbed] });
    } catch {
      // DMs closed — skip silently
    }
    return;
  }

  // ── !restrict <@seller> ───────────────────────────────────────────────────
  // Owner only
  if (command === 'restrict') {
    if (!isOwner(member)) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Access Denied', `Only the **Owner** can use \`${PREFIX}restrict\`.`)],
      });
    }

    const target = message.mentions.members.first();
    if (!target) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '⚠️ Missing Argument', `**Usage:** \`${PREFIX}restrict <@seller>\``)],
      });
    }

    const sellerRole = guild.roles.cache.get(process.env.SELLER_ROLE_ID);
    const restrictedRole = guild.roles.cache.get(process.env.RESTRICTED_ROLE_ID);

    if (!sellerRole || !restrictedRole) {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Role Not Found', 'Seller or Restricted role not found. Check your `.env` configuration.')],
      });
    }

    try {
      if (target.roles.cache.has(process.env.SELLER_ROLE_ID)) {
        await target.roles.remove(sellerRole);
      }
      await target.roles.add(restrictedRole);
    } catch {
      return channel.send({
        embeds: [buildErrorEmbed(guild.name, '❌ Permission Error', "I don't have permission to manage this member's roles. Make sure my role is above Seller and Restricted roles.")],
      });
    }

    const embed = buildEmbed(guild.name)
      .setTitle('🔒 Seller Restricted')
      .setDescription(
        `✅ Successfully restricted ${target}.\n\n> ❌ Seller role removed\n> ✅ Restricted role assigned\n\n> **Actioned by:** ${author}`
      );
    return channel.send({ embeds: [embed] });
  }
});

client.login(process.env.TOKEN);
