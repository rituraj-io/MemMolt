// functions/mcp/registerTools.js

// Handler imports
const { handleStatus } = require('./status');
const {
	handleSearchBucket,
	handleCreateBucket,
	handleUpdateBucket,
	handleDeleteBucket,
} = require('./bucketTools');
const {
	handleSearchThread,
	handleCreateThread,
	handleUpdateThread,
	handleDeleteThread,
	handleMoveThread,
} = require('./threadTools');
const {
	handleSearchMemos,
	handleFetchMemos,
	handleCreateMemo,
	handleUpdateMemo,
	handleDeleteMemo,
	handleMoveMemo,
} = require('./memoTools');


/**
 * Tool definitions with JSON Schema for MCP
 * @type {Array<{name: string, description: string, inputSchema: object}>}
 */
const TOOL_DEFINITIONS = [
	{
		name: 'status',
		description: 'Get MemMolt system status and health info',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'search_memos',
		description:
			'Search memos using hybrid search (FTS5 + Vector + RRF). Optionally scope to a bucket and/or thread.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
				bucket_id: {
					type: 'string',
					description: 'Optional: scope search to a specific bucket',
				},
				thread_id: {
					type: 'string',
					description: 'Optional: scope search to a specific thread',
				},
			},
			required: ['query'],
		},
	},
	{
		name: 'fetch_memos',
		description:
			'Fetch full content of one or more memos by ID. Pass an array of memo IDs.',
		inputSchema: {
			type: 'object',
			properties: {
				memo_ids: {
					type: 'array',
					items: { type: 'string' },
					description: 'Array of memo IDs (e.g. ["M:1", "M:5"])',
				},
			},
			required: ['memo_ids'],
		},
	},
	{
		name: 'search_bucket',
		description: 'Search buckets using hybrid search (FTS5 + Vector + RRF).',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
			},
			required: ['query'],
		},
	},
	{
		name: 'search_thread',
		description: 'Search threads using hybrid search (FTS5 + Vector + RRF).',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
			},
			required: ['query'],
		},
	},
	{
		name: 'create_bucket',
		description: 'Create a new bucket (top-level category).',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Bucket name' },
				summary: {
					type: 'string',
					description: 'Summary of what this bucket will contain',
				},
			},
			required: ['name', 'summary'],
		},
	},
	{
		name: 'create_thread',
		description: 'Create a new thread under a bucket.',
		inputSchema: {
			type: 'object',
			properties: {
				parent_bucket_id: {
					type: 'string',
					description: 'ID of the parent bucket (e.g. "B:1")',
				},
				name: { type: 'string', description: 'Thread name' },
				summary: {
					type: 'string',
					description: 'Summary of what this thread will contain',
				},
			},
			required: ['parent_bucket_id', 'name', 'summary'],
		},
	},
	{
		name: 'create_memo',
		description: 'Create a new memo under a thread.',
		inputSchema: {
			type: 'object',
			properties: {
				parent_thread_id: {
					type: 'string',
					description: 'ID of the parent thread (e.g. "T:1")',
				},
				title: { type: 'string', description: 'Memo title' },
				summary: { type: 'string', description: 'Memo summary' },
				content: {
					type: 'string',
					description: 'Full memo content (Markdown)',
				},
			},
			required: ['parent_thread_id', 'title', 'summary', 'content'],
		},
	},
	{
		name: 'update_bucket',
		description:
			'Update a bucket name and/or summary. Only provided fields are updated.',
		inputSchema: {
			type: 'object',
			properties: {
				bucket_id: { type: 'string', description: 'Bucket ID (e.g. "B:1")' },
				name: { type: 'string', description: 'New bucket name' },
				summary: { type: 'string', description: 'New bucket summary' },
			},
			required: ['bucket_id'],
		},
	},
	{
		name: 'update_thread',
		description:
			'Update a thread name and/or summary. Only provided fields are updated.',
		inputSchema: {
			type: 'object',
			properties: {
				thread_id: { type: 'string', description: 'Thread ID (e.g. "T:1")' },
				name: { type: 'string', description: 'New thread name' },
				summary: { type: 'string', description: 'New thread summary' },
			},
			required: ['thread_id'],
		},
	},
	{
		name: 'update_memo',
		description:
			'Update a memo title, summary, and/or content. All fields optional. Content has two modes: full replace (provide "content") or line edit (provide "line_edits" array). They are mutually exclusive.',
		inputSchema: {
			type: 'object',
			properties: {
				memo_id: { type: 'string', description: 'Memo ID (e.g. "M:1")' },
				title: { type: 'string', description: 'New memo title' },
				summary: { type: 'string', description: 'New memo summary' },
				content: {
					type: 'string',
					description: 'Full replacement content (Mode 1)',
				},
				line_edits: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							line: {
								type: 'number',
								description: 'Line number (1-indexed, starts from 1)',
							},
							content: {
								type: 'string',
								description: 'New content for this line',
							},
						},
						required: ['line', 'content'],
					},
					description: 'Array of line edits (Mode 2). Mutually exclusive with content.',
				},
			},
			required: ['memo_id'],
		},
	},
	{
		name: 'delete_bucket',
		description:
			'Delete a bucket by ID. CASCADE: deletes all threads and memos within it.',
		inputSchema: {
			type: 'object',
			properties: {
				bucket_id: { type: 'string', description: 'Bucket ID (e.g. "B:1")' },
			},
			required: ['bucket_id'],
		},
	},
	{
		name: 'delete_thread',
		description:
			'Delete a thread by ID. CASCADE: deletes all memos within it.',
		inputSchema: {
			type: 'object',
			properties: {
				thread_id: { type: 'string', description: 'Thread ID (e.g. "T:1")' },
			},
			required: ['thread_id'],
		},
	},
	{
		name: 'delete_memo',
		description: 'Delete a memo by ID.',
		inputSchema: {
			type: 'object',
			properties: {
				memo_id: { type: 'string', description: 'Memo ID (e.g. "M:1")' },
			},
			required: ['memo_id'],
		},
	},
	{
		name: 'move_thread',
		description: 'Move a thread to a different bucket.',
		inputSchema: {
			type: 'object',
			properties: {
				thread_id: { type: 'string', description: 'Thread ID to move' },
				new_bucket_id: {
					type: 'string',
					description: 'Destination bucket ID',
				},
			},
			required: ['thread_id', 'new_bucket_id'],
		},
	},
	{
		name: 'move_memo',
		description: 'Move a memo to a different thread.',
		inputSchema: {
			type: 'object',
			properties: {
				memo_id: { type: 'string', description: 'Memo ID to move' },
				new_thread_id: {
					type: 'string',
					description: 'Destination thread ID',
				},
			},
			required: ['memo_id', 'new_thread_id'],
		},
	},
];


