// MemMolt MCP server entry point.
// Supports HTTP/SSE (default) and stdio (via --stdio) transports.

const http = require('http');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { initSqlite } = require('./database/sqlite');
const { cleanupOrphans } = require('./functions/utils/orphanCleanup');
const { TOOL_DEFINITIONS, routeToolCall } = require('./functions/mcp/registerTools');
const { INSTRUCTIONS } = require('./functions/mcp/instructions');


// Configuration
const PORT = Number(process.env.MEMMOLT_PORT) || 3100;
const USE_STDIO = process.argv.includes('--stdio');


/**
 * Create and configure the MCP server.
 * Registers tools/list and tools/call handlers using the JSON schemas
 * defined in functions/mcp/registerTools.js.
 * @returns {Server}
 */
function createServer() {
	// Using the lower-level Server (deprecated in SDK types but fully functional)
	// instead of McpServer because McpServer.registerTool requires Zod schemas,
	// while our TOOL_DEFINITIONS are declarative JSON schemas.
	// TODO: future — migrate TOOL_DEFINITIONS to Zod and switch to McpServer.
	// @ts-ignore — intentional use of deprecated Server class
	const server = new Server(
		{ name: 'MemMolt', version: '1.0.0' },
		{ capabilities: { tools: {} }, instructions: INSTRUCTIONS }
	);

	// Advertise the full tool catalog
	server.setRequestHandler(ListToolsRequestSchema, async () => {
		return { tools: TOOL_DEFINITIONS };
	});

	// Dispatch tool calls to the matching handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		try {
			const result = await routeToolCall(name, args || {});
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2),
					},
				],
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({ error: message }, null, 2),
					},
				],
				isError: true,
			};
		}
	});

	return server;
}


/**
 * Start the server with stdio transport.
 * @param {Server} server
 */
async function startStdio(server) {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error('MemMolt MCP server running on stdio');
}


/**
 * Start the server with HTTP/SSE transport.
 * Clients connect to GET /sse for the event stream, then POST messages to /messages?sessionId=<id>.
 * @param {Server} server
 */
async function startHttpSse(server) {
	/** @type {Map<string, SSEServerTransport>} */
	const transports = new Map();

	const httpServer = http.createServer(async (req, res) => {
		const url = new URL(req.url || '', `http://localhost:${PORT}`);

		// GET /sse — client opens an SSE stream; a new MCP transport is created for this session
		if (url.pathname === '/sse' && req.method === 'GET') {
			const transport = new SSEServerTransport('/messages', res);
			transports.set(transport.sessionId, transport);

			res.on('close', () => {
				transports.delete(transport.sessionId);
			});

			await server.connect(transport);
			return;
		}

		// POST /messages?sessionId=... — client sends JSON-RPC messages here
		if (url.pathname === '/messages' && req.method === 'POST') {
			const sessionId = url.searchParams.get('sessionId');
			const transport = sessionId ? transports.get(sessionId) : undefined;

			if (!transport) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid or missing sessionId' }));
				return;
			}

			await transport.handlePostMessage(req, res);
			return;
		}

		// GET /health — simple health probe
		if (url.pathname === '/health' && req.method === 'GET') {
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'ok', server: 'MemMolt' }));
			return;
		}

		res.writeHead(404);
		res.end('Not found');
	});

	httpServer.listen(PORT, () => {
		console.log(`MemMolt MCP server running on http://localhost:${PORT}`);
		console.log(`  SSE endpoint:      http://localhost:${PORT}/sse`);
		console.log(`  Messages endpoint: http://localhost:${PORT}/messages`);
		console.log(`  Health endpoint:   http://localhost:${PORT}/health`);
	});
}


/**
 * Main entry point — initialize SQLite (loads sqlite-vec extension and runs schema),
 * then start the requested transport.
 */
async function main() {
	initSqlite();

	// One-shot integrity sweep: delete any orphaned rows or dangling vectors
	// left behind by previous crashes, manual SQL edits, or restored backups.
	const orphanReport = cleanupOrphans();
	const totalOrphans =
		orphanReport.orphan_threads +
		orphanReport.orphan_memos +
		orphanReport.orphan_bucket_vectors +
		orphanReport.orphan_thread_vectors +
		orphanReport.orphan_memo_vectors;

	if (totalOrphans > 0) {
		console.error('[startup] orphan cleanup:', orphanReport);
	}

	const server = createServer();

	if (USE_STDIO) {
		await startStdio(server);
	} else {
		await startHttpSse(server);
	}
}


main().catch((err) => {
	console.error('Failed to start MemMolt:', err);
	process.exit(1);
});
