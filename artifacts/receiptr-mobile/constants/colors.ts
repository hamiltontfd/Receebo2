/**
 * Receebo Mobile — semantic design tokens.
 * Synced from the web app's index.css minimal monochrome palette.
 * HSL → hex conversions: 0 0% L% → hsl(0,0%,L%) → hex
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#121212',
    tint: '#121212',

    background: '#ffffff',
    foreground: '#121212',

    card: '#ffffff',
    cardForeground: '#121212',

    primary: '#121212',
    primaryForeground: '#ffffff',

    secondary: '#f5f5f5',
    secondaryForeground: '#121212',

    muted: '#f5f5f5',
    mutedForeground: '#737373',

    accent: '#f5f5f5',
    accentForeground: '#121212',

    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    border: '#e6e6e6',
    input: '#e6e6e6',
  },

  dark: {
    text: '#fafafa',
    tint: '#fafafa',

    background: '#121212',
    foreground: '#fafafa',

    card: '#1a1a1a',
    cardForeground: '#fafafa',

    primary: '#fafafa',
    primaryForeground: '#121212',

    secondary: '#2e2e2e',
    secondaryForeground: '#fafafa',

    muted: '#2e2e2e',
    mutedForeground: '#999999',

    accent: '#2e2e2e',
    accentForeground: '#fafafa',

    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    border: '#2e2e2e',
    input: '#2e2e2e',
  },

  // Border radius in px — matches web app's --radius: 0.5rem (8px)
  radius: 8,
};

export default colors;
