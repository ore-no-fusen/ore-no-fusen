---
status: complete
phase: 19-300ms-pool-ctrl-n
source: 19-01-SUMMARY.md, 19-02-SUMMARY.md, 19-03-SUMMARY.md, 19-04-SUMMARY.md, 19-05-SUMMARY.md
started: 2026-05-02T00:00:00Z
updated: 2026-05-02T01:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Pool window pre-created at startup
expected: Pool window processes visible in Task Manager, app loads normally
result: pass

### 2. Ctrl+N launches new note within 300ms
expected: Press Ctrl+N. A transparent sticky note window appears and becomes visible instantly. Text editor is ready to type. Window appears in <300ms from keypress.
result: pass

### 3. First character typed creates the note file
expected: Press Ctrl+N, type 1 character (e.g. "A"), then close without saving. Verify the note file was created in the folder. If you open the folder in Drive/File Manager, the note should exist even though you didn't explicitly save.
result: issue
reported: "File is created but missing YAML frontmatter header (title, created date). File contains only the body text without metadata."
severity: major

### 4. Pool refills after creating a note
expected: Press Ctrl+N 3 times rapidly to use up the pool. A 4th Ctrl+N should either show the note window instantly (if pool refilled) or briefly show "少々お待ちください" toast, then show the window. Multiple pool windows should still be visible in Task Manager.
result: pass

### 5. Global Ctrl+N works from any application
expected: Switch to another application (browser, calculator, anything). Press Ctrl+N. The ore-no-fusen window appears with a new sticky note ready to edit. Global hotkey works even when app is not in focus.
result: pass

### 6. Lazy file creation on first char—no empty files
expected: Press Ctrl+N, close the window immediately without typing anything. Verify no empty/blank note file was created in the folder. Close behavior correctly reclaims the pool slot.
result: issue
reported: "Empty 'Untitled' memo file is created when closing without typing. Should not create any file if 0 characters entered."
severity: major

### 7. Custom shortcut in settings works
expected: Edit app settings to change the note creation hotkey from Ctrl+N to something else (e.g. Ctrl+Shift+N). Verify the new hotkey launches a note, and Ctrl+N no longer works. Change back to Ctrl+N and verify it works again.
result: skipped
reason: Settings UI for shortcut customization not yet implemented (backend support exists)

### 8. Performance: 300ms requirement met
expected: After completing real device measurement with `npm run tauri build` and `npm run perf:check`, verify the output shows T2_READY median ≤ 300ms (central value from 5+ Ctrl+N samples). Human measurement required.
result: pass
notes: "T2_READY median: 126ms (7 samples, min: 26ms, max: 1585ms) — well below 300ms threshold"

## Summary

total: 8
passed: 5
issues: 2
pending: 0
skipped: 1

## Gaps

- truth: "Lazy file creation must include YAML frontmatter header with title and created timestamp"
  status: failed
  reason: "User reported: File created on first character but missing YAML metadata header (title, created, etc)"
  severity: major
  test: 3
  artifacts: []
  missing:
    - "Add YAML frontmatter generation to fusen_create_note_lazy or upstream handler"
    - "Verify header format matches existing note files"

- truth: "Closing pool note without typing any character must not create a file"
  status: failed
  reason: "User reported: Empty 'Untitled' memo file created when window closed without input"
  severity: major
  test: 6
  artifacts: []
  missing:
    - "Fix close-without-input logic in StickyNote.tsx or Rust handler"
    - "Ensure pool slot is reclaimed without file creation"
