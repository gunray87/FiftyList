import { Tabs } from 'expo-router';
import { BookOpen, Film, TrendingUp, Sparkles } from 'lucide-react-native';
import { View, StyleSheet, Platform } from 'react-native';
import ViewportFix from '@/components/ViewportFix';

export default function TabLayout() {
  return (
    <>
      <ViewportFix />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: [
            styles.tabBar,
            Platform.OS === 'web' && styles.webTabBar
          ],
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#6B7280',
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarIconStyle: styles.tabBarIcon,
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Books',
            tabBarIcon: ({ size, color }) => (
              <View style={styles.iconContainer}>
                <BookOpen size={size} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="movies"
          options={{
            title: 'Movies',
            tabBarIcon: ({ size, color }) => (
              <View style={styles.iconContainer}>
                <Film size={size} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="suggestions"
          options={{
            title: 'Suggestions',
            tabBarIcon: ({ size, color }) => (
              <View style={styles.iconContainer}>
                <Sparkles size={size} color={color} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: 'Stats',
            tabBarIcon: ({ size, color }) => (
              <View style={styles.iconContainer}>
                <TrendingUp size={size} color={color} />
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
    paddingBottom: 8,
    height: 80,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  webTabBar: {
    // Ensure proper height on web
    minHeight: 80,
    maxHeight: 80,
  },
  tabBarLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    marginTop: 4,
  },
  tabBarIcon: {
    marginBottom: 0,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});