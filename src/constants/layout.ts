// Shared screen-chrome measurements that live outside navigation.tsx so
// components can read them without importing the navigator itself — every
// screen component is already imported *by* navigation.tsx, and importing
// back from it would be a circular dependency.

/** Height of the bottom tab bar, set in navigation.tsx's `tabBarStyle`. */
export const TAB_BAR_HEIGHT = 105;
