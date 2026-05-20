import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { stripDirectedByPrefix } from '@/utils/formatDirectorDisplay';

interface MoviePosterTitleBlockProps {
  title: string;
  directorOrAuthor: string;
}

/**
 * Movie list headline: bold title first, same flowing paragraph continues with Director + name (wraps).
 * All-time star is rendered by ItemCard alongside this block (same pattern as books).
 */
export default function MoviePosterTitleBlock({
  title,
  directorOrAuthor,
}: MoviePosterTitleBlockProps) {
  const directorName = directorOrAuthor ? stripDirectedByPrefix(directorOrAuthor) : '';

  return (
    <View style={styles.block}>
      <Text style={styles.headlineWrap} numberOfLines={6}>
        <Text style={styles.movieTitle}>{title}</Text>
        {directorName ? (
          [
            <Text key="dir-word" style={styles.directorLabel}>
              {`\u2009\u00B7\u2009Director\u2009`}
            </Text>,
            <Text key="dir-name" style={styles.directorName}>
              {directorName}
            </Text>,
          ]
        ) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 1,
  },
  headlineWrap: {
    width: '100%',
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: 0.2,
  },
  movieTitle: {
    fontFamily: 'Inter-Bold',
    fontSize: 17,
    lineHeight: 23,
    color: '#F8FAFC',
    letterSpacing: 0.35,
  },
  directorLabel: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 17,
    color: '#64748B',
    letterSpacing: 0.1,
  },
  directorName: {
    fontFamily: 'Inter-Medium',
    fontSize: 12,
    lineHeight: 17,
    color: '#CBD5E1',
    letterSpacing: 0.15,
  },
});
