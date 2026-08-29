import { createNavigationContainerRef } from '@react-navigation/native';

// Lets code outside the navigation tree (the notification tap handler in
// App.tsx, the goal-reorder shortcut in SettingsScreen) send the user to a
// tab without the modal it opens having to live anywhere but HomeScreen,
// where the rest of its state already does. Lives in its own file so
// navigation.tsx and its screens don't have to import each other for it.
export const navigationRef = createNavigationContainerRef<any>();
