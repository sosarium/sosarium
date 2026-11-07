import { getPreferences, subscribePreferences, type ThemeChoice, updatePreferences } from './preferences';

export function applyTheme(theme: ThemeChoice): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: ThemeChoice): void {
  updatePreferences({ theme });
  applyTheme(theme);
}

export function watchTheme(): () => void {
  applyTheme(getPreferences().theme);
  return subscribePreferences(() => applyTheme(getPreferences().theme));
}
