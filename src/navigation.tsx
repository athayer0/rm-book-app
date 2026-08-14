import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './hooks/useColors';
import { HomeScreen } from './screens/HomeScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TAB_BAR_HEIGHT } from './constants/layout';

const Tab = createBottomTabNavigator();

// Lets code outside the navigation tree (the notification tap handler in
// App.tsx) send the user to a tab without the modal it opens having to live
// anywhere but HomeScreen, where the rest of its state already does.
export const navigationRef = createNavigationContainerRef<any>();

export function AppNavigation() {
  const Colors = useColors();

  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: Colors.tabBar,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingBottom: 10,
            paddingTop: 10,
            height: TAB_BAR_HEIGHT,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: -2,
          },
          tabBarShowLabel: false,
          tabBarIcon: ({ focused }) => {
            const icons: Record<string, string> = {
              Home: focused ? 'home' : 'home-outline',
              Calendar: focused ? 'calendar' : 'calendar-outline',
              People: focused ? 'people' : 'people-outline',
              Settings: focused ? 'settings' : 'settings-outline',
            };
            const iconName = icons[route.name] ?? 'ellipse';
            return (
              <View style={{
                width: 56,
                height: 34,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: focused ? Colors.primary : 'transparent',
              }}>
                <Ionicons
                  name={iconName as any}
                  size={22}
                  color={focused ? Colors.onPrimary : Colors.tabBarInactive}
                />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="People" component={PeopleScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
