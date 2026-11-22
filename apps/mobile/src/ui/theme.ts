/**
 * SmileSync brand, taken from the logo: deep navy, teal, blue and the warm
 * amber at the end of the smile. NFR 3: large targets and high-contrast text,
 * since CHWs often work outdoors in bright sun. Every text/background pair is
 * checked against WCAG AA in src/core/contrast.test.ts.
 */
export const colors = {
  /** The logo's background. Brand bands and headers; the logo sits on it seamlessly. */
  navy: '#0F1D40',
  /** Raised elements on navy (progress track, fields on the login screen). */
  navySoft: '#24366B',
  onNavy: '#FFFFFF',
  onNavyMuted: '#BAC6E2',

  /** Main action buttons: bright teal from the logo, with navy text. */
  action: '#2EC4B6',
  actionText: '#0F1D40',
  /** Deep teal: links, secondary buttons, selected choices, progress. Readable on white. */
  primary: '#0B7A72',
  primaryText: '#FFFFFF',
  /** Amber from the smile: highlights and "waiting" states. */
  accent: '#F5A443',

  bg: '#EEF2F8',
  surface: '#FFFFFF',
  text: '#0F1D40',
  muted: '#4B5675',
  border: '#CBD3E3',
  /** Disabled buttons: light enough that their muted label still reads in sunlight. */
  disabledBg: '#E4E9F2',
  danger: '#B3261E',
  warnBg: '#FFF1DC',
  warnText: '#7A4100',
  errorBg: '#FCE4E2',
  okBg: '#E1F6F3',
} as const;

export const size = {
  /** Minimum touch target, above the 48 dp platform guideline (NFR 3). */
  touch: 56,
  gutter: 18,
  radius: 14,
  text: 17,
  small: 14,
  title: 22,
  /** Content column width on large phones and tablets, centred. */
  column: 520,
} as const;
