# Rules

- Make proper components & follow DRY principle
- Respond to user in compact/brief preserving meaning, user will request elaboration if required
- This is a NodeJS project, use JSDOC + Typescript Compiler
- Follow prettier rules
- DONT do `git commit` unless the user requests it
- Spit the code in sections with `\n\n` 2 new lines between sections to create visual separation
- Write comments to brief what the section does
- Have max 250 - 500 lines per code > split into components and utilities if required


## Folder Structure

project_root
|___ documentations/ # Contains documentation for users
|___ database/ # Contains database connectors + .sql files for DB initialization
|___ functions/
	|___ utils/ # Utility functions
	|___ mcp/ # MCP files
	|___ ...
|___ .db/ # gitignored but will contain the ChromaDB and SQLite files
|___ index.js # Entry file
|___ README.md # instructions on how to use the tool