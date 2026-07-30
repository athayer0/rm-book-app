import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from './hooks/useColors';
import { withTabSwipe } from './components/TabSwipe';
import { HomeScreen } from './screens/HomeScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

// Which tabs answer to a horizontal swipe. Calendar is the deliberate omission:
// it already owns that gesture for day navigation, so it can be swiped *to* from
// either neighbour but only left through the tab bar.
//
// Wrapped at module scope — doing it inline in the render would hand
// <Tab.Screen> a fresh component type on every pass and remount the screen.
const HomeTab = withTabSwipe(HomeScreen);
const PeopleTab = withTabSwipe(PeopleScreen);
const SettingsTab = withTabSwipe(SettingsScreen);

export function AppNavigation() {
  const Colors = useColors();

  return (
    <NavigationContainer>
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
            height: 105,
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
                  color={focused ? Colors.white : Colors.tabBarInactive}
                />
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeTab} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="People" component={PeopleTab} />
        <Tab.Screen name="Settings" component={SettingsTab} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
