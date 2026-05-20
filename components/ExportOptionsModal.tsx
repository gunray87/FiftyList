import React, { useMemo, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { X } from 'lucide-react-native';
import { ExportOptions, ExportYearFilter } from '@/types';

interface ExportOptionsModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (options: ExportOptions) => void;
  primaryColor: string;
  isDark?: boolean;
}

const defaultOptions: ExportOptions = {
  year: 'all',
  sections: {
    overview: true,
    books: true,
    movies: true,
    yearlyBreakdown: true,
  },
  categories: {
    completed: true,
    inProgress: true,
    planned: true,
    fails: true,
    allTime: true,
  },
};

export default function ExportOptionsModal({
  visible,
  onClose,
  onConfirm,
  primaryColor,
  isDark = false,
}: ExportOptionsModalProps) {
  const [options, setOptions] = useState<ExportOptions>(defaultOptions);

  const yearChoices = useMemo(() => {
    const current = new Date().getFullYear();
    return ['all', ...Array.from({ length: 11 }, (_, i) => current - i)] as ExportYearFilter[];
  }, []);

  const setSection = (key: keyof ExportOptions['sections'], value: boolean) => {
    setOptions((prev) => ({ ...prev, sections: { ...prev.sections, [key]: value } }));
  };

  const setCategory = (key: keyof ExportOptions['categories'], value: boolean) => {
    setOptions((prev) => ({ ...prev, categories: { ...prev.categories, [key]: value } }));
  };

  const resetDefaults = () => setOptions(defaultOptions);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, isDark && styles.darkContainer]}>
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.title, isDark && styles.darkText]}>Export Options</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={22} color={isDark ? '#D1D5DB' : '#374151'} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Year Filter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
            {yearChoices.map((y) => {
              const selected = options.year === y;
              return (
                <TouchableOpacity
                  key={String(y)}
                  style={[
                    styles.yearChip,
                    isDark && styles.darkChip,
                    selected && { backgroundColor: primaryColor, borderColor: primaryColor },
                  ]}
                  onPress={() => setOptions((prev) => ({ ...prev, year: y }))}
                >
                  <Text style={[styles.chipText, isDark && styles.darkText, selected && styles.selectedChipText]}>
                    {y === 'all' ? 'All Years' : y}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={[styles.sectionTitle, isDark && styles.darkText]}>Sections</Text>
          <View style={[styles.card, isDark && styles.darkCard]}>
            <Row
              label="Overview & statistics"
              value={options.sections.overview}
              onValueChange={(value) => setSection('overview', value)}
              isDark={isDark}
            />
            <Row label="Books section" value={options.sections.books} onValueChange={(value) => setSection('books', value)} isDark={isDark} />
            <Row label="Movies section" value={options.sections.movies} onValueChange={(value) => setSection('movies', value)} isDark={isDark} />
            <Row
              label="Yearly breakdown"
              value={options.sections.yearlyBreakdown}
              onValueChange={(value) => setSection('yearlyBreakdown', value)}
              isDark={isDark}
            />
          </View>

          <Text style={[styles.sectionTitle, isDark && styles.darkText]}>List Categories</Text>
          <View style={[styles.card, isDark && styles.darkCard]}>
            <Row label="Completed" value={options.categories.completed} onValueChange={(value) => setCategory('completed', value)} isDark={isDark} />
            <Row label="In progress" value={options.categories.inProgress} onValueChange={(value) => setCategory('inProgress', value)} isDark={isDark} />
            <Row label="Planned" value={options.categories.planned} onValueChange={(value) => setCategory('planned', value)} isDark={isDark} />
            <Row label="Stopped / DNF" value={options.categories.fails} onValueChange={(value) => setCategory('fails', value)} isDark={isDark} />
            <Row label="All-time favorites" value={options.categories.allTime} onValueChange={(value) => setCategory('allTime', value)} isDark={isDark} />
          </View>
        </ScrollView>

        <View style={[styles.footer, isDark && styles.darkHeader]}>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={resetDefaults}>
            <Text style={styles.secondaryText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }]} onPress={() => onConfirm(options)}>
            <Text style={styles.primaryText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  value,
  onValueChange,
  isDark,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  isDark?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowText, isDark && styles.darkText]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  darkContainer: { backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkHeader: { borderBottomColor: '#374151' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  darkText: { color: '#F9FAFB' },
  closeButton: { padding: 6 },
  content: { flex: 1, padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 10, marginBottom: 8 },
  yearRow: { gap: 8, paddingVertical: 4 },
  yearChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  darkChip: { borderColor: '#4B5563', backgroundColor: '#1F2937' },
  chipText: { color: '#334155', fontWeight: '600' },
  selectedChipText: { color: '#FFFFFF' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  darkCard: { backgroundColor: '#1F2937', borderColor: '#374151' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  rowText: { fontSize: 15, color: '#111827' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  button: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  secondary: { backgroundColor: '#E2E8F0' },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryText: { color: '#0F172A', fontWeight: '700' },
});
