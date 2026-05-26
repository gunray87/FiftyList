import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Film, Sparkles } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import Header from '@/components/Header';
import ImportModal from '@/components/ImportModal';

const SAND_BACKGROUND = '#F0E8D8';
const CARD_BG = '#FFFFFF';
const BOOK_ACCENT = '#D97706';
const MOVIE_ACCENT = '#92400E';
const BOOK_BAR = '#EA580C';
const MOVIE_BAR = '#C4A052';
const BORDER_WARM = 'rgba(180, 83, 9, 0.15)';
const MUTED = '#78716C';
const MUTED_SOFT = '#A8A29E';
const WARM_BORDER = '#D4C4A8';
const YOY_BAR_EMPTY = '#F0E8D8';
const AMBER_HERO = '#C87B1A';

const MAX_BAR_HEIGHT = 132;
const YOY_MINI_HEIGHT = 24;
const YOY_TEXT_ZERO = '#A8A29E';
const YOY_BAR_ZERO = '#D6D3D1';
const YOY_DIM = '#B45309';
const YOY_MID = '#D97706';
const YOY_BRIGHT = '#EA580C';

type YoyTier = 'zero' | 'dim' | 'mid' | 'high';

function yoyAccent(tier: YoyTier): { text: string; bar: string } {
  switch (tier) {
    case 'zero':
      return { text: YOY_TEXT_ZERO, bar: YOY_BAR_ZERO };
    case 'dim':
      return { text: YOY_DIM, bar: YOY_DIM };
    case 'mid':
      return { text: YOY_MID, bar: YOY_MID };
    case 'high':
      return { text: YOY_BRIGHT, bar: YOY_BRIGHT };
    default:
      return { text: YOY_MID, bar: YOY_MID };
  }
}

function computeYoyTiers(counts: [number, number, number]): YoyTier[] {
  const tiers: YoyTier[] = ['zero', 'zero', 'zero'];
  const positive = counts.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  if (positive.length === 0) return tiers;

  const posVals = positive.map((i) => counts[i]);
  const minPos = Math.min(...posVals);
  const maxVal = Math.max(...posVals);
  const onlyOneYear = positive.length === 1;

  if (onlyOneYear) {
    tiers[positive[0]] = 'high';
    return tiers;
  }

  if (minPos === maxVal) {
    positive.forEach((i) => {
      tiers[i] = 'mid';
    });
    return tiers;
  }

  positive.forEach((i) => {
    const c = counts[i];
    if (c === maxVal) tiers[i] = 'high';
    else if (c === minPos) tiers[i] = 'dim';
    else tiers[i] = 'mid';
  });
  return tiers;
}

