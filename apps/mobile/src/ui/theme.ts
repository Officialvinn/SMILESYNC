/**
 * NFR 3: large touch targets and large text for use outdoors, often in
 * bright sun, by health workers who may not use smartphones daily.
 */
export const colors = {
  bg: '#F7F7F5',
  surface: '#FFFFFF',
  text: '#1B1F23',
  muted: '#5A636B',
  border: '#C9CED3',
  primary: '#0B6E4F',
  primaryText: '#FFFFFF',
  danger: '#B42318',
  warnBg: '#FFF4D6',
  warnText: '#6B4A00',
  errorBg: '#FDE7E5',
  okBg: '#E3F4EC',
} as const;

export const size = {
  /** Minimum touch target, above the 48 dp platform guideline (NFR 3). */
  touch: 56,
  gutter: 16,
  radius: 12,
  text: 17,
  small: 14,
  title: 22,
} as const;
