---
pageClass: user-guide-page
---

# Install and Get Started

[日本語](/user-guide/install)

## Install from Microsoft Store

| Step | Action |
|---|---|
| 1 | Open [Ore No Fusen in Microsoft Store](https://apps.microsoft.com/detail/9N4MW0V2MVVG) |
| 2 | Select **Get** or **Install** |
| 3 | Wait for Store to finish installing |
| 4 | Select **Open**, or launch Ore No Fusen from the Windows Start menu |
| 5 | At the first prompt, create a desktop shortcut if you want one |

Installing the package alone does not display the first-run prompt. Launch the app once from Store or the Start menu.

The shortcut prompt says:

> Create a desktop shortcut?
> We recommend creating one if you use the app every day.
> You can also create it later from Settings.

The Store shortcut is named **Ore No Fusen (Store Version)** so it is distinguishable from an older MSI or NSIS installation. You can create, recreate, or remove it later under **Settings → General**. Use this shortcut when registering the app in an external launcher.

## Install with winget

This installs the same Store version:

```powershell
winget install --id 9N4MW0V2MVVG --source msstore
```

Microsoft Store delivers updates automatically. GitHub Releases do not distribute an unsigned MSIX to general users. Version 5.0.0 is the final migration release that also provides MSI and NSIS for existing users; version 5.1.0 and later use Store MSIX as the official distribution.

## Move from an MSI or NSIS version

1. Do not uninstall the old version yet. Install the Store version first.
2. Exit the old version, then open the Store version.
3. Confirm that notes, images, tags, the data location, and settings are present.
4. Exit the Store version and uninstall the old version from **Installed apps**.
5. Open the Store version again and confirm the data is still present.

The old version and Store version cannot run at the same time. Verify your data in the Store version before removing the old installation.

::: info
If you disable Ore No Fusen in Windows **Startup apps**, the app cannot force Windows to enable it again. Follow the link shown in Settings and enable it in Windows.
:::

Next: [Basic use](/en/user-guide/basic)
