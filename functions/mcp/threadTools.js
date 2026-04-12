// functions/mcp/threadTools.js
// Thin MCP handlers wrapping the thread domain functions
const { searchThreads } = require('../memory/threads/search');
const { createThread } = require('../memory/threads/create');
const { updateThread } = require('../memory/threads/update');
const { deleteThread } = require('../memory/threads/delete');
const { moveThread } = require('../memory/threads/move');


/**
 * Handle search_thread tool call
 * @param {object} params
 * @param {string} params.query
 * @returns {Promise<object>}
 */
async function handleSearchThread({ query }) {
	const results = await searchThreads(query);

	return {
		results,
		total: results.length,
	};
}


/**
 * Handle create_thread tool call
 * @param {object} params
 * @param {string} params.parent_bucket_id
 * @param {string} params.name
 * @param {string} params.summary
 * @returns {Promise<object>}
 */
async function handleCreateThread({ parent_bucket_id, name, summary }) {
	const thread = await createThread({ parent_bucket_id, name, summary });

	return {
		thread_id: thread.thread_id,
		thread_name: thread.thread_name,
		thread_summary: thread.thread_summary,
		parent_bucket_id: thread.parent_bucket_id,
		created_at: thread.created_at,
		agent_guidance:
			'Consider whether the parent bucket summary should be updated to reflect this new thread.',
	};
}


/**
 * Handle update_thread tool call
 * @param {object} params
 * @param {string} params.thread_id
 * @param {string} [params.name]
 * @param {string} [params.summary]
 * @returns {Promise<object>}
 */
async function handleUpdateThread({ thread_id, name, summary }) {
	const thread = await updateThread({ thread_id, name, summary });

	return {
		thread_id: thread.thread_id,
		thread_name: thread.thread_name,
		thread_summary: thread.thread_summary,
		updated_at: thread.updated_at,
		agent_guidance: name
			? 'If the thread name changed significantly, consider whether the parent bucket summary still accurately describes its contents.'
			: undefined,
	};
}


/**
 * Handle delete_thread tool call
 * @param {object} params
 * @param {string} params.thread_id
 * @returns {Promise<object>}
 */
async function handleDeleteThread({ thread_id }) {
	const result = await deleteThread(thread_id);

	return {
		deleted: true,
		thread_id: result.thread_id,
		memos_deleted: result.memos_deleted,
		agent_guidance:
			'Consider whether the parent bucket summary should be updated now that this thread is gone.',
	};
}


/**
 * Handle move_thread tool call
 * @param {object} params
 * @param {string} params.thread_id
 * @param {string} params.new_bucket_id
 * @returns {object}
 */
function handleMoveThread({ thread_id, new_bucket_id }) {
	const result = moveThread(thread_id, new_bucket_id);

	return {
		moved: true,
		thread_id: result.thread_id,
		old_bucket_id: result.old_bucket_id,
		new_bucket_id: result.new_bucket_id,
		agent_guidance:
			'Both the source and destination bucket summaries may need updating. The source bucket lost a topic, the destination bucket gained one.',
	};
}


module.exports = {
	handleSearchThread,
	handleCreateThread,
	handleUpdateThread,
	handleDeleteThread,
	handleMoveThread,
};
