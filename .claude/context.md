# ore-no-fusen project context
Desktop sticky note application.
## Stack
* Tauri v2
* Next.js 14
* React 18
* Rust backend
## Architecture
Frontend: React components in `app/`
Backend: Rust commands in `src-tauri/src/`
Communication: Tauri invoke() between frontend and Rust backend
## State
Notes stored in Rust `AppState.notes`.
## Storage
Notes saved as markdown files in filesystem.
## Tags
Tags stored inside note metadata.
Command to get tags:
`fusen_get_all_tags`
## Important
This is a **multi-window Tauri app**.
Each sticky note is its own window.
State synchronization must happen through Rust backend or events.
