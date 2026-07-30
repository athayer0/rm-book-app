// How an interaction happened — the channel a contact went through, or the form
// a date took. Stored on the event as `contactMethod`.
//
// One table of methods, but each event type draws from its own slice of it: a
// contact by WhatsApp is ordinary, a date by WhatsApp is not. The field keeps its
// original name because the column does; what it means is "how", for any type
// that has a how.

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
 * that type's default, so both lists lead with in_person.
 *
 * Membership here is also what decides whether a type has a method at all — a
 * type absent from this table shows no picker and stores nothing.
 */
const METHOD_OPTIONS_BY_TYPE: Record<string, string[]> = {
  contact: ['in_person', 'phone', 'text', 'whatsapp', 'messenger', 'other'],
  date: ['in_person', 'video', 'other'],
};

export const DEFAULT_CONTACT_METHOD = 'in_person';

export function usesContactMethod(type: string): boolean {
  return type in METHOD_OPTIONS_BY_TYPE;
}

export function methodOptionsFor(type: string): string[] {
  return METHOD_OPTIONS_BY_TYPE[type] ?? [];
}

/** What the picker's row is called. A date's "how" is really what kind of date it is. */
export function methodFieldLabel(type: string): string {
  return type === 'date' ? 'Date Type' : 'Contact Method';
}

export function contactMethodLabel(method: string | undefined): string {
  return CONTACT_METHODS[method ?? '']?.label ?? CONTACT_METHODS[DEFAULT_CONTACT_METHOD].label;
}

/**
 * The method to actually use, given what's stored and what the type allows.
 *
 * Falls back rather than returning undefined, so callers never render a blank
 * row. Checking against the type's own options is what handles retyping: a
 * contact made on WhatsApp that is changed into a date can't stay a WhatsApp
 * date, so it lands on that type's default instead.
 */
export function resolveContactMethod(method: string | undefined, type: string): string {
  const options = methodOptionsFor(type);
  if (options.length === 0) return DEFAULT_CONTACT_METHOD;
  return method && options.includes(method) ? method : options[0];
}
