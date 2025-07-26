import React, { useEffect } from 'react';
import { Platform } from 'react-native';

export default function ViewportFix() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Fix viewport height issues on web
      const setVH = () => {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
      };

      // Set initial viewport height
      setVH();

      // Update on resize
      window.addEventListener('resize', setVH);
      window.addEventListener('orientationchange', setVH);

      // Cleanup
      return () => {
        window.removeEventListener('resize', setVH);
        window.removeEventListener('orientationchange', setVH);
      };
    }
  }, []);

  return null;
}