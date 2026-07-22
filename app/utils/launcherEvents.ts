export const LAUNCHER_SHELF_CHANGED_EVENT = 'fusen:launcher_shelf_changed';

export function shouldReloadLauncherForEvent(eventName: string): boolean {
    return eventName === LAUNCHER_SHELF_CHANGED_EVENT;
}
