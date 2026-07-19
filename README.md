# FUSEN (My Sticky Notes)

<div align="center">

*Read this in other languages: **English** | [日本語](README.ja.md)*

![Ore-no-Fusen Desktop](public/screenshots/ScreenShot_OreNoFusen.png)

**Pin your thoughts to your desktop.**

A beautiful sticky notes app with Markdown support.

[![GitHub release](https://ore-no-fusen-badges.ore-no-fusen-g8.workers.dev/badges/release.svg)](https://github.com/ore-no-fusen/ore-no-fusen/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

**The former GitHub-distributed edition reached 2,800 downloads. The current official edition is distributed through Microsoft Store.**

[Microsoft Store](https://apps.microsoft.com/detail/9N4MW0V2MVVG) • [Documentation](https://ore-no-fusen.github.io/ore-no-fusen/) • [FAQ](docs/101_FAQ.md) • [Landing Page](https://ore-no-fusen.vercel.app) • [🎥 Comic Guide](https://github.com/ore-no-fusen/ore-no-fusen/wiki/%E6%BC%AB%E7%94%BB%E3%81%A7%E5%AD%A6%E3%81%B6%E4%BF%BA%E3%81%AE%E4%BB%98%E7%AE%8B)

</div>

---
# FUSEN

The fastest way to capture thoughts.

Markdown sticky notes for your desktop.

## Install (10 sec)
```bash
winget install --id 9N4MW0V2MVVG --source msstore
```

Or install it from [Microsoft Store](https://apps.microsoft.com/detail/9N4MW0V2MVVG).


## Concept

Capture thoughts instantly without interrupting your thinking.

FUSEN is designed as a fast thinking canvas where ideas can appear the moment they come to mind.

---


## ✨ Features

### 🎯 Simple yet Powerful

- **Markdown Support** - Supports headings, lists, code blocks, tables, Mermaid diagrams, images, and more.
- **VideoDrop** - Send `mp4` / `mov` videos from the iPhone/iPad PWA to your PC and keep the saved path attached to the note.
- **One-click Edit** - Click anywhere to start typing immediately. Auto-saves so you never lose your thoughts.
- **Floating Format Bar** - Appears automatically when text is selected. Click to format bold, headings, lists, and checkboxes.
- **Tags & Archives** - Organize your sticky notes. Folder structure for easy viewing.
- **Full-Text Search** - Find statements instantly with regular expression support. Auto-jumps and highlights the matching lines.
- **Pin to Top** - Always display in front of other windows using the 📌 button.
- **System Tray Integration** - Resides in the system tray for instant access anytime.
- **Auto-Start** - Starts automatically on system boot.
- **Sound Effects** - Comfortable feedback for a pleasant user experience.

### 🔒 Privacy Focused

- **100% Local** - All data is saved locally on your device. No cloud storage is required.
- **Offline Capable** - Works without an internet connection.
- **Open Source** - Code is fully available. Use it with peace of mind.

---

## 📸 Screenshots

![Main Screen](public/screenshots/ScreenShot_OreNoFusen.png)

---

## 📥 Installation

### For General Users (Recommended)

1. Open the [Microsoft Store listing](https://apps.microsoft.com/detail/9N4MW0V2MVVG).
2. Select **Get** or **Install**.
3. Select **Open** on the Store page after installation.
4. On first launch, choose whether to create the **俺の付箋（Store版）** desktop shortcut. You can also create it later from Settings.
5. Future updates are delivered automatically through Microsoft Store.

**System Requirements:**
- OS: Windows 10/11 (64-bit)
- Disk Space: Approx. 100MB
- Memory: 4GB+ recommended

If you use an older MSI or NSIS edition, install the Store edition first, verify your notes and settings, and only then uninstall the old edition.

### For Developers

#### Prerequisites
- Node.js 18+
- Rust (Install via [rustup](https://rustup.rs/))

#### Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/ore-no-fusen/ore-no-fusen.git
cd ore-no-fusen
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm run tauri dev
```

4. Production build:
```bash
npm run tauri build
```

After building the release executable and resources, create the Store submission MSIX with `packaging/msix/build-msix.ps1`.

---

## 🎯 Usage

### Basic Operations

1. **Create a Sticky Note** - Right-click the system tray icon → "New Note"
2. **Edit** - Double-click a note
3. **Search** - Press `Ctrl+F` to open the search window
4. **Tagging** - Write `#tagname` within a note to automatically tag it

For detailed usage, please see the [User Guide on Wiki](https://github.com/ore-no-fusen/ore-no-fusen/wiki).

### Markdown Example

```markdown
# Today's Tasks

## Important
- [ ] Prepare presentation slides
- [x] Reply to emails

## Notes
**Deadline**: 2026/02/15
*Assignee*: Alex

| Item | Status |
|------|------|
| Slides | In Progress |
| Review | Pending |

#work #important
```

---

## 💡 Use Cases

### 📝 Task Management
Organize your daily tasks with checklists and tags. Move completed tasks to the archive.

### 💭 Idea Capture
Jot down ideas the moment you have them. Structure and organize them with Markdown.

### 📚 Study Notes
Categorize what you learn with tags. Easily review using the search feature.

### 🔖 Link Collection
Save frequently used links on sticky notes. Group them using tags.

---

## 🛠️ Technology Stack

### Frontend
- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **CodeMirror 6** (Markdown Editor)

### Backend
- **Tauri 2.x** (Desktop App Framework)
- **Rust** (Fast & Secure Backend)

### Architecture
- **DOD (Data-Oriented Design)** - Data-centric architecture
- **Effect Pattern** - Explicit management of side effects
- **AppState (SSOT)** - Single source of truth

---

## 📖 Documentation

- [Online Documentation](https://ore-no-fusen.github.io/ore-no-fusen/) - System specifications and architecture (JA)
- [User Guide on Wiki](https://github.com/ore-no-fusen/ore-no-fusen/wiki) - Detailed instructions (JA)
- [FAQ](docs/101_FAQ.md) - Frequently asked questions (JA)

---

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgements

FUSEN uses the following open-source projects:

- [Tauri](https://tauri.app/)
- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [CodeMirror](https://codemirror.net/)
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📞 Support

- **Bug Reports**: [GitHub Issues](https://github.com/ore-no-fusen/ore-no-fusen/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/ore-no-fusen/ore-no-fusen/discussions)
- **Questions**: [FAQ](docs/101_FAQ.md)

---

<div align="center">

**Make organizing thoughts more fun with FUSEN** 🎉

Made with ❤️ by ONF Studios

</div>
