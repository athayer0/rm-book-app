# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go)
npx expo start --ios    # open iOS simulator
npx expo start --android
npx tsc --noEmit        # type-check (no test suite exists)
```

Supabase credentials are required as env vars: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

## Architecture

React Native (Expo SDK 54) app with the new architecture enabled. No tests exist. TypeScript runs with `strict: true` (`tsconfig.json`) and the tree currently type-checks clean without `--skipLibCheck`.

### Data flow

All data is **local-first**. Every write goes to AsyncStorage immediately, then is queued to Supabase via `src/lib/syncQueue.ts`. The queue is drained on app focus and whenever the network comes back online (`NetInfo` listener in `App.tsx`). There is no optimistic rollback — local state is authoritative.

- `src/utils/storage.ts` — typed `getItem`/`setItem` wrappers around AsyncStorage (JSON).
- `src/lib/syncQueue.ts` — persists a queue of `{ table, type, row }` operations to AsyncStorage.
- `src/lib/sync.ts` — `drainQueue()` flushes the queue to Supabase; `pullAll()` does incremental sync using a `last_synced_at` watermark. Ops leave the queue only once confirmed sent. The watermark is the newest `updated_at` actually pulled, not the client clock — `updated_at` is stamped by a server-side trigger, so comparing against a local timestamp would drop rows on clock skew.
- `src/lib/rowMappers.ts` — local camelCase ⇄ Supabase snake_case. Every network write goes through `toRow`, which drops any key not in that table's column allowlist (PostgREST rejects the whole request on an unknown column).
- Auth state lives in `src/lib/AuthContext.tsx` (Supabase session, exposed via `useAuth()`).

### State management

No Redux or Zustand. Each feature has its own hook that owns AsyncStorage reads/writes:

| Hook | Storage key | What it manages |
|---|---|---|
| `usePeople` | `people` | Contact list |
| `useCalendarEvents` | `calendar_events` | Calendar events |
| `useWeeklyGoals` | `goal_counts_<weekKey>`, `goal_targets_<weekKey>`, `goal_definitions` | Goal counts, per-week targets, definitions |
| `useEventStatuses` | `event_statuses` | Per-occurrence status, keyed `eventId::date` |
| `useSettings` | `settings` | App-wide settings |

**Every key name lives in `src/constants/storageKeys.ts`.** Never build one inline — a key assembled at the call site is invisible to a rename, and fails by silently reading the wrong bucket rather than by erroring.

Hooks are built on `useStoredState` (`src/hooks/useStoredState.ts`), which subscribes to the key. `setItem` in `src/utils/storage.ts` notifies subscribers, so a write from anywhere — including `pullAll` writing AsyncStorage directly — reaches every live screen. Writes resolve against a ref rather than closed-over state, so two writes in the same tick don't clobber each other.

Settings are provided globally via `SettingsContext` (created in `useSettings.ts`, provided in `App.tsx`'s `SettingsProvider`).

### Theming

Colors are entirely dynamic — **every component resolves its palette at render time**. There is no static palette export to reach for.

- `src/constants/colors.ts` exports `LightColors`, `DarkColors`, and the `ColorPalette` type.
- `src/hooks/useColors.ts` — call `const Colors = useColors()` inside every component. It reads `settings.theme` ('light' | 'dark' | 'system') and React Native's `useColorScheme()` for system detection.
- `primary` is user-chosen (`settings.themeColor`, picked on the Settings screen), so `useColors` overrides it on top of the base palette. **Anything drawn on a `primary` background must use `onPrimary` / `onPrimaryMuted`, never `white`** — those two are recomputed from the chosen colour's luminance, so a pale header gets dark lettering instead of invisible white. The returned palette is memoized on `[isDark, themeColor]`; keep it that way, since every `useMemo(() => makeStyles(Colors), [Colors])` in the tree depends on the reference being stable.
- Styles must be computed inside the component: `const styles = useMemo(() => makeStyles(Colors), [Colors])` with a module-level `function makeStyles(C: ColorPalette) { return StyleSheet.create({...}); }`.

**Dark mode requirements — apply to every visual change:**

- Any new color must be added as a token to **both** `LightColors` and `DarkColors` in `src/constants/colors.ts`. Never hardcode hex/rgb values inside components.
- Choose dark-mode values that maintain sufficient contrast: light text on dark backgrounds, inverted surface hierarchy (e.g. dark cards on a darker background, not lighter cards).
- Shadows and elevation: use lower opacity or replace with subtle border/tint in dark mode rather than strong drop shadows.
- Semitransparent overlays (`rgba`): pick separate tokens for light vs. dark so the overlay reads correctly on each background.
- Icons, images, and non-text elements that use color should also reference `ColorPalette` tokens rather than fixed values.
- After any color/visual change, mentally verify both themes: does it look intentional in light mode **and** dark mode?

### Dropdowns

**Every dropdown in the app is `src/components/DropdownMenu.tsx`.** Do not hand-roll another one — four screens each had their own `dropdown`/`dropdownFloating`/`dropdownItem` styles before this, and they drifted apart. It exports four things:

- `DropdownMenu` — the floating panel. Animates in (opacity + scale from `transformOrigin: top`) and, crucially, **stays mounted through its own exit**, which is why `open` is a prop rather than the caller writing `{open && <Menu/>}`. `align` is `'stretch'` (match the trigger's width — the default, right for a field) or `'left'`/`'right'` (size to content and pin — right for a menu hanging off an icon button).
- `DropdownItem` — one row. Handles the press tint, the inset separator (`showSeparator={i < arr.length - 1}`), the selected checkmark, and the selection haptic. `leading` takes an icon or colour dot; that element owns its own right margin, since the row has no `gap`.
- `MenuDivider` — full-bleed, for dividing a menu into sections. Distinct from a row separator, which is inset.
- `Collapsible` — animated height, for panels that genuinely belong in the flow (a colour picker, a time wheel) where floating would tear the control away from the row it edits. Measures its content via `onLayout`, since `height: 'auto'` isn't animatable. Its content is **absolutely positioned, and must stay that way**: measuring it in normal flow measures it inside a box the component has just clamped to 0, so the height it reports is derived from the height being derived from it, and the panel can measure back as 0 and stay permanently blank. **Nothing containing an anchored `DropdownMenu` can go inside one** — its `overflow: 'hidden'` would clip the menu.

Menus use their own palette tokens (`menuSurface`, `menuSeparator`, `menuBorder`, `menuPressedBg`, `menuShadow`), not `card`/`border`. A menu floats *above* a card, so in dark mode it is lighter than the surface it covers.

`menuBorder` and `menuShadow` are a pair, and which one carries the edge flips with the theme. In light mode `menuSurface` is the same `#FFFFFF` as `card`, and nearly every menu opens over a card — so the surface distinguishes nothing, the hairline states where the panel starts, and the shadow only says how far above it floats. In dark mode a black shadow on a near-black background does almost nothing, so the hairline is most of the separation and the lifted surface supplies the rest. Neither can be dropped for the other. Note also that Android ignores `shadow*` entirely and draws only from `elevation`, so any change to the shadow needs a matching one there.

