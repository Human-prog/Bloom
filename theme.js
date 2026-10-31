/**
 * Dark mode toggle: switches CSS variables + Electron window background.
 */
const defaultTheme = 'light';

function toggle(current) {
  const next = current === 'dark' ? 'light' : 'dark';
  return { theme: next, cssVars: { '--bg': next === 'dark' ? '#0d0d12' : '#f5f5f7', '--fg': next === 'dark' ? '#e5e5e7' : '#1a1a2e' } };
}

module.exports = { toggle, defaultTheme };
