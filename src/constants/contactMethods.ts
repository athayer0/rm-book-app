// How an interaction happened — the channel a contact went through, or the form
// a date took. Stored on the event as `contactMethod`.
//
// One table of methods, but each event type draws from its own slice of it: a
// contact by WhatsApp is ordinary, a date by WhatsApp is not. The field keeps its
// original name because the column does; what it means is "how", for any type
// that has a how.

import type { TFunction } from 'i18next';

export interface ContactMethodConfig {
  label: string;
  icon: string;
  /** Matches GoalIcon's dispatch: anything else falls through to Ionicons. */
  iconFamily: 'Ionicons' | 'MaterialCommunityIcons';
}

export const CONTACT_METHODS: Record<string, ContactMethodConfig> = {
  in_person: { label: 'In Person', icon: 'people', iconFamily: 'Ionicons' },
  phone:     { label: 'Phone Call', icon: 'call', iconFamily: 'Ionicons' },
  text:      { label: 'Text', icon: 'chatbubble', iconFamily: 'Ionicons' },
  whatsapp:  { label: 'WhatsApp', icon: 'whatsapp', iconFamily: 'MaterialCommunityIcons' },
  messenger: { label: 'Messenger', icon: 'facebook-messenger', iconFamily: 'MaterialCommunityIcons' },
  video:     { label: 'Video Call', icon: 'videocam', iconFamily: 'Ionicons' },
  other:     { label: 'Other', icon: 'ellipsis-horizontal', iconFamily: 'Ionicons' },
};

/**
 * Which methods each event type offers, in dropdown order. The first entry is
 * that type's fallback — what it lands on when nothing else applies.
 *
 * Membership here is also what decides whether a type has a method at all — a
 * type absent from this table shows no picker and stores nothing.
 */
const METHOD_OPTIONS_BY_TYPE: Record<string, string[]> = {
  contact: ['in_person', 'phone', 'text', 'whatsapp', 'messenger', 'other'],
  date: ['in_person', 'video', 'other'],
};

/** What a new contact starts as before the user has chosen otherwise. */
export const DEFAULT_CONTACT_METHOD = 'phone';

/** The choices the setting offers — a contact's own list, since that is what it governs. */
export const DEFAULT_METHOD_CHOICES = METHOD_OPTIONS_BY_TYPE.contact;

/**
 * Types the user's default applies to.
 *
 * Contacts only. A date's "how" is really what kind of date it was — a different
 * question off a different list, so it keeps its own first entry however the
 * contact default is set.
 */
const PREFERENCE_APPLIES_TO = new Set(['contact']);

export function usesContactMethod(type: string): boolean {
  return type in METHOD_OPTIONS_BY_TYPE;
}

export function methodOptionsFor(type: string): string[] {
  return METHOD_OPTIONS_BY_TYPE[type] ?? [];
}

/** What the picker's row is called. A date's "how" is really what kind of date it is. */
export function methodFieldLabel(type: string, t: TFunction): string {
  return type === 'date' ? t('contactMethods.field.dateType') : t('contactMethods.field.contactMethod');
}

export function contactMethodLabel(method: string | undefined, t: TFunction): string {
  const id = method && CONTACT_METHODS[method] ? method : DEFAULT_CONTACT_METHOD;
  return t(`contactMethods.${id}`, { defaultValue: CONTACT_METHODS[id].label });
}

/**
 * The method to actually use, given what's stored and what the type allows.
 *
 * Falls back rather than returning undefined, so callers never render a blank
 * row. Checking against the type's own options is what handles retyping: a
 * contact made on WhatsApp that is changed into a date can't stay a WhatsApp
 * date, so it lands on that type's fallback instead.
 *
 * `preferred` is the user's setting, and callers pass it only where it belongs:
 * seeding a method the user has yet to choose. Reading an event that already has
 * one back out is not that — a stored method wins outright, and an event saved
 * before the field existed keeps answering the same way rather than shifting
 * because a preference about new events changed.
 */
export function resolveContactMethod(
  method: string | undefined,
  type: string,
  preferred?: string,
): string {
  const options = methodOptionsFor(type);
  if (options.length === 0) return DEFAULT_CONTACT_METHOD;
  if (method && options.includes(method)) return method;
  if (preferred && PREFERENCE_APPLIES_TO.has(type) && options.includes(preferred)) return preferred;
  return options[0];
}
