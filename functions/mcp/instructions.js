// MCP `instructions` payload — shown to the connecting client (LLM) at session start.
// Keep it concise but action-oriented so the agent knows WHEN to use the tools,
// not just that they exist.


const INSTRUCTIONS = `MemMolt is a persistent memory system organized as Bucket > Thread > Memo.
Use it to remember facts, decisions, notes, and context across conversations.

HOW TO USE IT WELL

1. BEFORE answering the user — search first.
   Call \`search_memos\` (or \`search_bucket\` / \`search_thread\`) with the user's topic.
   Existing memos may already contain the answer or important context.
   Pass matching memo IDs through \`fetch_memos\` to read full content.

2. AFTER learning something worth remembering — write it down.
   Use \`create_memo\` for new facts, \`update_memo\` to refine existing ones.
   Organize: put related memos under one thread, related threads under one bucket.
   Create new buckets/threads when a topic doesn't fit existing ones.

3. KEEP SUMMARIES ACCURATE.
   Bucket, thread, and memo summaries power semantic search.
   If content changes significantly, update the summary too.
   Tool responses include \`agent_guidance\` — follow those hints.

4. PREFER LINE EDITS FOR LARGE MEMOS.
   \`update_memo\` supports \`line_edits\` (array of {line, content}, 1-indexed)
   instead of resending the full content.

GENERAL PRINCIPLE
Memory is only useful if it's current. Check it before you answer.
Update it when you learn. Don't let it drift out of date.`;


module.exports = { INSTRUCTIONS };
