// functions/mcp/memoTools.js
const { searchMemos } = require('../memory/memos/search');
const { fetchMemos } = require('../memory/memos/fetch');
const { createMemo } = require('../memory/memos/create');
const { updateMemo } = require('../memory/memos/update');
const { deleteMemo } = require('../memory/memos/delete');
const { moveMemo } = require('../memory/memos/move');


/**
 * Handle search_memos tool call — hybrid FTS + vector search with scope metadata
 * @param {object} params
 * @param {string} params.query
 * @param {string} [params.bucket_id]
 * @param {string} [params.thread_id]
 * @returns {Promise<object>}
 */
async function handleSearchMemos({ query, bucket_id, thread_id }) {
	const results = await searchMemos({ query, bucket_id, thread_id });

	return {
		results,
		total: results.length,
		scope: thread_id
			? `thread:${thread_id}`
			: bucket_id
				? `bucket:${bucket_id}`
				: 'global',
	};
}


/**
 * Handle fetch_memos tool call — returns full memo content by ID list
 * @param {object} params
 * @param {string[]} params.memo_ids
 * @returns {{ memos: import('../memory/memos/fetch').FetchedMemo[], total: number }}
 */
function handleFetchMemos({ memo_ids }) {
	const memos = fetchMemos(memo_ids);

	return {
		memos,
		total: memos.length,
	};
}


/**
 * Handle create_memo tool call
 * @param {object} params
 * @param {string} params.parent_thread_id
 * @param {string} params.title
 * @param {string} params.summary
 * @param {string} params.content
 * @returns {Promise<object>}
 */
async function handleCreateMemo({ parent_thread_id, title, summary, content }) {
	const memo = await createMemo({ parent_thread_id, title, summary, content });

	return {
		memo_id: memo.memo_id,
		memo_title: memo.memo_title,
		parent_thread_id: memo.parent_thread_id,
		created_at: memo.created_at,
		agent_guidance:
			'Consider whether the parent thread summary should be updated to reflect this new memo.',
	};
}


/**
 * Handle update_memo tool call — full replace or line-edit mode
 * @param {object} params
 * @param {string} params.memo_id
 * @param {string} [params.title]
 * @param {string} [params.summary]
 * @param {string} [params.content]
 * @param {Array<{ line: number, content: string }>} [params.line_edits]
 * @returns {Promise<object>}
 */
async function handleUpdateMemo({ memo_id, title, summary, content, line_edits }) {
	const memo = await updateMemo({ memo_id, title, summary, content, line_edits });

	return {
		memo_id: memo.memo_id,
		memo_title: memo.memo_title,
		memo_summary: memo.memo_summary,
		updated_at: memo.updated_at,
		agent_guidance:
			content !== undefined || line_edits !== undefined
				? 'Content was updated. Consider whether the memo summary still accurately reflects the content. Also consider whether the parent thread summary still holds.'
				: undefined,
	};
}


/**
 * Handle delete_memo tool call
 * @param {object} params
 * @param {string} params.memo_id
 * @returns {Promise<object>}
 */
async function handleDeleteMemo({ memo_id }) {
	const result = await deleteMemo(memo_id);

	return {
		deleted: true,
		memo_id: result.memo_id,
		agent_guidance:
			'Consider whether the parent thread summary should be updated now that this memo is gone.',
	};
}


/**
 * Handle move_memo tool call
 * @param {object} params
 * @param {string} params.memo_id
 * @param {string} params.new_thread_id
 * @returns {object}
 */
function handleMoveMemo({ memo_id, new_thread_id }) {
	const result = moveMemo(memo_id, new_thread_id);

	return {
		moved: true,
		memo_id: result.memo_id,
		old_thread_id: result.old_thread_id,
		new_thread_id: result.new_thread_id,
		agent_guidance:
			'Both the source and destination thread summaries may need updating. The source thread lost content, the destination thread gained content.',
	};
}


module.exports = {
	handleSearchMemos,
	handleFetchMemos,
	handleCreateMemo,
	handleUpdateMemo,
	handleDeleteMemo,
	handleMoveMemo,
};
