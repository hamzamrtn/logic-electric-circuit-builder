// Development harness only: supply the CSS variables Obsidian supplies in the real host.
export function setDevelopmentTheme(mode: 'light' | 'dark') {
  const dark = mode === 'dark';
  const values = {
    '--background-primary': dark ? '#1e1e1e' : '#ffffff',
    '--background-secondary': dark ? '#262626' : '#f6f6f6',
    '--background-secondary-alt': dark ? '#303030' : '#eeeeee',
    '--background-modifier-border': dark ? '#414141' : '#dddddd',
    '--background-modifier-hover': dark ? '#383838' : '#e8e8e8',
    '--text-normal': dark ? '#dadada' : '#222222',
    '--text-muted': dark ? '#aaa' : '#666',
    '--interactive-accent': dark ? '#a5a5a5' : '#626262',
    '--text-on-accent': dark ? '#171717' : '#ffffff',
  };
  for (const [name, value] of Object.entries(values)) document.documentElement.style.setProperty(name, value);
  document.documentElement.style.colorScheme = mode;
}