/**
 * Route a tool call to the correct handler
 * @param {string} toolName
 * @param {any} params
 * @returns {Promise<object>}
 */
async function routeToolCall(toolName, params) {
	switch (toolName) {
		case 'status':
			return handleStatus();
		case 'search_memos':
			return handleSearchMemos(params);
		case 'fetch_memos':
			return handleFetchMemos(params);
		case 'search_bucket':
			return handleSearchBucket(params);
		case 'search_thread':
			return handleSearchThread(params);
		case 'create_bucket':
			return handleCreateBucket(params);
		case 'create_thread':
			return handleCreateThread(params);
		case 'create_memo':
			return handleCreateMemo(params);
		case 'update_bucket':
			return handleUpdateBucket(params);
		case 'update_thread':
			return handleUpdateThread(params);
		case 'update_memo':
			return handleUpdateMemo(params);
		case 'delete_bucket':
			return handleDeleteBucket(params);
		case 'delete_thread':
			return handleDeleteThread(params);
		case 'delete_memo':
			return handleDeleteMemo(params);
		case 'move_thread':
			return handleMoveThread(params);
		case 'move_memo':
			return handleMoveMemo(params);
		default:
			throw new Error(`Unknown tool: ${toolName}`);
	}
}


module.exports = { TOOL_DEFINITIONS, routeToolCall };
