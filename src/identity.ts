/** Paperclip cap-v1 palette identifiers; colors below are original office interpretations.
 * No arbitrary color, URL, ID or upstream configuration reaches the renderer. */
export const PALETTES = {
  'bubblegum-sky': ['#ee91bb', '#71c6e5'], 'pink-lemonade': ['#ed83ac', '#efd17d'],
  'orchid-peach': ['#b597df', '#edb598'], 'coral-mint': ['#e98e82', '#8bd1bd'],
  'lime-lagoon': ['#bed77c', '#65b9bb'], 'arctic-blue': ['#83c8e2', '#adcbe8'],
  'solar-flare': ['#efb75d', '#de795c'], 'violet-ember': ['#b393dd', '#e29a64'],
  'deep-tide': ['#659caf', '#8cc8c2'], 'coral-current': ['#ea918a', '#76b9cb'],
  'golden-hour': ['#e7c076', '#bd8f76'], 'tangerine-cobalt': ['#ec9c62', '#8b9ed8'],
  'electric-grove': ['#a8ce74', '#69b494'], 'flamingo-jade': ['#e394b0', '#70bca5'],
  'cherry-pop': ['#db7a91', '#efb5bf'], 'turquoise-cherry': ['#6cc5c4', '#d9899d'],
  'ultraviolet-tide': ['#ad92df', '#71bdcb'],
} as const
export type PaletteId = keyof typeof PALETTES
export type Appearance = Readonly<{ schemaVersion: 1; characterVersion: 'cap-v1'; paletteId: PaletteId }>
export type Identity = Readonly<{ name: string; role: string; avatarUrl?: string; appearance?: Appearance }>
export function appearancePalette(value: unknown): PaletteId | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return
  if (Object.keys(value).length !== 3 || !['schemaVersion', 'characterVersion', 'paletteId'].every(k => Object.hasOwn(value, k))) return
  const a = value as Record<string, unknown>
  if (a.schemaVersion === 1 && a.characterVersion === 'cap-v1' && typeof a.paletteId === 'string' && Object.hasOwn(PALETTES, a.paletteId)) return a.paletteId as PaletteId
}
export function identityText(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || fallback : fallback
}

/** Project only the validated tuple. Never reproduce Paperclip's ID-derived default. */
export function normalizeAppearance(value: unknown): Appearance | undefined {
  const paletteId = appearancePalette(value)
  return paletteId ? Object.freeze({ schemaVersion: 1, characterVersion: 'cap-v1', paletteId }) : undefined
}
export function appearanceKey(identity?: Identity): string | undefined {
  const a = identity?.appearance
  return a ? `${a.schemaVersion}:${a.characterVersion}:${a.paletteId}` : undefined
}
export function appearanceLabel(identity?: Identity): string {
  return identity?.appearance ? `Paperclip · ${identity.appearance.paletteId}` : 'Local fallback · appearance unavailable'
}

/** Only native public avatar paths are accepted, never arbitrary remote images. */
export function normalizeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return
  const match = /^\/api\/agent-avatars\/(cap-v1)\/([a-z-]+)\/rest\.png(?:\?size=\d+&scale=\d+)?$/.exec(value)
  return match && Object.hasOwn(PALETTES, match[2]) ? value : undefined
}
