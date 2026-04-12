// functions/mcp/bucketTools.js — Thin MCP tool handlers wrapping bucket domain functions
const { searchBuckets } = require('../memory/buckets/search');
const { createBucket } = require('../memory/buckets/create');
const { updateBucket } = require('../memory/buckets/update');
const { deleteBucket } = require('../memory/buckets/delete');


/**
 * Handle search_bucket tool call
 * @param {object} params
 * @param {string} params.query
 * @returns {Promise<{ results: import('../memory/buckets/search').BucketSearchResult[], total: number }>}
 */
async function handleSearchBucket({ query }) {
	const results = await searchBuckets(query);

	return {
		results,
		total: results.length,
	};
}


/**
 * Handle create_bucket tool call
 * @param {object} params
 * @param {string} params.name
 * @param {string} params.summary
 * @returns {Promise<{ bucket_id: string, bucket_name: string, bucket_summary: string, created_at: string }>}
 */
async function handleCreateBucket({ name, summary }) {
	const bucket = await createBucket({ name, summary });

	return {
		bucket_id: bucket.bucket_id,
		bucket_name: bucket.bucket_name,
		bucket_summary: bucket.bucket_summary,
		created_at: bucket.created_at,
	};
}


/**
 * Handle update_bucket tool call
 * @param {object} params
 * @param {string} params.bucket_id
 * @param {string} [params.name]
 * @param {string} [params.summary]
 * @returns {Promise<{ bucket_id: string, bucket_name: string, bucket_summary: string, updated_at: string }>}
 */
async function handleUpdateBucket({ bucket_id, name, summary }) {
	const bucket = await updateBucket({ bucket_id, name, summary });

	return {
		bucket_id: bucket.bucket_id,
		bucket_name: bucket.bucket_name,
		bucket_summary: bucket.bucket_summary,
		updated_at: bucket.updated_at,
	};
}


/**
 * Handle delete_bucket tool call
 * @param {object} params
 * @param {string} params.bucket_id
 * @returns {Promise<{ deleted: boolean, bucket_id: string, threads_deleted: number, memos_deleted: number, agent_guidance: string }>}
 */
async function handleDeleteBucket({ bucket_id }) {
	const result = await deleteBucket(bucket_id);

	return {
		deleted: true,
		bucket_id: result.bucket_id,
		threads_deleted: result.threads_deleted,
		memos_deleted: result.memos_deleted,
		agent_guidance: 'This bucket and all its contents have been permanently deleted.',
	};
}


module.exports = {
	handleSearchBucket,
	handleCreateBucket,
	handleUpdateBucket,
	handleDeleteBucket,
};
