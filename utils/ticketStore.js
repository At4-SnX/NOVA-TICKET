/**
 * Au lieu de retrouver le créateur d'un ticket en reparsant le nom du
 * salon (fragile : les labels de catégorie comme "Report-Staff" ou
 * "Demande-Légal" contiennent eux-mêmes des tirets, ce qui cassait le
 * découpage), on stocke l'ID du créateur directement dans le topic du
 * salon à sa création. Beaucoup plus fiable.
 */

const OWNER_REGEX = /ticket-owner:(\d+)/;
const TYPE_REGEX = /ticket-type:([a-zA-Z]+)/;
const REPORTED_REGEX = /ticket-reported:(\d+)/;

function buildTopic({ ownerId, type, reportedStaffId = null }) {
  let topic = `ticket-owner:${ownerId}|ticket-type:${type}`;
  if (reportedStaffId) {
    topic += `|ticket-reported:${reportedStaffId}`;
  }
  return topic;
}

function getOwnerIdFromTopic(topic) {
  if (!topic) return null;
  const match = topic.match(OWNER_REGEX);
  return match ? match[1] : null;
}

function getTypeFromTopic(topic) {
  if (!topic) return null;
  const match = topic.match(TYPE_REGEX);
  return match ? match[1] : null;
}

function getReportedStaffIdFromTopic(topic) {
  if (!topic) return null;
  const match = topic.match(REPORTED_REGEX);
  return match ? match[1] : null;
}

/**
 * Cherche un ticket déjà ouvert par ce membre, en se basant sur le topic
 * des salons (et non plus sur le nom).
 */
function findExistingTicket(guild, ownerId) {
  return guild.channels.cache.find((c) => getOwnerIdFromTopic(c.topic) === ownerId);
}

module.exports = {
  buildTopic,
  getOwnerIdFromTopic,
  getTypeFromTopic,
  getReportedStaffIdFromTopic,
  findExistingTicket,
};
