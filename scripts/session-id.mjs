// Codex thread IDs are canonical UUIDs. Reject malformed IDs before dispatch;
// a typo must never silently create an unrelated, uncached conversation.
export const conversationIdPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
const canonical = new RegExp(conversationIdPattern);
export const isConversationId = value => typeof value === 'string' && canonical.test(value);
