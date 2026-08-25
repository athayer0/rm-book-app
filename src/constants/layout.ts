// Shared screen-chrome measurements that live outside navigation.tsx so
// components can read them without importing the navigator itself — every
// screen component is already imported *by* navigation.tsx, and importing
// back from it would be a circular dependency.

/** Height of the bottom tab bar, set in navigation.tsx's `tabBarStyle`. */
export const TAB_BAR_HEIGHT = 96;

/**
 * Height of each tab screen's own primary-colored header (Home, Calendar,
 * People, Settings all build one to this same `minHeight`). Centralized so
 * SheetModal's topInset gap and HomeLoadingScreen's static header mirror
 * can't drift from the real thing.
 */
export const HEADER_HEIGHT = 56;
