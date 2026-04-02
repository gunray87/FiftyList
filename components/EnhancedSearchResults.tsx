import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Star, ExternalLink, DollarSign } from 'lucide-react-native';
import { BookSearchResult, MovieSearchResult } from '@/types';
import { useSubscription } from '@/hooks/useSubscription';
import { DataQualityGate } from './DataQualityGate';

interface EnhancedSearchResultsProps {
  results: BookSearchResult[] | MovieSearchResult[];
  onSelect: (result: BookSearchResult | MovieSearchResult) => void;
  type: 'books' | 'movies';
}

export const EnhancedSearchResults: React.FC<EnhancedSearchResultsProps> = ({ 
  results, 
  onSelect, 
  type 
}) => {
  const { features } = useSubscription();

  const renderBookResult = (result: BookSearchResult) => (
    <TouchableOpacity 
      key={result.id} 
      style={styles.resultItem}
      onPress={() => onSelect(result)}
    >
      <View style={styles.resultContent}>
        {result.thumbnail && (
          <Image source={{ uri: result.thumbnail }} style={styles.thumbnail} />
        )}
        
        <View style={styles.resultDetails}>
          <Text style={styles.title}>{result.title}</Text>
          <Text style={styles.author}>by {result.author}</Text>
          
          {result.year && (
            <Text style={styles.year}>{result.year}</Text>
          )}
          
          {/* Premium features */}
          <DataQualityGate feature="enhanced_search">
            {result.description && (
              <Text style={styles.description} numberOfLines={2}>
                {result.description}
              </Text>
            )}
            
            {result.rating && (
              <View style={styles.ratingContainer}>
                <Star size={14} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.rating}>{result.rating}/5</Text>
              </View>
            )}
            
            {result.genres && result.genres.length > 0 && (
              <View style={styles.genresContainer}>
                {result.genres.slice(0, 3).map((genre, index) => (
                  <Text key={index} style={styles.genreTag}>
                    {genre}
                  </Text>
                ))}
              </View>
            )}
            
            {result.pageCount && (
              <Text style={styles.pageCount}>{result.pageCount} pages</Text>
            )}
            
            {result.isbn && (
              <Text style={styles.isbn}>ISBN: {result.isbn}</Text>
            )}
          </DataQualityGate>
          
          {/* Price tracking - Premium only */}
          <DataQualityGate feature="price_tracking">
            {result.availability && (
              <View style={styles.availabilityContainer}>
                <Text style={styles.availabilityTitle}>Available on:</Text>
                {Object.entries(result.availability).map(([platform, info]) => (
                  <View key={platform} style={styles.platformRow}>
                    <DollarSign size={12} color="#10B981" />
                    <Text style={styles.platformText}>
                      {platform}: ${info.price}
                    </Text>
                    {info.inStock && (
                      <Text style={styles.inStockText}>In Stock</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </DataQualityGate>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderMovieResult = (result: MovieSearchResult) => (
    <TouchableOpacity 
      key={result.id} 
      style={styles.resultItem}
      onPress={() => onSelect(result)}
    >
      <View style={styles.resultContent}>
        {result.thumbnail && (
          <Image source={{ uri: result.thumbnail }} style={styles.thumbnail} />
        )}
        
        <View style={styles.resultDetails}>
          <Text style={styles.title}>{result.title}</Text>
          <Text style={styles.author}>Directed by {result.director}</Text>
          
          {result.year && (
            <Text style={styles.year}>{result.year}</Text>
          )}
          
          {/* Premium features */}
          <DataQualityGate feature="movie_search">
            {result.description && (
              <Text style={styles.description} numberOfLines={2}>
                {result.description}
              </Text>
            )}
            
            {result.rating && (
              <View style={styles.ratingContainer}>
                <Star size={14} color="#F59E0B" fill="#F59E0B" />
                <Text style={styles.rating}>{result.rating}/10</Text>
              </View>
            )}
            
            {result.genres && result.genres.length > 0 && (
              <View style={styles.genresContainer}>
                {result.genres.slice(0, 3).map((genre, index) => (
                  <Text key={index} style={styles.genreTag}>
                    {genre}
                  </Text>
                ))}
              </View>
            )}
            
            {result.runtime && (
              <Text style={styles.runtime}>{result.runtime} minutes</Text>
            )}
            
            {result.cast && result.cast.length > 0 && (
              <Text style={styles.cast}>
                Starring: {result.cast.slice(0, 3).join(', ')}
              </Text>
            )}
          </DataQualityGate>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (results.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No results found</Text>
        {type === 'movies' && !features.canSearchMovies && (
          <DataQualityGate feature="movie_search">
            <View />
          </DataQualityGate>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {type === 'books' 
        ? results.map(renderBookResult)
        : results.map(renderMovieResult)
      }
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  resultItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultContent: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 60,
    height: 80,
    borderRadius: 4,
    marginRight: 12,
  },
  resultDetails: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  author: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 4,
  },
  year: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  description: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rating: {
    fontSize: 12,
    color: '#F59E0B',
    marginLeft: 4,
    fontWeight: '500',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  genreTag: {
    fontSize: 10,
    color: '#3B82F6',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginBottom: 4,
  },
  pageCount: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  isbn: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  runtime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  cast: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  availabilityContainer: {
    backgroundColor: '#F0FDF4',
    borderRadius: 6,
    padding: 8,
    marginTop: 8,
  },
  availabilityTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 4,
  },
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  platformText: {
    fontSize: 11,
    color: '#059669',
    marginLeft: 4,
  },
  inStockText: {
    fontSize: 10,
    color: '#10B981',
    marginLeft: 8,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
