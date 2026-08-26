export function isTauriRuntime(isTauriBuild?: string, isTauriDev?: string) {
  return isTauriBuild === 'true' || isTauriDev === '1';
}
