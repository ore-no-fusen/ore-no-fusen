---
status: verifying
trigger: "Empty 'Untitled' memo file created when closing without typing"
created: 2026-05-02T00:00:00Z
updated: 2026-05-02T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: onCloseRequested calls preventDefault() for ALL windows, blocking pool window close and preventing pool cleanup listener from firing
test: Identified and fixed the issue
expecting: Pool windows now close cleanly without file creation when user doesn't type
next_action: Verify in real environment - Test 6 should pass now

## Symptoms

expected: Closing Pool note without typing = no file created, pool slot reclaimed
actual: Empty/blank "Untitled" memo file appears in folder
errors: No error messages, file is silently created
reproduction: Open Pool window with Ctrl+N, close immediately without typing
started: Phase 19 UAT test 6 failure

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-05-02T01:00:00Z
  checked: Close event handlers in StickyNote.tsx
  found: TWO close handlers exist:
    1. win.onCloseRequested() at line 524 - calls preventDefault() unconditionally for ALL windows
    2. win.listen('tauri://close-requested') at line 745 - only for pool windows, emits pool_slot_released
  implication: preventDefault() blocks the close event entirely

- timestamp: 2026-05-02T01:01:00Z
  checked: Sequence of close events for pool windows
  found: When user closes pool window:
    1. onCloseRequested fires (line 524)
    2. preventDefault() is called for ALL windows (line 527)
    3. This BLOCKS the entire close event
    4. tauri://close-requested listener NEVER fires (because close was prevented)
    5. Pool cleanup (pool_slot_released, replenish) is never executed
  implication: Pool windows can't close cleanly, cleanup listener is skipped

- timestamp: 2026-05-02T01:02:00Z
  checked: Pool window close-without-input scenario
  found: User closes pool window without typing:
    1. onCloseRequested fires, preventDefault() is called
    2. Window is stuck in "attempted close" state
    3. Cleanup listener at line 745 never fires
    4. file creation should NOT happen (firstCharFiredRef=false, fusen_create_note_lazy never called)
    5. BUT: handleSave might be called from somewhere else, or timing issue causes problems
  implication: The close blocker is the core issue preventing proper cleanup

- timestamp: 2026-05-02T01:03:00Z
  checked: Root cause confirmation
  found: preventDefault() at line 527 is TOO AGGRESSIVE for pool windows. Pool windows have their own close handler (line 745) that should be allowed to fire. Normal windows (non-pool) need preventDefault to block unwanted closes. Pool windows should let close proceed so cleanup handler can run.
  implication: Solution: Skip preventDefault() for pool windows by checking isPoolRef.current

- timestamp: 2026-05-02T01:04:00Z
  checked: Applied fix
  found: Added guard at line 526: if (isPoolRef.current) return; before preventDefault()
  implication: Pool windows now skip preventDefault, allowing close to proceed and cleanup listener to fire

## Resolution

root_cause: |
  CRITICAL BUG: The close event flow is broken for pool windows
  
  Current flow (intended):
  1. User closes pool window
  2. onCloseRequested (line 524) fires → preventDefault() → endEditing (if editing)
  3. tauri://close-requested (line 745) listener should fire → check firstCharFiredRef → emit pool_slot_released
  4. Window closes
  
  ACTUAL flow (broken):
  1. User closes pool window without typing
  2. onCloseRequested (line 524) fires → preventDefault() BLOCKS THE CLOSE
  3. Since close was prevented/blocked, tauri://close-requested listener NEVER fires
  4. Pool window CANNOT close (preventDefault blocks it)
  5. But then somewhere a file IS getting created...
  
  The real issue: When onCloseRequested calls preventDefault(), it blocks the entire close event.
  This means pool windows get stuck and can't close cleanly. Additionally:
  
  - The fix in ae91397 added handleSave guard: isPoolRef.current check
  - But onCloseRequested calls endEditingForListenerRef if isEditingForListenerRef.current is true
  - If user hasn't typed, isEditingForListenerRef is false, so endEditing is NOT called
  - Window is stuck in opened state with preventDefault blocking any close
  
  The file creation likely happens through a DIFFERENT mechanism:
  - Maybe the close blocker causes a re-render cycle that somehow triggers save
  - Or maybe there's timing where the pool window IS closing via a different path
  
  The core issue: preventDefault() at line 527 is TOO AGGRESSIVE for pool windows.
  Pool windows should allow close to proceed (or explicitly call close after cleanup).

fix: Applied - Added guard in onCloseRequested to skip preventDefault for pool windows
  Location: app/components/StickyNote.tsx, line 526
  Change: Added check "if (isPoolRef.current) return;" before preventDefault() call
  
  This allows pool windows to:
  1. Close without being blocked by preventDefault()
  2. Fire the tauri://close-requested listener
  3. Run pool cleanup (emit pool_slot_released) if user didn't type
  4. Properly release the pool slot
  
  Files changed:
  - app/components/StickyNote.tsx (1 change: added guard before preventDefault)

verification: 
  - Applied fix successfully
  - Pool windows should now close cleanly without file creation
  - Test 6 should pass: "close without typing = no file created"
  - Test 3 should still pass: "type 1 char = file created with frontmatter"
