import { Alert, Linking } from 'react-native';
import type { TFunction } from 'i18next';

// A tel: URI only carries dialable characters — the formatting a user types
// (spaces, dashes, parens) is dropped rather than percent-encoded.
export function toDialable(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^\d+*#,;]/g, '');
}

/**
 * wa.me addresses people by full international number: digits only, country
 * code included, no '+' and no punctuation. A number already stored with a
 * leading '+' carries its own code; anything else is treated as a US/Canada
 * local number, since a number from anywhere else is expected to already be
 * saved with its own '+' code.
 *
 * The leading zero of a local number is dropped when a code is prepended —
 * that zero is a national trunk prefix (UK 07700…, DE 030…) and is never part
 * of the international form. NANP numbers never start with one, so this is a
 * no-op for the US/Canada numbers this fallback actually applies to.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  return '1' + digits.replace(/^0+/, '');
}

/**
 * Messenger addresses people by handle, so anything identifying the profile
 * will do: an m.me link, a facebook.com profile URL, or the bare username.
 * Numeric-id URLs (profile.php?id=… and /people/Name/…) resolve through m.me
 * too, so the id is pulled out of those rather than the display name.
 *
 * Returns '' when nothing handle-shaped is left, which is what hides the button.
 */
export function toMessengerHandle(link: string | null | undefined): string {
  const raw = (link ?? '').trim();
  if (!raw) return '';

  const queryId = raw.match(/[?&]id=(\d+)/);
  if (queryId) return queryId[1];
  const pathId = raw.match(/\/people\/[^/]+\/(\d+)/);
  if (pathId) return pathId[1];

  const handle = raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^(?:www\.)?(?:m\.me|messenger\.com|facebook\.com|fb\.com|fb\.me)\//i, '')
    .replace(/^t\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '');

  // Usernames are letters, digits and periods. A slash or any other character
  // surviving this far means the input was not a profile we recognise.
  return /^[A-Za-z0-9.]+$/.test(handle) ? handle : '';
}

/**
 * The Facebook app's "Copy link" hands back facebook.com/share/<token>/ — an
 * opaque redirect, not a profile. Only Facebook can expand it, so it earns a
 * hint of its own rather than the generic "couldn't read that" message.
 */
export function isFacebookShareLink(link: string | null | undefined): boolean {
  return /facebook\.com\/share\//i.test((link ?? '').trim());
}

// openURL rather than a canOpenURL gate: on Android 11+ canOpenURL answers
// false for tel:/sms: unless the manifest declares a matching <queries> intent,
// so gating would hide a button that in fact works. Failure surfaces as an alert.
async function open(url: string, failureTitle: string, failureBody: string): Promise<void> {
  if (!(await tryOpen(url))) Alert.alert(failureTitle, failureBody);
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

export async function callNumber(phone: string | null | undefined, t: TFunction): Promise<void> {
  const dialable = toDialable(phone);
  if (!dialable) return;
  await open(
    `tel:${dialable}`,
    t('phoneUtils.cantPlaceCallTitle'),
    t('phoneUtils.cantPlaceCallBody'),
  );
}

export async function messageNumber(phone: string | null | undefined, t: TFunction): Promise<void> {
  const dialable = toDialable(phone);
  if (!dialable) return;
  await open(
    `sms:${dialable}`,
    t('phoneUtils.cantStartMessageTitle'),
    t('phoneUtils.cantStartMessageBody'),
  );
}

// The https links, not the whatsapp:// and fb-messenger:// schemes: with the app
// installed the OS hands them straight to it, and without it they fall back to
// the web page instead of throwing.
export async function openWhatsApp(
  phone: string | null | undefined,
  t: TFunction,
): Promise<void> {
  const number = toWhatsAppNumber(phone);
  if (!number) return;
  await open(
    `https://wa.me/${number}`,
    t('phoneUtils.cantOpenWhatsappTitle'),
    t('phoneUtils.cantOpenWhatsappBody'),
  );
}

/**
 * fb-messenger://user-thread/<id> opens the installed app straight onto the
 * thread, with no browser in between — but it only accepts the numeric profile
 * id, which is why a profile saved by id behaves better than one saved by
 * username. Usernames have no app-scheme equivalent and go via m.me.
 *
 * Falling back on failure covers the app not being installed: the scheme
 * rejects, and m.me lands on the web page instead. canOpenURL is deliberately
 * not used to decide — iOS answers false for any scheme missing from
 * LSApplicationQueriesSchemes, so it would skip the app link on a device that
 * has Messenger right there.
 */
export async function openMessenger(link: string | null | undefined, t: TFunction): Promise<void> {
  const handle = toMessengerHandle(link);
  if (!handle) return;
  if (/^\d+$/.test(handle) && await tryOpen(`fb-messenger://user-thread/${handle}`)) return;
  await open(
    `https://m.me/${handle}`,
    t('phoneUtils.cantOpenMessengerTitle'),
    t('phoneUtils.cantOpenMessengerBody'),
  );
}
