#!/usr/bin/env node

// Global CLI entry for MemMolt.
// When installed via `npm install -g memmolt`, users get a `memmolt` command
// that boots the MCP server in stdio mode by default. Pass --http to boot
// the HTTP/SSE transport instead.

const path = require('path');


// argv handling: default to stdio, accept --http to override.
const args = process.argv.slice(2);
if (!args.includes('--http') && !args.includes('--stdio')) {
	process.argv.push('--stdio');
}


// Delegate to the real entry point.
require(path.join(__dirname, '..', 'index.js'));
