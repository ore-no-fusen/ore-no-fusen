---
pageClass: user-guide-page
---

# Basic Use

[日本語](/user-guide/basic)

::: info Revision draft
Behavior may differ from the current app until the corresponding fix is released. This draft has not been published.
:::

## One way to create a note, several ways to clear the screen

Start with **New Note** and write. Different creation shortcuts make the same kind of note. There are **four ways to remove a note from the screen, depending on how often you expect to use it next**.

| When will you need it? | How to clear the screen and bring it back |
|---|---|
| In a moment; it is only in the way for now | **Hide temporarily** using **Hide All**, then **Show All** in the tray menu. Notes already stored in the launcher stay stored. |
| Often; keep the desktop clear between uses | **Store in Launcher**. Register the note, then use **Store** on its row. The same button becomes **Take out**. Showing it does not remove its registration. |
| Rarely, but keep it for reference | **File in a folder** using the current **Put Away by Tag** command. Later, use **Take Out Put-Away Notes** to find and return it. |
| No longer needed | **Move to trash** with Delete. Before permanent deletion, a mistaken deletion can be recovered manually by returning the note and referenced images from the trash folder. There is no dedicated in-app trash restore button. |

![Four ways to clear the screen according to the next use and return method](/screens/note-visibility-levels.svg)

Use the launcher for notes you need repeatedly; file completed work for occasional reference. These are choices, not steps to perform in order. Moving to trash is different from permanent deletion. If a note or image with the same name already exists at the destination, do not overwrite it; check the recovery procedure first. Permanently deleted notes cannot be restored through normal app controls. Disable automatic trash cleanup before attempting recovery.

| Goal | Action |
|---|---|
| New note | `Ctrl+N` or the tray menu |
| Edit | Double-click a note |
| Finish editing | Click outside or press `Esc` |
| Search | `Ctrl+F` |
| Delete | Use the trash button on the right or right-click → Delete |

The top controls create a note, collapse it, and pin it. The archive and delete controls are separated on the right. The bottom-right corner resizes the note.

## Keep a note in front or fold it

Click the thumbtack at the top-right to keep a note in front of other apps. A red thumbtack means it is pinned; click again to unpin. Click **△** to fold the whole note and **▽** to expand it.

## Organize notes

- Write tags such as `#work`.
- Use `Ctrl+F` for full-text search.
- **Put Away by Tag** moves a note from the desktop into its tag folder. A note without a tag goes to Archive.
- To bring a filed note back, right-click the tray icon → **Take Out Put-Away Notes**. Select notes and confirm how many to take out. They return at their previous position and size.

**Data Management → Import Markdown & Put-Away Tags** copies notes and leaves the source files in place. Use it to import external Markdown or create copies of filed notes.

Launcher registration and tags are separate. Registration adds a shortcut in Quick Launcher; it does not add a user tag.

## Quick Launcher {#quick-launcher}

Register useful notes for quick access, store them to clear your desktop, and take them out when needed.

### Open it

The default key is **Ctrl+P**. You can also right-click the tray icon or taskbar app icon → **Open Quick Launcher**. Change the key under **Settings → Hotkeys → Quick Launcher Trigger**. Enable **Also open with three right-clicks** to open it over other apps.

| Goal | Action |
|---|---|
| Register | Right-click a note → **Register in Launcher**. It appears under the **Launcher** tab. Registration keeps it on the desktop. |
| Find and open | Search by title or tags, or choose a tag. Click a row, or use **↑ / ↓** and **Enter**. QA, Terms, and Recipes have their own tabs. |
| Store | Click **Store** on the note’s row. Its content and registration stay intact. |
| Take out | Click **Take out** or the note’s row to return it to the desktop. It remains in **Registered**. The **Stored in Launcher** view only lists hidden notes, so taking one out removes it from that view. |
| Register a tag | Right-click a user tag → **Register all notes with this tag**. Note visibility stays unchanged. |
| Store a tag | Right-click a user tag → **Store all notes with this tag**. All desktop notes with that tag are registered and stored, including previously unregistered notes and notes outside the current text search. |
| Remove registration | Right-click a row → **Remove from Launcher**. The note is not deleted. A stored note is taken out first. |

::: tip Storing and filing are different
Store in Launcher hides a note without moving its file. Put Away by Tag moves it into a tag folder or Archive. Return filed notes through the tray’s **Take Out Put-Away Notes** command.
:::

## App actions from a note

Right-click a note and open **⚙️ App Actions** to search, arrange notes by tag, undo arrangement, or open Settings.

Next: [Advanced use](/en/user-guide/advanced)
