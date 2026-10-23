/** The sizes the Ostrovok CDN serves: cards and thumbnails, and the gallery. */
export type OstrovokImageSize = '640x400' | '1024x768'

/**
 * The URL of an Ostrovok CDN photo at a size: the template has `{size}` in its path, e.g.
 * `https://cdn.ostrovok.ru/t/{size}/content/dd/97/….jpeg`. The CDN serves the stored format and ignores
 * `?format=webp`, so the URL has no query.
 */
export const ostrovokImage = (template: string, size: OstrovokImageSize) => template.replace('{size}', size)