**Any screen holding a floating menu needs a lagging elevation state** (`elevatedDropdown` in `SettingsScreen`, `elevatedPicker` in `AddEditEventModal`, `elevated` in `AddEditPersonModal`). The `zIndex` that lifts a menu's group above its neighbours cannot be driven by the open flag: the menu now animates out over ~130ms and the flag is already false for all of it, so the menu would drop behind the rows below for its whole exit. These states lag the open flag downward and only ever move to another open menu, never back to `null`.

### Navigation

Bottom tab navigator (`@react-navigation/bottom-tabs`) with 4 tabs: Home, Calendar, People, Settings. Defined in `src/navigation.tsx`. Goals have no screen or tab of their own — they surface on `HomeScreen` through `GoalGrid` plus the `WeeklyPlanningModal` and `GoalWeeklyModal` sheets.

### Calendar

The calendar is a 3-pane sliding `Animated.View` (prev/current/next day) that enables swipe-to-navigate. Drag-and-drop uses `react-native-gesture-handler` with a `DragContext` provider (`src/components/DragContext.tsx`) wrapping `CalendarContent`. Dragging an event across the edge of the screen triggers day navigation via a `setInterval`.

Event layout (overlapping events rendered in columns) is computed by `computeEventLayout()` in `src/utils/eventUtils.ts` using a union-find algorithm. Backup events (`event.backup === true`) sort rightmost and have no status tracking.

### Goals

Goals are weekly counts tracked against a target (the `goal` field on `GoalDefinition`). Definitions are stored in `useWeeklyGoals`. Certain calendar event types auto-increment goal counts when marked completed (mapping defined in `getGoalContribution()` in `eventUtils.ts`): prayer → morning/nightly prayer goal, scripture → personal study, church → church hours (by duration), temple/exercise → their respective goals.

**There is no migration layer, and no legacy key names.** Storage keys and Supabase tables use "goal" wording throughout, and the only names the app knows are the ones in `storageKeys.ts`. The pre-rename `indicator_*` keys, the copy-forward migration, and the `schema_version` stamp were all removed once the last device holding old data was wiped — so a hook may assume the key it asks for is the only spelling that has ever existed. If a persisted shape ever needs to change again, add the version stamp back at that point rather than leaving one in place for a rename that already happened.

Per-week counts and targets share one `goal_entries` row per `(user, goal, week)`. Both columns are nullable and each writer sends **only its own column** — PostgREST builds the conflict update from the keys present, so a count write must not include `target` or it will clobber it.

Supabase PKs are composite (`user_id`, `id`). This is load-bearing: built-in goal ids like `morning_prayer` are the same literal for every user, so a bare `id` PK would let the first account to sync claim them permanently.

Week keys are strings like `"2025-W21"` generated by `getWeekKey()` in `src/utils/dateUtils.ts`.

### Icons

Two icon families are used: `@expo/vector-icons` `Ionicons` (default) and `MaterialCommunityIcons`. The `GoalIcon` component (`src/components/GoalIcon.tsx`) handles the dispatch. Always pass `iconFamily` alongside `icon` for goal definitions.
