import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Share, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChartBar as BarChart3, TrendingUp, Calendar, Award, BookOpen, Film } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useDataStore } from '@/hooks/useDataStore';
import Header from '@/components/Header';
import ImportModal from '@/components/ImportModal';

export default function StatsScreen() {
  const { books, movies, generateComprehensiveExport, importItems } = useDataStore();
  const [showImportModal, setShowImportModal] = React.useState(false);

  const currentYear = new Date().getFullYear();
  
  // Calculate yearly stats
  const getYearlyStats = (items: any[]) => {
    const yearStats: { [key: number]: number } = {};
    items.forEach(item => {
      if (item.year) {
        yearStats[item.year] = (yearStats[item.year] || 0) + 1;
      }
    });
    return yearStats;
  };

  const bookYearStats = getYearlyStats(books.completed);
  const movieYearStats = getYearlyStats(movies.completed);

  // Get top years
  const topBookYears = Object.entries(bookYearStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  const topMovieYears = Object.entries(movieYearStats)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);

  // Calculate format distribution
  const getFormatStats = (items: any[]) => {
    const formatStats: { [key: string]: number } = {};
    items.forEach(item => {
      if (item.format) {
        formatStats[item.format] = (formatStats[item.format] || 0) + 1;
      }
    });
    return formatStats;
  };

  const bookFormatStats = getFormatStats(books.completed);
  const movieFormatStats = getFormatStats(movies.completed);

  // Calculate rating distribution
  const getRatingStats = (items: any[]) => {
    const ratingStats: { [key: number]: number } = {};
    items.forEach(item => {
      if (item.rating && item.rating > 0) {
        ratingStats[item.rating] = (ratingStats[item.rating] || 0) + 1;
      }
    });
    return ratingStats;
  };

  const bookRatingStats = getRatingStats(books.completed);
  const movieRatingStats = getRatingStats(movies.completed);

  const totalBooks = books.completed.length;
  const totalMovies = movies.completed.length;
  const booksThisYear = books.completed.filter(book => book.year === currentYear).length;
  const moviesThisYear = movies.completed.filter(movie => movie.year === currentYear).length;

  const averageBookRating = books.completed.filter(b => b.rating).reduce((sum, b) => sum + (b.rating || 0), 0) / books.completed.filter(b => b.rating).length || 0;
  const averageMovieRating = movies.completed.filter(m => m.rating).reduce((sum, m) => sum + (m.rating || 0), 0) / movies.completed.filter(m => m.rating).length || 0;

  const handleExport = async () => {
    try {
      const exportText = generateComprehensiveExport();
      
      await Share.share({
        message: exportText,
        title: 'My Complete Reading & Watching List',
      });
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Export Error', 'Failed to export data. Please try again.');
    }
  };

  const handleImport = (importedBooks: any[], importedMovies: any[]) => {
    importItems(importedBooks, importedMovies);
    setShowImportModal(false);
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, color }: any) => (
    <View style={styles.statCard}>
      <View style={styles.statHeader}>
        <Icon size={24} color={color} />
        <Text style={styles.statTitle}>{title}</Text>
      </View>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statSubtitle}>{subtitle}</Text>
    </View>
  );

  const FormatChart = ({ data, title, colors }: any) => {
    const total = Object.values(data).reduce((sum: number, count: any) => sum + count, 0);
    
    return (
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{title}</Text>
        <View style={styles.formatList}>
          {Object.entries(data).map(([format, count]: [string, any]) => {
            const percentage = total > 0 ? (count / total * 100) : 0;
            const formatLabels: { [key: string]: string } = {
              text: 'Hardcopy',
              audio: 'Audio',
              ebook: 'eBook',
              streaming: 'Streaming',
              theater: 'Theater',
              bluray: 'Blu-ray',
              dvd: 'DVD',
            };
            
            return (
              <View key={format} style={styles.formatItem}>
                <View style={styles.formatInfo}>
                  <Text style={styles.formatLabel}>{formatLabels[format] || format}</Text>
                  <Text style={styles.formatCount}>{count}</Text>
                </View>
                <View style={styles.formatBar}>
                  <View 
                    style={[
                      styles.formatBarFill, 
                      { width: `${percentage}%`, backgroundColor: colors[0] }
                    ]} 
                  />
                </View>
                <Text style={styles.formatPercent}>{percentage.toFixed(0)}%</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <Header
        title="Statistics"
        onAddPress={() => {}}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        primaryColor="#10B981"
        secondaryColor="#059669"
        isDark={false}
        backgroundColor="#F8FAFC"
      />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'web' && styles.webScrollContent
        ]}
      >
        {/* Overview Stats */}
        <View style={styles.overviewGrid}>
          <StatCard
            title="Total Books"
            value={totalBooks}
            subtitle="All time"
            icon={BookOpen}
            color="#F59E0B"
          />
          <StatCard
            title="Total Movies"
            value={totalMovies}
            subtitle="All time"
            icon={Film}
            color="#3B82F6"
          />
          <StatCard
            title="This Year"
            value={booksThisYear + moviesThisYear}
            subtitle="Combined"
            icon={Calendar}
            color="#10B981"
          />
          <StatCard
            title="All Time"
            value={books.allTime.length + movies.allTime.length}
            subtitle="Favorites"
            icon={Award}
            color="#8B5CF6"
          />
        </View>

        {/* Yearly Performance */}
        <View style={styles.yearlyCard}>
          <Text style={styles.sectionTitle}>Yearly Performance</Text>
          <View style={styles.yearlyGrid}>
            <View style={styles.yearlySection}>
              <Text style={styles.yearlySubtitle}>Books</Text>
              {topBookYears.map(([year, count]) => (
                <View key={year} style={styles.yearlyItem}>
                  <Text style={styles.yearlyYear}>{year}</Text>
                  <View style={styles.yearlyBar}>
                    <View 
                      style={[
                        styles.yearlyBarFill,
                        { 
                          width: `${(count / Math.max(...Object.values(bookYearStats))) * 100}%`,
                          backgroundColor: '#F59E0B'
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.yearlyCount}>{count}</Text>
                </View>
              ))}
            </View>
            
            <View style={styles.yearlySection}>
              <Text style={styles.yearlySubtitle}>Movies</Text>
              {topMovieYears.map(([year, count]) => (
                <View key={year} style={styles.yearlyItem}>
                  <Text style={styles.yearlyYear}>{year}</Text>
                  <View style={styles.yearlyBar}>
                    <View 
                      style={[
                        styles.yearlyBarFill,
                        { 
                          width: `${(count / Math.max(...Object.values(movieYearStats))) * 100}%`,
                          backgroundColor: '#3B82F6'
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.yearlyCount}>{count}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Average Ratings */}
        <View style={styles.ratingsCard}>
          <Text style={styles.sectionTitle}>Average Ratings</Text>
          <View style={styles.ratingsGrid}>
            <View style={styles.ratingItem}>
              <BookOpen size={20} color="#F59E0B" />
              <Text style={styles.ratingLabel}>Books</Text>
              <Text style={[styles.ratingValue, { color: '#F59E0B' }]}>
                {averageBookRating.toFixed(1)}
              </Text>
              <Text style={styles.ratingStars}>{'★'.repeat(Math.round(averageBookRating))}</Text>
            </View>
            <View style={styles.ratingItem}>
              <Film size={20} color="#3B82F6" />
              <Text style={styles.ratingLabel}>Movies</Text>
              <Text style={[styles.ratingValue, { color: '#3B82F6' }]}>
                {averageMovieRating.toFixed(1)}
              </Text>
              <Text style={styles.ratingStars}>{'★'.repeat(Math.round(averageMovieRating))}</Text>
            </View>
          </View>
        </View>

        {/* Format Distribution */}
        {Object.keys(bookFormatStats).length > 0 && (
          <FormatChart
            data={bookFormatStats}
            title="Book Formats"
            colors={['#F59E0B', '#D97706']}
          />
        )}

        {Object.keys(movieFormatStats).length > 0 && (
          <FormatChart
            data={movieFormatStats}
            title="Movie Formats"
            colors={['#3B82F6', '#2563EB']}
          />
        )}

        {/* Current Progress */}
        <View style={styles.progressCard}>
          <Text style={styles.sectionTitle}>{currentYear} Progress</Text>
          <View style={styles.progressGrid}>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Books</Text>
              <Text style={[styles.progressValue, { color: '#F59E0B' }]}>{booksThisYear}</Text>
              <Text style={styles.progressSubtext}>completed</Text>
            </View>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Movies</Text>
              <Text style={[styles.progressValue, { color: '#3B82F6' }]}>{moviesThisYear}</Text>
              <Text style={styles.progressSubtext}>completed</Text>
            </View>
            <View style={styles.progressItem}>
              <Text style={styles.progressLabel}>Total</Text>
              <Text style={[styles.progressValue, { color: '#10B981' }]}>{booksThisYear + moviesThisYear}</Text>
              <Text style={styles.progressSubtext}>this year</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <ImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        isDark={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  webContainer: {
    minHeight: '100vh',
    height: '100vh',
    maxHeight: '100vh',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  webScrollContent: {
    paddingBottom: 40,
    minHeight: '100%',
  },
  overviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
  },
  statValue: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  statSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 16,
  },
  yearlyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  yearlyGrid: {
    flexDirection: 'row',
    gap: 20,
  },
  yearlySection: {
    flex: 1,
  },
  yearlySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#64748B',
    marginBottom: 12,
  },
  yearlyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  yearlyYear: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#475569',
    width: 40,
  },
  yearlyBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
  },
  yearlyBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  yearlyCount: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    width: 20,
    textAlign: 'right',
  },
  ratingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ratingsGrid: {
    flexDirection: 'row',
    gap: 20,
  },
  ratingItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  ratingLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
  },
  ratingValue: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
  },
  ratingStars: {
    fontSize: 16,
    color: '#F59E0B',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 16,
  },
  formatList: {
    gap: 12,
  },
  formatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formatInfo: {
    width: 80,
  },
  formatLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#475569',
  },
  formatCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
  },
  formatBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
  },
  formatBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  formatPercent: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    width: 35,
    textAlign: 'right',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  progressGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressItem: {
    alignItems: 'center',
    gap: 4,
  },
  progressLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
  },
  progressValue: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
  },
  progressSubtext: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
  },
});