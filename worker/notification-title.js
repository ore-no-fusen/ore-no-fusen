export function getDefaultNotificationTitle(language) {
  return language?.startsWith('ja') ? '俺の付箋' : 'FUSEN';
}

export function resolvePushTitles(title, language) {
  const noteTitle = title || '';
  return {
    noteTitle,
    notificationTitle: noteTitle || getDefaultNotificationTitle(language),
  };
}
