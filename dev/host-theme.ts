// Development harness only: supply the CSS variables Obsidian supplies in the real host.
export function setDevelopmentTheme(mode: 'light' | 'dark') {
  document.documentElement.classList.add('lec-development');
  document.documentElement.classList.toggle('lec-development-dark', mode === 'dark');
}
