/** Builds "?a=1&b=2" from filter values, skipping empty ones. */
export function toQueryString(values: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(values)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
