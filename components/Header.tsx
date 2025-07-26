import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { Plus, Settings } from 'lucide-react-native';
import SettingsModal from './SettingsModal';

interface HeaderProps {
  title: string;
  onAddPress: () => void;
  onExportPress: () => void;
  onImportPress?: () => void;
  primaryColor: string;
  secondaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
}

export default function Header({ onAddPress, onExportPress, onImportPress, primaryColor, secondaryColor, isDark = false, backgroundColor }: HeaderProps) {
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
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={() => setShowSettings(true)}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              accessibilityHint="Open app settings and options"
            >
              <Settings size={16} color="#64748B" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={onAddPress}
              accessibilityRole="button"
              accessibilityLabel="Add new item"
              accessibilityHint="Add a new book or movie to your list"
            >
              <Plus size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <SettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onExportPress={onExportPress}
        onImportPress={onImportPress || (() => {})}
        isDark={isDark}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  },
});