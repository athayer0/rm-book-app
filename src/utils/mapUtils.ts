import { Alert, Linking, Platform } from 'react-native';

/** Which app an iPhone opens an address in. Android always uses Google Maps. */
export type MapsApp = 'apple' | 'google';

export const MAPS_APP_OPTIONS: { key: MapsApp; label: string }[] = [
  { key: 'apple', label: 'Apple Maps' },
  { key: 'google', label: 'Google Maps' },
];

export const DEFAULT_MAPS_APP: MapsApp = 'apple';

export function mapsAppLabel(app: MapsApp | undefined): string {
  return MAPS_APP_OPTIONS.find(o => o.key === app)?.label
    ?? MAPS_APP_OPTIONS.find(o => o.key === DEFAULT_MAPS_APP)!.label;
}

/**
 * An address as a maps app wants it: one line, no stray whitespace. Both
 * providers do their own fuzzy matching, so nothing is parsed out of it — the
 * newlines a pasted address arrives with just become separators.
 *
 * Returns '' when there is nothing to search for, which is what hides the pin.
 */
export function toMapQuery(address: string | null | undefined): string {
  return (address ?? '').replace(/\s+/g, ' ').trim();
}

/** openURL, reporting whether anything handled it rather than alerting. */
async function tryOpen(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens `address` in a maps app.
 *
 * Android goes straight to Google Maps rather than to a `geo:` intent, which
 * would raise the system chooser instead. iOS honours the Settings preference:
 * there is no URL that resolves to "whatever the user set as default", so the
 * choice has to be one the app stores itself.
 *
 * The Google link is the documented cross-platform https one, so a device
 * without the app installed lands on the web map instead of throwing. On iOS
 * the comgooglemaps:// scheme is tried first — a universal link handed over by
 * another app sometimes still opens in Safari, and the scheme does not.
 * canOpenURL is deliberately not consulted: it answers false for any scheme
 * missing from LSApplicationQueriesSchemes, so it would skip the app link on a
 * phone that has Google Maps right there.
 */
export async function openMaps(
  address: string | null | undefined,
  preferred: MapsApp | undefined,
): Promise<void> {
  const query = toMapQuery(address);
  if (!query) return;
  const encoded = encodeURIComponent(query);
  const googleWeb = `https://www.google.com/maps/search/?api=1&query=${encoded}`;

  if (Platform.OS === 'ios') {
    if ((preferred ?? DEFAULT_MAPS_APP) === 'apple') {
      if (await tryOpen(`http://maps.apple.com/?q=${encoded}`)) return;
    } else if (await tryOpen(`comgooglemaps://?q=${encoded}`)) {
      return;
    }
  }

  if (await tryOpen(googleWeb)) return;
  Alert.alert(
    'Can’t open Maps',
    'Nothing on this device could open the address.',
  );
}
