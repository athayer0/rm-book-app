import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import { HomeScreen } from './screens/HomeScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { GoalsScreen } from './screens/GoalsScreen';
import { PeopleScreen } from './screens/PeopleScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

export function AppNavigation() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.tabBarInactive,
          tabBarStyle: {
            backgroundColor: Colors.white,
            borderTopColor: Colors.border,
            borderTopWidth: 1,
            paddingBottom: 4,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: -2,
          },
          tabBarIcon: ({ color, focused }) => {
            const icons: Record<string, string> = {
              Home: focused ? 'home' : 'home-outline',
              Calendar: focused ? 'calendar' : 'calendar-outline',
              Goals: focused ? 'stats-chart' : 'stats-chart-outline',
              People: focused ? 'people' : 'people-outline',
              Settings: focused ? 'settings' : 'settings-outline',
            };
            const iconName = icons[route.name] ?? 'ellipse';
            return <Ionicons name={iconName as any} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Goals" component={GoalsScreen} />
        <Tab.Screen name="People" component={PeopleScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
