/**
 * Copy for the collapsed LOCATION panel's two-line mini-status.
 *
 * Two navigation paths reach it and both must land somewhere real:
 *  - a preset city/POI pill, which carries a curated `{name, pois}` record;
 *  - a free-text geocode search, which carries only the formatted address
 *    string ("Tokyo, Japan", "Tokyo Tower, 4 Chome-2-8 Shibakoen, …, Japan").
 *
 * Before this existed only the pill path was rendered, so a search left the
 * readout reporting "Location: --" while the camera sat over the destination.
 */

import { t } from './i18n/index.js';

const EMPTY = Object.freeze({
  city: t('location.empty'),
  poi: t('location.landmarkEmpty'),
});

/** Split a geocoder `formatted_address` into its trimmed, non-empty segments. */
export function addressSegments(label) {
  return String(label ?? '')
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Build the collapsed LOCATION mini-status lines.
 *
 * A preset city always wins: it is the curated record the camera was framed
 * from, and its POI name is more useful than any address string. A searched
 * label is used only when no preset city is active, which is exactly the state
 * a free-text search leaves behind.
 *
 * @param {Object} [input]
 * @param {{name: string, label?: string, pois?: Array<{name: string,label?: string}>}|null} [input.city]
 *   Active preset city record, or null.
 * @param {{name: string,label?: string}|null} [input.currentPoi] - Currently framed preset POI.
 * @param {string} [input.searchedLabel] - Geocoded `formatted_address`.
 * @returns {{city: string, poi: string}} Line one and line two.
 */
export function locationMiniStatus({
  city = null,
  currentPoi = null,
  searchedLabel = '',
} = {}) {
  if (city?.name) {
    const fallbackPoi = city.pois?.[0] || null;
    return {
      city: `📍 ${city.label || city.name}`,
      poi: currentPoi?.label || currentPoi?.name || fallbackPoi?.label || fallbackPoi?.name || '--',
    };
  }

  const segments = addressSegments(searchedLabel);
  if (segments.length) {
    return {
      city: `📍 ${segments[0]}`,
      // The remaining address is the place's context ("Japan", "Minato City,
      // Tokyo, Japan"); the readout is ellipsised in CSS, so a long tail is
      // safe. A one-segment geocode ("Japan") has no context to show.
      poi: segments.length > 1 ? segments.slice(1).join(', ') : t('location.searched'),
    };
  }

  return { ...EMPTY };
}

export default locationMiniStatus;
