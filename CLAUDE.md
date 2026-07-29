# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go)
npx expo start --ios    # open iOS simulator
npx expo start --android
npx tsc --noEmit --skipLibCheck   # type-check (no test suite exists)
```

Supabase credentials are required as env vars: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Architecture

React Native (Expo SDK 54) app with the new architecture enabled. No tests exist. TypeScript strict mode is off; `--skipLibCheck` is needed for tsc.

### Data flow

All data is **local-first**. Every write goes to AsyncStorage immediately, then is queued to Supabase via `src/lib/syncQueue.ts`. The queue is drained on app focus and whenever the network comes back online (`NetInfo` listener in `App.tsx`). There is no optimistic rollback — local state is authoritative.

- `src/utils/storage.ts` — typed `getItem`/`setItem` wrappers around AsyncStorage (JSON).
- `src/lib/syncQueue.ts` — persists a queue of `{ table, type, row }` operations to AsyncStorage.
- `src/lib/sync.ts` — `drainQueue()` flushes the queue to Supabase; `pullAll()` does incremental sync using a `last_synced_at` timestamp.
- Auth state lives in `src/lib/AuthContext.tsx` (Supabase session, exposed via `useAuth()`).

### State management

No Redux or Zustand. Each feature has its own hook that owns AsyncStorage reads/writes:

| Hook | Storage key | What it manages |
|---|---|---|
| `usePeople` | `people` | Contact list |
| `useCalendarEvents` | `calendar_events` | Calendar events |
| `useWeeklyGoals` | `indicators_<weekKey>`, `indicator_definitions` | Goal counts + definitions |
| `useEventStatuses` | `event_status_<date>` | Per-event status (pending/completed/failed) |
| `useSettings` | `settings` | App-wide settings |

Settings are provided globally via `SettingsContext` (created in `useSettings.ts`, provided in `App.tsx`'s `SettingsProvider`).

### Theming

Colors are entirely dynamic — **never use the static `Colors` export in new UI code**.

- `src/constants/colors.ts` exports `LightColors`, `DarkColors`, `ColorPalette` type. `Colors = LightColors` exists only as a static fallback.
- `src/hooks/useColors.ts` — call `const Colors = useColors()` inside every component. It reads `settings.theme` ('light' | 'dark' | 'system') and React Native's `useColorScheme()` for system detection.
- Styles must be computed inside the component: `const styles = useMemo(() => makeStyles(Colors), [Colors])` with a module-level `function makeStyles(C: ColorPalette) { return StyleSheet.create({...}); }`.

**Dark mode requirements — apply to every visual change:**

- Any new color must be added as a token to **both** `LightColors` and `DarkColors` in `src/constants/colors.ts`. Never hardcode hex/rgb values inside components.
- Choose dark-mode values that maintain sufficient contrast: light text on dark backgrounds, inverted surface hierarchy (e.g. dark cards on a darker background, not lighter cards).
- Shadows and elevation: use lower opacity or replace with subtle border/tint in dark mode rather than strong drop shadows.
- Semitransparent overlays (`rgba`): pick separate tokens for light vs. dark so the overlay reads correctly on each background.
- Icons, images, and non-text elements that use color should also reference `ColorPalette` tokens rather than fixed values.
- After any color/visual change, mentally verify both themes: does it look intentional in light mode **and** dark mode?

### Navigation

Bottom tab navigator (`@react-navigation/bottom-tabs`) with 4 tabs: Home, Calendar, People, Settings. Defined in `src/navigation.tsx`. `GoalsScreen` exists but is not currently wired into the tab bar.

### Calendar

The calendar is a 3-pane sliding `Animated.View` (prev/current/next day) that enables swipe-to-navigate. Drag-and-drop uses `react-native-gesture-handler` with a `DragContext` provider (`src/components/DragContext.tsx`) wrapping `CalendarContent`. Dragging an event across the edge of the screen triggers day navigation via a `setInterval`.

Event layout (overlapping events rendered in columns) is computed by `computeEventLayout()` in `src/utils/eventUtils.ts` using a union-find algorithm. Backup events (`event.backup === true`) sort rightmost and have no status tracking.

### Goals

Goals are weekly counts tracked against a target (the `goal` field on `GoalDefinition`). Definitions are stored in `useWeeklyGoals`. Certain calendar event types auto-increment goal counts when marked completed (mapping defined in `getGoalContribution()` in `eventUtils.ts`): prayer → morning/nightly prayer goal, scripture → personal study, church → church hours (by duration), temple/exercise → their respective goals.

**Persistence names are intentionally stale:** the AsyncStorage keys (`indicators_<weekKey>`, `indicator_goals_<weekKey>`, `indicator_definitions`) and the Supabase tables/columns (`indicator_definitions`, `indicator_entries`, `indicator_id`) keep the original "indicator" wording so data written by earlier versions still loads. Renaming them requires a migration — don't "fix" them to match the code.

Week keys are strings like `"2025-W21"` generated by `getWeekKey()` in `src/utils/dateUtils.ts`.

### Icons

Two icon families are used: `@expo/vector-icons` `Ionicons` (default) and `MaterialCommunityIcons`. The `GoalIcon` component (`src/components/GoalIcon.tsx`) handles the dispatch. Always pass `iconFamily` alongside `icon` for goal definitions.
