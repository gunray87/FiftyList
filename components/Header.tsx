import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Plus, Settings, Search } from 'lucide-react-native';
import SettingsModal from './SettingsModal';

interface HeaderProps {
  title: string;
  onAddPress: () => void;
  onExportPress: () => void;
  onImportPress?: () => void;
  onSearchPress?: () => void;
  onSharePress?: () => void;
  primaryColor: string;
  secondaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
  isExporting?: boolean;
}

export default function Header({ onAddPress, onExportPress, onImportPress, onSearchPress, onSharePress, primaryColor, secondaryColor, isDark = false, backgroundColor, isExporting = false }: HeaderProps) {
  const [showSettings, setShowSettings] = useState(false);

  // Use the provided background color directly
  const headerBackground = backgroundColor || (isDark ? '#111827' : '#D6B588');

  return (
    <>
      <View 
        style={[styles.container, { backgroundColor: headerBackground }]}
        accessibilityRole="banner"
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              <Image
                source={require('../assets/images/Logo Image_1.png')}
                style={[
                  styles.logo,
                  isDark && styles.whiteLogo
                ]}
                resizeMode="contain"
                accessibilityLabel="FiftyList app logo"
                accessibilityRole="image"
              />
            </View>
          </View>
          
          <View 
            style={styles.actions}
            accessibilityRole="toolbar"
            accessibilityLabel="Header actions"
          >
            {onSearchPress && (
              <TouchableOpacity 
                style={styles.actionButton} 
                onPress={onSearchPress}
                accessibilityRole="button"
                accessibilityLabel="Search"
                accessibilityHint="Show search bar to find items"
              >
                <Search size={18} color="#475569" strokeWidth={2.25} />
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => setShowSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              accessibilityHint="Open app settings and options"
            >
              <Settings size={18} color="#475569" strokeWidth={2.25} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={onAddPress}
              accessibilityRole="button"
              accessibilityLabel="Add new item"
              accessibilityHint="Add a new book or movie to your list"
            >
              <Plus size={18} color="#475569" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onExportPress={onExportPress}
        onImportPress={onImportPress || (() => {})}
        onSharePress={onSharePress}
        isDark={isDark}
        isExporting={isExporting}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 0, // Removed all horizontal padding
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 12, // Only add padding to the right for action buttons
  },
  logoContainer: {
    flex: 1,
    alignItems: 'flex-start',
    marginLeft: -12, // Increased negative margin
  },
  logoWrapper: {
    width: 240,
    height: 60,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 0,
  },
  logo: {
    width: 200,
    height: 50,
    marginLeft: -8, // Increased negative margin for logo
  },
  whiteLogo: {
    tintColor: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(10px)' } : {}),
  },
});