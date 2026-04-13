#!/usr/bin/env node

// First-run bootstrap for plugin installs.
// When MemMolt is installed as a Claude Code plugin, the plugin cache
// contains the source but no node_modules. This script ensures the
// native dependencies are present, then hands off to the real entry point.
//
// On subsequent runs it's a fast existence check (a few ms) and delegates
// immediately.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const sentinel = path.join(root, 'node_modules', 'better-sqlite3', 'package.json');


// Install dependencies on first run only.
if (!fs.existsSync(sentinel)) {
	process.stderr.write('[memmolt] First run — installing native dependencies (one-time, ~30s)...\n');

	try {
		// stdio: ['ignore', 'ignore', 'inherit'] keeps npm's stdout off the
		// MCP protocol stream. Warnings/errors still surface on stderr.
		execSync('npm install --omit=dev --no-audit --no-fund --loglevel=error', {
			cwd: root,
			stdio: ['ignore', 'ignore', 'inherit']
		});
		process.stderr.write('[memmolt] Dependencies installed.\n');
	} catch (err) {
		process.stderr.write(`[memmolt] Dependency install failed: ${err.message}\n`);
		process.exit(1);
	}
}


// Hand off to the real entry point. argv (including --stdio) is preserved.
require(path.join(root, 'index.js'));