export default function StatsScreen() {
  const { books, movies, generateComprehensiveExport, importItems } = useDataStore();
  const [showImportModal, setShowImportModal] = React.useState(false);

  const screenW = Dimensions.get('window').width;

  const currentYear = new Date().getFullYear();
  const monthOfYear = new Date().getMonth() + 1;

  const getCompletionYear = (item: { completedDate?: string }): number | null => {
    if (!item.completedDate) return null;
    const date = new Date(item.completedDate);
    return date.getFullYear();
  };

  const getCompletionYearStats = (items: any[]) => {
    const yearStats: { [key: number]: number } = {};
    items.forEach((item) => {
      const completionYear = getCompletionYear(item);
      if (completionYear) {
        yearStats[completionYear] = (yearStats[completionYear] || 0) + 1;
      }
    });
    return yearStats;
  };

  const completedBooks = books?.completed || [];
  const completedMovies = movies?.completed || [];

  const bookCompletionYearStats = getCompletionYearStats(completedBooks);
  const movieCompletionYearStats = getCompletionYearStats(completedMovies);

  const bookFormatStats = React.useMemo(() => {
    const formatStats: { [key: string]: number } = {};
    completedBooks.forEach((item: any) => {
      if (item?.format) {
        formatStats[item.format] = (formatStats[item.format] || 0) + 1;
      }
    });
    return formatStats;
  }, [completedBooks]);

  const movieFormatStats = React.useMemo(() => {
    const formatStats: { [key: string]: number } = {};
    completedMovies.forEach((item: any) => {
      if (item?.format) {
        formatStats[item.format] = (formatStats[item.format] || 0) + 1;
      }
    });
    return formatStats;
  }, [completedMovies]);

  const totalBooks = completedBooks.length;
  const totalMovies = completedMovies.length;
  const booksThisYear = completedBooks.filter((book: any) => {
    const cy = getCompletionYear(book);
    return cy === currentYear;
  }).length;

  const moviesThisYear = completedMovies.filter((movie: any) => {
    const cy = getCompletionYear(movie);
    return cy === currentYear;
  }).length;

  const avgBooksPerMonth =
    monthOfYear > 0 ? booksThisYear / monthOfYear : 0;

  const favBooks = books?.allTime?.length ?? 0;
  const favMovies = movies?.allTime?.length ?? 0;
  const totalFavorites = favBooks + favMovies;

  const averageBookRating =
    completedBooks.filter((b: any) => b?.rating).reduce((sum: number, b: any) => sum + (b.rating || 0), 0) /
      Math.max(completedBooks.filter((b: any) => b?.rating).length, 1) || 0;
  const averageMovieRating =
    completedMovies.filter((m: any) => m?.rating).reduce((sum: number, m: any) => sum + (m.rating || 0), 0) /
      Math.max(completedMovies.filter((m: any) => m?.rating).length, 1) || 0;

  const insightLine = React.useMemo(() => {
    let bestY = 0;
    let bestC = 0;
    Object.entries(bookCompletionYearStats).forEach(([y, c]) => {
      if (typeof c === 'number' && c > bestC) {
        bestC = c;
        bestY = Number(y);
      }
    });
    if (bestC > 0 && bestY) {
      return `Your best year was ${bestY} — ${bestC} books.`;
    }
    const formatKeys = Object.keys(bookFormatStats);
    if (formatKeys.length >= 2) {
      return `You've finished books across ${formatKeys.length} formats — explore what fits your streak.`;
    }
    const authorSet = new Set(
      completedBooks.map((b: any) => (typeof b.author === 'string' ? b.author.trim() : '')).filter(Boolean)
    ).size;
    if (authorSet >= 5) {
      return `You've read books by ${authorSet} different authors — your taste is branching out.`;
    }
    if (totalBooks + totalMovies === 0) {
      return 'Complete a book or movie to unlock richer insights here.';
    }
    return 'Keep logging completions — each year grows a sharper picture of how you read and watch.';
  }, [bookCompletionYearStats, bookFormatStats, completedBooks, totalBooks, totalMovies]);

  const yearKeys = React.useMemo(() => {
    const set = new Set([
      ...Object.keys(bookCompletionYearStats || {}),
      ...Object.keys(movieCompletionYearStats || {}),
    ].map(Number));
    return Array.from(set)
      .filter((y) => !Number.isNaN(y))
      .sort((a, b) => a - b)
      .slice(-8);
  }, [bookCompletionYearStats, movieCompletionYearStats]);

  const maxBookY = React.useMemo(
    () =>
      Math.max(...yearKeys.map((y) => bookCompletionYearStats[y] ?? 0), 1),
    [yearKeys, bookCompletionYearStats]
  );
  const maxMovieY = React.useMemo(
    () =>
      Math.max(...yearKeys.map((y) => movieCompletionYearStats[y] ?? 0), 1),
    [yearKeys, movieCompletionYearStats]
  );

  const yoyRows = React.useMemo(() => {
    const years = [currentYear - 2, currentYear - 1, currentYear];
    const tuple: [number, number, number] = [
      bookCompletionYearStats[years[0]] ?? 0,
      bookCompletionYearStats[years[1]] ?? 0,
      bookCompletionYearStats[years[2]] ?? 0,
    ];

    const tiers = computeYoyTiers(tuple);
    const maxYoY = Math.max(...tuple, 1);

    return years.map((year, i) => {
      const count = tuple[i];
      const tier = tiers[i];
      const accent = yoyAccent(tier);
      let barFillHeight: number;
      if (count === 0) {
        barFillHeight = 3;
      } else {
        const scaled = Math.round((count / maxYoY) * YOY_MINI_HEIGHT);
        barFillHeight = Math.min(Math.max(scaled, 4), YOY_MINI_HEIGHT);
      }
      return {
        year,
        count,
        tier,
        accent,
        barFillHeight,
      };
    });
  }, [bookCompletionYearStats, currentYear]);

  const movieYoyRows = React.useMemo(() => {
    const years = [currentYear - 2, currentYear - 1, currentYear];
    const tuple: [number, number, number] = [
      movieCompletionYearStats[years[0]] ?? 0,
      movieCompletionYearStats[years[1]] ?? 0,
      movieCompletionYearStats[years[2]] ?? 0,
    ];

    const tiers = computeYoyTiers(tuple);
    const maxYoY = Math.max(...tuple, 1);

    return years.map((year, i) => {
      const count = tuple[i];
      const tier = tiers[i];
      const accent = yoyAccent(tier);
      let barFillHeight: number;
      if (count === 0) {
        barFillHeight = 3;
      } else {
        const scaled = Math.round((count / maxYoY) * YOY_MINI_HEIGHT);
        barFillHeight = Math.min(Math.max(scaled, 4), YOY_MINI_HEIGHT);
      }
      return {
        year,
        count,
        tier,
        accent,
        barFillHeight,
      };
    });
  }, [movieCompletionYearStats, currentYear]);

  const gutter = 40;
  const chartInnerW = Math.max(screenW - gutter, 260);
  const yearSlotW =
    yearKeys.length > 0 ? Math.min(56, chartInnerW / yearKeys.length) : 40;

  const handleExport = async () => {
    try {
      const exportText = generateComprehensiveExport();
      if (Platform.OS === 'web') {
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fiftylist-export-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        if (Share.share) {
          await Share.share({
            message: exportText,
            title: 'FiftyList — My Complete Reading & Watching List',
          });
        } else {
          Alert.alert('Export Complete', 'Your data was prepared.', [
            { text: 'OK', onPress: () => console.log('Export data:', exportText) },
          ]);
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert(
        'Export Error',
        Platform.OS === 'web'
          ? 'Failed to download export file.'
          : 'Failed to export data.'
      );
    }
  };

  const handleImport = (importedBooks: any[], importedMovies: any[]) => {
    importItems(importedBooks, importedMovies);
    setShowImportModal(false);
  };

  const FormatChart = ({ data, title, colors }: any) => {
    const total = Object.values(data).reduce((sum: number, count: any) => sum + count, 0);
    return (
      <View style={styles.chartCard}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.formatList}>
          {Object.entries(data).map(([format, count]: [string, any]) => {
            const percentage = total > 0 ? (count / total) * 100 : 0;
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
                <View style={[styles.formatBar, { backgroundColor: 'rgba(180,83,9,0.08)' }]}>
                  <View
                    style={[styles.formatBarFill, { width: `${percentage}%`, backgroundColor: colors[0] }]}
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

  const heroFontSize =
    Platform.OS === 'web' ? Math.min(96, chartInnerW * 0.2) : Math.min(88, screenW * 0.22);
  const movieHeroFontSize = heroFontSize * 0.65;

  const renderYoySection = (
    label: string,
    rows: typeof yoyRows,
    options: { useAmberBars?: boolean; isFirst?: boolean } = {},
  ) => (
    <View style={[styles.yoyBlock, options.isFirst && styles.yoyBlockFirst]}>
      <Text style={styles.yoyLabel}>{label}</Text>
      <View style={styles.yoyRow}>
        {rows.map(({ year, count, tier, accent, barFillHeight }) => (
          <View key={`yoy-${label}-${year}`} style={styles.yoyCell}>
            <View style={styles.yoyBarTrack}>
              <View
                style={[
                  styles.yoyBarFill,
                  {
                    height: barFillHeight,
                    backgroundColor:
                      count === 0
                        ? YOY_BAR_EMPTY
                        : options.useAmberBars
                          ? AMBER_HERO
                          : tier === 'zero'
                            ? YOY_BAR_EMPTY
                            : accent.bar,
                  },
                ]}
              />
            </View>
            <Text style={styles.yoyYearMuted}>{year}</Text>
            <Text
              style={[
                styles.yoyCount,
                {
                  color:
                    count === 0
                      ? accent.text
                      : options.useAmberBars
                        ? AMBER_HERO
                        : accent.text,
                },
              ]}
            >
              {count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, Platform.OS === 'web' && styles.webContainer]}
      edges={['top']}
    >
      <Header
        title="Statistics"
        onAddPress={() => {}}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        primaryColor="#D97706"
        secondaryColor="#B45309"
        isDark={false}
        backgroundColor={SAND_BACKGROUND}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: SAND_BACKGROUND }]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          Platform.OS === 'web' && styles.webScrollContent,
        ]}
      >
        {/* 1 · Dual hero */}
        <View style={styles.dualHero}>
          <View style={styles.dualHeroCol}>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[styles.heroNumber, { fontSize: heroFontSize, lineHeight: heroFontSize * 1.02 }]}
            >
              {totalBooks}
            </Text>
            <Text style={styles.heroWord}>books</Text>
            <Text style={styles.heroMuted}>All time</Text>
          </View>

          <View style={styles.dualHeroDivider} />

          <View style={styles.dualHeroColRight}>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[
                styles.heroNumber,
                styles.heroNumberMovies,
                { fontSize: movieHeroFontSize, lineHeight: movieHeroFontSize * 1.02 },
              ]}
            >
              {totalMovies}
            </Text>
            <Text style={styles.heroWord}>movies</Text>
            <Text style={styles.heroMuted}>All time</Text>
          </View>
        </View>

        {/* Delight */}
        <View style={styles.delightCard}>
          <Sparkles size={20} color={BOOK_ACCENT} style={styles.delightIcon} />
          <Text style={styles.delightText}>{insightLine}</Text>
        </View>

        {/* 2 · Secondary — this year + YoY books */}
        <View style={styles.secondaryCard}>
          <Text style={styles.metricSectionLabel}>Progress</Text>
          <View style={styles.progressMainRow}>
            <View style={styles.progressPrimaryCol}>
              <Text style={styles.progressPrimaryValue}>{booksThisYear}</Text>
              <Text style={styles.progressPrimaryLabel}>Books in {currentYear}</Text>
            </View>
            <View style={styles.progressSupportCol}>
              <Text style={styles.progressSupportValue}>
                {booksThisYear > 0 ? avgBooksPerMonth.toFixed(1) : '—'}
              </Text>
              <Text style={styles.progressSupportTitle}>Avg books / mo</Text>
              <Text style={styles.progressSupportHint}>Through {monthOfYear} months</Text>
            </View>
          </View>

          {renderYoySection('Books finished by year', yoyRows, { isFirst: true })}
          <View style={styles.yoySectionDivider} />
          {renderYoySection('Movies finished by year', movieYoyRows, { useAmberBars: true })}
        </View>

        {/* 3 · Tertiary — movies + favorites (typographic weight) */}
        <View style={styles.tertiaryCard}>
          <View>
            <Text style={styles.tertiarySectionKicker}>Movies</Text>
            <Text style={[styles.tertiaryHeroNum, { color: MOVIE_ACCENT }]}>{totalMovies}</Text>
            <Text style={styles.tertiaryHeroCaption}>All-time finished</Text>
            <View style={styles.tertiarySubRow}>
              <Text style={styles.tertiarySubNum}>{moviesThisYear}</Text>
              <Text style={styles.tertiarySubRest}>
                {' '}
                finished in {currentYear}
              </Text>
            </View>
          </View>

          <View style={styles.tertiaryFavoritesBlock}>
            <Text style={styles.tertiarySectionKicker}>Favorites</Text>
            <Text style={[styles.tertiaryHeroNum, { color: BOOK_ACCENT }]}>{totalFavorites}</Text>
            <Text style={styles.tertiaryHeroCaption}>Books & movies on your shelf</Text>
          </View>
        </View>

        {/* Vertical year chart */}
        <View style={styles.yearlyCard}>
          <Text style={styles.sectionTitle}>Completion by year</Text>
          <Text style={styles.sectionSubtitle}>When you finished titles</Text>

          {yearKeys.length === 0 ? (
            <Text style={styles.emptyYears}>Nothing to chart yet.</Text>
          ) : (
            <View style={[styles.vertChart, { paddingHorizontal: 8 }]}>
              <View style={styles.vertLegend}>
                <View style={styles.legendDot} />
                <Text style={styles.legendText}>Books</Text>
                <View style={[styles.legendDot, styles.legendDotMovies]} />
                <Text style={styles.legendText}>Movies</Text>
              </View>

              <View style={[styles.barsArea, { minHeight: MAX_BAR_HEIGHT + 44 }]}>
                <View style={styles.barsRow}>
                  {yearKeys.map((year) => {
                    const bc = bookCompletionYearStats[year] ?? 0;
                    const mc = movieCompletionYearStats[year] ?? 0;
                    const hBook = bc > 0 ? (bc / maxBookY) * MAX_BAR_HEIGHT : 4;
                    const hMovie = mc > 0 ? (mc / maxMovieY) * MAX_BAR_HEIGHT : 4;
                    return (
                      <View key={`y-${year}`} style={[styles.yearCol, { width: yearSlotW }]}>
                        <View style={styles.valuePair}>
                          <Text style={styles.barValueTiny}>{bc > 0 ? bc : ''}</Text>
                          <Text style={[styles.barValueTiny, styles.barValueMuted]}>
                            {mc > 0 ? mc : ''}
                          </Text>
                        </View>
                        <View style={styles.barPair}>
                          <View
                            style={[
                              styles.barPill,
                              {
                                height: Math.max(hBook, 8),
                                backgroundColor: BOOK_BAR,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.barPill,
                              {
                                height: Math.max(hMovie, 8),
                                backgroundColor: MOVIE_BAR,
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.yearLabel}>{year}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Average ratings — compact column */}
        <View style={styles.ratingsCard}>
          <Text style={styles.sectionTitle}>Average ratings</Text>
          <View style={styles.ratingRows}>
            <View style={styles.ratingInline}>
              <BookOpen size={18} color={BOOK_BAR} />
              <Text style={styles.ratingLabel}>Books</Text>
              <Text style={[styles.ratingNum, { color: BOOK_BAR }]}>
                {completedBooks.some((b: any) => b?.rating) ? averageBookRating.toFixed(1) : '—'}
              </Text>
            </View>
            <View style={styles.ratingInline}>
              <Film size={18} color={MOVIE_ACCENT} />
              <Text style={styles.ratingLabel}>Movies</Text>
              <Text style={[styles.ratingNum, { color: MOVIE_ACCENT }]}>
                {completedMovies.some((m: any) => m?.rating) ? averageMovieRating.toFixed(1) : '—'}
              </Text>
            </View>
          </View>
        </View>

        {Object.keys(bookFormatStats || {}).length > 0 && (
          <FormatChart
            data={bookFormatStats}
            title="Book formats"
            colors={[BOOK_BAR, '#C2410C']}
          />
        )}

        {Object.keys(movieFormatStats || {}).length > 0 && (
          <FormatChart
            data={movieFormatStats}
            title="Movie formats"
            colors={[MOVIE_BAR, '#92400E']}
          />
        )}
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
    backgroundColor: SAND_BACKGROUND,
  },
  webContainer: {
    minHeight: '100vh' as any,
    height: '100vh' as any,
    maxHeight: '100vh' as any,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  webScrollContent: {
    paddingBottom: 40,
    minHeight: '100%',
  },
  dualHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
    paddingTop: 4,
  },
  dualHeroCol: {
    flex: 1,
    minWidth: 0,
  },
  dualHeroColRight: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 28,
  },
  dualHeroDivider: {
    width: 1,
    backgroundColor: WARM_BORDER,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  heroNumber: {
    fontFamily: 'Inter-Bold',
    color: '#1C1917',
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
  },
  heroNumberMovies: {
    color: AMBER_HERO,
    letterSpacing: -2,
  },
  heroWord: {
    fontFamily: 'Inter-Regular',
    fontWeight: '400',
    fontSize: 30,
    color: '#78716C',
    marginTop: -4,
  },
  heroMuted: {
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    color: MUTED,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  delightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    shadowColor: 'rgba(0,0,0,0.06)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    shadowOpacity: 1,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: BOOK_BAR,
  },
  delightIcon: {
    marginTop: 2,
  },
  delightText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#44403C',
    lineHeight: 24,
  },
  metricSectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: MUTED_SOFT,
    marginBottom: 12,
  },
  secondaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  progressMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  progressPrimaryCol: {
    flex: 1,
    minWidth: 0,
  },
  progressPrimaryValue: {
    fontSize: 48,
    lineHeight: 52,
    fontFamily: 'Inter-Bold',
    color: BOOK_BAR,
    fontVariant: ['tabular-nums'],
  },
  progressPrimaryLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#44403C',
    marginTop: 6,
  },
  progressSupportCol: {
    alignItems: 'flex-end',
    paddingBottom: 2,
    maxWidth: '42%',
  },
  progressSupportValue: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: 'Inter-SemiBold',
    color: MUTED,
    fontVariant: ['tabular-nums'],
  },
  progressSupportTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MUTED_SOFT,
    marginTop: 4,
    textAlign: 'right',
  },
  progressSupportHint: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: MUTED_SOFT,
    marginTop: 2,
    textAlign: 'right',
  },
  yoyBlock: {
    paddingTop: 18,
  },
  yoyBlockFirst: {
    marginTop: 22,
  },
  yoySectionDivider: {
    height: 0.5,
    backgroundColor: WARM_BORDER,
    marginTop: 4,
  },
  yoyLabel: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: MUTED_SOFT,
    marginBottom: 10,
  },
  yoyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  yoyCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  yoyBarTrack: {
    width: '72%',
    maxWidth: 44,
    height: YOY_MINI_HEIGHT,
    borderRadius: 6,
    backgroundColor: 'rgba(87, 83, 78, 0.08)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: 8,
  },
  yoyBarFill: {
    width: '100%',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  yoyYearMuted: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MUTED_SOFT,
    marginBottom: 4,
  },
  yoyCount: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    fontVariant: ['tabular-nums'],
  },
  tertiaryCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  tertiarySectionKicker: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: MUTED_SOFT,
    marginBottom: 6,
  },
  tertiaryHeroNum: {
    fontSize: 42,
    lineHeight: 46,
    fontFamily: 'Inter-Bold',
    fontVariant: ['tabular-nums'],
  },
  tertiaryHeroCaption: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: MUTED,
    marginTop: 4,
  },
  tertiarySubRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 12,
  },
  tertiarySubNum: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    fontVariant: ['tabular-nums'],
    color: MOVIE_ACCENT,
  },
  tertiarySubRest: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#57534E',
  },
  tertiaryFavoritesBlock: {
    marginTop: 28,
  },
  yearlyCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  vertChart: {
    marginTop: 8,
  },
  vertLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BOOK_BAR,
    marginRight: -4,
  },
  legendDotMovies: {
    marginLeft: 12,
    backgroundColor: MOVIE_BAR,
  },
  legendText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: MUTED,
  },
  barsArea: {
    justifyContent: 'flex-end',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    width: '100%',
  },
  yearCol: {
    alignItems: 'center',
  },
  valuePair: {
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'center',
    minHeight: 18,
    marginBottom: 4,
    width: '100%',
  },
  barValueTiny: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: BOOK_BAR,
  },
  barValueMuted: {
    color: MOVIE_BAR,
  },
  barPair: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: MAX_BAR_HEIGHT,
    justifyContent: 'center',
  },
  barPill: {
    width: 14,
    borderRadius: 6,
    minHeight: 4,
  },
  yearLabel: {
    marginTop: 8,
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: MUTED,
  },
  emptyYears: {
    fontSize: 14,
    color: MUTED,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Inter-SemiBold',
    color: '#1C1917',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: MUTED,
    marginBottom: 12,
  },
  ratingsCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  ratingRows: {
    gap: 16,
    marginTop: 4,
  },
  ratingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ratingLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: '#44403C',
  },
  ratingNum: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
  },
  chartCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  formatList: {
    gap: 12,
    marginTop: 8,
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
    color: '#57534E',
  },
  formatCount: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: MUTED,
  },
  formatBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  formatBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  formatPercent: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#1C1917',
    width: 35,
    textAlign: 'right',
  },
});
