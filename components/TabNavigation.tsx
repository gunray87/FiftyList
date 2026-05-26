import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Fallback only if caller omits accent (defaults to Books sand/amber tone). */
const DEFAULT_PRIMARY = '#D97706';

function hexToRgbA(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6 || Number.isNaN(parseInt(h, 16))) {
    return `rgba(115, 115, 115, ${alpha})`;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  count: number;
}

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: Tab[];
  /** Screen accent: Books `#D97706` (amber), Movies `#3B82F6` (blue). */
  primaryColor: string;
  isDark?: boolean;
  /** Screen background behind chips (used for scroll fade edge). */
  backgroundColor?: string;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
  tabs,
  primaryColor,
  isDark = false,
  backgroundColor,
}: TabNavigationProps) {
  const accent = primaryColor || DEFAULT_PRIMARY;

  const palette = useMemo(() => {
    const inactiveBorder = isDark ? '#2A2A4A' : hexToRgbA(accent, 0.38);
    const badgeMuted = hexToRgbA(accent, isDark ? 0.18 : 0.12);
    // Movies (dark / blue): cool blue tints. Books (light / amber): warm stone.
    const inactiveIcon = isDark ? '#93C5FD' : '#78716C';
    const inactiveLabel = isDark ? 'rgba(226, 232, 240, 0.95)' : '#57534E';
    const badgeTextInactive = isDark ? '#BFDBFE' : '#57534E';

    return {
      inactiveBorder,
      badgeMuted,
      inactiveIcon,
      inactiveLabel,
      badgeTextInactive,
    };
  }, [accent, isDark]);

  const [showLeftFade, setShowLeftFade] = useState(false);

  const onHorizontalScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setShowLeftFade(x > 8);
  };

  return (
    <View style={styles.wrapper} accessibilityRole="tablist" accessibilityLabel="Category navigation">
      <View style={styles.track}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onHorizontalScroll}
          contentContainerStyle={styles.scrollContent}
          accessibilityLabel="Category tabs"
        >
          {tabs.map((tab, index) => {
            const isActive = activeTab === tab.key;
            const IconComponent = tab.icon;

            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.chip,
                  index === tabs.length - 1 && styles.chipLast,
                  !isActive && { borderColor: palette.inactiveBorder, backgroundColor: 'transparent' },
                  isActive && { backgroundColor: accent, borderColor: accent },
                ]}
                onPress={() => onTabChange(tab.key)}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} category, ${tab.count} items`}
                accessibilityHint={`Switch to ${tab.label} category`}
                accessibilityState={{ selected: isActive }}
                activeOpacity={0.85}
              >
                <IconComponent
                  size={16}
                  color={isActive ? '#FFFFFF' : palette.inactiveIcon}
                  {...(Platform.OS === 'web'
                    ? { 'aria-hidden': true }
                    : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                />
                <Text
                  style={[
                    styles.tabLabelBase,
                    { color: isActive ? '#FFFFFF' : palette.inactiveLabel },
                  ]}
                  numberOfLines={1}
                  {...(Platform.OS === 'web'
                    ? { 'aria-hidden': true }
                    : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.badge,
                    isActive ? styles.badgeActive : { backgroundColor: palette.badgeMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeTextBase,
                      { color: isActive ? '#FFFFFF' : palette.badgeTextInactive },
                    ]}
                  >
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {showLeftFade && (
          <LinearGradient
            pointerEvents="none"
            colors={
              isDark
                ? [
                    backgroundColor
                      ? hexToRgbA(backgroundColor, 0.92)
                      : 'rgba(17, 24, 39, 0.92)',
                    hexToRgbA(backgroundColor ?? '#111827', 0),
                  ]
                : [
                    hexToRgbA(backgroundColor ?? '#EDE8D0', 0.96),
                    hexToRgbA(backgroundColor ?? '#EDE8D0', 0),
                  ]
            }
            locations={[0, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.leftFade}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
    zIndex: 0,
  },
  track: {
    position: 'relative',
    width: '100%',
    overflow: 'visible',
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 0,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1.5,
    marginRight: 8,
  },
  chipLast: {
    marginRight: 0,
  },
  tabLabelBase: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    maxWidth: 140,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeTextBase: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  leftFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 28,
    zIndex: 2,
  },
});
