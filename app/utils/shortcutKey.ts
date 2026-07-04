const MODIFIER_KEYS = new Set([
    'Control',
    'Shift',
    'Alt',
    'Meta',
    'Escape',
]);

const KEY_ALIASES: Record<string, string> = {
    ' ': 'space',
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'Backspace': 'backspace',
    'Delete': 'delete',
    'Enter': 'enter',
    'Tab': 'tab',
    'Space': 'space',
};

export function keyboardEventToShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): string | null {
    if (event.key === 'Escape') return null;
    if (MODIFIER_KEYS.has(event.key)) return null;

    const modifiers: string[] = [];
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    if (event.metaKey) modifiers.push('super');
    if (modifiers.length === 0) return null;

    const key = normalizeKey(event.key);
    if (!key) return null;
    return [...modifiers, key].join('+');
}

export function matchesShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>, shortcut: string | null | undefined): boolean {
    if (!shortcut) return false;
    const eventShortcut = keyboardEventToShortcut(event);
    if (!eventShortcut) return false;
    return normalizeShortcutString(eventShortcut) === normalizeShortcutString(shortcut);
}

export function formatShortcutLabel(shortcut: string): string {
    return normalizeShortcutString(shortcut)
        .split('+')
        .filter(Boolean)
        .map(part => {
            switch (part.toLowerCase()) {
                case 'ctrl': return 'Ctrl';
                case 'alt': return 'Alt';
                case 'shift': return 'Shift';
                case 'super': return 'Win';
                case 'space': return 'Space';
                case 'up': return '↑';
                case 'down': return '↓';
                case 'left': return '←';
                case 'right': return '→';
                default:
                    return part.length === 1 ? part.toUpperCase() : part;
            }
        })
        .join(' + ');
}

export function normalizeShortcutString(shortcut: string): string {
    const modifiers = new Set<string>();
    let key: string | null = null;

    shortcut
        .split('+')
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(part => {
            const lower = part.toLowerCase();
            switch (lower) {
                case 'control':
                case 'ctrl':
                    modifiers.add('ctrl');
                    return;
                case 'alt':
                    modifiers.add('alt');
                    return;
                case 'shift':
                    modifiers.add('shift');
                    return;
                case 'meta':
                case 'super':
                case 'command':
                case 'cmd':
                    modifiers.add('super');
                    return;
            }

            key = normalizeShortcutPart(part);
        });

    const orderedModifiers = ['ctrl', 'alt', 'shift', 'super'].filter(modifier => modifiers.has(modifier));
    return [...orderedModifiers, ...(key ? [key] : [])].join('+');
}

function normalizeShortcutPart(part: string): string {
    if (/^Key[A-Z]$/i.test(part)) return part.slice(3).toLowerCase();
    if (/^Digit[0-9]$/i.test(part)) return part.slice(5);
    const aliased = KEY_ALIASES[part] ?? KEY_ALIASES[part.toLowerCase()];
    if (aliased) return aliased;
    return part.toLowerCase();
}

function normalizeKey(key: string): string | null {
    if (KEY_ALIASES[key]) return KEY_ALIASES[key];
    if (/^[a-zA-Z0-9]$/.test(key)) return key.toLowerCase();
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key.toLowerCase();
    return null;
}
