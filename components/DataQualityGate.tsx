import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSubscription } from '@/hooks/useSubscription';
import { Star, Zap, DollarSign, Search } from 'lucide-react-native';

interface DataQualityGateProps {
  feature: 'movie_search' | 'enhanced_search' | 'price_tracking' | 'recommendations';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const DataQualityGate: React.FC<DataQualityGateProps> = ({ 
  feature, 
  children, 
  fallback 
}) => {
  const { features, startFreeTrial } = useSubscription();

  const hasAccess = () => {
    switch (feature) {
      case 'movie_search':
        return features.canSearchMovies;
      case 'enhanced_search':
        return features.canUseEnhancedSearch;
      case 'price_tracking':
        return features.canTrackPrices;
      case 'recommendations':
        return features.canGetRecommendations;
      default:
        return false;
    }
  };

  if (hasAccess()) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return <DataQualityUpgradePrompt feature={feature} onStartTrial={startFreeTrial} />;
};

interface DataQualityUpgradePromptProps {
  feature: 'movie_search' | 'enhanced_search' | 'price_tracking' | 'recommendations';
  onStartTrial: () => void;
}

const DataQualityUpgradePrompt: React.FC<DataQualityUpgradePromptProps> = ({ 
  feature, 
  onStartTrial 
}) => {
  const getFeatureInfo = () => {
    switch (feature) {
      case 'movie_search':
        return {
          icon: <Search size={24} color="#3B82F6" />,
          title: "Get Movie Data Automatically",
          description: "Premium users get detailed movie information, ratings, cast details, and release dates automatically populated.",
          benefit: "Save time with auto-populated data",
          example: "Instead of manual entry, get: Director, Cast, Rating, Genre, Release Date, Plot Summary"
        };
      case 'enhanced_search':
        return {
          icon: <Zap size={24} color="#3B82F6" />,
          title: "Get Rich Book Information",
          description: "Premium users get detailed book information from multiple databases with descriptions, ratings, and genres.",
          benefit: "Never miss important details",
          example: "Get: Description, Rating, Genres, Page Count, ISBN, Cover Art, Availability"
        };
      case 'price_tracking':
        return {
          icon: <DollarSign size={24} color="#3B82F6" />,
          title: "Track Prices & Availability",
          description: "Premium users get real-time price alerts and availability across Amazon, Audible, Kindle, and more.",
          benefit: "Find the best deals",
          example: "See prices on: Amazon, Audible, Kindle, Google Play, Apple Books"
        };
      case 'recommendations':
        return {
          icon: <Star size={24} color="#3B82F6" />,
          title: "Get Smart Recommendations",
          description: "Premium users get AI-powered recommendations based on their reading history and preferences.",
          benefit: "Discover your next favorite book",
          example: "Get personalized suggestions based on: Your reading history, Similar authors, Trending books"
        };
    }
  };

  const featureInfo = getFeatureInfo();

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        {featureInfo.icon}
      </View>
      
      <Text style={styles.title}>{featureInfo.title}</Text>
      <Text style={styles.description}>{featureInfo.description}</Text>
      
      <View style={styles.benefitContainer}>
        <Text style={styles.benefitLabel}>✨ {featureInfo.benefit}</Text>
      </View>
      
      <View style={styles.exampleContainer}>
        <Text style={styles.exampleLabel}>Example:</Text>
        <Text style={styles.exampleText}>{featureInfo.example}</Text>
      </View>
      
      <TouchableOpacity 
        style={styles.trialButton}
        onPress={onStartTrial}
      >
        <Text style={styles.trialButtonText}>Try Premium Free for 7 Days</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.upgradeButton}
        onPress={() => {
          // Navigate to subscription screen
          console.log('Navigate to subscription');
        }}
      >
        <Text style={styles.upgradeButtonText}>Upgrade to Premium - $2.99/month</Text>
      </TouchableOpacity>
      
      <Text style={styles.disclaimer}>
        Cancel anytime. No commitment.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 20,
    margin: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  benefitContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  benefitLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0369A1',
    textAlign: 'center',
  },
  exampleContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  exampleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  trialButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  trialButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  upgradeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#3B82F6',
    marginBottom: 8,
  },
  upgradeButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  disclaimer: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
