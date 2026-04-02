import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity, ScrollView, Platform, Share, Alert, Animated, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, BookOpen, Film, Filter, SlidersHorizontal, Star, TrendingUp, Heart, RefreshCw, Plus, Clock, Check, Lightbulb, ThumbsUp, ThumbsDown, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '@/hooks/useDataStore';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useUserInterests } from '@/hooks/useUserInterests';
import { usePreloadedData } from '@/app/_layout';
import Header from '@/components/Header';
import AddEditModal from '@/components/AddEditModal';

import CustomAlert from '@/components/CustomAlert';

// NLP Content Analysis System
interface NLPContentAnalysis {
  sentiment: {
    score: number; // -1 to 1 (negative to positive)
    magnitude: number; // 0 to 1 (intensity)
    emotions: string[]; // joy, sadness, anger, fear, surprise, disgust
  };
  topics: {
    primary: string[];
    secondary: string[];
    themes: string[];
  };
  complexity: {
    readabilityScore: number; // 0-100 (higher = more complex)
    vocabularyLevel: string; // elementary, intermediate, advanced
    sentenceComplexity: number; // 0-1
  };
  style: {
    tone: string; // formal, casual, academic, conversational
    pacing: string; // fast, moderate, slow
    narrativeStructure: string; // linear, non-linear, episodic
  };
  content: {
    genreIndicators: string[];
    targetAudience: string;
    contentWarnings: string[];
  };
}

// Semantic Similarity System
interface SemanticEmbedding {
  id: string;
  vector: number[];
  metadata: {
    title: string;
    author: string;
    genres: string[];
    description: string;
    topics: string[];
    timestamp: number;
  };
}

interface SemanticCache {
  embeddings: Map<string, SemanticEmbedding>;
  similarityMatrix: Map<string, Map<string, number>>;
  lastUpdated: number;
  cacheSize: number;
  maxCacheSize: number;
}

interface SimilarityResult {
  itemId: string;
  similarity: number;
  reason: string;
  confidence: number;
}

// Enhanced Suggestion interface with semantic features
interface Suggestion {
  id: string;
  title: string;
  author: string;
  year: number;
  format: "text" | "audio" | "streaming";
  rating: number;
  description: string;
  genres: string[];
  isBook: boolean;
  source: 'googlebooks' | 'tmdb' | 'local';
  reason: string;
  confidence: number;
  category: 'adventure' | 'literary' | 'contemporary' | 'award' | 'search' | 'genre' | 'seasonal' | 'trending' | 'similar' | 'author' | 'mood' | 'format' | 'predictive' | 'semantic';
  estimatedPages?: number;
  estimatedLength: string;
  // API-specific fields
  coverId?: number;
  isbn?: string;
  tmdbId?: number;
  posterPath?: string;
  // Additional fields for compatibility
  mood?: string;
  awards?: string[];
  weeksOnList?: number;
  // NLP Analysis fields
  nlpAnalysis?: NLPContentAnalysis;
  // Semantic Similarity fields
  semanticEmbedding?: number[];
  similarItems?: string[];
  semanticTags?: string[];
}

type SortOption = 'confidence' | 'length' | 'rating' | 'year';
type FilterOption = 'all' | 'books' | 'movies' | 'short' | 'medium' | 'long' | 'semantic';

// Granular rating types
type GranularRating = 'loved' | 'liked' | 'meh' | 'disliked' | null;

// Rating configuration
const RATING_CONFIG = {
  loved: {
    label: 'Loved',
    icon: '❤️',
    color: '#EF4444', // Red
    weight: 2.0, // Highest positive weight
    feedback: 'Excellent! This will help find similar content you\'ll love.'
  },
  liked: {
    label: 'Liked',
    icon: '👍',
    color: '#10B981', // Green
    weight: 1.0, // Standard positive weight
    feedback: 'Great! This helps refine your preferences.'
  },
  meh: {
    label: 'Meh',
    icon: '😐',
    color: '#F59E0B', // Amber
    weight: 0.0, // Neutral weight
    feedback: 'Noted. This helps avoid similar content.'
  },
  disliked: {
    label: 'Disliked',
    icon: '👎',
    color: '#6B7280', // Gray
    weight: -1.0, // Negative weight
    feedback: 'Got it. We\'ll avoid similar content.'
  }
};

// Alternative API configurations for high-volume calls
const API_CONFIG = {
  // Local fallback data for reliability
  USE_LOCAL_FALLBACK: true,
  
  // Rate limiting for different APIs
  RATE_LIMITS: {
    localFallback: 0,  // No rate limit
  }
};

// Semantic Similarity Configuration
const SEMANTIC_CONFIG = {
  // Embedding dimensions (simplified for mobile)
  EMBEDDING_DIMENSIONS: 64,
  
  // Similarity thresholds
  SIMILARITY_THRESHOLD: 0.7,
  HIGH_SIMILARITY_THRESHOLD: 0.85,
  
  // Cache settings
  MAX_CACHE_SIZE: 1000,
  CACHE_EXPIRY_HOURS: 24,
  
  // Performance settings
  MAX_SIMILARITY_CALCULATIONS: 50,
  BATCH_SIZE: 10,
  
  // Content filtering settings
  YEAR_FILTERING: {
    ENABLED: true,
    MAX_AGE_YEARS: 2, // Filter out content older than 2 years
    CLASSIC_MAX_AGE_YEARS: 10, // Allow classics up to 10 years old
    CLASSIC_GENRE_MAX_AGE_YEARS: 15, // Allow classic genres up to 15 years old
    CLASSIC_GENRES: ['classic', 'literary', 'non-fiction', 'biography', 'history']
  },
  
  // Feature weights for similarity calculation
  WEIGHTS: {
    title: 0.3,
    author: 0.2,
    genres: 0.25,
    description: 0.15,
    topics: 0.1
  }
};

// Comprehensive hard-coded dataset for zero API usage
export const COMPREHENSIVE_BOOK_DATA = [
  // Adventure & Outdoor Books
  { title: "Into Thin Air", author: "Jon Krakauer", year: 1997, description: "A firsthand account of the 1996 Mount Everest disaster.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.5 },
  { title: "The Emerald Mile", author: "Kevin Fedarko", year: 2013, description: "The epic story of the fastest ride through the Grand Canyon.", genres: ["adventure", "non-fiction", "history"], rating: 4.6 },
  { title: "Endurance", author: "Alfred Lansing", year: 1959, description: "Shackleton's legendary Antarctic expedition.", genres: ["adventure", "non-fiction", "history"], rating: 4.7 },
  { title: "The River of Doubt", author: "Candice Millard", year: 2005, description: "Theodore Roosevelt's journey down an uncharted tributary of the Amazon.", genres: ["adventure", "non-fiction", "history"], rating: 4.4 },
  { title: "Alone on the Wall", author: "Alex Honnold", year: 2015, description: "Free solo climbing adventures and philosophy.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.3 },
  { title: "The Impossible Climb", author: "Mark Synnott", year: 2019, description: "Alex Honnold, El Capitan, and the climbing life.", genres: ["adventure", "non-fiction", "biography"], rating: 4.2 },
  { title: "Conquistadors of the Useless", author: "Lionel Terray", year: 1963, description: "Classic mountaineering memoir from a French alpinist.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.1 },
  { title: "The Wager", author: "David Grann", year: 2023, description: "A tale of shipwreck, mutiny and murder.", genres: ["adventure", "non-fiction", "history"], rating: 4.5 },
  { title: "K2: Life and Death on the World's Most Dangerous Mountain", author: "Ed Viesturs", year: 2009, description: "The deadly history of K2 climbing.", genres: ["adventure", "non-fiction", "history"], rating: 4.3 },
  { title: "The Third Pole", author: "Mark Synnott", year: 2021, description: "Mystery, obsession, and death on Mount Everest.", genres: ["adventure", "non-fiction", "history"], rating: 4.0 },
  { title: "Touching the Void", author: "Joe Simpson", year: 1988, description: "A mountaineering survival story.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.4 },
  { title: "The Climb", author: "Anatoli Boukreev", year: 1997, description: "Tragic ambitions on Everest.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.2 },
  { title: "Annapurna", author: "Maurice Herzog", year: 1952, description: "The first ascent of an 8,000-meter peak.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.1 },
  { title: "The White Spider", author: "Heinrich Harrer", year: 1959, description: "The classic account of the first ascent of the Eiger.", genres: ["adventure", "non-fiction", "history"], rating: 4.3 },
  { title: "No Shortcuts to the Top", author: "Ed Viesturs", year: 2006, description: "Climbing the world's 14 highest peaks.", genres: ["adventure", "non-fiction", "memoir"], rating: 4.4 },
  
  // Fantasy Books
  { title: "The Name of the Wind", author: "Patrick Rothfuss", year: 2007, description: "The first book in the Kingkiller Chronicle series.", genres: ["fantasy", "fiction"], rating: 4.5 },
  { title: "The Fellowship of the Ring", author: "J.R.R. Tolkien", year: 1954, description: "The first volume of The Lord of the Rings.", genres: ["fantasy", "fiction"], rating: 4.6 },
  { title: "The Two Towers", author: "J.R.R. Tolkien", year: 1954, description: "The second volume of The Lord of the Rings.", genres: ["fantasy", "fiction"], rating: 4.6 },
  { title: "The Hobbit", author: "J.R.R. Tolkien", year: 1937, description: "Bilbo Baggins' journey with thirteen dwarves.", genres: ["fantasy", "fiction"], rating: 4.5 },
  { title: "A Darker Shade of Magic", author: "V.E. Schwab", year: 2015, description: "A fantasy novel about parallel Londons.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Song of Achilles", author: "Madeline Miller", year: 2011, description: "A retelling of the Iliad from Patroclus' perspective.", genres: ["fantasy", "fiction", "romance"], rating: 4.4 },
  { title: "The Way of Kings", author: "Brandon Sanderson", year: 2010, description: "The first book in the Stormlight Archive series.", genres: ["fantasy", "fiction"], rating: 4.6 },
  { title: "Words of Radiance", author: "Brandon Sanderson", year: 2014, description: "The second book in the Stormlight Archive series.", genres: ["fantasy", "fiction"], rating: 4.7 },
  { title: "Oathbringer", author: "Brandon Sanderson", year: 2017, description: "The third book in the Stormlight Archive series.", genres: ["fantasy", "fiction"], rating: 4.6 },
  { title: "The Hero of Ages", author: "Brandon Sanderson", year: 2008, description: "The final book in the Mistborn trilogy.", genres: ["fantasy", "fiction"], rating: 4.5 },
  { title: "The Final Empire", author: "Brandon Sanderson", year: 2006, description: "The first book in the Mistborn trilogy.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "The Well of Ascension", author: "Brandon Sanderson", year: 2007, description: "The second book in the Mistborn trilogy.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Lightning Thief", author: "Rick Riordan", year: 2005, description: "The first book in the Percy Jackson series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "The Sea of Monsters", author: "Rick Riordan", year: 2006, description: "The second book in the Percy Jackson series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "The Titan's Curse", author: "Rick Riordan", year: 2007, description: "The third book in the Percy Jackson series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "The Battle of the Labyrinth", author: "Rick Riordan", year: 2008, description: "The fourth book in the Percy Jackson series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "The Last Olympian", author: "Rick Riordan", year: 2009, description: "The fifth book in the Percy Jackson series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.4 },
  
  // Mystery & Crime Books
  { title: "I'll Be Gone in the Dark", author: "Michelle McNamara", year: 2018, description: "One woman's obsessive search for the Golden State Killer.", genres: ["mystery", "true crime", "non-fiction"], rating: 4.3 },
  { title: "Killers of the Flower Moon", author: "David Grann", year: 2017, description: "The Osage murders and the birth of the FBI.", genres: ["mystery", "true crime", "non-fiction"], rating: 4.4 },
  { title: "City on Fire", author: "Don Winslow", year: 2022, description: "A crime novel set in 1980s New York.", genres: ["crime", "fiction"], rating: 4.2 },
  { title: "The Devil's Star", author: "Jo Nesbo", year: 2003, description: "A Harry Hole detective novel.", genres: ["mystery", "crime", "fiction"], rating: 4.1 },
  { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", year: 2005, description: "The first book in the Millennium series.", genres: ["mystery", "crime", "fiction"], rating: 4.2 },
  { title: "Gone Girl", author: "Gillian Flynn", year: 2012, description: "A psychological thriller about a missing woman.", genres: ["mystery", "thriller", "fiction"], rating: 4.1 },
  { title: "The Silent Patient", author: "Alex Michaelides", year: 2019, description: "A psychological thriller about a woman who shoots her husband.", genres: ["mystery", "thriller", "fiction"], rating: 4.0 },
  { title: "Verity", author: "Colleen Hoover", year: 2021, description: "A psychological thriller about a writer's manuscript.", genres: ["mystery", "thriller", "fiction"], rating: 4.1 },
  { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", year: 2017, description: "A novel about an aging Hollywood starlet.", genres: ["historical fiction", "romance"], rating: 4.3 },
  { title: "The Things We Cannot Say", author: "Kelly Rimmer", year: 2019, description: "A dual timeline novel about love and war.", genres: ["historical fiction", "romance"], rating: 4.2 },
  
  // Science Fiction Books
  { title: "The Three Body Problem", author: "Liu Cixin", year: 2008, description: "The first book in the Remembrance of Earth's Past trilogy.", genres: ["science fiction", "fiction"], rating: 4.3 },
  { title: "The Dark Forest", author: "Liu Cixin", year: 2008, description: "The second book in the Remembrance of Earth's Past trilogy.", genres: ["science fiction", "fiction"], rating: 4.4 },
  { title: "Death's End", author: "Liu Cixin", year: 2010, description: "The third book in the Remembrance of Earth's Past trilogy.", genres: ["science fiction", "fiction"], rating: 4.5 },
  { title: "Dune", author: "Frank Herbert", year: 1965, description: "A science fiction masterpiece about desert planet Arrakis.", genres: ["science fiction", "fiction"], rating: 4.6 },
  { title: "The Martian", author: "Andy Weir", year: 2011, description: "An astronaut stranded on Mars fights to survive.", genres: ["science fiction", "fiction"], rating: 4.4 },
  { title: "Project Hail Mary", author: "Andy Weir", year: 2021, description: "An astronaut wakes up alone on a spaceship with no memory.", genres: ["science fiction", "fiction"], rating: 4.3 },
  { title: "Ready Player One", author: "Ernest Cline", year: 2011, description: "A virtual reality treasure hunt in a dystopian future.", genres: ["science fiction", "fiction"], rating: 4.2 },
  { title: "The Hunger Games", author: "Suzanne Collins", year: 2008, description: "A dystopian novel about a televised battle to the death.", genres: ["science fiction", "young adult", "fiction"], rating: 4.3 },
  { title: "Catching Fire", author: "Suzanne Collins", year: 2009, description: "The second book in The Hunger Games trilogy.", genres: ["science fiction", "young adult", "fiction"], rating: 4.2 },
  { title: "Mockingjay", author: "Suzanne Collins", year: 2010, description: "The final book in The Hunger Games trilogy.", genres: ["science fiction", "young adult", "fiction"], rating: 4.1 },
  { title: "The Ballad of Song Birds and Snakes", author: "Suzanne Collins", year: 2020, description: "A prequel to The Hunger Games series.", genres: ["young adult", "fiction", "dystopian"], rating: 4.0 },
  
  // Historical Fiction & Biography
  { title: "The Personal Librarian", author: "Marie Benedict", year: 2021, description: "The remarkable story of Belle da Costa Greene.", genres: ["historical fiction", "biography"], rating: 4.1 },
  { title: "The Book Thief", author: "Markus Zusak", year: 2005, description: "A novel set in Nazi Germany narrated by Death.", genres: ["historical fiction", "young adult"], rating: 4.4 },
  { title: "All the Light We Cannot See", author: "Anthony Doerr", year: 2014, description: "A novel about a blind French girl and a German boy during WWII.", genres: ["historical fiction", "fiction"], rating: 4.3 },
  { title: "The Nightingale", author: "Kristin Hannah", year: 2015, description: "Two sisters in Nazi-occupied France.", genres: ["historical fiction", "fiction"], rating: 4.2 },
  { title: "The Tattooist of Auschwitz", author: "Heather Morris", year: 2018, description: "Based on the true story of Lale Sokolov.", genres: ["historical fiction", "biography"], rating: 4.1 },
  { title: "Educated", author: "Tara Westover", year: 2018, description: "A memoir about growing up in a survivalist family.", genres: ["memoir", "biography", "non-fiction"], rating: 4.5 },
  { title: "Becoming", author: "Michelle Obama", year: 2018, description: "The memoir of the former First Lady.", genres: ["memoir", "biography", "non-fiction"], rating: 4.4 },
  { title: "Sapiens", author: "Yuval Noah Harari", year: 2011, description: "A brief history of humankind.", genres: ["history", "non-fiction"], rating: 4.3 },
  { title: "Atomic Habits", author: "James Clear", year: 2018, description: "An easy and proven way to build good habits.", genres: ["self-help", "non-fiction"], rating: 4.4 },
  { title: "The Subtle Art of Not Giving a F*ck", author: "Mark Manson", year: 2016, description: "A counterintuitive approach to living a good life.", genres: ["self-help", "non-fiction"], rating: 4.0 },
  
  // Contemporary Fiction
  { title: "The Midnight Library", author: "Matt Haig", year: 2020, description: "A library between life and death.", genres: ["contemporary", "fiction"], rating: 4.1 },
  { title: "Klara and the Sun", author: "Kazuo Ishiguro", year: 2021, description: "A novel about an artificial friend.", genres: ["contemporary", "fiction"], rating: 4.0 },
  { title: "The Vanishing Half", author: "Brit Bennett", year: 2020, description: "A novel about twin sisters and identity.", genres: ["contemporary", "fiction"], rating: 4.2 },
  { title: "Such a Fun Age", author: "Kiley Reid", year: 2019, description: "A novel about race and privilege.", genres: ["contemporary", "fiction"], rating: 4.1 },
  { title: "Normal People", author: "Sally Rooney", year: 2018, description: "A novel about the relationship between two teenagers.", genres: ["contemporary", "fiction", "romance"], rating: 4.0 },
  { title: "Conversations with Friends", author: "Sally Rooney", year: 2017, description: "A novel about friendship and love.", genres: ["contemporary", "fiction"], rating: 3.9 },
  { title: "Beautiful World, Where Are You", author: "Sally Rooney", year: 2021, description: "A novel about love and friendship in the modern world.", genres: ["contemporary", "fiction"], rating: 3.8 },
  { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", year: 2022, description: "A novel about friendship and video games.", genres: ["contemporary", "fiction"], rating: 4.2 },
  { title: "Lessons in Chemistry", author: "Bonnie Garmus", year: 2022, description: "A novel about a female scientist in the 1960s.", genres: ["contemporary", "fiction"], rating: 4.1 },
  { title: "Remarkably Bright Creatures", author: "Shelby Van Pelt", year: 2022, description: "A novel about friendship between a widow and an octopus.", genres: ["contemporary", "fiction"], rating: 4.0 },
  
  // Award-Winning Books
  { title: "The Overstory", author: "Richard Powers", year: 2018, description: "A Pulitzer Prize-winning novel about trees and people.", genres: ["literary", "fiction"], rating: 4.2, awards: ["Pulitzer Prize"] },
  { title: "The Underground Railroad", author: "Colson Whitehead", year: 2016, description: "A Pulitzer Prize-winning novel about slavery.", genres: ["literary", "historical fiction"], rating: 4.3, awards: ["Pulitzer Prize"] },
  { title: "All the Pretty Horses", author: "Cormac McCarthy", year: 1992, description: "A National Book Award-winning novel.", genres: ["literary", "western", "fiction"], rating: 4.1, awards: ["National Book Award"] },
  { title: "Beloved", author: "Toni Morrison", year: 1987, description: "A Pulitzer Prize-winning novel about slavery.", genres: ["literary", "historical fiction"], rating: 4.4, awards: ["Pulitzer Prize"] },
  { title: "The Goldfinch", author: "Donna Tartt", year: 2013, description: "A Pulitzer Prize-winning novel about art and loss.", genres: ["literary", "fiction"], rating: 4.0, awards: ["Pulitzer Prize"] },
  { title: "A Visit from the Goon Squad", author: "Jennifer Egan", year: 2010, description: "A Pulitzer Prize-winning novel about time and music.", genres: ["literary", "fiction"], rating: 4.1, awards: ["Pulitzer Prize"] },
  { title: "The Brief Wondrous Life of Oscar Wao", author: "Junot Díaz", year: 2007, description: "A Pulitzer Prize-winning novel about Dominican-American life.", genres: ["literary", "fiction"], rating: 4.2, awards: ["Pulitzer Prize"] },
  { title: "Middlesex", author: "Jeffrey Eugenides", year: 2002, description: "A Pulitzer Prize-winning novel about gender and identity.", genres: ["literary", "fiction"], rating: 4.3, awards: ["Pulitzer Prize"] },
  { title: "The Amazing Adventures of Kavalier & Clay", author: "Michael Chabon", year: 2000, description: "A Pulitzer Prize-winning novel about comic books.", genres: ["literary", "historical fiction"], rating: 4.2, awards: ["Pulitzer Prize"] },
  { title: "Interpreter of Maladies", author: "Jhumpa Lahiri", year: 1999, description: "A Pulitzer Prize-winning short story collection.", genres: ["literary", "short stories"], rating: 4.4, awards: ["Pulitzer Prize"] },
  
  // Additional Fantasy Books
  { title: "The Return of the King", author: "J.R.R. Tolkien", year: 1955, description: "The final volume of The Lord of the Rings.", genres: ["fantasy", "fiction"], rating: 4.7 },
  { title: "The Silmarillion", author: "J.R.R. Tolkien", year: 1977, description: "The mythology and legends of Middle-earth.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Children of Húrin", author: "J.R.R. Tolkien", year: 2007, description: "A tragic tale from the First Age of Middle-earth.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "Rhythm of War", author: "Brandon Sanderson", year: 2020, description: "The fourth book in the Stormlight Archive series.", genres: ["fantasy", "fiction"], rating: 4.5 },
  { title: "Dawnshard", author: "Brandon Sanderson", year: 2020, description: "A novella in the Stormlight Archive universe.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Alloy of Law", author: "Brandon Sanderson", year: 2011, description: "A Mistborn novel set in the industrial era.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "Shadows of Self", author: "Brandon Sanderson", year: 2015, description: "A Mistborn novel about law and justice.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Bands of Mourning", author: "Brandon Sanderson", year: 2016, description: "A Mistborn novel about ancient artifacts.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Lost Metal", author: "Brandon Sanderson", year: 2022, description: "The final Mistborn novel in the Wax and Wayne series.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "Elantris", author: "Brandon Sanderson", year: 2005, description: "A standalone fantasy novel about a fallen city.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "Warbreaker", author: "Brandon Sanderson", year: 2009, description: "A standalone fantasy novel about color magic.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Rithmatist", author: "Brandon Sanderson", year: 2013, description: "A young adult fantasy about magical chalk drawings.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Steelheart", author: "Brandon Sanderson", year: 2013, description: "The first book in the Reckoners series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "Firefight", author: "Brandon Sanderson", year: 2015, description: "The second book in the Reckoners series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Calamity", author: "Brandon Sanderson", year: 2016, description: "The final book in the Reckoners series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Wise Man's Fear", author: "Patrick Rothfuss", year: 2011, description: "The second book in the Kingkiller Chronicle series.", genres: ["fantasy", "fiction"], rating: 4.6 },
  { title: "The Slow Regard of Silent Things", author: "Patrick Rothfuss", year: 2014, description: "A novella about Auri from the Kingkiller Chronicle.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "A Gathering of Shadows", author: "V.E. Schwab", year: 2016, description: "The second book in the Shades of Magic series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "A Conjuring of Light", author: "V.E. Schwab", year: 2017, description: "The final book in the Shades of Magic series.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "Circe", author: "Madeline Miller", year: 2018, description: "A retelling of the Greek myth of Circe.", genres: ["fantasy", "fiction", "mythology"], rating: 4.4 },
  { title: "The Priory of the Orange Tree", author: "Samantha Shannon", year: 2019, description: "An epic fantasy about dragons and queens.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "A Day of Fallen Night", author: "Samantha Shannon", year: 2023, description: "A prequel to The Priory of the Orange Tree.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Fifth Season", author: "N.K. Jemisin", year: 2015, description: "The first book in the Broken Earth trilogy.", genres: ["fantasy", "science fiction"], rating: 4.4 },
  { title: "The Obelisk Gate", author: "N.K. Jemisin", year: 2016, description: "The second book in the Broken Earth trilogy.", genres: ["fantasy", "science fiction"], rating: 4.5 },
  { title: "The Stone Sky", author: "N.K. Jemisin", year: 2017, description: "The final book in the Broken Earth trilogy.", genres: ["fantasy", "science fiction"], rating: 4.6 },
  { title: "The Hundred Thousand Kingdoms", author: "N.K. Jemisin", year: 2010, description: "The first book in the Inheritance trilogy.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Broken Kingdoms", author: "N.K. Jemisin", year: 2010, description: "The second book in the Inheritance trilogy.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Kingdom of Gods", author: "N.K. Jemisin", year: 2011, description: "The final book in the Inheritance trilogy.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The City We Became", author: "N.K. Jemisin", year: 2020, description: "A fantasy novel about New York City.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "The World We Make", author: "N.K. Jemisin", year: 2022, description: "The sequel to The City We Became.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Lies of Locke Lamora", author: "Scott Lynch", year: 2006, description: "The first book in the Gentlemen Bastards series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "Red Seas Under Red Skies", author: "Scott Lynch", year: 2007, description: "The second book in the Gentlemen Bastards series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Republic of Thieves", author: "Scott Lynch", year: 2013, description: "The third book in the Gentlemen Bastards series.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Thorn of Emberlain", author: "Scott Lynch", year: 2024, description: "The fourth book in the Gentlemen Bastards series.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "The Blade Itself", author: "Joe Abercrombie", year: 2006, description: "The first book in the First Law trilogy.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "Before They Are Hanged", author: "Joe Abercrombie", year: 2007, description: "The second book in the First Law trilogy.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "Last Argument of Kings", author: "Joe Abercrombie", year: 2008, description: "The final book in the First Law trilogy.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "Best Served Cold", author: "Joe Abercrombie", year: 2009, description: "A standalone novel in the First Law world.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Heroes", author: "Joe Abercrombie", year: 2011, description: "A standalone novel about a battle.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "Red Country", author: "Joe Abercrombie", year: 2012, description: "A standalone western fantasy novel.", genres: ["fantasy", "western", "fiction"], rating: 4.1 },
  { title: "A Little Hatred", author: "Joe Abercrombie", year: 2019, description: "The first book in the Age of Madness trilogy.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Trouble With Peace", author: "Joe Abercrombie", year: 2020, description: "The second book in the Age of Madness trilogy.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Wisdom of Crowds", author: "Joe Abercrombie", year: 2021, description: "The final book in the Age of Madness trilogy.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "The Way of Shadows", author: "Brent Weeks", year: 2008, description: "The first book in the Night Angel trilogy.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "Shadow's Edge", author: "Brent Weeks", year: 2008, description: "The second book in the Night Angel trilogy.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "Beyond the Shadows", author: "Brent Weeks", year: 2008, description: "The final book in the Night Angel trilogy.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Black Prism", author: "Brent Weeks", year: 2010, description: "The first book in the Lightbringer series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Blinding Knife", author: "Brent Weeks", year: 2012, description: "The second book in the Lightbringer series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Broken Eye", author: "Brent Weeks", year: 2014, description: "The third book in the Lightbringer series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Blood Mirror", author: "Brent Weeks", year: 2016, description: "The fourth book in the Lightbringer series.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Burning White", author: "Brent Weeks", year: 2019, description: "The final book in the Lightbringer series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Eye of the World", author: "Robert Jordan", year: 1990, description: "The first book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Great Hunt", author: "Robert Jordan", year: 1990, description: "The second book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "The Dragon Reborn", author: "Robert Jordan", year: 1991, description: "The third book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "The Shadow Rising", author: "Robert Jordan", year: 1992, description: "The fourth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "The Fires of Heaven", author: "Robert Jordan", year: 1993, description: "The fifth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "Lord of Chaos", author: "Robert Jordan", year: 1994, description: "The sixth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "A Crown of Swords", author: "Robert Jordan", year: 1996, description: "The seventh book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Path of Daggers", author: "Robert Jordan", year: 1998, description: "The eighth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "Winter's Heart", author: "Robert Jordan", year: 2000, description: "The ninth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "Crossroads of Twilight", author: "Robert Jordan", year: 2003, description: "The tenth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "Knife of Dreams", author: "Robert Jordan", year: 2005, description: "The eleventh book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.1 },
  { title: "The Gathering Storm", author: "Robert Jordan & Brandon Sanderson", year: 2009, description: "The twelfth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.3 },
  { title: "Towers of Midnight", author: "Robert Jordan & Brandon Sanderson", year: 2010, description: "The thirteenth book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.2 },
  { title: "A Memory of Light", author: "Robert Jordan & Brandon Sanderson", year: 2013, description: "The final book in The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.4 },
  { title: "New Spring", author: "Robert Jordan", year: 2004, description: "A prequel to The Wheel of Time series.", genres: ["fantasy", "fiction"], rating: 4.0 },
  { title: "The Red Queen", author: "Victoria Aveyard", year: 2015, description: "The first book in the Red Queen series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Glass Sword", author: "Victoria Aveyard", year: 2016, description: "The second book in the Red Queen series.", genres: ["fantasy", "young adult", "fiction"], rating: 3.9 },
  { title: "King's Cage", author: "Victoria Aveyard", year: 2017, description: "The third book in the Red Queen series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "War Storm", author: "Victoria Aveyard", year: 2018, description: "The final book in the Red Queen series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "Red Queen", author: "Victoria Aveyard", year: 2015, description: "The first book in the Red Queen series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "The Cruel Prince", author: "Holly Black", year: 2018, description: "The first book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Wicked King", author: "Holly Black", year: 2019, description: "The second book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "The Queen of Nothing", author: "Holly Black", year: 2019, description: "The final book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "Tithe", author: "Holly Black", year: 2002, description: "The first book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 3.9 },
  { title: "Valiant", author: "Holly Black", year: 2005, description: "The second book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Ironside", author: "Holly Black", year: 2007, description: "The final book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Darkest Part of the Forest", author: "Holly Black", year: 2015, description: "A standalone fantasy novel about faeries.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Book of Night", author: "Holly Black", year: 2022, description: "A dark fantasy novel about shadow magic.", genres: ["fantasy", "fiction"], rating: 3.9 },
  { title: "The Raven Boys", author: "Maggie Stiefvater", year: 2012, description: "The first book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Dream Thieves", author: "Maggie Stiefvater", year: 2013, description: "The second book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "Blue Lily, Lily Blue", author: "Maggie Stiefvater", year: 2014, description: "The third book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Raven King", author: "Maggie Stiefvater", year: 2016, description: "The final book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "Call Down the Hawk", author: "Maggie Stiefvater", year: 2019, description: "The first book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Mister Impossible", author: "Maggie Stiefvater", year: 2021, description: "The second book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "Greywaren", author: "Maggie Stiefvater", year: 2022, description: "The final book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "Shiver", author: "Maggie Stiefvater", year: 2009, description: "The first book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 3.9 },
  { title: "Linger", author: "Maggie Stiefvater", year: 2010, description: "The second book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Forever", author: "Maggie Stiefvater", year: 2011, description: "The final book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Scorpio Races", author: "Maggie Stiefvater", year: 2011, description: "A standalone fantasy novel about water horses.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "All the Crooked Saints", author: "Maggie Stiefvater", year: 2017, description: "A standalone magical realism novel.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "The Call", author: "Peadar Ó Guilín", year: 2016, description: "The first book in The Call duology.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "The Invasion", author: "Peadar Ó Guilín", year: 2018, description: "The final book in The Call duology.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Cruel Prince", author: "Holly Black", year: 2018, description: "The first book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Wicked King", author: "Holly Black", year: 2019, description: "The second book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "The Queen of Nothing", author: "Holly Black", year: 2019, description: "The final book in The Folk of the Air series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "Tithe", author: "Holly Black", year: 2002, description: "The first book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 3.9 },
  { title: "Valiant", author: "Holly Black", year: 2005, description: "The second book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Ironside", author: "Holly Black", year: 2007, description: "The final book in the Modern Faerie Tales series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Darkest Part of the Forest", author: "Holly Black", year: 2015, description: "A standalone fantasy novel about faeries.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Book of Night", author: "Holly Black", year: 2022, description: "A dark fantasy novel about shadow magic.", genres: ["fantasy", "fiction"], rating: 3.9 },
  { title: "The Raven Boys", author: "Maggie Stiefvater", year: 2012, description: "The first book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Dream Thieves", author: "Maggie Stiefvater", year: 2013, description: "The second book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "Blue Lily, Lily Blue", author: "Maggie Stiefvater", year: 2014, description: "The third book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Raven King", author: "Maggie Stiefvater", year: 2016, description: "The final book in The Raven Cycle series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.3 },
  { title: "Call Down the Hawk", author: "Maggie Stiefvater", year: 2019, description: "The first book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Mister Impossible", author: "Maggie Stiefvater", year: 2021, description: "The second book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "Greywaren", author: "Maggie Stiefvater", year: 2022, description: "The final book in The Dreamer trilogy.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "Shiver", author: "Maggie Stiefvater", year: 2009, description: "The first book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 3.9 },
  { title: "Linger", author: "Maggie Stiefvater", year: 2010, description: "The second book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "Forever", author: "Maggie Stiefvater", year: 2011, description: "The final book in The Wolves of Mercy Falls series.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  { title: "The Scorpio Races", author: "Maggie Stiefvater", year: 2011, description: "A standalone fantasy novel about water horses.", genres: ["fantasy", "young adult", "fiction"], rating: 4.2 },
  { title: "All the Crooked Saints", author: "Maggie Stiefvater", year: 2017, description: "A standalone magical realism novel.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "The Call", author: "Peadar Ó Guilín", year: 2016, description: "The first book in The Call duology.", genres: ["fantasy", "young adult", "fiction"], rating: 4.0 },
  { title: "The Invasion", author: "Peadar Ó Guilín", year: 2018, description: "The final book in The Call duology.", genres: ["fantasy", "young adult", "fiction"], rating: 4.1 },
  
  // Additional Science Fiction Books
  { title: "Neuromancer", author: "William Gibson", year: 1984, description: "The first cyberpunk novel.", genres: ["science fiction", "cyberpunk"], rating: 4.2 },
  { title: "Snow Crash", author: "Neal Stephenson", year: 1992, description: "A cyberpunk novel about virtual reality.", genres: ["science fiction", "cyberpunk"], rating: 4.1 },
  { title: "The Diamond Age", author: "Neal Stephenson", year: 1995, description: "A post-cyberpunk novel about nanotechnology.", genres: ["science fiction", "cyberpunk"], rating: 4.0 },
  { title: "Cryptonomicon", author: "Neal Stephenson", year: 1999, description: "A novel about cryptography and World War II.", genres: ["science fiction", "historical fiction"], rating: 4.1 },
  { title: "Anathem", author: "Neal Stephenson", year: 2008, description: "A science fiction novel about mathematics and philosophy.", genres: ["science fiction", "fiction"], rating: 4.2 },
  { title: "Seveneves", author: "Neal Stephenson", year: 2015, description: "A novel about humanity's survival after the moon explodes.", genres: ["science fiction", "fiction"], rating: 4.0 },
  { title: "Fall; or, Dodge in Hell", author: "Neal Stephenson", year: 2019, description: "A novel about digital consciousness.", genres: ["science fiction", "fiction"], rating: 3.8 },
  { title: "Termination Shock", author: "Neal Stephenson", year: 2021, description: "A novel about climate change and geoengineering.", genres: ["science fiction", "fiction"], rating: 3.9 },
  { title: "The Foundation", author: "Isaac Asimov", year: 1951, description: "The first book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.3 },
  { title: "Foundation and Empire", author: "Isaac Asimov", year: 1952, description: "The second book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.2 },
  { title: "Second Foundation", author: "Isaac Asimov", year: 1953, description: "The third book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.3 },
  { title: "Foundation's Edge", author: "Isaac Asimov", year: 1982, description: "The fourth book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.1 },
  { title: "Foundation and Earth", author: "Isaac Asimov", year: 1986, description: "The fifth book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.0 },
  { title: "Prelude to Foundation", author: "Isaac Asimov", year: 1988, description: "A prequel to the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.1 },
  { title: "Forward the Foundation", author: "Isaac Asimov", year: 1993, description: "The final book in the Foundation series.", genres: ["science fiction", "fiction"], rating: 4.0 },
  { title: "I, Robot", author: "Isaac Asimov", year: 1950, description: "A collection of robot stories.", genres: ["science fiction", "short stories"], rating: 4.2 },
  { title: "The Caves of Steel", author: "Isaac Asimov", year: 1954, description: "The first book in the Robot series.", genres: ["science fiction", "mystery"], rating: 4.1 },
  { title: "The Naked Sun", author: "Isaac Asimov", year: 1957, description: "The second book in the Robot series.", genres: ["science fiction", "mystery"], rating: 4.0 },
  { title: "The Robots of Dawn", author: "Isaac Asimov", year: 1983, description: "The third book in the Robot series.", genres: ["science fiction", "mystery"], rating: 4.1 },
  { title: "Robots and Empire", author: "Isaac Asimov", year: 1985, description: "The fourth book in the Robot series.", genres: ["science fiction", "fiction"], rating: 4.0 },
  { title: "The Gods Themselves", author: "Isaac Asimov", year: 1972, description: "A novel about parallel universes.", genres: ["science fiction", "fiction"], rating: 4.1 },
  { title: "Nightfall", author: "Isaac Asimov", year: 1990, description: "A novel about a world with multiple suns.", genres: ["science fiction", "fiction"], rating: 4.0 },
  { title: "The End of Eternity", author: "Isaac Asimov", year: 1955, description: "A novel about time travel.", genres: ["science fiction", "fiction"], rating: 4.1 },
  { title: "The Stars, Like Dust", author: "Isaac Asimov", year: 1951, description: "A novel about interstellar politics.", genres: ["science fiction", "fiction"], rating: 3.9 },
  { title: "The Currents of Space", author: "Isaac Asimov", year: 1952, description: "A novel about space colonization.", genres: ["science fiction", "fiction"], rating: 3.8 },
  { title: "Pebble in the Sky", author: "Isaac Asimov", year: 1950, description: "A novel about Earth's future.", genres: ["science fiction", "fiction"], rating: 3.9 },
  { title: "The Hitchhiker's Guide to the Galaxy", author: "Douglas Adams", year: 1979, description: "A humorous science fiction novel.", genres: ["science fiction", "comedy", "fiction"], rating: 4.3 },
  { title: "The Restaurant at the End of the Universe", author: "Douglas Adams", year: 1980, description: "The second book in the Hitchhiker's series.", genres: ["science fiction", "comedy", "fiction"], rating: 4.2 },
  { title: "Life, the Universe and Everything", author: "Douglas Adams", year: 1982, description: "The third book in the Hitchhiker's series.", genres: ["science fiction", "comedy", "fiction"], rating: 4.1 },
  { title: "So Long, and Thanks for All the Fish", author: "Douglas Adams", year: 1984, description: "The fourth book in the Hitchhiker's series.", genres: ["science fiction", "comedy", "fiction"], rating: 4.0 },
  { title: "Mostly Harmless", author: "Douglas Adams", year: 1992, description: "The fifth book in the Hitchhiker's series.", genres: ["science fiction", "comedy", "fiction"], rating: 3.9 },
  { title: "Dirk Gently's Holistic Detective Agency", author: "Douglas Adams", year: 1987, description: "A detective novel with supernatural elements.", genres: ["science fiction", "mystery", "comedy"], rating: 4.0 },
  { title: "The Long Dark Tea-Time of the Soul", author: "Douglas Adams", year: 1988, description: "The second Dirk Gently novel.", genres: ["science fiction", "mystery", "comedy"], rating: 4.1 },
  { title: "1984", author: "George Orwell", year: 1949, description: "A dystopian novel about totalitarianism.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.4 },
  { title: "Animal Farm", author: "George Orwell", year: 1945, description: "An allegorical novel about revolution.", genres: ["fiction", "allegory"], rating: 4.3 },
  { title: "Brave New World", author: "Aldous Huxley", year: 1932, description: "A dystopian novel about genetic engineering.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.2 },
  { title: "Fahrenheit 451", author: "Ray Bradbury", year: 1953, description: "A dystopian novel about book burning.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.3 },
  { title: "The Martian Chronicles", author: "Ray Bradbury", year: 1950, description: "A collection of stories about Mars colonization.", genres: ["science fiction", "short stories"], rating: 4.1 },
  { title: "Something Wicked This Way Comes", author: "Ray Bradbury", year: 1962, description: "A dark fantasy novel about a traveling carnival.", genres: ["fantasy", "horror", "fiction"], rating: 4.0 },
  { title: "The Illustrated Man", author: "Ray Bradbury", year: 1951, description: "A collection of science fiction stories.", genres: ["science fiction", "short stories"], rating: 4.1 },
  { title: "The October Country", author: "Ray Bradbury", year: 1955, description: "A collection of horror and fantasy stories.", genres: ["horror", "fantasy", "short stories"], rating: 4.0 },
  { title: "Dandelion Wine", author: "Ray Bradbury", year: 1957, description: "A novel about childhood and summer.", genres: ["fiction", "coming of age"], rating: 4.1 },
  { title: "Death is a Lonely Business", author: "Ray Bradbury", year: 1985, description: "A detective novel set in 1949 Los Angeles.", genres: ["mystery", "fiction"], rating: 3.9 },
  { title: "A Graveyard for Lunatics", author: "Ray Bradbury", year: 1990, description: "A sequel to Death is a Lonely Business.", genres: ["mystery", "fiction"], rating: 3.8 },
  { title: "Let's All Kill Constance", author: "Ray Bradbury", year: 2003, description: "The final book in the detective trilogy.", genres: ["mystery", "fiction"], rating: 3.7 },
  { title: "The Handmaid's Tale", author: "Margaret Atwood", year: 1985, description: "A dystopian novel about women's rights.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.3 },
  { title: "The Testaments", author: "Margaret Atwood", year: 2019, description: "A sequel to The Handmaid's Tale.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.1 },
  { title: "Oryx and Crake", author: "Margaret Atwood", year: 2003, description: "The first book in the MaddAddam trilogy.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.0 },
  { title: "The Year of the Flood", author: "Margaret Atwood", year: 2009, description: "The second book in the MaddAddam trilogy.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.1 },
  { title: "MaddAddam", author: "Margaret Atwood", year: 2013, description: "The final book in the MaddAddam trilogy.", genres: ["science fiction", "dystopian", "fiction"], rating: 4.0 },
  { title: "The Blind Assassin", author: "Margaret Atwood", year: 2000, description: "A novel about sisters and storytelling.", genres: ["literary", "fiction"], rating: 4.2 },
  { title: "Alias Grace", author: "Margaret Atwood", year: 1996, description: "A historical novel about a convicted murderer.", genres: ["historical fiction", "mystery"], rating: 4.1 },
  { title: "Cat's Eye", author: "Margaret Atwood", year: 1988, description: "A novel about childhood bullying and memory.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "The Robber Bride", author: "Margaret Atwood", year: 1993, description: "A novel about female friendship and betrayal.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "The Edible Woman", author: "Margaret Atwood", year: 1969, description: "Atwood's first novel about marriage and identity.", genres: ["literary", "fiction"], rating: 3.9 },
  { title: "Surfacing", author: "Margaret Atwood", year: 1972, description: "A novel about a woman's search for her father.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "Lady Oracle", author: "Margaret Atwood", year: 1976, description: "A novel about a writer's double life.", genres: ["literary", "fiction"], rating: 3.9 },
  { title: "Life Before Man", author: "Margaret Atwood", year: 1979, description: "A novel about relationships and evolution.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "Bodily Harm", author: "Margaret Atwood", year: 1981, description: "A novel about a journalist in the Caribbean.", genres: ["literary", "fiction"], rating: 3.9 },
  { title: "The Heart Goes Last", author: "Margaret Atwood", year: 2015, description: "A novel about a couple in a social experiment.", genres: ["science fiction", "dystopian", "fiction"], rating: 3.8 },
  { title: "Hag-Seed", author: "Margaret Atwood", year: 2016, description: "A retelling of The Tempest.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "The Penelopiad", author: "Margaret Atwood", year: 2005, description: "A retelling of The Odyssey from Penelope's perspective.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "The Door", author: "Margaret Atwood", year: 2007, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "Morning in the Burned House", author: "Margaret Atwood", year: 1995, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Interlunar", author: "Margaret Atwood", year: 1984, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "True Stories", author: "Margaret Atwood", year: 1981, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Two-Headed Poems", author: "Margaret Atwood", year: 1978, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "You Are Happy", author: "Margaret Atwood", year: 1974, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Power Politics", author: "Margaret Atwood", year: 1971, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "The Journals of Susanna Moodie", author: "Margaret Atwood", year: 1970, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "The Circle Game", author: "Margaret Atwood", year: 1966, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "Double Persephone", author: "Margaret Atwood", year: 1961, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "The Stone Diaries", author: "Carol Shields", year: 1993, description: "A Pulitzer Prize-winning novel about a woman's life.", genres: ["literary", "fiction"], rating: 4.2, awards: ["Pulitzer Prize"] },
  { title: "Unless", author: "Carol Shields", year: 2002, description: "A novel about a mother's search for meaning.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "Larry's Party", author: "Carol Shields", year: 1997, description: "A novel about a man's life through the lens of mazes.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "The Republic of Love", author: "Carol Shields", year: 1992, description: "A novel about love and relationships.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "Swann", author: "Carol Shields", year: 1987, description: "A novel about a murdered poet.", genres: ["literary", "mystery", "fiction"], rating: 4.0 },
  { title: "Happenstance", author: "Carol Shields", year: 1980, description: "A novel about a marriage from two perspectives.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "Small Ceremonies", author: "Carol Shields", year: 1976, description: "Shields's first novel about family life.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "The Box Garden", author: "Carol Shields", year: 1977, description: "A novel about a woman's journey to self-discovery.", genres: ["literary", "fiction"], rating: 4.1 },
  { title: "Various Miracles", author: "Carol Shields", year: 1985, description: "A collection of short stories.", genres: ["literary", "short stories"], rating: 4.0 },
  { title: "The Orange Fish", author: "Carol Shields", year: 1989, description: "A collection of short stories.", genres: ["literary", "short stories"], rating: 4.1 },
  { title: "Dressing Up for the Carnival", author: "Carol Shields", year: 2000, description: "A collection of short stories.", genres: ["literary", "short stories"], rating: 4.0 },
  { title: "Collected Stories", author: "Carol Shields", year: 2004, description: "A comprehensive collection of short stories.", genres: ["literary", "short stories"], rating: 4.1 },
  { title: "Coming Through Slaughter", author: "Michael Ondaatje", year: 1976, description: "A novel about jazz musician Buddy Bolden.", genres: ["literary", "historical fiction"], rating: 4.0 },
  { title: "In the Skin of a Lion", author: "Michael Ondaatje", year: 1987, description: "A novel about immigrants in Toronto.", genres: ["literary", "historical fiction"], rating: 4.1 },
  { title: "The English Patient", author: "Michael Ondaatje", year: 1992, description: "A Booker Prize-winning novel about love and war.", genres: ["literary", "historical fiction"], rating: 4.3, awards: ["Booker Prize"] },
  { title: "Anil's Ghost", author: "Michael Ondaatje", year: 2000, description: "A novel about a forensic anthropologist in Sri Lanka.", genres: ["literary", "mystery", "fiction"], rating: 4.1 },
  { title: "Divisadero", author: "Michael Ondaatje", year: 2007, description: "A novel about family and memory.", genres: ["literary", "fiction"], rating: 4.0 },
  { title: "The Cat's Table", author: "Michael Ondaatje", year: 2011, description: "A novel about a boy's journey by ship.", genres: ["literary", "coming of age", "fiction"], rating: 4.1 },
  { title: "Warlight", author: "Michael Ondaatje", year: 2018, description: "A novel about children left behind during WWII.", genres: ["literary", "historical fiction"], rating: 4.0 },
  { title: "The Collected Works of Billy the Kid", author: "Michael Ondaatje", year: 1970, description: "A novel about the outlaw Billy the Kid.", genres: ["literary", "historical fiction"], rating: 4.1 },
  { title: "Running in the Family", author: "Michael Ondaatje", year: 1982, description: "A memoir about family history in Sri Lanka.", genres: ["memoir", "biography"], rating: 4.2 },
  { title: "Handwriting", author: "Michael Ondaatje", year: 1998, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "The Cinnamon Peeler", author: "Michael Ondaatje", year: 1989, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Secular Love", author: "Michael Ondaatje", year: 1984, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "There's a Trick with a Knife I'm Learning to Do", author: "Michael Ondaatje", year: 1979, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Rat Jelly", author: "Michael Ondaatje", year: 1973, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "The Dainty Monsters", author: "Michael Ondaatje", year: 1967, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "The Man with Seven Toes", author: "Michael Ondaatje", year: 1969, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "Elimination Dance", author: "Michael Ondaatje", year: 1978, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "Tin Roof", author: "Michael Ondaatje", year: 1982, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "The Story", author: "Michael Ondaatje", year: 2005, description: "A collection of poetry.", genres: ["poetry"], rating: 4.1 },
  { title: "The Conversation", author: "Michael Ondaatje", year: 2012, description: "A collection of poetry.", genres: ["poetry"], rating: 4.0 },
  { title: "The Long Poem Anthology", author: "Michael Ondaatje", year: 1979, description: "An anthology of long poems.", genres: ["poetry", "anthology"], rating: 4.1 },
  { title: "The Brick Reader", author: "Michael Ondaatje", year: 1991, description: "An anthology of Canadian writing.", genres: ["anthology", "literary"], rating: 4.0 },
  { title: "From Ink Lake", author: "Michael Ondaatje", year: 1990, description: "An anthology of Canadian stories.", genres: ["anthology", "short stories"], rating: 4.1 },
  { title: "The Faber Book of Contemporary Canadian Short Stories", author: "Michael Ondaatje", year: 1990, description: "An anthology of Canadian short stories.", genres: ["anthology", "short stories"], rating: 4.0 },
  { title: "The Vintage Book of Contemporary Canadian Fiction", author: "Michael Ondaatje", year: 1997, description: "An anthology of Canadian fiction.", genres: ["anthology", "fiction"], rating: 4.1 },
  { title: "The Norton Anthology of English Literature", author: "Various", year: 1962, description: "A comprehensive anthology of English literature.", genres: ["anthology", "literary"], rating: 4.3 },
  { title: "The Norton Anthology of American Literature", author: "Various", year: 1979, description: "A comprehensive anthology of American literature.", genres: ["anthology", "literary"], rating: 4.3 },
  { title: "The Norton Anthology of World Literature", author: "Various", year: 2001, description: "A comprehensive anthology of world literature.", genres: ["anthology", "literary"], rating: 4.2 },
  { title: "The Oxford Book of English Verse", author: "Various", year: 1900, description: "An anthology of English poetry.", genres: ["anthology", "poetry"], rating: 4.4 },
  { title: "The Norton Anthology of Poetry", author: "Various", year: 1970, description: "A comprehensive anthology of poetry.", genres: ["anthology", "poetry"], rating: 4.3 },
  { title: "The Best American Short Stories", author: "Various", year: 1915, description: "An annual anthology of American short stories.", genres: ["anthology", "short stories"], rating: 4.2 },
  { title: "The O. Henry Prize Stories", author: "Various", year: 1919, description: "An annual anthology of short stories.", genres: ["anthology", "short stories"], rating: 4.1 },
  { title: "The Pushcart Prize", author: "Various", year: 1976, description: "An annual anthology of small press writing.", genres: ["anthology", "literary"], rating: 4.0 },
  { title: "The Best American Essays", author: "Various", year: 1986, description: "An annual anthology of American essays.", genres: ["anthology", "essays"], rating: 4.1 },
  { title: "The Best American Poetry", author: "Various", year: 1988, description: "An annual anthology of American poetry.", genres: ["anthology", "poetry"], rating: 4.2 },
  { title: "The Best American Science Fiction and Fantasy", author: "Various", year: 2015, description: "An annual anthology of science fiction and fantasy.", genres: ["anthology", "science fiction", "fantasy"], rating: 4.0 },
  { title: "The Year's Best Science Fiction", author: "Various", year: 1984, description: "An annual anthology of science fiction.", genres: ["anthology", "science fiction"], rating: 4.1 },
  { title: "The Year's Best Fantasy and Horror", author: "Various", year: 1988, description: "An annual anthology of fantasy and horror.", genres: ["anthology", "fantasy", "horror"], rating: 4.0 },
  { title: "The Best American Mystery Stories", author: "Various", year: 1997, description: "An annual anthology of mystery stories.", genres: ["anthology", "mystery"], rating: 4.1 },
  { title: "The Best American Crime Writing", author: "Various", year: 2002, description: "An annual anthology of crime writing.", genres: ["anthology", "crime"], rating: 4.0 },
  { title: "The Best American Travel Writing", author: "Various", year: 2000, description: "An annual anthology of travel writing.", genres: ["anthology", "travel"], rating: 4.1 },
  { title: "The Best American Sports Writing", author: "Various", year: 1991, description: "An annual anthology of sports writing.", genres: ["anthology", "sports"], rating: 4.0 },
  { title: "The Best American Food Writing", author: "Various", year: 2000, description: "An annual anthology of food writing.", genres: ["anthology", "food"], rating: 4.1 },
  { title: "The Best American Science and Nature Writing", author: "Various", year: 2000, description: "An annual anthology of science and nature writing.", genres: ["anthology", "science", "nature"], rating: 4.0 },
  { title: "The Best American Nonrequired Reading", author: "Various", year: 2002, description: "An annual anthology of miscellaneous writing.", genres: ["anthology", "literary"], rating: 4.1 },
  { title: "The Best American Comics", author: "Various", year: 2006, description: "An annual anthology of comics.", genres: ["anthology", "comics"], rating: 4.0 },
  { title: "The Best American Infographics", author: "Various", year: 2013, description: "An annual anthology of infographics.", genres: ["anthology", "visual"], rating: 4.1 },
  { title: "The Best American Magazine Writing", author: "Various", year: 2000, description: "An annual anthology of magazine writing.", genres: ["anthology", "journalism"], rating: 4.0 },
  { title: "The Best American Newspaper Writing", author: "Various", year: 2001, description: "An annual anthology of newspaper writing.", genres: ["anthology", "journalism"], rating: 4.1 },
  { title: "The Best American Spiritual Writing", author: "Various", year: 2004, description: "An annual anthology of spiritual writing.", genres: ["anthology", "spiritual"], rating: 4.0 },
  { title: "The Best American Gay and Lesbian Writing", author: "Various", year: 2000, description: "An annual anthology of LGBTQ writing.", genres: ["anthology", "LGBTQ"], rating: 4.1 },
  { title: "The Best American Erotica", author: "Various", year: 1993, description: "An annual anthology of erotic writing.", genres: ["anthology", "erotica"], rating: 4.0 },
  { title: "The Best American Humor", author: "Various", year: 1993, description: "An annual anthology of humorous writing.", genres: ["anthology", "humor"], rating: 4.1 },
  { title: "The Best American Political Writing", author: "Various", year: 2004, description: "An annual anthology of political writing.", genres: ["anthology", "politics"], rating: 4.0 },
  { title: "The Best American Business Writing", author: "Various", year: 2012, description: "An annual anthology of business writing.", genres: ["anthology", "business"], rating: 4.1 },
  { title: "The Best American Technology Writing", author: "Various", year: 2006, description: "An annual anthology of technology writing.", genres: ["anthology", "technology"], rating: 4.0 },
  { title: "The Best American Medical Writing", author: "Various", year: 2006, description: "An annual anthology of medical writing.", genres: ["anthology", "medical"], rating: 4.1 },
  { title: "The Best American Legal Writing", author: "Various", year: 2006, description: "An annual anthology of legal writing.", genres: ["anthology", "legal"], rating: 4.0 },
  { title: "The Best American Historical Writing", author: "Various", year: 2007, description: "An annual anthology of historical writing.", genres: ["anthology", "history"], rating: 4.1 },
  { title: "The Best American Military Writing", author: "Various", year: 2008, description: "An annual anthology of military writing.", genres: ["anthology", "military"], rating: 4.0 },
  { title: "The Best American Environmental Writing", author: "Various", year: 2001, description: "An annual anthology of environmental writing.", genres: ["anthology", "environmental"], rating: 4.1 },
  { title: "The Best American Essays of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of essays.", genres: ["anthology", "essays"], rating: 4.3 },
  { title: "The Best American Short Stories of the Century", author: "Various", year: 1999, description: "A century-spanning anthology of short stories.", genres: ["anthology", "short stories"], rating: 4.3 },
  { title: "The Best American Poetry of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of poetry.", genres: ["anthology", "poetry"], rating: 4.3 },
  { title: "The Best American Science Fiction of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of science fiction.", genres: ["anthology", "science fiction"], rating: 4.2 },
  { title: "The Best American Fantasy of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of fantasy.", genres: ["anthology", "fantasy"], rating: 4.2 },
  { title: "The Best American Mystery Stories of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of mystery stories.", genres: ["anthology", "mystery"], rating: 4.2 },
  { title: "The Best American Crime Stories of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of crime stories.", genres: ["anthology", "crime"], rating: 4.1 },
  { title: "The Best American Travel Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of travel writing.", genres: ["anthology", "travel"], rating: 4.1 },
  { title: "The Best American Sports Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of sports writing.", genres: ["anthology", "sports"], rating: 4.1 },
  { title: "The Best American Food Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of food writing.", genres: ["anthology", "food"], rating: 4.1 },
  { title: "The Best American Science and Nature Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of science and nature writing.", genres: ["anthology", "science", "nature"], rating: 4.1 },
  { title: "The Best American Nonrequired Reading of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of miscellaneous writing.", genres: ["anthology", "literary"], rating: 4.1 },
  { title: "The Best American Comics of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of comics.", genres: ["anthology", "comics"], rating: 4.0 },
  { title: "The Best American Infographics of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of infographics.", genres: ["anthology", "visual"], rating: 4.0 },
  { title: "The Best American Magazine Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of magazine writing.", genres: ["anthology", "journalism"], rating: 4.0 },
  { title: "The Best American Newspaper Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of newspaper writing.", genres: ["anthology", "journalism"], rating: 4.0 },
  { title: "The Best American Spiritual Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of spiritual writing.", genres: ["anthology", "spiritual"], rating: 4.0 },
  { title: "The Best American Gay and Lesbian Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of LGBTQ writing.", genres: ["anthology", "LGBTQ"], rating: 4.0 },
  { title: "The Best American Erotica of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of erotic writing.", genres: ["anthology", "erotica"], rating: 4.0 },
  { title: "The Best American Humor of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of humorous writing.", genres: ["anthology", "humor"], rating: 4.0 },
  { title: "The Best American Political Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of political writing.", genres: ["anthology", "politics"], rating: 4.0 },
  { title: "The Best American Business Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of business writing.", genres: ["anthology", "business"], rating: 4.0 },
  { title: "The Best American Technology Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of technology writing.", genres: ["anthology", "technology"], rating: 4.0 },
  { title: "The Best American Medical Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of medical writing.", genres: ["anthology", "medical"], rating: 4.0 },
  { title: "The Best American Legal Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of legal writing.", genres: ["anthology", "legal"], rating: 4.0 },
  { title: "The Best American Historical Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of historical writing.", genres: ["anthology", "history"], rating: 4.0 },
  { title: "The Best American Military Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of military writing.", genres: ["anthology", "military"], rating: 4.0 },
  { title: "The Best American Environmental Writing of the Century", author: "Various", year: 2000, description: "A century-spanning anthology of environmental writing.", genres: ["anthology", "environmental"], rating: 4.0 },
  
  // Top 100 Books of All Time & Required Reading
  { title: "To Kill a Mockingbird", author: "Harper Lee", year: 1960, description: "A classic novel about racial injustice in the American South.", genres: ["classic", "literary", "fiction"], rating: 4.5, awards: ["Pulitzer Prize"] },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925, description: "A novel about the American Dream and the Jazz Age.", genres: ["classic", "literary", "fiction"], rating: 4.4 },
  { title: "Lord of the Flies", author: "William Golding", year: 1954, description: "A novel about the dark side of human nature.", genres: ["classic", "literary", "fiction"], rating: 4.2 },
  { title: "The Grapes of Wrath", author: "John Steinbeck", year: 1939, description: "A novel about the Great Depression and migrant workers.", genres: ["classic", "literary", "fiction"], rating: 4.4, awards: ["Pulitzer Prize"] },
  { title: "Of Mice and Men", author: "John Steinbeck", year: 1937, description: "A novella about friendship during the Great Depression.", genres: ["classic", "literary", "fiction"], rating: 4.3 },
  { title: "The Old Man and the Sea", author: "Ernest Hemingway", year: 1952, description: "A novel about an old fisherman's struggle.", genres: ["classic", "literary", "fiction"], rating: 4.2, awards: ["Pulitzer Prize"] },
  { title: "For Whom the Bell Tolls", author: "Ernest Hemingway", year: 1940, description: "A novel about the Spanish Civil War.", genres: ["classic", "literary", "fiction"], rating: 4.3 },
  { title: "A Farewell to Arms", author: "Ernest Hemingway", year: 1929, description: "A novel about love and war during WWI.", genres: ["classic", "literary", "fiction"], rating: 4.2 },
  { title: "The Sun Also Rises", author: "Ernest Hemingway", year: 1926, description: "A novel about the Lost Generation in Paris.", genres: ["classic", "literary", "fiction"], rating: 4.1 },
  { title: "The Adventures of Huckleberry Finn", author: "Mark Twain", year: 1884, description: "A novel about a boy's journey down the Mississippi River.", genres: ["classic", "adventure", "fiction"], rating: 4.4 },
  { title: "The Adventures of Tom Sawyer", author: "Mark Twain", year: 1876, description: "A novel about a boy's adventures in Missouri.", genres: ["classic", "adventure", "fiction"], rating: 4.2 },
  { title: "Moby-Dick", author: "Herman Melville", year: 1851, description: "An epic novel about a whaling voyage and obsession.", genres: ["classic", "adventure", "fiction"], rating: 4.1 },
  { title: "The Scarlet Letter", author: "Nathaniel Hawthorne", year: 1850, description: "A novel about sin and redemption in Puritan New England.", genres: ["classic", "literary", "fiction"], rating: 4.0 },
  { title: "The Crucible", author: "Arthur Miller", year: 1953, description: "A play about the Salem witch trials.", genres: ["classic", "drama", "historical"], rating: 4.2 },
  { title: "Death of a Salesman", author: "Arthur Miller", year: 1949, description: "A play about the American Dream and family.", genres: ["classic", "drama", "fiction"], rating: 4.3, awards: ["Pulitzer Prize"] },
  { title: "Romeo and Juliet", author: "William Shakespeare", year: 1597, description: "A tragic play about young love.", genres: ["classic", "drama", "romance"], rating: 4.4 },
  { title: "Hamlet", author: "William Shakespeare", year: 1603, description: "A tragic play about revenge and madness.", genres: ["classic", "drama", "tragedy"], rating: 4.5 },
  { title: "Macbeth", author: "William Shakespeare", year: 1606, description: "A tragic play about ambition and power.", genres: ["classic", "drama", "tragedy"], rating: 4.4 },
  { title: "Othello", author: "William Shakespeare", year: 1604, description: "A tragic play about jealousy and betrayal.", genres: ["classic", "drama", "tragedy"], rating: 4.3 },
  { title: "King Lear", author: "William Shakespeare", year: 1606, description: "A tragic play about family and power.", genres: ["classic", "drama", "tragedy"], rating: 4.4 },
  { title: "Julius Caesar", author: "William Shakespeare", year: 1599, description: "A historical play about betrayal and power.", genres: ["classic", "drama", "historical"], rating: 4.2 },
  { title: "A Midsummer Night's Dream", author: "William Shakespeare", year: 1596, description: "A comedy about love and magic.", genres: ["classic", "drama", "comedy"], rating: 4.3 },
  { title: "The Tempest", author: "William Shakespeare", year: 1611, description: "A play about magic, revenge, and forgiveness.", genres: ["classic", "drama", "fantasy"], rating: 4.2 },
  { title: "Much Ado About Nothing", author: "William Shakespeare", year: 1598, description: "A comedy about love and deception.", genres: ["classic", "drama", "comedy"], rating: 4.2 },
  { title: "Twelfth Night", author: "William Shakespeare", year: 1601, description: "A comedy about mistaken identity and love.", genres: ["classic", "drama", "comedy"], rating: 4.2 },
  { title: "As You Like It", author: "William Shakespeare", year: 1599, description: "A comedy about love and disguise.", genres: ["classic", "drama", "comedy"], rating: 4.1 },
  { title: "The Merchant of Venice", author: "William Shakespeare", year: 1596, description: "A play about justice and mercy.", genres: ["classic", "drama", "comedy"], rating: 4.1 },
  { title: "The Taming of the Shrew", author: "William Shakespeare", year: 1592, description: "A comedy about marriage and gender roles.", genres: ["classic", "drama", "comedy"], rating: 4.0 },
  { title: "Antony and Cleopatra", author: "William Shakespeare", year: 1607, description: "A tragedy about love and power.", genres: ["classic", "drama", "tragedy"], rating: 4.1 },
  { title: "Coriolanus", author: "William Shakespeare", year: 1608, description: "A tragedy about pride and politics.", genres: ["classic", "drama", "tragedy"], rating: 4.0 },
  { title: "Timon of Athens", author: "William Shakespeare", year: 1607, description: "A tragedy about friendship and betrayal.", genres: ["classic", "drama", "tragedy"], rating: 3.9 },
  { title: "Pericles, Prince of Tyre", author: "William Shakespeare", year: 1608, description: "A romance about adventure and family.", genres: ["classic", "drama", "romance"], rating: 3.8 },
  { title: "Cymbeline", author: "William Shakespeare", year: 1611, description: "A romance about love and forgiveness.", genres: ["classic", "drama", "romance"], rating: 3.9 },
  { title: "The Winter's Tale", author: "William Shakespeare", year: 1611, description: "A romance about jealousy and redemption.", genres: ["classic", "drama", "romance"], rating: 4.0 },
  { title: "The Two Noble Kinsmen", author: "William Shakespeare", year: 1613, description: "A romance about friendship and love.", genres: ["classic", "drama", "romance"], rating: 3.8 },
  { title: "Henry IV, Part 1", author: "William Shakespeare", year: 1597, description: "A history play about kingship and rebellion.", genres: ["classic", "drama", "historical"], rating: 4.1 },
  { title: "Henry IV, Part 2", author: "William Shakespeare", year: 1598, description: "A history play about kingship and succession.", genres: ["classic", "drama", "historical"], rating: 4.0 },
  { title: "Henry V", author: "William Shakespeare", year: 1599, description: "A history play about war and leadership.", genres: ["classic", "drama", "historical"], rating: 4.2 },
  { title: "Henry VI, Part 1", author: "William Shakespeare", year: 1591, description: "A history play about the Wars of the Roses.", genres: ["classic", "drama", "historical"], rating: 3.9 },
  { title: "Henry VI, Part 2", author: "William Shakespeare", year: 1591, description: "A history play about civil war.", genres: ["classic", "drama", "historical"], rating: 3.9 },
  { title: "Henry VI, Part 3", author: "William Shakespeare", year: 1591, description: "A history play about the end of civil war.", genres: ["classic", "drama", "historical"], rating: 3.8 },
  { title: "Richard III", author: "William Shakespeare", year: 1592, description: "A history play about tyranny and ambition.", genres: ["classic", "drama", "historical"], rating: 4.1 },
  { title: "Richard II", author: "William Shakespeare", year: 1595, description: "A history play about kingship and deposition.", genres: ["classic", "drama", "historical"], rating: 4.0 },
  { title: "Henry VIII", author: "William Shakespeare", year: 1613, description: "A history play about the Tudor court.", genres: ["classic", "drama", "historical"], rating: 3.9 },
  { title: "King John", author: "William Shakespeare", year: 1596, description: "A history play about medieval politics.", genres: ["classic", "drama", "historical"], rating: 3.8 },
  { title: "Edward III", author: "William Shakespeare", year: 1596, description: "A history play about medieval warfare.", genres: ["classic", "drama", "historical"], rating: 3.7 },
  { title: "Sir Thomas More", author: "William Shakespeare", year: 1600, description: "A history play about martyrdom.", genres: ["classic", "drama", "historical"], rating: 3.6 },
  { title: "The Two Gentlemen of Verona", author: "William Shakespeare", year: 1594, description: "A comedy about friendship and love.", genres: ["classic", "drama", "comedy"], rating: 3.9 },
  { title: "The Comedy of Errors", author: "William Shakespeare", year: 1594, description: "A comedy about mistaken identity.", genres: ["classic", "drama", "comedy"], rating: 3.8 },
  { title: "Love's Labour's Lost", author: "William Shakespeare", year: 1595, description: "A comedy about courtship and learning.", genres: ["classic", "drama", "comedy"], rating: 3.9 },
  { title: "All's Well That Ends Well", author: "William Shakespeare", year: 1602, description: "A comedy about love and healing.", genres: ["classic", "drama", "comedy"], rating: 3.8 },
  { title: "Measure for Measure", author: "William Shakespeare", year: 1604, description: "A comedy about justice and mercy.", genres: ["classic", "drama", "comedy"], rating: 4.0 },
  { title: "Troilus and Cressida", author: "William Shakespeare", year: 1602, description: "A tragedy about love and war.", genres: ["classic", "drama", "tragedy"], rating: 3.9 },
  { title: "Titus Andronicus", author: "William Shakespeare", year: 1594, description: "A tragedy about revenge and violence.", genres: ["classic", "drama", "tragedy"], rating: 3.7 },
  { title: "The Rape of Lucrece", author: "William Shakespeare", year: 1594, description: "A narrative poem about virtue and violence.", genres: ["classic", "poetry", "narrative"], rating: 3.8 },
  { title: "Venus and Adonis", author: "William Shakespeare", year: 1593, description: "A narrative poem about love and death.", genres: ["classic", "poetry", "narrative"], rating: 3.9 },
  { title: "The Sonnets", author: "William Shakespeare", year: 1609, description: "A collection of 154 sonnets about love and time.", genres: ["classic", "poetry", "sonnets"], rating: 4.3 },
  { title: "A Lover's Complaint", author: "William Shakespeare", year: 1609, description: "A narrative poem about love and betrayal.", genres: ["classic", "poetry", "narrative"], rating: 3.7 },
  { title: "The Passionate Pilgrim", author: "William Shakespeare", year: 1599, description: "A collection of poems about love.", genres: ["classic", "poetry", "collection"], rating: 3.6 },
  { title: "The Phoenix and the Turtle", author: "William Shakespeare", year: 1601, description: "A poem about love and death.", genres: ["classic", "poetry", "allegory"], rating: 3.8 },
  
  // Holiday & Seasonal Books
  // Christmas Books
  { title: "A Christmas Carol", author: "Charles Dickens", year: 1843, description: "A classic Christmas story about Ebenezer Scrooge's redemption.", genres: ["classic", "christmas", "fiction"], rating: 4.5 },
  { title: "The Gift of the Magi", author: "O. Henry", year: 1905, description: "A short story about a couple's Christmas gifts.", genres: ["classic", "christmas", "short story"], rating: 4.3 },
  { title: "The Polar Express", author: "Chris Van Allsburg", year: 1985, description: "A magical train journey to the North Pole.", genres: ["children", "christmas", "fantasy"], rating: 4.4 },
  { title: "How the Grinch Stole Christmas!", author: "Dr. Seuss", year: 1957, description: "The Grinch learns the true meaning of Christmas.", genres: ["children", "christmas", "poetry"], rating: 4.6 },
  { title: "The Night Before Christmas", author: "Clement Clarke Moore", year: 1823, description: "A classic Christmas poem about Santa's visit.", genres: ["classic", "christmas", "poetry"], rating: 4.4 },
  { title: "The Nutcracker", author: "E.T.A. Hoffmann", year: 1816, description: "A magical Christmas story about a nutcracker that comes to life.", genres: ["classic", "christmas", "fantasy"], rating: 4.2 },
  { title: "The Little Match Girl", author: "Hans Christian Andersen", year: 1845, description: "A tragic Christmas story about a poor girl.", genres: ["classic", "christmas", "short story"], rating: 4.1 },
  { title: "The Snowman", author: "Raymond Briggs", year: 1978, description: "A wordless picture book about a snowman's magical night.", genres: ["children", "christmas", "fantasy"], rating: 4.3 },
  { title: "The Best Christmas Pageant Ever", author: "Barbara Robinson", year: 1972, description: "A humorous story about the worst kids in town putting on a Christmas pageant.", genres: ["children", "christmas", "comedy"], rating: 4.2 },
  { title: "The Christmas Box", author: "Richard Paul Evans", year: 1993, description: "A touching story about the true meaning of Christmas.", genres: ["contemporary", "christmas", "fiction"], rating: 4.0 },
  { title: "Skipping Christmas", author: "John Grisham", year: 2001, description: "A couple decides to skip Christmas and go on a cruise.", genres: ["contemporary", "christmas", "comedy"], rating: 3.9 },
  { title: "The Christmas Train", author: "David Baldacci", year: 2002, description: "A journalist's journey on a Christmas train.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  { title: "The Christmas Sweater", author: "Glenn Beck", year: 2008, description: "A story about forgiveness and the true meaning of Christmas.", genres: ["contemporary", "christmas", "fiction"], rating: 3.7 },
  { title: "The Christmas List", author: "Richard Paul Evans", year: 2009, description: "A man reads his own obituary and decides to change his life.", genres: ["contemporary", "christmas", "fiction"], rating: 3.9 },
  { title: "The Christmas Promise", author: "Richard Paul Evans", year: 2010, description: "A story about love, loss, and Christmas miracles.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  { title: "The Christmas Room", author: "Catherine Anderson", year: 2017, description: "A romance set during the Christmas season.", genres: ["contemporary", "christmas", "romance"], rating: 3.9 },
  { title: "The Christmas Wedding", author: "James Patterson", year: 2011, description: "A family gathers for a Christmas wedding.", genres: ["contemporary", "christmas", "romance"], rating: 3.7 },
  { title: "The Christmas Hope", author: "Donna VanLiere", year: 2005, description: "A story about hope and healing during Christmas.", genres: ["contemporary", "christmas", "fiction"], rating: 3.8 },
  { title: "The Christmas Shoes", author: "Donna VanLiere", year: 2001, description: "A touching story about a boy buying shoes for his dying mother.", genres: ["contemporary", "christmas", "fiction"], rating: 3.9 },
  { title: "The Christmas Blessing", author: "Donna VanLiere", year: 2003, description: "A story about love and second chances at Christmas.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  { title: "The Christmas Secret", author: "Donna VanLiere", year: 2004, description: "A story about finding love and faith during Christmas.", genres: ["contemporary", "christmas", "romance"], rating: 3.7 },
  { title: "The Christmas Journey", author: "Donna VanLiere", year: 2010, description: "A retelling of the Christmas story.", genres: ["contemporary", "christmas", "religious"], rating: 3.8 },
  { title: "The Christmas Note", author: "Donna VanLiere", year: 2011, description: "A story about family and forgiveness at Christmas.", genres: ["contemporary", "christmas", "fiction"], rating: 3.7 },
  { title: "The Christmas Light", author: "Donna VanLiere", year: 2013, description: "A story about hope and healing during the holidays.", genres: ["contemporary", "christmas", "fiction"], rating: 3.8 },
  { title: "The Christmas Town", author: "Donna VanLiere", year: 2016, description: "A story about finding home and family at Christmas.", genres: ["contemporary", "christmas", "romance"], rating: 3.7 },
  { title: "The Christmas Table", author: "Donna VanLiere", year: 2017, description: "A story about love and family traditions.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  { title: "The Christmas Prayer", author: "Donna VanLiere", year: 2018, description: "A story about faith and miracles at Christmas.", genres: ["contemporary", "christmas", "religious"], rating: 3.7 },
  { title: "The Christmas Wish", author: "Donna VanLiere", year: 2019, description: "A story about hope and dreams coming true.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  { title: "The Christmas Star", author: "Donna VanLiere", year: 2020, description: "A story about love and redemption during Christmas.", genres: ["contemporary", "christmas", "romance"], rating: 3.7 },
  { title: "The Christmas Bridge", author: "Donna VanLiere", year: 2021, description: "A story about connecting with others during the holidays.", genres: ["contemporary", "christmas", "fiction"], rating: 3.8 },
  { title: "The Christmas Window", author: "Donna VanLiere", year: 2022, description: "A story about seeing the world through new eyes.", genres: ["contemporary", "christmas", "romance"], rating: 3.7 },
  { title: "The Christmas Door", author: "Donna VanLiere", year: 2023, description: "A story about opening doors to new possibilities.", genres: ["contemporary", "christmas", "romance"], rating: 3.8 },
  
  // Halloween Books
  { title: "The Legend of Sleepy Hollow", author: "Washington Irving", year: 1820, description: "A classic Halloween story about the Headless Horseman.", genres: ["classic", "halloween", "horror"], rating: 4.3 },
  { title: "The Raven", author: "Edgar Allan Poe", year: 1845, description: "A haunting poem about loss and the supernatural.", genres: ["classic", "halloween", "poetry"], rating: 4.4 },
  { title: "The Tell-Tale Heart", author: "Edgar Allan Poe", year: 1843, description: "A psychological horror story about guilt and madness.", genres: ["classic", "halloween", "horror"], rating: 4.2 },
  { title: "The Fall of the House of Usher", author: "Edgar Allan Poe", year: 1839, description: "A gothic horror story about a decaying mansion.", genres: ["classic", "halloween", "horror"], rating: 4.1 },
  { title: "The Masque of the Red Death", author: "Edgar Allan Poe", year: 1842, description: "A story about a deadly plague and a masquerade ball.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The Pit and the Pendulum", author: "Edgar Allan Poe", year: 1842, description: "A story about torture and survival during the Spanish Inquisition.", genres: ["classic", "halloween", "horror"], rating: 4.1 },
  { title: "The Black Cat", author: "Edgar Allan Poe", year: 1843, description: "A story about guilt, alcoholism, and a mysterious cat.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The Cask of Amontillado", author: "Edgar Allan Poe", year: 1846, description: "A story about revenge and murder during carnival.", genres: ["classic", "halloween", "horror"], rating: 4.2 },
  { title: "The Murders in the Rue Morgue", author: "Edgar Allan Poe", year: 1841, description: "The first modern detective story.", genres: ["classic", "halloween", "mystery"], rating: 4.1 },
  { title: "The Purloined Letter", author: "Edgar Allan Poe", year: 1844, description: "A detective story about a stolen letter.", genres: ["classic", "halloween", "mystery"], rating: 4.0 },
  { title: "The Mystery of Marie Rogêt", author: "Edgar Allan Poe", year: 1842, description: "A detective story based on a real murder case.", genres: ["classic", "halloween", "mystery"], rating: 3.9 },
  { title: "The Gold-Bug", author: "Edgar Allan Poe", year: 1843, description: "A story about treasure hunting and cryptography.", genres: ["classic", "halloween", "mystery"], rating: 4.0 },
  { title: "The Premature Burial", author: "Edgar Allan Poe", year: 1844, description: "A story about the fear of being buried alive.", genres: ["classic", "halloween", "horror"], rating: 3.9 },
  { title: "The Facts in the Case of M. Valdemar", author: "Edgar Allan Poe", year: 1845, description: "A story about mesmerism and death.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The Oval Portrait", author: "Edgar Allan Poe", year: 1842, description: "A story about art and obsession.", genres: ["classic", "halloween", "horror"], rating: 3.8 },
  { title: "The Assignation", author: "Edgar Allan Poe", year: 1834, description: "A story about love and suicide.", genres: ["classic", "halloween", "romance"], rating: 3.7 },
  { title: "Berenice", author: "Edgar Allan Poe", year: 1835, description: "A story about obsession and madness.", genres: ["classic", "halloween", "horror"], rating: 3.8 },
  { title: "Morella", author: "Edgar Allan Poe", year: 1835, description: "A story about reincarnation and death.", genres: ["classic", "halloween", "horror"], rating: 3.7 },
  { title: "Ligeia", author: "Edgar Allan Poe", year: 1838, description: "A story about love, death, and the supernatural.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The Haunted Palace", author: "Edgar Allan Poe", year: 1839, description: "A poem about a haunted castle.", genres: ["classic", "halloween", "poetry"], rating: 3.9 },
  { title: "The Conqueror Worm", author: "Edgar Allan Poe", year: 1843, description: "A poem about death and the theater of life.", genres: ["classic", "halloween", "poetry"], rating: 4.0 },
  { title: "Ulalume", author: "Edgar Allan Poe", year: 1847, description: "A poem about love and death.", genres: ["classic", "halloween", "poetry"], rating: 3.8 },
  { title: "Annabel Lee", author: "Edgar Allan Poe", year: 1849, description: "A poem about lost love and death.", genres: ["classic", "halloween", "poetry"], rating: 4.1 },
  { title: "The Bells", author: "Edgar Allan Poe", year: 1849, description: "A poem about different types of bells and their meanings.", genres: ["classic", "halloween", "poetry"], rating: 4.0 },
  { title: "Eldorado", author: "Edgar Allan Poe", year: 1849, description: "A poem about the search for the mythical city of gold.", genres: ["classic", "halloween", "poetry"], rating: 3.9 },
  { title: "A Dream Within a Dream", author: "Edgar Allan Poe", year: 1849, description: "A poem about reality and illusion.", genres: ["classic", "halloween", "poetry"], rating: 4.0 },
  { title: "The City in the Sea", author: "Edgar Allan Poe", year: 1845, description: "A poem about a sunken city.", genres: ["classic", "halloween", "poetry"], rating: 3.8 },
  { title: "The Sleeper", author: "Edgar Allan Poe", year: 1831, description: "A poem about death and sleep.", genres: ["classic", "halloween", "poetry"], rating: 3.9 },
  { title: "The Valley of Unrest", author: "Edgar Allan Poe", year: 1831, description: "A poem about a haunted valley.", genres: ["classic", "halloween", "poetry"], rating: 3.7 },
  { title: "The Lake", author: "Edgar Allan Poe", year: 1827, description: "A poem about a beautiful lake.", genres: ["classic", "halloween", "poetry"], rating: 3.8 },
  { title: "To Helen", author: "Edgar Allan Poe", year: 1831, description: "A poem about beauty and inspiration.", genres: ["classic", "halloween", "poetry"], rating: 3.9 },
  { title: "Israfel", author: "Edgar Allan Poe", year: 1831, description: "A poem about an angelic musician.", genres: ["classic", "halloween", "poetry"], rating: 3.8 },
  { title: "The Coliseum", author: "Edgar Allan Poe", year: 1833, description: "A poem about the ruins of the Roman Colosseum.", genres: ["classic", "halloween", "poetry"], rating: 3.7 },
  { title: "The Haunted Mind", author: "Nathaniel Hawthorne", year: 1835, description: "A story about dreams and the supernatural.", genres: ["classic", "halloween", "horror"], rating: 3.8 },
  { title: "Young Goodman Brown", author: "Nathaniel Hawthorne", year: 1835, description: "A story about temptation and the devil.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The Minister's Black Veil", author: "Nathaniel Hawthorne", year: 1836, description: "A story about sin and secrecy.", genres: ["classic", "halloween", "horror"], rating: 3.9 },
  { title: "The Birthmark", author: "Nathaniel Hawthorne", year: 1843, description: "A story about perfection and obsession.", genres: ["classic", "halloween", "horror"], rating: 4.1 },
  { title: "Rappaccini's Daughter", author: "Nathaniel Hawthorne", year: 1844, description: "A story about a poisonous garden and love.", genres: ["classic", "halloween", "horror"], rating: 4.0 },
  { title: "The House of the Seven Gables", author: "Nathaniel Hawthorne", year: 1851, description: "A gothic novel about a cursed family.", genres: ["classic", "halloween", "horror"], rating: 4.2 },
  { title: "The Scarlet Letter", author: "Nathaniel Hawthorne", year: 1850, description: "A novel about sin, guilt, and redemption.", genres: ["classic", "halloween", "historical fiction"], rating: 4.3 },
  { title: "The Marble Faun", author: "Nathaniel Hawthorne", year: 1860, description: "A novel about art, love, and sin in Italy.", genres: ["classic", "halloween", "romance"], rating: 3.9 },
  { title: "The Blithedale Romance", author: "Nathaniel Hawthorne", year: 1852, description: "A novel about a utopian community.", genres: ["classic", "halloween", "romance"], rating: 3.8 },
  { title: "Fanshawe", author: "Nathaniel Hawthorne", year: 1828, description: "Hawthorne's first novel about college life.", genres: ["classic", "halloween", "romance"], rating: 3.7 },
  { title: "The Dolliver Romance", author: "Nathaniel Hawthorne", year: 1864, description: "An unfinished novel about immortality.", genres: ["classic", "halloween", "fantasy"], rating: 3.6 },
  { title: "Septimius Felton", author: "Nathaniel Hawthorne", year: 1872, description: "An unfinished novel about eternal life.", genres: ["classic", "halloween", "fantasy"], rating: 3.7 },
  { title: "The Ancestral Footstep", author: "Nathaniel Hawthorne", year: 1883, description: "An unfinished novel about family history.", genres: ["classic", "halloween", "mystery"], rating: 3.6 },
  { title: "The Ghost of the Count's Daughter", author: "Nathaniel Hawthorne", year: 1838, description: "A story about a ghost and revenge.", genres: ["classic", "halloween", "horror"], rating: 3.8 },
  { title: "The Hollow of the Three Hills", author: "Nathaniel Hawthorne", year: 1830, description: "A story about witchcraft and prophecy.", genres: ["classic", "halloween", "horror"], rating: 3.7 },
  { title: "The Wives of the Dead", author: "Nathaniel Hawthorne", year: 1832, description: "A story about two widows and their husbands.", genres: ["classic", "halloween", "romance"], rating: 3.8 },
  { title: "The White Old Maid", author: "Nathaniel Hawthorne", year: 1835, description: "A story about a mysterious woman in white.", genres: ["classic", "halloween", "mystery"], rating: 3.7 },
  { title: "The Ambitious Guest", author: "Nathaniel Hawthorne", year: 1835, description: "A story about ambition and fate.", genres: ["classic", "halloween", "tragedy"], rating: 3.8 },
  { title: "The Wedding Knell", author: "Nathaniel Hawthorne", year: 1836, description: "A story about a wedding and death.", genres: ["classic", "halloween", "tragedy"], rating: 3.7 },
  { title: "The Maypole of Merry Mount", author: "Nathaniel Hawthorne", year: 1836, description: "A story about Puritanism and celebration.", genres: ["classic", "halloween", "historical fiction"], rating: 3.8 },
  { title: "The Gentle Boy", author: "Nathaniel Hawthorne", year: 1832, description: "A story about religious persecution.", genres: ["classic", "halloween", "historical fiction"], rating: 3.7 },
  { title: "The Gray Champion", author: "Nathaniel Hawthorne", year: 1835, description: "A story about a mysterious protector.", genres: ["classic", "halloween", "historical fiction"], rating: 3.8 },
  { title: "Endicott and the Red Cross", author: "Nathaniel Hawthorne", year: 1838, description: "A story about religious freedom.", genres: ["classic", "halloween", "historical fiction"], rating: 3.7 },
  { title: "The Shaker Bridal", author: "Nathaniel Hawthorne", year: 1838, description: "A story about Shaker life and love.", genres: ["classic", "halloween", "historical fiction"], rating: 3.6 },
  { title: "The Lily's Quest", author: "Nathaniel Hawthorne", year: 1839, description: "A story about love and death.", genres: ["classic", "halloween", "romance"], rating: 3.7 },
  { title: "The Threefold Destiny", author: "Nathaniel Hawthorne", year: 1838, description: "A story about fate and destiny.", genres: ["classic", "halloween", "fantasy"], rating: 3.8 },
  { title: "The Village Uncle", author: "Nathaniel Hawthorne", year: 1835, description: "A story about village life and tradition.", genres: ["classic", "halloween", "historical fiction"], rating: 3.7 },
  { title: "The Old Apple Dealer", author: "Nathaniel Hawthorne", year: 1837, description: "A story about an old man and his apples.", genres: ["classic", "halloween", "historical fiction"], rating: 3.6 },
  { title: "The Sister Years", author: "Nathaniel Hawthorne", year: 1839, description: "A story about the old and new year.", genres: ["classic", "halloween", "allegory"], rating: 3.7 },
  { title: "Snowflakes", author: "Nathaniel Hawthorne", year: 1838, description: "A story about winter and imagination.", genres: ["classic", "halloween", "fantasy"], rating: 3.6 },
  { title: "The Christmas Banquet", author: "Nathaniel Hawthorne", year: 1844, description: "A story about a Christmas dinner for the miserable.", genres: ["classic", "christmas", "allegory"], rating: 3.8 },
  { title: "The New Adam and Eve", author: "Nathaniel Hawthorne", year: 1843, description: "A story about Adam and Eve exploring modern Boston.", genres: ["classic", "halloween", "fantasy"], rating: 3.7 },
  { title: "The Hall of Fantasy", author: "Nathaniel Hawthorne", year: 1843, description: "A story about a hall where dreams come true.", genres: ["classic", "halloween", "fantasy"], rating: 3.8 },
  { title: "The Procession of Life", author: "Nathaniel Hawthorne", year: 1843, description: "A story about the different stages of life.", genres: ["classic", "halloween", "allegory"], rating: 3.7 },
  { title: "The Celestial Railroad", author: "Nathaniel Hawthorne", year: 1843, description: "A story about a modern version of Pilgrim's Progress.", genres: ["classic", "halloween", "allegory"], rating: 3.8 },
  { title: "The Intelligence Office", author: "Nathaniel Hawthorne", year: 1844, description: "A story about an office that grants wishes.", genres: ["classic", "halloween", "fantasy"], rating: 3.7 },
  { title: "The Artist of the Beautiful", author: "Nathaniel Hawthorne", year: 1844, description: "A story about an artist and his mechanical butterfly.", genres: ["classic", "halloween", "fantasy"], rating: 4.0 },
  { title: "A Select Party", author: "Nathaniel Hawthorne", year: 1844, description: "A story about a party for imaginary people.", genres: ["classic", "halloween", "fantasy"], rating: 3.8 },
  { title: "A Book of Autographs", author: "Nathaniel Hawthorne", year: 1844, description: "A story about a book of famous signatures.", genres: ["classic", "halloween", "mystery"], rating: 3.7 },
  { title: "The Old Manse", author: "Nathaniel Hawthorne", year: 1846, description: "A story about Hawthorne's home in Concord.", genres: ["classic", "halloween", "memoir"], rating: 3.8 },
  
  // Women-Focused & Female-Authored Books
  // Contemporary Women's Fiction
  { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", year: 2017, description: "A novel about an aging Hollywood starlet revealing her secrets.", genres: ["contemporary", "romance", "historical fiction"], rating: 4.3 },
  { title: "Daisy Jones & The Six", author: "Taylor Jenkins Reid", year: 2019, description: "A fictional oral history of a 1970s rock band.", genres: ["contemporary", "historical fiction", "music"], rating: 4.2 },
  { title: "Malibu Rising", author: "Taylor Jenkins Reid", year: 2021, description: "A novel about four famous siblings throwing an epic party.", genres: ["contemporary", "family", "drama"], rating: 4.1 },
  { title: "Carrie Soto Is Back", author: "Taylor Jenkins Reid", year: 2022, description: "A retired tennis champion makes a comeback.", genres: ["contemporary", "sports", "drama"], rating: 4.0 },
  { title: "The Midnight Library", author: "Matt Haig", year: 2020, description: "A library between life and death where each book represents a different life.", genres: ["contemporary", "fantasy", "philosophy"], rating: 4.1 },
  { title: "The Invisible Life of Addie LaRue", author: "V.E. Schwab", year: 2020, description: "A woman makes a Faustian bargain to live forever but is cursed to be forgotten.", genres: ["fantasy", "romance", "historical fiction"], rating: 4.2 },
  { title: "The House in the Cerulean Sea", author: "TJ Klune", year: 2020, description: "A magical island orphanage and the caseworker who discovers its secrets.", genres: ["fantasy", "romance", "lgbtq"], rating: 4.3 },
  { title: "Under the Whispering Door", author: "TJ Klune", year: 2021, description: "A queer love story about a man who dies and finds himself at a tea shop.", genres: ["fantasy", "romance", "lgbtq"], rating: 4.1 },
  { title: "The Paper Palace", author: "Miranda Cowley Heller", year: 2021, description: "A woman's life-changing decision over 24 hours.", genres: ["contemporary", "romance", "family"], rating: 4.0 },
  { title: "Lessons in Chemistry", author: "Bonnie Garmus", year: 2022, description: "A female scientist becomes a cooking show host in the 1960s.", genres: ["contemporary", "historical fiction", "feminism"], rating: 4.1 },
  { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", year: 2022, description: "A novel about friendship and video games.", genres: ["contemporary", "friendship", "technology"], rating: 4.2 },
  { title: "Remarkably Bright Creatures", author: "Shelby Van Pelt", year: 2022, description: "A widow forms an unlikely friendship with a giant Pacific octopus.", genres: ["contemporary", "friendship", "mystery"], rating: 4.0 },
  { title: "The Maid", author: "Nita Prose", year: 2022, description: "A hotel maid discovers a dead body and becomes a suspect.", genres: ["mystery", "contemporary", "neurodiversity"], rating: 4.1 },
  { title: "The Dictionary of Lost Words", author: "Pip Williams", year: 2020, description: "A novel about the creation of the Oxford English Dictionary from a woman's perspective.", genres: ["historical fiction", "feminism", "language"], rating: 4.2 },
  { title: "The Four Winds", author: "Kristin Hannah", year: 2021, description: "A woman's struggle during the Great Depression.", genres: ["historical fiction", "family", "drama"], rating: 4.1 },
  { title: "The Great Alone", author: "Kristin Hannah", year: 2018, description: "A family moves to Alaska to start over.", genres: ["contemporary", "family", "adventure"], rating: 4.2 },
  { title: "The Nightingale", author: "Kristin Hannah", year: 2015, description: "Two sisters in Nazi-occupied France.", genres: ["historical fiction", "war", "family"], rating: 4.2 },
  { title: "Firefly Lane", author: "Kristin Hannah", year: 2008, description: "A friendship spanning three decades.", genres: ["contemporary", "friendship", "family"], rating: 4.0 },
  { title: "Fly Away", author: "Kristin Hannah", year: 2013, description: "The sequel to Firefly Lane about healing and forgiveness.", genres: ["contemporary", "family", "healing"], rating: 3.9 },
  { title: "The Vanishing Half", author: "Brit Bennett", year: 2020, description: "Twin sisters choose different racial identities.", genres: ["contemporary", "family", "race"], rating: 4.2 },
  { title: "The Mothers", author: "Brit Bennett", year: 2016, description: "A novel about community, love, and the choices that define us.", genres: ["contemporary", "family", "community"], rating: 4.0 },
  { title: "Such a Fun Age", author: "Kiley Reid", year: 2019, description: "A novel about race and privilege.", genres: ["contemporary", "race", "class"], rating: 4.1 },
  { title: "Come and Get It", author: "Kiley Reid", year: 2024, description: "A novel about money, power, and desire.", genres: ["contemporary", "satire", "class"], rating: 4.0 },
  { title: "Normal People", author: "Sally Rooney", year: 2018, description: "A novel about the relationship between two teenagers.", genres: ["contemporary", "romance", "coming-of-age"], rating: 4.0 },
  { title: "Conversations with Friends", author: "Sally Rooney", year: 2017, description: "A novel about friendship and love.", genres: ["contemporary", "friendship", "romance"], rating: 3.9 },
  { title: "Beautiful World, Where Are You", author: "Sally Rooney", year: 2021, description: "A novel about love and friendship in the modern world.", genres: ["contemporary", "romance", "friendship"], rating: 3.8 },
  { title: "Klara and the Sun", author: "Kazuo Ishiguro", year: 2021, description: "A novel about an artificial friend.", genres: ["contemporary", "sci-fi", "philosophy"], rating: 4.0 },
  { title: "The Remains of the Day", author: "Kazuo Ishiguro", year: 1989, description: "A butler reflects on his life and service.", genres: ["historical fiction", "romance", "class"], rating: 4.3 },
  { title: "Never Let Me Go", author: "Kazuo Ishiguro", year: 2005, description: "A novel about love and loss in a dystopian world.", genres: ["sci-fi", "romance", "dystopian"], rating: 4.2 },
  { title: "The Buried Giant", author: "Kazuo Ishiguro", year: 2015, description: "A novel about memory and love in post-Arthurian Britain.", genres: ["fantasy", "romance", "historical fiction"], rating: 3.9 },
  { title: "When We Were Orphans", author: "Kazuo Ishiguro", year: 2000, description: "A detective searches for his missing parents in Shanghai.", genres: ["mystery", "historical fiction", "family"], rating: 3.8 },
  { title: "The Unconsoled", author: "Kazuo Ishiguro", year: 1995, description: "A pianist arrives in a European city for a concert.", genres: ["contemporary", "surreal", "music"], rating: 3.7 },
  { title: "A Pale View of Hills", author: "Kazuo Ishiguro", year: 1982, description: "A Japanese woman living in England reflects on her past.", genres: ["contemporary", "family", "memory"], rating: 3.9 },
  { title: "An Artist of the Floating World", author: "Kazuo Ishiguro", year: 1986, description: "A Japanese artist reflects on his life after WWII.", genres: ["historical fiction", "art", "memory"], rating: 4.0 },
  { title: "The Personal Librarian", author: "Marie Benedict", year: 2021, description: "The remarkable story of Belle da Costa Greene.", genres: ["historical fiction", "biography", "race"], rating: 4.1 },
  { title: "The Other Einstein", author: "Marie Benedict", year: 2016, description: "A novel about Albert Einstein's first wife.", genres: ["historical fiction", "biography", "science"], rating: 3.9 },
  { title: "Carnegie's Maid", author: "Marie Benedict", year: 2018, description: "A novel about a maid who becomes Andrew Carnegie's confidante.", genres: ["historical fiction", "romance", "class"], rating: 3.8 },
  { title: "Lady Clementine", author: "Marie Benedict", year: 2020, description: "A novel about Winston Churchill's wife.", genres: ["historical fiction", "biography", "politics"], rating: 3.9 },
  { title: "The Mystery of Mrs. Christie", author: "Marie Benedict", year: 2020, description: "A novel about Agatha Christie's mysterious disappearance.", genres: ["historical fiction", "mystery", "biography"], rating: 3.8 },
  { title: "Her Hidden Genius", author: "Marie Benedict", year: 2022, description: "A novel about Rosalind Franklin and the discovery of DNA.", genres: ["historical fiction", "biography", "science"], rating: 4.0 },
  { title: "The Mitford Affair", author: "Marie Benedict", year: 2023, description: "A novel about the Mitford sisters during WWII.", genres: ["historical fiction", "family", "war"], rating: 3.9 },
  { title: "The Book Thief", author: "Markus Zusak", year: 2005, description: "A novel set in Nazi Germany narrated by Death.", genres: ["historical fiction", "young adult", "war"], rating: 4.4 },
  { title: "I Am the Messenger", author: "Markus Zusak", year: 2002, description: "A novel about a taxi driver who receives mysterious messages.", genres: ["contemporary", "mystery", "coming-of-age"], rating: 4.1 },
  { title: "Bridge of Clay", author: "Markus Zusak", year: 2018, description: "A novel about five brothers and their family's story.", genres: ["contemporary", "family", "coming-of-age"], rating: 3.9 },
  { title: "The Messenger", author: "Markus Zusak", year: 2002, description: "A novel about a young man who receives mysterious playing cards.", genres: ["contemporary", "mystery", "coming-of-age"], rating: 4.0 },
  { title: "Fighting Ruben Wolfe", author: "Markus Zusak", year: 2000, description: "A novel about two brothers who become boxers.", genres: ["contemporary", "sports", "family"], rating: 3.8 },
  { title: "Getting the Girl", author: "Markus Zusak", year: 2001, description: "A novel about love and family.", genres: ["contemporary", "romance", "family"], rating: 3.7 },
  { title: "The Underdog", author: "Markus Zusak", year: 1999, description: "A novel about a young boy's journey.", genres: ["contemporary", "coming-of-age", "family"], rating: 3.6 },
  { title: "Educated", author: "Tara Westover", year: 2018, description: "A memoir about growing up in a survivalist family.", genres: ["memoir", "biography", "family"], rating: 4.5 },
  { title: "Becoming", author: "Michelle Obama", year: 2018, description: "The memoir of the former First Lady.", genres: ["memoir", "biography", "politics"], rating: 4.4 },
  { title: "The Light We Carry", author: "Michelle Obama", year: 2022, description: "Michelle Obama's guide to overcoming uncertain times.", genres: ["memoir", "self-help", "inspiration"], rating: 4.2 },
  { title: "Untamed", author: "Glennon Doyle", year: 2020, description: "A memoir about finding your voice and living authentically.", genres: ["memoir", "self-help", "feminism"], rating: 4.1 },
  { title: "Love Warrior", author: "Glennon Doyle", year: 2016, description: "A memoir about marriage, addiction, and healing.", genres: ["memoir", "family", "healing"], rating: 4.0 },
  { title: "Carry On, Warrior", author: "Glennon Doyle", year: 2013, description: "A memoir about faith, family, and finding your way.", genres: ["memoir", "faith", "family"], rating: 3.9 },
  { title: "The Glass Castle", author: "Jeannette Walls", year: 2005, description: "A memoir about growing up with unconventional parents.", genres: ["memoir", "family", "coming-of-age"], rating: 4.3 },
  { title: "Half Broke Horses", author: "Jeannette Walls", year: 2009, description: "A novel based on the life of the author's grandmother.", genres: ["historical fiction", "family", "western"], rating: 4.1 },
  { title: "The Silver Star", author: "Jeannette Walls", year: 2013, description: "A novel about two sisters who go to live with their uncle.", genres: ["contemporary", "family", "coming-of-age"], rating: 3.9 },
  { title: "Hang the Moon", author: "Jeannette Walls", year: 2023, description: "A novel about a young woman in Prohibition-era Virginia.", genres: ["historical fiction", "family", "adventure"], rating: 4.0 },
  { title: "Wild", author: "Cheryl Strayed", year: 2012, description: "A memoir about hiking the Pacific Crest Trail.", genres: ["memoir", "adventure", "healing"], rating: 4.2 },
  { title: "Tiny Beautiful Things", author: "Cheryl Strayed", year: 2012, description: "Advice on love and life from Dear Sugar.", genres: ["memoir", "self-help", "advice"], rating: 4.3 },
  { title: "Brave Enough", author: "Cheryl Strayed", year: 2015, description: "A collection of quotes and wisdom.", genres: ["self-help", "inspiration", "quotes"], rating: 4.0 },
  { title: "The Best of Me", author: "Cheryl Strayed", year: 2020, description: "Selected essays from the author's career.", genres: ["memoir", "essays", "personal"], rating: 4.1 },
  { title: "The Year of Magical Thinking", author: "Joan Didion", year: 2005, description: "A memoir about grief and loss.", genres: ["memoir", "grief", "family"], rating: 4.4 },
  { title: "Blue Nights", author: "Joan Didion", year: 2011, description: "A memoir about aging and the death of her daughter.", genres: ["memoir", "grief", "aging"], rating: 4.2 },
  { title: "Slouching Towards Bethlehem", author: "Joan Didion", year: 1968, description: "A collection of essays about 1960s America.", genres: ["essays", "journalism", "culture"], rating: 4.3 },
  { title: "The White Album", author: "Joan Didion", year: 1979, description: "Essays about the 1960s and 1970s.", genres: ["essays", "journalism", "culture"], rating: 4.2 },
  { title: "Play It As It Lays", author: "Joan Didion", year: 1970, description: "A novel about a woman's breakdown in Hollywood.", genres: ["contemporary", "drama", "hollywood"], rating: 4.1 },
  { title: "A Book of Common Prayer", author: "Joan Didion", year: 1977, description: "A novel about an American woman in Central America.", genres: ["contemporary", "drama", "politics"], rating: 4.0 },
  { title: "Democracy", author: "Joan Didion", year: 1984, description: "A novel about politics and power in America.", genres: ["contemporary", "drama", "politics"], rating: 3.9 },
  { title: "The Last Thing He Wanted", author: "Joan Didion", year: 1996, description: "A novel about a journalist caught in political intrigue.", genres: ["contemporary", "thriller", "politics"], rating: 3.8 },
  { title: "Where I Was From", author: "Joan Didion", year: 2003, description: "A memoir about California and family history.", genres: ["memoir", "family", "california"], rating: 4.0 },
  { title: "Political Fictions", author: "Joan Didion", year: 2001, description: "Essays about American politics.", genres: ["essays", "politics", "journalism"], rating: 4.1 },
  { title: "Fixed Ideas", author: "Joan Didion", year: 2003, description: "Essays about America after 9/11.", genres: ["essays", "politics", "journalism"], rating: 4.0 },
  { title: "South and West", author: "Joan Didion", year: 2017, description: "Notes from a road trip through the American South.", genres: ["memoir", "travel", "journalism"], rating: 3.9 },
  { title: "Let Me Tell You What I Mean", author: "Joan Didion", year: 2021, description: "A collection of previously uncollected essays.", genres: ["essays", "journalism", "personal"], rating: 4.0 },
  { title: "The Woman in Me", author: "Britney Spears", year: 2023, description: "The memoir of pop star Britney Spears.", genres: ["memoir", "biography", "music"], rating: 4.1 },
  { title: "Spare", author: "Prince Harry", year: 2023, description: "The memoir of Prince Harry.", genres: ["memoir", "biography", "royalty"], rating: 4.0 },
  { title: "Finding Me", author: "Viola Davis", year: 2022, description: "The memoir of actress Viola Davis.", genres: ["memoir", "biography", "acting"], rating: 4.3 },
  { title: "Just as I Am", author: "Cicely Tyson", year: 2021, description: "The memoir of actress Cicely Tyson.", genres: ["memoir", "biography", "acting"], rating: 4.2 },
  { title: "The Beauty in Breaking", author: "Michele Harper", year: 2020, description: "A memoir by an emergency room physician.", genres: ["memoir", "medicine", "healing"], rating: 4.1 },
  { title: "Know My Name", author: "Chanel Miller", year: 2019, description: "A memoir about sexual assault and healing.", genres: ["memoir", "feminism", "healing"], rating: 4.4 },
  { title: "In the Dream House", author: "Carmen Maria Machado", year: 2019, description: "A memoir about domestic abuse in a same-sex relationship.", genres: ["memoir", "lgbtq", "healing"], rating: 4.3 },
  { title: "Her Body and Other Parties", author: "Carmen Maria Machado", year: 2017, description: "A collection of short stories blending horror and feminism.", genres: ["short stories", "horror", "feminism"], rating: 4.2 },
  { title: "The Lowland", author: "Jhumpa Lahiri", year: 2013, description: "A novel about two brothers in India and America.", genres: ["contemporary", "family", "immigration"], rating: 4.1 },
  { title: "Unaccustomed Earth", author: "Jhumpa Lahiri", year: 2008, description: "A collection of short stories about Bengali-Americans.", genres: ["short stories", "immigration", "family"], rating: 4.2 },
  { title: "The Namesake", author: "Jhumpa Lahiri", year: 2003, description: "A novel about an Indian-American family.", genres: ["contemporary", "family", "immigration"], rating: 4.3 },
  { title: "Whereabouts", author: "Jhumpa Lahiri", year: 2021, description: "A novel about a woman's solitary life in an Italian city.", genres: ["contemporary", "solitude", "reflection"], rating: 4.0 },
  { title: "Roman Stories", author: "Jhumpa Lahiri", year: 2023, description: "A collection of short stories set in Rome.", genres: ["short stories", "italy", "immigration"], rating: 4.1 },
  { title: "The House of the Spirits", author: "Isabel Allende", year: 1982, description: "A magical realist novel about a Chilean family.", genres: ["magical realism", "family", "chile"], rating: 4.4 },
  { title: "Eva Luna", author: "Isabel Allende", year: 1987, description: "A novel about a storyteller in Latin America.", genres: ["magical realism", "storytelling", "latin america"], rating: 4.2 },
  { title: "Daughter of Fortune", author: "Isabel Allende", year: 1999, description: "A novel about a Chilean woman during the California Gold Rush.", genres: ["historical fiction", "adventure", "chile"], rating: 4.1 },
  { title: "Portrait in Sepia", author: "Isabel Allende", year: 2000, description: "A novel about a woman's search for her identity.", genres: ["historical fiction", "family", "chile"], rating: 4.0 },
  { title: "Zorro", author: "Isabel Allende", year: 2005, description: "A novel about the legendary masked hero.", genres: ["historical fiction", "adventure", "california"], rating: 3.9 },
  { title: "Inés of My Soul", author: "Isabel Allende", year: 2006, description: "A novel about the Spanish conquest of Chile.", genres: ["historical fiction", "adventure", "chile"], rating: 4.0 },
  { title: "Island Beneath the Sea", author: "Isabel Allende", year: 2009, description: "A novel about slavery and revolution in Haiti.", genres: ["historical fiction", "slavery", "haiti"], rating: 4.1 },
  { title: "Maya's Notebook", author: "Isabel Allende", year: 2011, description: "A novel about a troubled teenager finding refuge in Chile.", genres: ["contemporary", "coming-of-age", "chile"], rating: 3.9 },
  { title: "Ripper", author: "Isabel Allende", year: 2014, description: "A mystery novel about a teenage detective.", genres: ["mystery", "young adult", "chile"], rating: 3.8 },
  { title: "The Japanese Lover", author: "Isabel Allende", year: 2015, description: "A novel about love and family across generations.", genres: ["contemporary", "romance", "family"], rating: 4.0 },
  { title: "In the Midst of Winter", author: "Isabel Allende", year: 2017, description: "A novel about three people brought together by a car accident.", genres: ["contemporary", "romance", "family"], rating: 3.9 },
  { title: "A Long Petal of the Sea", author: "Isabel Allende", year: 2019, description: "A novel about Spanish refugees in Chile.", genres: ["historical fiction", "immigration", "chile"], rating: 4.1 },
  { title: "Violeta", author: "Isabel Allende", year: 2022, description: "A novel about a woman's life spanning a century of change.", genres: ["historical fiction", "family", "chile"], rating: 4.0 },
  { title: "The Wind Knows My Name", author: "Isabel Allende", year: 2023, description: "A novel about immigration and family across time.", genres: ["contemporary", "immigration", "family"], rating: 4.1 },
  { title: "The Handmaid's Tale", author: "Margaret Atwood", year: 1985, description: "A dystopian novel about a woman's struggle in a totalitarian society.", genres: ["dystopian", "feminism", "sci-fi"], rating: 4.4 },
  { title: "The Testaments", author: "Margaret Atwood", year: 2019, description: "The sequel to The Handmaid's Tale.", genres: ["dystopian", "feminism", "sci-fi"], rating: 4.2 },
  { title: "Alias Grace", author: "Margaret Atwood", year: 1996, description: "A novel about a 19th-century murderess.", genres: ["historical fiction", "mystery", "feminism"], rating: 4.1 },
  { title: "The Blind Assassin", author: "Margaret Atwood", year: 2000, description: "A novel about two sisters and a mysterious death.", genres: ["contemporary", "mystery", "family"], rating: 4.3 },
  { title: "Oryx and Crake", author: "Margaret Atwood", year: 2003, description: "A dystopian novel about genetic engineering.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.2 },
  { title: "The Year of the Flood", author: "Margaret Atwood", year: 2009, description: "A dystopian novel about environmental collapse.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.1 },
  { title: "MaddAddam", author: "Margaret Atwood", year: 2013, description: "The final book in the MaddAddam trilogy.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.0 },
  { title: "The Robber Bride", author: "Margaret Atwood", year: 1993, description: "A novel about three women and their nemesis.", genres: ["contemporary", "friendship", "feminism"], rating: 4.1 },
  { title: "Cat's Eye", author: "Margaret Atwood", year: 1988, description: "A novel about an artist reflecting on her childhood.", genres: ["contemporary", "coming-of-age", "art"], rating: 4.2 },
  { title: "The Edible Woman", author: "Margaret Atwood", year: 1969, description: "A novel about a woman's rebellion against societal expectations.", genres: ["contemporary", "feminism", "satire"], rating: 4.0 },
  { title: "Surfacing", author: "Margaret Atwood", year: 1972, description: "A novel about a woman's journey into the wilderness.", genres: ["contemporary", "feminism", "nature"], rating: 3.9 },
  { title: "Lady Oracle", author: "Margaret Atwood", year: 1976, description: "A novel about a writer who fakes her own death.", genres: ["contemporary", "feminism", "satire"], rating: 3.8 },
  { title: "Life Before Man", author: "Margaret Atwood", year: 1979, description: "A novel about relationships and infidelity.", genres: ["contemporary", "romance", "family"], rating: 3.9 },
  { title: "Bodily Harm", author: "Margaret Atwood", year: 1981, description: "A novel about a journalist in the Caribbean.", genres: ["contemporary", "politics", "feminism"], rating: 3.8 },
  { title: "The Penelopiad", author: "Margaret Atwood", year: 2005, description: "A retelling of The Odyssey from Penelope's perspective.", genres: ["mythology", "feminism", "retelling"], rating: 4.1 },
  { title: "The Heart Goes Last", author: "Margaret Atwood", year: 2015, description: "A dystopian novel about a couple in a social experiment.", genres: ["dystopian", "sci-fi", "romance"], rating: 3.9 },
  { title: "Hag-Seed", author: "Margaret Atwood", year: 2016, description: "A retelling of The Tempest.", genres: ["retelling", "shakespeare", "contemporary"], rating: 4.0 },
  { title: "The Stone Mattress", author: "Margaret Atwood", year: 2014, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.1 },
  { title: "Dancing Girls", author: "Margaret Atwood", year: 1977, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 3.9 },
  { title: "Bluebeard's Egg", author: "Margaret Atwood", year: 1983, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.0 },
  { title: "Wilderness Tips", author: "Margaret Atwood", year: 1991, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.1 },
  { title: "Good Bones and Simple Murders", author: "Margaret Atwood", year: 1992, description: "A collection of short stories and essays.", genres: ["short stories", "essays", "feminism"], rating: 4.0 },
  { title: "The Tent", author: "Margaret Atwood", year: 2006, description: "A collection of short stories and essays.", genres: ["short stories", "essays", "feminism"], rating: 3.9 },
  { title: "Moral Disorder", author: "Margaret Atwood", year: 2006, description: "A collection of linked short stories.", genres: ["short stories", "contemporary", "family"], rating: 4.0 },
  { title: "Old Babes in the Wood", author: "Margaret Atwood", year: 2023, description: "A collection of short stories about aging and relationships.", genres: ["short stories", "aging", "relationships"], rating: 4.1 },
  { title: "The Color Purple", author: "Alice Walker", year: 1982, description: "A novel about African American women in the early 1900s.", genres: ["historical fiction", "feminism", "race"], rating: 4.5 },
  { title: "Meridian", author: "Alice Walker", year: 1976, description: "A novel about a woman's involvement in the Civil Rights Movement.", genres: ["historical fiction", "feminism", "civil rights"], rating: 4.2 },
  { title: "The Third Life of Grange Copeland", author: "Alice Walker", year: 1970, description: "A novel about three generations of an African American family.", genres: ["historical fiction", "family", "race"], rating: 4.1 },
  { title: "Possessing the Secret of Joy", author: "Alice Walker", year: 1992, description: "A novel about female genital mutilation.", genres: ["contemporary", "feminism", "africa"], rating: 4.0 },
  { title: "By the Light of My Father's Smile", author: "Alice Walker", year: 1998, description: "A novel about sexuality and spirituality.", genres: ["contemporary", "feminism", "spirituality"], rating: 3.9 },
  { title: "The Way Forward Is with a Broken Heart", author: "Alice Walker", year: 2000, description: "A collection of short stories about love and loss.", genres: ["short stories", "romance", "healing"], rating: 4.0 },
  { title: "Now Is the Time to Open Your Heart", author: "Alice Walker", year: 2004, description: "A novel about a woman's spiritual journey.", genres: ["contemporary", "spirituality", "feminism"], rating: 3.8 },
  { title: "We Are the Ones We Have Been Waiting For", author: "Alice Walker", year: 2006, description: "A collection of essays about activism and spirituality.", genres: ["essays", "activism", "spirituality"], rating: 4.1 },
  { title: "The Chicken Chronicles", author: "Alice Walker", year: 2011, description: "A memoir about raising chickens.", genres: ["memoir", "nature", "healing"], rating: 3.9 },
  { title: "The Cushion in the Road", author: "Alice Walker", year: 2013, description: "A collection of essays about meditation and activism.", genres: ["essays", "meditation", "activism"], rating: 4.0 },
  { title: "Taking the Arrow Out of the Heart", author: "Alice Walker", year: 2018, description: "A collection of poems about healing and activism.", genres: ["poetry", "healing", "activism"], rating: 4.1 },
  { title: "Gathering Blossoms Under Fire", author: "Alice Walker", year: 2022, description: "A collection of journal entries from 1965-2000.", genres: ["memoir", "journal", "activism"], rating: 4.0 },
  { title: "The Temple of My Familiar", author: "Alice Walker", year: 1989, description: "A novel about African American women and their ancestors.", genres: ["contemporary", "feminism", "spirituality"], rating: 4.1 },
  { title: "To Hell with Dying", author: "Alice Walker", year: 1988, description: "A children's book about love and death.", genres: ["children", "family", "death"], rating: 4.0 },
  { title: "Finding the Green Stone", author: "Alice Walker", year: 1991, description: "A children's book about self-esteem and healing.", genres: ["children", "self-help", "healing"], rating: 3.9 },
  { title: "Langston Hughes: American Poet", author: "Alice Walker", year: 1974, description: "A biography of Langston Hughes for children.", genres: ["biography", "children", "poetry"], rating: 4.0 },
  { title: "There Is a Flower at the Tip of My Nose Smelling Me", author: "Alice Walker", year: 2006, description: "A children's book about nature and spirituality.", genres: ["children", "nature", "spirituality"], rating: 3.8 },
  { title: "Why War Is Never a Good Idea", author: "Alice Walker", year: 2007, description: "A children's book about peace and war.", genres: ["children", "peace", "activism"], rating: 4.0 },
  { title: "Sweet People Are Everywhere", author: "Alice Walker", year: 2021, description: "A children's book about kindness and connection.", genres: ["children", "kindness", "connection"], rating: 4.1 },
  { title: "The Beauty in Breaking", author: "Michele Harper", year: 2020, description: "A memoir by an emergency room physician.", genres: ["memoir", "medicine", "healing"], rating: 4.1 },
  { title: "Know My Name", author: "Chanel Miller", year: 2019, description: "A memoir about sexual assault and healing.", genres: ["memoir", "feminism", "healing"], rating: 4.4 },
  { title: "In the Dream House", author: "Carmen Maria Machado", year: 2019, description: "A memoir about domestic abuse in a same-sex relationship.", genres: ["memoir", "lgbtq", "healing"], rating: 4.3 },
  { title: "Her Body and Other Parties", author: "Carmen Maria Machado", year: 2017, description: "A collection of short stories blending horror and feminism.", genres: ["short stories", "horror", "feminism"], rating: 4.2 },
  { title: "The Lowland", author: "Jhumpa Lahiri", year: 2013, description: "A novel about two brothers in India and America.", genres: ["contemporary", "family", "immigration"], rating: 4.1 },
  { title: "Unaccustomed Earth", author: "Jhumpa Lahiri", year: 2008, description: "A collection of short stories about Bengali-Americans.", genres: ["short stories", "immigration", "family"], rating: 4.2 },
  { title: "The Namesake", author: "Jhumpa Lahiri", year: 2003, description: "A novel about an Indian-American family.", genres: ["contemporary", "family", "immigration"], rating: 4.3 },
  { title: "Whereabouts", author: "Jhumpa Lahiri", year: 2021, description: "A novel about a woman's solitary life in an Italian city.", genres: ["contemporary", "solitude", "reflection"], rating: 4.0 },
  { title: "Roman Stories", author: "Jhumpa Lahiri", year: 2023, description: "A collection of short stories set in Rome.", genres: ["short stories", "italy", "immigration"], rating: 4.1 },
  { title: "The House of the Spirits", author: "Isabel Allende", year: 1982, description: "A magical realist novel about a Chilean family.", genres: ["magical realism", "family", "chile"], rating: 4.4 },
  { title: "Eva Luna", author: "Isabel Allende", year: 1987, description: "A novel about a storyteller in Latin America.", genres: ["magical realism", "storytelling", "latin america"], rating: 4.2 },
  { title: "Daughter of Fortune", author: "Isabel Allende", year: 1999, description: "A novel about a Chilean woman during the California Gold Rush.", genres: ["historical fiction", "adventure", "chile"], rating: 4.1 },
  { title: "Portrait in Sepia", author: "Isabel Allende", year: 2000, description: "A novel about a woman's search for her identity.", genres: ["historical fiction", "family", "chile"], rating: 4.0 },
  { title: "Zorro", author: "Isabel Allende", year: 2005, description: "A novel about the legendary masked hero.", genres: ["historical fiction", "adventure", "california"], rating: 3.9 },
  { title: "Inés of My Soul", author: "Isabel Allende", year: 2006, description: "A novel about the Spanish conquest of Chile.", genres: ["historical fiction", "adventure", "chile"], rating: 4.0 },
  { title: "Island Beneath the Sea", author: "Isabel Allende", year: 2009, description: "A novel about slavery and revolution in Haiti.", genres: ["historical fiction", "slavery", "haiti"], rating: 4.1 },
  { title: "Maya's Notebook", author: "Isabel Allende", year: 2011, description: "A novel about a troubled teenager finding refuge in Chile.", genres: ["contemporary", "coming-of-age", "chile"], rating: 3.9 },
  { title: "Ripper", author: "Isabel Allende", year: 2014, description: "A mystery novel about a teenage detective.", genres: ["mystery", "young adult", "chile"], rating: 3.8 },
  { title: "The Japanese Lover", author: "Isabel Allende", year: 2015, description: "A novel about love and family across generations.", genres: ["contemporary", "romance", "family"], rating: 4.0 },
  { title: "In the Midst of Winter", author: "Isabel Allende", year: 2017, description: "A novel about three people brought together by a car accident.", genres: ["contemporary", "romance", "family"], rating: 3.9 },
  { title: "A Long Petal of the Sea", author: "Isabel Allende", year: 2019, description: "A novel about Spanish refugees in Chile.", genres: ["historical fiction", "immigration", "chile"], rating: 4.1 },
  { title: "Violeta", author: "Isabel Allende", year: 2022, description: "A novel about a woman's life spanning a century of change.", genres: ["historical fiction", "family", "chile"], rating: 4.0 },
  { title: "The Wind Knows My Name", author: "Isabel Allende", year: 2023, description: "A novel about immigration and family across time.", genres: ["contemporary", "immigration", "family"], rating: 4.1 },
  { title: "The Handmaid's Tale", author: "Margaret Atwood", year: 1985, description: "A dystopian novel about a woman's struggle in a totalitarian society.", genres: ["dystopian", "feminism", "sci-fi"], rating: 4.4 },
  { title: "The Testaments", author: "Margaret Atwood", year: 2019, description: "The sequel to The Handmaid's Tale.", genres: ["dystopian", "feminism", "sci-fi"], rating: 4.2 },
  { title: "Alias Grace", author: "Margaret Atwood", year: 1996, description: "A novel about a 19th-century murderess.", genres: ["historical fiction", "mystery", "feminism"], rating: 4.1 },
  { title: "The Blind Assassin", author: "Margaret Atwood", year: 2000, description: "A novel about two sisters and a mysterious death.", genres: ["contemporary", "mystery", "family"], rating: 4.3 },
  { title: "Oryx and Crake", author: "Margaret Atwood", year: 2003, description: "A dystopian novel about genetic engineering.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.2 },
  { title: "The Year of the Flood", author: "Margaret Atwood", year: 2009, description: "A dystopian novel about environmental collapse.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.1 },
  { title: "MaddAddam", author: "Margaret Atwood", year: 2013, description: "The final book in the MaddAddam trilogy.", genres: ["dystopian", "sci-fi", "environmental"], rating: 4.0 },
  { title: "The Robber Bride", author: "Margaret Atwood", year: 1993, description: "A novel about three women and their nemesis.", genres: ["contemporary", "friendship", "feminism"], rating: 4.1 },
  { title: "Cat's Eye", author: "Margaret Atwood", year: 1988, description: "A novel about an artist reflecting on her childhood.", genres: ["contemporary", "coming-of-age", "art"], rating: 4.2 },
  { title: "The Edible Woman", author: "Margaret Atwood", year: 1969, description: "A novel about a woman's rebellion against societal expectations.", genres: ["contemporary", "feminism", "satire"], rating: 4.0 },
  { title: "Surfacing", author: "Margaret Atwood", year: 1972, description: "A novel about a woman's journey into the wilderness.", genres: ["contemporary", "feminism", "nature"], rating: 3.9 },
  { title: "Lady Oracle", author: "Margaret Atwood", year: 1976, description: "A novel about a writer who fakes her own death.", genres: ["contemporary", "feminism", "satire"], rating: 3.8 },
  { title: "Life Before Man", author: "Margaret Atwood", year: 1979, description: "A novel about relationships and infidelity.", genres: ["contemporary", "romance", "family"], rating: 3.9 },
  { title: "Bodily Harm", author: "Margaret Atwood", year: 1981, description: "A novel about a journalist in the Caribbean.", genres: ["contemporary", "politics", "feminism"], rating: 3.8 },
  { title: "The Penelopiad", author: "Margaret Atwood", year: 2005, description: "A retelling of The Odyssey from Penelope's perspective.", genres: ["mythology", "feminism", "retelling"], rating: 4.1 },
  { title: "The Heart Goes Last", author: "Margaret Atwood", year: 2015, description: "A dystopian novel about a couple in a social experiment.", genres: ["dystopian", "sci-fi", "romance"], rating: 3.9 },
  { title: "Hag-Seed", author: "Margaret Atwood", year: 2016, description: "A retelling of The Tempest.", genres: ["retelling", "shakespeare", "contemporary"], rating: 4.0 },
  { title: "The Stone Mattress", author: "Margaret Atwood", year: 2014, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.1 },
  { title: "Dancing Girls", author: "Margaret Atwood", year: 1977, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 3.9 },
  { title: "Bluebeard's Egg", author: "Margaret Atwood", year: 1983, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.0 },
  { title: "Wilderness Tips", author: "Margaret Atwood", year: 1991, description: "A collection of short stories.", genres: ["short stories", "contemporary", "feminism"], rating: 4.1 },
  { title: "Good Bones and Simple Murders", author: "Margaret Atwood", year: 1992, description: "A collection of short stories and essays.", genres: ["short stories", "essays", "feminism"], rating: 4.0 },
  { title: "The Tent", author: "Margaret Atwood", year: 2006, description: "A collection of short stories and essays.", genres: ["short stories", "essays", "feminism"], rating: 3.9 },
  { title: "Moral Disorder", author: "Margaret Atwood", year: 2006, description: "A collection of linked short stories.", genres: ["short stories", "contemporary", "family"], rating: 4.0 },
  { title: "Old Babes in the Wood", author: "Margaret Atwood", year: 2023, description: "A collection of short stories about aging and relationships.", genres: ["short stories", "aging", "relationships"], rating: 4.1 },
  { title: "The Color Purple", author: "Alice Walker", year: 1982, description: "A novel about African American women in the early 1900s.", genres: ["historical fiction", "feminism", "race"], rating: 4.5 },
  { title: "Meridian", author: "Alice Walker", year: 1976, description: "A novel about a woman's involvement in the Civil Rights Movement.", genres: ["historical fiction", "feminism", "civil rights"], rating: 4.2 },
  { title: "The Third Life of Grange Copeland", author: "Alice Walker", year: 1970, description: "A novel about three generations of an African American family.", genres: ["historical fiction", "family", "race"], rating: 4.1 },
  { title: "Possessing the Secret of Joy", author: "Alice Walker", year: 1992, description: "A novel about female genital mutilation.", genres: ["contemporary", "feminism", "africa"], rating: 4.0 },
  { title: "By the Light of My Father's Smile", author: "Alice Walker", year: 1998, description: "A novel about sexuality and spirituality.", genres: ["contemporary", "feminism", "spirituality"], rating: 3.9 },
  { title: "The Way Forward Is with a Broken Heart", author: "Alice Walker", year: 2000, description: "A collection of short stories about love and loss.", genres: ["short stories", "romance", "healing"], rating: 4.0 },
  { title: "Now Is the Time to Open Your Heart", author: "Alice Walker", year: 2004, description: "A novel about a woman's spiritual journey.", genres: ["contemporary", "spirituality", "feminism"], rating: 3.8 },
  { title: "We Are the Ones We Have Been Waiting For", author: "Alice Walker", year: 2006, description: "A collection of essays about activism and spirituality.", genres: ["essays", "activism", "spirituality"], rating: 4.1 },
  { title: "The Chicken Chronicles", author: "Alice Walker", year: 2011, description: "A memoir about raising chickens.", genres: ["memoir", "nature", "healing"], rating: 3.9 },
  { title: "The Cushion in the Road", author: "Alice Walker", year: 2013, description: "A collection of essays about meditation and activism.", genres: ["essays", "meditation", "activism"], rating: 4.0 },
  { title: "Taking the Arrow Out of the Heart", author: "Alice Walker", year: 2018, description: "A collection of poems about healing and activism.", genres: ["poetry", "healing", "activism"], rating: 4.1 },
  { title: "Gathering Blossoms Under Fire", author: "Alice Walker", year: 2022, description: "A collection of journal entries from 1965-2000.", genres: ["memoir", "journal", "activism"], rating: 4.0 },
  { title: "The Temple of My Familiar", author: "Alice Walker", year: 1989, description: "A novel about African American women and their ancestors.", genres: ["contemporary", "feminism", "spirituality"], rating: 4.1 },
  { title: "To Hell with Dying", author: "Alice Walker", year: 1988, description: "A children's book about love and death.", genres: ["children", "family", "death"], rating: 4.0 },
  { title: "Finding the Green Stone", author: "Alice Walker", year: 1991, description: "A children's book about self-esteem and healing.", genres: ["children", "self-help", "healing"], rating: 3.9 },
  { title: "Langston Hughes: American Poet", author: "Alice Walker", year: 1974, description: "A biography of Langston Hughes for children.", genres: ["biography", "children", "poetry"], rating: 4.0 },
  { title: "There Is a Flower at the Tip of My Nose Smelling Me", author: "Alice Walker", year: 2006, description: "A children's book about nature and spirituality.", genres: ["children", "nature", "spirituality"], rating: 3.8 },
  { title: "Why War Is Never a Good Idea", author: "Alice Walker", year: 2007, description: "A children's book about peace and war.", genres: ["children", "peace", "activism"], rating: 4.0 },
    { title: "Sweet People Are Everywhere", author: "Alice Walker", year: 2021, description: "A children's book about kindness and connection.", genres: ["children", "kindness", "connection"], rating: 4.1 },
  { title: "Mama Day", author: "Gloria Naylor", year: 1988, description: "A novel blending realism and magical realism.", genres: ["contemporary", "magical realism", "family"], rating: 4.1 },
  { title: "Bailey's Cafe", author: "Gloria Naylor", year: 1992, description: "A novel about a magical cafe and its patrons.", genres: ["contemporary", "magical realism", "community"], rating: 4.0 },
  { title: "The Men of Brewster Place", author: "Gloria Naylor", year: 1998, description: "A novel about the men of the same housing project.", genres: ["contemporary", "masculinity", "community"], rating: 3.9 },
  { title: "1996", author: "Gloria Naylor", year: 2005, description: "A novel about the year 1996 and its significance.", genres: ["contemporary", "history", "reflection"], rating: 3.8 },
  { title: "Kindred", author: "Octavia Butler", year: 1979, description: "A science fiction novel about a black woman who travels back to slavery times.", genres: ["sci-fi", "historical fiction", "race"], rating: 4.4 },
  { title: "Parable of the Sower", author: "Octavia Butler", year: 1993, description: "A dystopian novel about a young woman's journey.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.3 },
  { title: "Parable of the Talents", author: "Octavia Butler", year: 1998, description: "The sequel to Parable of the Sower.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.2 },
  { title: "Wild Seed", author: "Octavia Butler", year: 1980, description: "A science fiction novel about immortals.", genres: ["sci-fi", "fantasy", "romance"], rating: 4.1 },
  { title: "Mind of My Mind", author: "Octavia Butler", year: 1977, description: "A science fiction novel about telepathy.", genres: ["sci-fi", "fantasy", "family"], rating: 4.0 },
  { title: "Clay's Ark", author: "Octavia Butler", year: 1984, description: "A science fiction novel about an alien disease.", genres: ["sci-fi", "horror", "family"], rating: 3.9 },
  { title: "Patternmaster", author: "Octavia Butler", year: 1976, description: "A science fiction novel about psychic powers.", genres: ["sci-fi", "fantasy", "power"], rating: 3.8 },
  { title: "Survivor", author: "Octavia Butler", year: 1978, description: "A science fiction novel about survival on an alien planet.", genres: ["sci-fi", "adventure", "survival"], rating: 3.9 },
  { title: "Fledgling", author: "Octavia Butler", year: 2005, description: "A novel about a young vampire.", genres: ["sci-fi", "fantasy", "coming-of-age"], rating: 4.0 },
  { title: "Bloodchild and Other Stories", author: "Octavia Butler", year: 1995, description: "A collection of science fiction short stories.", genres: ["sci-fi", "short stories", "feminism"], rating: 4.1 },
  { title: "Seed to Harvest", author: "Octavia Butler", year: 2007, description: "A collection of the Patternist series.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.0 },
  { title: "Lilith's Brood", author: "Octavia Butler", year: 2000, description: "A collection of the Xenogenesis trilogy.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.1 },
  { title: "The Parable Series", author: "Octavia Butler", year: 2007, description: "A collection of the Parable novels.", genres: ["sci-fi", "dystopian", "collection"], rating: 4.2 },
  { title: "The Complete Stories", author: "Flannery O'Connor", year: 1971, description: "A collection of all of Flannery O'Connor's short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.3 },
  { title: "Wise Blood", author: "Flannery O'Connor", year: 1952, description: "A novel about religious fanaticism in the South.", genres: ["contemporary", "religion", "southern gothic"], rating: 4.1 },
  { title: "The Violent Bear It Away", author: "Flannery O'Connor", year: 1960, description: "A novel about prophecy and violence.", genres: ["contemporary", "religion", "southern gothic"], rating: 4.0 },
  { title: "A Good Man Is Hard to Find", author: "Flannery O'Connor", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.2 },
  { title: "Everything That Rises Must Converge", author: "Flannery O'Connor", year: 1965, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.1 },
  { title: "Mystery and Manners", author: "Flannery O'Connor", year: 1969, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Habit of Being", author: "Flannery O'Connor", year: 1979, description: "Letters of Flannery O'Connor.", genres: ["letters", "biography", "literature"], rating: 4.1 },
  { title: "A Prayer Journal", author: "Flannery O'Connor", year: 2013, description: "Flannery O'Connor's prayer journal.", genres: ["journal", "religion", "spirituality"], rating: 4.0 },
  { title: "The Complete Stories", author: "Eudora Welty", year: 1980, description: "A collection of all of Eudora Welty's short stories.", genres: ["short stories", "southern", "family"], rating: 4.2 },
  { title: "Delta Wedding", author: "Eudora Welty", year: 1946, description: "A novel about a Southern family wedding.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Optimist's Daughter", author: "Eudora Welty", year: 1972, description: "A Pulitzer Prize-winning novel about grief and family.", genres: ["contemporary", "family", "grief"], rating: 4.1 },
  { title: "Losing Battles", author: "Eudora Welty", year: 1970, description: "A novel about a Southern family reunion.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Robber Bridegroom", author: "Eudora Welty", year: 1942, description: "A fairy tale set in the American South.", genres: ["fantasy", "fairy tale", "southern"], rating: 3.9 },
  { title: "The Ponder Heart", author: "Eudora Welty", year: 1954, description: "A novel about a Southern family and inheritance.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "One Writer's Beginnings", author: "Eudora Welty", year: 1984, description: "A memoir about writing and family.", genres: ["memoir", "writing", "family"], rating: 4.1 },
  { title: "The Eye of the Story", author: "Eudora Welty", year: 1978, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Golden Apples", author: "Eudora Welty", year: 1949, description: "A collection of interconnected short stories.", genres: ["short stories", "southern", "community"], rating: 4.1 },
  { title: "The Wide Net", author: "Eudora Welty", year: 1943, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "A Curtain of Green", author: "Eudora Welty", year: 1941, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.1 },
  { title: "The Bride of the Innisfallen", author: "Eudora Welty", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "The Collected Stories", author: "Eudora Welty", year: 1980, description: "A comprehensive collection of short stories.", genres: ["short stories", "southern", "collection"], rating: 4.2 },
  { title: "The Norton Book of Friendship", author: "Eudora Welty", year: 1991, description: "An anthology of writings about friendship.", genres: ["anthology", "friendship", "literature"], rating: 4.0 },
  { title: "The Norton Book of American Autobiography", author: "Eudora Welty", year: 1991, description: "An anthology of American autobiographies.", genres: ["anthology", "autobiography", "american"], rating: 4.1 },
  
  // Banned & Challenged Books - Important Works of Literature
  // Classic Banned Books
  { title: "1984", author: "George Orwell", year: 1949, description: "A dystopian novel about totalitarian surveillance and control.", genres: ["dystopian", "sci-fi", "political"], rating: 4.5 },
  { title: "Animal Farm", author: "George Orwell", year: 1945, description: "An allegorical novel about the Russian Revolution.", genres: ["allegory", "political", "satire"], rating: 4.4 },
  { title: "Brave New World", author: "Aldous Huxley", year: 1932, description: "A dystopian novel about a controlled society.", genres: ["dystopian", "sci-fi", "social commentary"], rating: 4.3 },
  { title: "Fahrenheit 451", author: "Ray Bradbury", year: 1953, description: "A dystopian novel about book burning and censorship.", genres: ["dystopian", "sci-fi", "censorship"], rating: 4.4 },
  { title: "The Catcher in the Rye", author: "J.D. Salinger", year: 1951, description: "A novel about teenage alienation and rebellion.", genres: ["coming-of-age", "contemporary", "rebellion"], rating: 4.2 },
  { title: "To Kill a Mockingbird", author: "Harper Lee", year: 1960, description: "A novel about racial injustice in the American South.", genres: ["historical fiction", "social justice", "race"], rating: 4.5 },
  { title: "The Adventures of Huckleberry Finn", author: "Mark Twain", year: 1885, description: "A novel about a boy's journey down the Mississippi River.", genres: ["adventure", "coming-of-age", "social commentary"], rating: 4.3 },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925, description: "A novel about the American Dream and the Jazz Age.", genres: ["classic", "romance", "social commentary"], rating: 4.4 },
  { title: "Of Mice and Men", author: "John Steinbeck", year: 1937, description: "A novel about friendship during the Great Depression.", genres: ["classic", "drama", "friendship"], rating: 4.3 },
  { title: "The Grapes of Wrath", author: "John Steinbeck", year: 1939, description: "A novel about migrant workers during the Dust Bowl.", genres: ["historical fiction", "social commentary", "family"], rating: 4.4 },
  { title: "Lord of the Flies", author: "William Golding", year: 1954, description: "A novel about boys stranded on an island and human nature.", genres: ["allegory", "survival", "psychological"], rating: 4.2 },
  { title: "The Lord of the Rings", author: "J.R.R. Tolkien", year: 1954, description: "An epic fantasy trilogy about the quest to destroy a powerful ring.", genres: ["fantasy", "adventure", "epic"], rating: 4.6 },
  { title: "The Hobbit", author: "J.R.R. Tolkien", year: 1937, description: "A fantasy novel about a hobbit's adventure with dwarves.", genres: ["fantasy", "adventure", "quest"], rating: 4.5 },
  { title: "The Chronicles of Narnia", author: "C.S. Lewis", year: 1950, description: "A fantasy series about children in a magical world.", genres: ["fantasy", "adventure", "children"], rating: 4.4 },
  { title: "A Clockwork Orange", author: "Anthony Burgess", year: 1962, description: "A dystopian novel about violence and free will.", genres: ["dystopian", "sci-fi", "psychological"], rating: 4.1 },
  { title: "Lolita", author: "Vladimir Nabokov", year: 1955, description: "A controversial novel about obsession and manipulation.", genres: ["contemporary", "psychological", "controversial"], rating: 4.2 },
  { title: "The Satanic Verses", author: "Salman Rushdie", year: 1988, description: "A novel about migration and religious controversy.", genres: ["contemporary", "magical realism", "religious"], rating: 4.1 },
  { title: "The Handmaid's Tale", author: "Margaret Atwood", year: 1985, description: "A dystopian novel about women's oppression.", genres: ["dystopian", "feminism", "social commentary"], rating: 4.4 },
  { title: "Beloved", author: "Toni Morrison", year: 1987, description: "A novel about slavery and its psychological aftermath.", genres: ["historical fiction", "magical realism", "slavery"], rating: 4.4 },
  { title: "The Color Purple", author: "Alice Walker", year: 1982, description: "A novel about African American women's struggles.", genres: ["historical fiction", "feminism", "race"], rating: 4.5 },
  { title: "Native Son", author: "Richard Wright", year: 1940, description: "A novel about racial inequality and crime in Chicago.", genres: ["contemporary", "social commentary", "race"], rating: 4.3 },
  { title: "Invisible Man", author: "Ralph Ellison", year: 1952, description: "A novel about African American identity and invisibility.", genres: ["contemporary", "social commentary", "identity"], rating: 4.4 },
  { title: "Go Tell It on the Mountain", author: "James Baldwin", year: 1953, description: "A novel about religion and family in Harlem.", genres: ["contemporary", "religious", "family"], rating: 4.2 },
  { title: "Giovanni's Room", author: "James Baldwin", year: 1956, description: "A novel about homosexuality and identity in Paris.", genres: ["contemporary", "lgbtq", "romance"], rating: 4.3 },
  { title: "Another Country", author: "James Baldwin", year: 1962, description: "A novel about race, sexuality, and love in New York.", genres: ["contemporary", "social commentary", "romance"], rating: 4.1 },
  { title: "If Beale Street Could Talk", author: "James Baldwin", year: 1974, description: "A novel about love and injustice in Harlem.", genres: ["contemporary", "romance", "social justice"], rating: 4.2 },
  { title: "The Autobiography of Malcolm X", author: "Malcolm X", year: 1965, description: "An autobiography about civil rights and personal transformation.", genres: ["autobiography", "civil rights", "social justice"], rating: 4.5 },
  { title: "The Fire Next Time", author: "James Baldwin", year: 1963, description: "Essays about race relations in America.", genres: ["essays", "civil rights", "social commentary"], rating: 4.4 },
  { title: "Notes of a Native Son", author: "James Baldwin", year: 1955, description: "Essays about race and identity in America.", genres: ["essays", "social commentary", "identity"], rating: 4.3 },
  { title: "Nobody Knows My Name", author: "James Baldwin", year: 1961, description: "Essays about race and American society.", genres: ["essays", "social commentary", "race"], rating: 4.2 },
  { title: "The Devil Finds Work", author: "James Baldwin", year: 1976, description: "Essays about race and cinema.", genres: ["essays", "film", "social commentary"], rating: 4.1 },
  { title: "No Name in the Street", author: "James Baldwin", year: 1972, description: "A memoir about the Civil Rights Movement.", genres: ["memoir", "civil rights", "social justice"], rating: 4.2 },
  { title: "The Evidence of Things Not Seen", author: "James Baldwin", year: 1985, description: "A book about the Atlanta child murders.", genres: ["true crime", "social commentary", "justice"], rating: 4.0 },
  { title: "The Price of the Ticket", author: "James Baldwin", year: 1985, description: "A collection of essays spanning 1948-1985.", genres: ["essays", "social commentary", "civil rights"], rating: 4.1 },
  { title: "The Cross of Redemption", author: "James Baldwin", year: 2010, description: "Uncollected writings by James Baldwin.", genres: ["essays", "social commentary", "civil rights"], rating: 4.0 },
  { title: "I Am Not Your Negro", author: "James Baldwin", year: 2017, description: "A documentary about James Baldwin's unfinished book.", genres: ["essays", "social commentary", "civil rights"], rating: 4.3 },
  { title: "The Women of Brewster Place", author: "Gloria Naylor", year: 1982, description: "A novel about African American women in a housing project.", genres: ["contemporary", "feminism", "community"], rating: 4.2 },
  { title: "Linden Hills", author: "Gloria Naylor", year: 1985, description: "A novel about an African American community.", genres: ["contemporary", "social commentary", "community"], rating: 4.0 },
  { title: "Mama Day", author: "Gloria Naylor", year: 1988, description: "A novel blending realism and magical realism.", genres: ["contemporary", "magical realism", "family"], rating: 4.1 },
  { title: "Bailey's Cafe", author: "Gloria Naylor", year: 1992, description: "A novel about a magical cafe and its patrons.", genres: ["contemporary", "magical realism", "community"], rating: 4.0 },
  { title: "The Men of Brewster Place", author: "Gloria Naylor", year: 1998, description: "A novel about the men of the same housing project.", genres: ["contemporary", "masculinity", "community"], rating: 3.9 },
  { title: "1996", author: "Gloria Naylor", year: 2005, description: "A novel about the year 1996 and its significance.", genres: ["contemporary", "historical", "reflection"], rating: 3.8 },
  { title: "Kindred", author: "Octavia Butler", year: 1979, description: "A science fiction novel about a black woman who travels back to slavery times.", genres: ["sci-fi", "historical fiction", "slavery"], rating: 4.4 },
  { title: "Parable of the Sower", author: "Octavia Butler", year: 1993, description: "A dystopian novel about a young woman's journey.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.3 },
  { title: "Parable of the Talents", author: "Octavia Butler", year: 1998, description: "The sequel to Parable of the Sower.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.2 },
  { title: "Wild Seed", author: "Octavia Butler", year: 1980, description: "A science fiction novel about immortals.", genres: ["sci-fi", "fantasy", "romance"], rating: 4.1 },
  { title: "Mind of My Mind", author: "Octavia Butler", year: 1977, description: "A science fiction novel about telepathy.", genres: ["sci-fi", "fantasy", "family"], rating: 4.0 },
  { title: "Clay's Ark", author: "Octavia Butler", year: 1984, description: "A science fiction novel about an alien disease.", genres: ["sci-fi", "horror", "family"], rating: 3.9 },
  { title: "Patternmaster", author: "Octavia Butler", year: 1976, description: "A science fiction novel about psychic powers.", genres: ["sci-fi", "fantasy", "power"], rating: 3.8 },
  { title: "Survivor", author: "Octavia Butler", year: 1978, description: "A science fiction novel about survival on an alien planet.", genres: ["sci-fi", "adventure", "survival"], rating: 3.9 },
  { title: "Fledgling", author: "Octavia Butler", year: 2005, description: "A novel about a young vampire.", genres: ["sci-fi", "fantasy", "coming-of-age"], rating: 4.0 },
  { title: "Bloodchild and Other Stories", author: "Octavia Butler", year: 1995, description: "A collection of science fiction short stories.", genres: ["sci-fi", "short stories", "feminism"], rating: 4.1 },
  { title: "Seed to Harvest", author: "Octavia Butler", year: 2007, description: "A collection of the Patternist series.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.0 },
  { title: "Lilith's Brood", author: "Octavia Butler", year: 2000, description: "A collection of the Xenogenesis trilogy.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.1 },
  { title: "The Parable Series", author: "Octavia Butler", year: 2007, description: "A collection of the Parable novels.", genres: ["sci-fi", "dystopian", "collection"], rating: 4.2 },
  { title: "The Complete Stories", author: "Flannery O'Connor", year: 1971, description: "A collection of all of Flannery O'Connor's short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.3 },
  { title: "Wise Blood", author: "Flannery O'Connor", year: 1952, description: "A novel about religious fanaticism in the South.", genres: ["contemporary", "religious", "southern gothic"], rating: 4.1 },
  { title: "The Violent Bear It Away", author: "Flannery O'Connor", year: 1960, description: "A novel about prophecy and violence.", genres: ["contemporary", "religious", "southern gothic"], rating: 4.0 },
  { title: "A Good Man Is Hard to Find", author: "Flannery O'Connor", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.2 },
  { title: "Everything That Rises Must Converge", author: "Flannery O'Connor", year: 1965, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.1 },
  { title: "Mystery and Manners", author: "Flannery O'Connor", year: 1969, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Habit of Being", author: "Flannery O'Connor", year: 1979, description: "Letters of Flannery O'Connor.", genres: ["letters", "biography", "literature"], rating: 4.1 },
  { title: "A Prayer Journal", author: "Flannery O'Connor", year: 2013, description: "Flannery O'Connor's prayer journal.", genres: ["journal", "religious", "spirituality"], rating: 4.0 },
  { title: "The Complete Stories", author: "Eudora Welty", year: 1980, description: "A collection of all of Eudora Welty's short stories.", genres: ["short stories", "southern", "family"], rating: 4.2 },
  { title: "Delta Wedding", author: "Eudora Welty", year: 1946, description: "A novel about a Southern family wedding.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Optimist's Daughter", author: "Eudora Welty", year: 1972, description: "A Pulitzer Prize-winning novel about grief and family.", genres: ["contemporary", "family", "grief"], rating: 4.1 },
  { title: "Losing Battles", author: "Eudora Welty", year: 1970, description: "A novel about a Southern family reunion.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Robber Bridegroom", author: "Eudora Welty", year: 1942, description: "A fairy tale set in the American South.", genres: ["fantasy", "fairy tale", "southern"], rating: 3.9 },
  { title: "The Ponder Heart", author: "Eudora Welty", year: 1954, description: "A novel about a Southern family and inheritance.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "One Writer's Beginnings", author: "Eudora Welty", year: 1984, description: "A memoir about writing and family.", genres: ["memoir", "writing", "family"], rating: 4.1 },
  { title: "The Eye of the Story", author: "Eudora Welty", year: 1978, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Golden Apples", author: "Eudora Welty", year: 1949, description: "A collection of interconnected short stories.", genres: ["short stories", "southern", "community"], rating: 4.1 },
  { title: "The Wide Net", author: "Eudora Welty", year: 1943, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "A Curtain of Green", author: "Eudora Welty", year: 1941, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.1 },
  { title: "The Bride of the Innisfallen", author: "Eudora Welty", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "The Collected Stories", author: "Eudora Welty", year: 1980, description: "A comprehensive collection of short stories.", genres: ["short stories", "southern", "collection"], rating: 4.2 },
  { title: "The Norton Book of Friendship", author: "Eudora Welty", year: 1991, description: "An anthology of writings about friendship.", genres: ["anthology", "friendship", "literature"], rating: 4.0 },
  { title: "The Norton Book of American Autobiography", author: "Eudora Welty", year: 1991, description: "An anthology of American autobiographies.", genres: ["anthology", "autobiography", "american"], rating: 4.1 },
  
  // Banned & Challenged Books - Important Works of Literature
  // Classic Banned Books
  { title: "1984", author: "George Orwell", year: 1949, description: "A dystopian novel about totalitarian surveillance and control.", genres: ["dystopian", "sci-fi", "political"], rating: 4.5 },
  { title: "Animal Farm", author: "George Orwell", year: 1945, description: "An allegorical novel about the Russian Revolution.", genres: ["allegory", "political", "satire"], rating: 4.4 },
  { title: "Brave New World", author: "Aldous Huxley", year: 1932, description: "A dystopian novel about a controlled society.", genres: ["dystopian", "sci-fi", "social commentary"], rating: 4.3 },
  { title: "Fahrenheit 451", author: "Ray Bradbury", year: 1953, description: "A dystopian novel about book burning and censorship.", genres: ["dystopian", "sci-fi", "censorship"], rating: 4.4 },
  { title: "The Catcher in the Rye", author: "J.D. Salinger", year: 1951, description: "A novel about teenage alienation and rebellion.", genres: ["coming-of-age", "contemporary", "rebellion"], rating: 4.2 },
  { title: "To Kill a Mockingbird", author: "Harper Lee", year: 1960, description: "A novel about racial injustice in the American South.", genres: ["historical fiction", "social justice", "race"], rating: 4.5 },
  { title: "The Adventures of Huckleberry Finn", author: "Mark Twain", year: 1885, description: "A novel about a boy's journey down the Mississippi River.", genres: ["adventure", "coming-of-age", "social commentary"], rating: 4.3 },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925, description: "A novel about the American Dream and the Jazz Age.", genres: ["classic", "romance", "social commentary"], rating: 4.4 },
  { title: "Of Mice and Men", author: "John Steinbeck", year: 1937, description: "A novel about friendship during the Great Depression.", genres: ["classic", "drama", "friendship"], rating: 4.3 },
  { title: "The Grapes of Wrath", author: "John Steinbeck", year: 1939, description: "A novel about migrant workers during the Dust Bowl.", genres: ["historical fiction", "social commentary", "family"], rating: 4.4 },
  { title: "Lord of the Flies", author: "William Golding", year: 1954, description: "A novel about boys stranded on an island and human nature.", genres: ["allegory", "survival", "psychological"], rating: 4.2 },
  { title: "The Lord of the Rings", author: "J.R.R. Tolkien", year: 1954, description: "An epic fantasy trilogy about the quest to destroy a powerful ring.", genres: ["fantasy", "adventure", "epic"], rating: 4.6 },
  { title: "The Hobbit", author: "J.R.R. Tolkien", year: 1937, description: "A fantasy novel about a hobbit's adventure with dwarves.", genres: ["fantasy", "adventure", "quest"], rating: 4.5 },
  { title: "The Chronicles of Narnia", author: "C.S. Lewis", year: 1950, description: "A fantasy series about children in a magical world.", genres: ["fantasy", "adventure", "children"], rating: 4.4 },
  { title: "A Clockwork Orange", author: "Anthony Burgess", year: 1962, description: "A dystopian novel about violence and free will.", genres: ["dystopian", "sci-fi", "psychological"], rating: 4.1 },
  { title: "Lolita", author: "Vladimir Nabokov", year: 1955, description: "A controversial novel about obsession and manipulation.", genres: ["contemporary", "psychological", "controversial"], rating: 4.2 },
  { title: "The Satanic Verses", author: "Salman Rushdie", year: 1988, description: "A novel about migration and religious controversy.", genres: ["contemporary", "magical realism", "religious"], rating: 4.1 },
  { title: "The Handmaid's Tale", author: "Margaret Atwood", year: 1985, description: "A dystopian novel about women's oppression.", genres: ["dystopian", "feminism", "social commentary"], rating: 4.4 },
  { title: "Beloved", author: "Toni Morrison", year: 1987, description: "A novel about slavery and its psychological aftermath.", genres: ["historical fiction", "magical realism", "slavery"], rating: 4.4 },
  { title: "The Color Purple", author: "Alice Walker", year: 1982, description: "A novel about African American women's struggles.", genres: ["historical fiction", "feminism", "race"], rating: 4.5 },
  { title: "Native Son", author: "Richard Wright", year: 1940, description: "A novel about racial inequality and crime in Chicago.", genres: ["contemporary", "social commentary", "race"], rating: 4.3 },
  { title: "Invisible Man", author: "Ralph Ellison", year: 1952, description: "A novel about African American identity and invisibility.", genres: ["contemporary", "social commentary", "identity"], rating: 4.4 },
  { title: "Go Tell It on the Mountain", author: "James Baldwin", year: 1953, description: "A novel about religion and family in Harlem.", genres: ["contemporary", "religious", "family"], rating: 4.2 },
  { title: "Giovanni's Room", author: "James Baldwin", year: 1956, description: "A novel about homosexuality and identity in Paris.", genres: ["contemporary", "lgbtq", "romance"], rating: 4.3 },
  { title: "Another Country", author: "James Baldwin", year: 1962, description: "A novel about race, sexuality, and love in New York.", genres: ["contemporary", "social commentary", "romance"], rating: 4.1 },
  { title: "If Beale Street Could Talk", author: "James Baldwin", year: 1974, description: "A novel about love and injustice in Harlem.", genres: ["contemporary", "romance", "social justice"], rating: 4.2 },
  { title: "The Autobiography of Malcolm X", author: "Malcolm X", year: 1965, description: "An autobiography about civil rights and personal transformation.", genres: ["autobiography", "civil rights", "social justice"], rating: 4.5 },
  { title: "The Fire Next Time", author: "James Baldwin", year: 1963, description: "Essays about race relations in America.", genres: ["essays", "civil rights", "social commentary"], rating: 4.4 },
  { title: "Notes of a Native Son", author: "James Baldwin", year: 1955, description: "Essays about race and identity in America.", genres: ["essays", "social commentary", "identity"], rating: 4.3 },
  { title: "Nobody Knows My Name", author: "James Baldwin", year: 1961, description: "Essays about race and American society.", genres: ["essays", "social commentary", "race"], rating: 4.2 },
  { title: "The Devil Finds Work", author: "James Baldwin", year: 1976, description: "Essays about race and cinema.", genres: ["essays", "film", "social commentary"], rating: 4.1 },
  { title: "No Name in the Street", author: "James Baldwin", year: 1972, description: "A memoir about the Civil Rights Movement.", genres: ["memoir", "civil rights", "social justice"], rating: 4.2 },
  { title: "The Evidence of Things Not Seen", author: "James Baldwin", year: 1985, description: "A book about the Atlanta child murders.", genres: ["true crime", "social commentary", "justice"], rating: 4.0 },
  { title: "The Price of the Ticket", author: "James Baldwin", year: 1985, description: "A collection of essays spanning 1948-1985.", genres: ["essays", "social commentary", "civil rights"], rating: 4.1 },
  { title: "The Cross of Redemption", author: "James Baldwin", year: 2010, description: "Uncollected writings by James Baldwin.", genres: ["essays", "social commentary", "civil rights"], rating: 4.0 },
  { title: "I Am Not Your Negro", author: "James Baldwin", year: 2017, description: "A documentary about James Baldwin's unfinished book.", genres: ["essays", "social commentary", "civil rights"], rating: 4.3 },
  { title: "The Women of Brewster Place", author: "Gloria Naylor", year: 1982, description: "A novel about African American women in a housing project.", genres: ["contemporary", "feminism", "community"], rating: 4.2 },
  { title: "Linden Hills", author: "Gloria Naylor", year: 1985, description: "A novel about an African American community.", genres: ["contemporary", "social commentary", "community"], rating: 4.0 },
  { title: "Mama Day", author: "Gloria Naylor", year: 1988, description: "A novel blending realism and magical realism.", genres: ["contemporary", "magical realism", "family"], rating: 4.1 },
  { title: "Bailey's Cafe", author: "Gloria Naylor", year: 1992, description: "A novel about a magical cafe and its patrons.", genres: ["contemporary", "magical realism", "community"], rating: 4.0 },
  { title: "The Men of Brewster Place", author: "Gloria Naylor", year: 1998, description: "A novel about the men of the same housing project.", genres: ["contemporary", "masculinity", "community"], rating: 3.9 },
  { title: "1996", author: "Gloria Naylor", year: 2005, description: "A novel about the year 1996 and its significance.", genres: ["contemporary", "historical", "reflection"], rating: 3.8 },
  { title: "Kindred", author: "Octavia Butler", year: 1979, description: "A science fiction novel about a black woman who travels back to slavery times.", genres: ["sci-fi", "historical fiction", "slavery"], rating: 4.4 },
  { title: "Parable of the Sower", author: "Octavia Butler", year: 1993, description: "A dystopian novel about a young woman's journey.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.3 },
  { title: "Parable of the Talents", author: "Octavia Butler", year: 1998, description: "The sequel to Parable of the Sower.", genres: ["dystopian", "sci-fi", "feminism"], rating: 4.2 },
  { title: "Wild Seed", author: "Octavia Butler", year: 1980, description: "A science fiction novel about immortals.", genres: ["sci-fi", "fantasy", "romance"], rating: 4.1 },
  { title: "Mind of My Mind", author: "Octavia Butler", year: 1977, description: "A science fiction novel about telepathy.", genres: ["sci-fi", "fantasy", "family"], rating: 4.0 },
  { title: "Clay's Ark", author: "Octavia Butler", year: 1984, description: "A science fiction novel about an alien disease.", genres: ["sci-fi", "horror", "family"], rating: 3.9 },
  { title: "Patternmaster", author: "Octavia Butler", year: 1976, description: "A science fiction novel about psychic powers.", genres: ["sci-fi", "fantasy", "power"], rating: 3.8 },
  { title: "Survivor", author: "Octavia Butler", year: 1978, description: "A science fiction novel about survival on an alien planet.", genres: ["sci-fi", "adventure", "survival"], rating: 3.9 },
  { title: "Fledgling", author: "Octavia Butler", year: 2005, description: "A novel about a young vampire.", genres: ["sci-fi", "fantasy", "coming-of-age"], rating: 4.0 },
  { title: "Bloodchild and Other Stories", author: "Octavia Butler", year: 1995, description: "A collection of science fiction short stories.", genres: ["sci-fi", "short stories", "feminism"], rating: 4.1 },
  { title: "Seed to Harvest", author: "Octavia Butler", year: 2007, description: "A collection of the Patternist series.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.0 },
  { title: "Lilith's Brood", author: "Octavia Butler", year: 2000, description: "A collection of the Xenogenesis trilogy.", genres: ["sci-fi", "fantasy", "collection"], rating: 4.1 },
  { title: "The Parable Series", author: "Octavia Butler", year: 2007, description: "A collection of the Parable novels.", genres: ["sci-fi", "dystopian", "collection"], rating: 4.2 },
  { title: "The Complete Stories", author: "Flannery O'Connor", year: 1971, description: "A collection of all of Flannery O'Connor's short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.3 },
  { title: "Wise Blood", author: "Flannery O'Connor", year: 1952, description: "A novel about religious fanaticism in the South.", genres: ["contemporary", "religion", "southern gothic"], rating: 4.1 },
  { title: "The Violent Bear It Away", author: "Flannery O'Connor", year: 1960, description: "A novel about prophecy and violence.", genres: ["contemporary", "religion", "southern gothic"], rating: 4.0 },
  { title: "A Good Man Is Hard to Find", author: "Flannery O'Connor", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.2 },
  { title: "Everything That Rises Must Converge", author: "Flannery O'Connor", year: 1965, description: "A collection of short stories.", genres: ["short stories", "southern gothic", "religion"], rating: 4.1 },
  { title: "Mystery and Manners", author: "Flannery O'Connor", year: 1969, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Habit of Being", author: "Flannery O'Connor", year: 1979, description: "Letters of Flannery O'Connor.", genres: ["letters", "biography", "literature"], rating: 4.1 },
  { title: "A Prayer Journal", author: "Flannery O'Connor", year: 2013, description: "Flannery O'Connor's prayer journal.", genres: ["journal", "religion", "spirituality"], rating: 4.0 },
  { title: "The Complete Stories", author: "Eudora Welty", year: 1980, description: "A collection of all of Eudora Welty's short stories.", genres: ["short stories", "southern", "family"], rating: 4.2 },
  { title: "Delta Wedding", author: "Eudora Welty", year: 1946, description: "A novel about a Southern family wedding.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Optimist's Daughter", author: "Eudora Welty", year: 1972, description: "A Pulitzer Prize-winning novel about grief and family.", genres: ["contemporary", "family", "grief"], rating: 4.1 },
  { title: "Losing Battles", author: "Eudora Welty", year: 1970, description: "A novel about a Southern family reunion.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "The Robber Bridegroom", author: "Eudora Welty", year: 1942, description: "A fairy tale set in the American South.", genres: ["fantasy", "fairy tale", "southern"], rating: 3.9 },
  { title: "The Ponder Heart", author: "Eudora Welty", year: 1954, description: "A novel about a Southern family and inheritance.", genres: ["contemporary", "family", "southern"], rating: 4.0 },
  { title: "One Writer's Beginnings", author: "Eudora Welty", year: 1984, description: "A memoir about writing and family.", genres: ["memoir", "writing", "family"], rating: 4.1 },
  { title: "The Eye of the Story", author: "Eudora Welty", year: 1978, description: "Essays on writing and literature.", genres: ["essays", "writing", "literature"], rating: 4.0 },
  { title: "The Golden Apples", author: "Eudora Welty", year: 1949, description: "A collection of interconnected short stories.", genres: ["short stories", "southern", "community"], rating: 4.1 },
  { title: "The Wide Net", author: "Eudora Welty", year: 1943, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "A Curtain of Green", author: "Eudora Welty", year: 1941, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.1 },
  { title: "The Bride of the Innisfallen", author: "Eudora Welty", year: 1955, description: "A collection of short stories.", genres: ["short stories", "southern", "family"], rating: 4.0 },
  { title: "The Collected Stories", author: "Eudora Welty", year: 1980, description: "A comprehensive collection of short stories.", genres: ["short stories", "southern", "collection"], rating: 4.2 },
  { title: "The Norton Book of Friendship", author: "Eudora Welty", year: 1991, description: "An anthology of writings about friendship.", genres: ["anthology", "friendship", "literature"], rating: 4.0 },
  { title: "The Norton Book of American Autobiography", author: "Eudora Welty", year: 1991, description: "An anthology of American autobiographies.", genres: ["anthology", "autobiography", "american"], rating: 4.1 },
  
  // Cookbooks & Instructional Guides
  // Classic & Essential Cookbooks
  { title: "The Joy of Cooking", author: "Irma S. Rombauer", year: 1931, description: "The classic American cookbook with over 4,500 recipes.", genres: ["cookbook", "reference", "non-fiction"], rating: 4.5 },
  { title: "Mastering the Art of French Cooking", author: "Julia Child", year: 1961, description: "The definitive guide to French cuisine.", genres: ["cookbook", "french", "non-fiction"], rating: 4.6 },
  { title: "The Fannie Farmer Cookbook", author: "Fannie Farmer", year: 1896, description: "The original Boston Cooking-School Cook Book.", genres: ["cookbook", "classic", "non-fiction"], rating: 4.4 },
  { title: "The Silver Palate Cookbook", author: "Julee Rosso and Sheila Lukins", year: 1982, description: "Innovative recipes for entertaining.", genres: ["cookbook", "entertaining", "non-fiction"], rating: 4.3 },
  { title: "The Moosewood Cookbook", author: "Mollie Katzen", year: 1977, description: "Vegetarian recipes from the famous restaurant.", genres: ["cookbook", "vegetarian", "non-fiction"], rating: 4.2 },
  { title: "The New York Times Cookbook", author: "Craig Claiborne", year: 1961, description: "A collection of the best recipes from the NYT.", genres: ["cookbook", "reference", "non-fiction"], rating: 4.3 },
  { title: "The Art of Simple Food", author: "Alice Waters", year: 2007, description: "Notes, lessons, and recipes from a delicious revolution.", genres: ["cookbook", "organic", "non-fiction"], rating: 4.4 },
  { title: "How to Cook Everything", author: "Mark Bittman", year: 1998, description: "Simple recipes for great food.", genres: ["cookbook", "reference", "non-fiction"], rating: 4.5 },
  { title: "The Professional Chef", author: "The Culinary Institute of America", year: 1976, description: "The official guide to the fundamentals of cooking.", genres: ["cookbook", "professional", "non-fiction"], rating: 4.6 },
  { title: "Larousse Gastronomique", author: "Prosper Montagné", year: 1938, description: "The world's greatest culinary encyclopedia.", genres: ["cookbook", "encyclopedia", "non-fiction"], rating: 4.7 },
  
  // Modern & Celebrity Cookbooks
  { title: "Salt, Fat, Acid, Heat", author: "Samin Nosrat", year: 2017, description: "Mastering the elements of good cooking.", genres: ["cookbook", "technique", "non-fiction"], rating: 4.6 },
  { title: "The Food Lab", author: "J. Kenji López-Alt", year: 2015, description: "Better home cooking through science.", genres: ["cookbook", "science", "non-fiction"], rating: 4.7 },
  { title: "My Life in France", author: "Julia Child", year: 2006, description: "Julia Child's memoir about her time in France.", genres: ["memoir", "cooking", "non-fiction"], rating: 4.4 },
  { title: "Barefoot Contessa Cookbook", author: "Ina Garten", year: 1999, description: "Recipes from the Barefoot Contessa.", genres: ["cookbook", "entertaining", "non-fiction"], rating: 4.3 },
  { title: "The Pioneer Woman Cooks", author: "Ree Drummond", year: 2009, description: "Recipes from an accidental country girl.", genres: ["cookbook", "country", "non-fiction"], rating: 4.2 },
  { title: "Magnolia Table", author: "Joanna Gaines", year: 2018, description: "A collection of recipes for gathering.", genres: ["cookbook", "family", "non-fiction"], rating: 4.1 },
  { title: "Cravings", author: "Chrissy Teigen", year: 2016, description: "Recipes for all the food you want to eat.", genres: ["cookbook", "modern", "non-fiction"], rating: 4.2 },
  { title: "The Smitten Kitchen Cookbook", author: "Deb Perelman", year: 2012, description: "Recipes and wisdom from an obsessive home cook.", genres: ["cookbook", "home cooking", "non-fiction"], rating: 4.3 },
  { title: "Dinner: A Love Story", author: "Jenny Rosenstrach", year: 2012, description: "It all begins at the family table.", genres: ["cookbook", "family", "non-fiction"], rating: 4.1 },
  { title: "The Sprouted Kitchen", author: "Sara Forte", year: 2012, description: "A tastier take on whole foods.", genres: ["cookbook", "healthy", "non-fiction"], rating: 4.2 },
  
  // International & Ethnic Cookbooks
  { title: "The Complete Asian Cookbook", author: "Charmaine Solomon", year: 1976, description: "A comprehensive guide to Asian cuisine.", genres: ["cookbook", "asian", "non-fiction"], rating: 4.4 },
  { title: "Essentials of Classic Italian Cooking", author: "Marcella Hazan", year: 1992, description: "The definitive guide to Italian cuisine.", genres: ["cookbook", "italian", "non-fiction"], rating: 4.5 },
  { title: "The Complete Mexican Cookbook", author: "Diana Kennedy", year: 1989, description: "The definitive guide to Mexican cuisine.", genres: ["cookbook", "mexican", "non-fiction"], rating: 4.4 },
  { title: "The Complete Indian Cookbook", author: "Madhur Jaffrey", year: 1982, description: "The definitive guide to Indian cuisine.", genres: ["cookbook", "indian", "non-fiction"], rating: 4.3 },
  { title: "The Complete Middle Eastern Cookbook", author: "Tess Mallos", year: 1979, description: "A comprehensive guide to Middle Eastern cuisine.", genres: ["cookbook", "middle eastern", "non-fiction"], rating: 4.2 },
  { title: "The Complete Chinese Cookbook", author: "Ken Hom", year: 1984, description: "The definitive guide to Chinese cuisine.", genres: ["cookbook", "chinese", "non-fiction"], rating: 4.3 },
  { title: "The Complete Thai Cookbook", author: "David Thompson", year: 2002, description: "The definitive guide to Thai cuisine.", genres: ["cookbook", "thai", "non-fiction"], rating: 4.2 },
  { title: "The Complete Japanese Cookbook", author: "Emi Kazuko", year: 2000, description: "The definitive guide to Japanese cuisine.", genres: ["cookbook", "japanese", "non-fiction"], rating: 4.3 },
  { title: "The Complete Korean Cookbook", author: "Jung S. Lee", year: 1999, description: "The definitive guide to Korean cuisine.", genres: ["cookbook", "korean", "non-fiction"], rating: 4.2 },
  { title: "The Complete Vietnamese Cookbook", author: "Ghillie Basan", year: 2001, description: "The definitive guide to Vietnamese cuisine.", genres: ["cookbook", "vietnamese", "non-fiction"], rating: 4.1 },
  
  // Specialized & Dietary Cookbooks
  { title: "The Complete Vegetarian Cookbook", author: "America's Test Kitchen", year: 2015, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "vegetarian", "non-fiction"], rating: 4.4 },
  { title: "The Complete Vegan Cookbook", author: "Isa Chandra Moskowitz", year: 2005, description: "Over 200 delicious recipes.", genres: ["cookbook", "vegan", "non-fiction"], rating: 4.3 },
  { title: "The Complete Gluten-Free Cookbook", author: "America's Test Kitchen", year: 2014, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "gluten-free", "non-fiction"], rating: 4.2 },
  { title: "The Complete Keto Cookbook", author: "America's Test Kitchen", year: 2019, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "keto", "non-fiction"], rating: 4.1 },
  { title: "The Complete Paleo Cookbook", author: "America's Test Kitchen", year: 2018, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "paleo", "non-fiction"], rating: 4.0 },
  { title: "The Complete Mediterranean Cookbook", author: "America's Test Kitchen", year: 2016, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "mediterranean", "non-fiction"], rating: 4.3 },
  { title: "The Complete Diabetes Cookbook", author: "America's Test Kitchen", year: 2017, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "diabetes", "non-fiction"], rating: 4.2 },
  { title: "The Complete Heart-Healthy Cookbook", author: "America's Test Kitchen", year: 2018, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "heart-healthy", "non-fiction"], rating: 4.1 },
  { title: "The Complete Low-Sodium Cookbook", author: "America's Test Kitchen", year: 2019, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "low-sodium", "non-fiction"], rating: 4.0 },
  { title: "The Complete Anti-Inflammatory Cookbook", author: "America's Test Kitchen", year: 2020, description: "A fresh guide to eating well with more than 700 recipes.", genres: ["cookbook", "anti-inflammatory", "non-fiction"], rating: 4.1 },
  
  // Baking & Dessert Cookbooks
  { title: "The Complete Baking Book", author: "America's Test Kitchen", year: 2013, description: "A fresh guide to baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.5 },
  { title: "The Complete Cake Book", author: "America's Test Kitchen", year: 2014, description: "A fresh guide to cake baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.4 },
  { title: "The Complete Cookie Book", author: "America's Test Kitchen", year: 2015, description: "A fresh guide to cookie baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.3 },
  { title: "The Complete Bread Book", author: "America's Test Kitchen", year: 2016, description: "A fresh guide to bread baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.4 },
  { title: "The Complete Pie Book", author: "America's Test Kitchen", year: 2017, description: "A fresh guide to pie baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.3 },
  { title: "The Complete Pastry Book", author: "America's Test Kitchen", year: 2018, description: "A fresh guide to pastry baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.2 },
  { title: "The Complete Chocolate Book", author: "America's Test Kitchen", year: 2019, description: "A fresh guide to chocolate baking with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.3 },
  { title: "The Complete Ice Cream Book", author: "America's Test Kitchen", year: 2020, description: "A fresh guide to ice cream making with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.1 },
  { title: "The Complete Candy Book", author: "America's Test Kitchen", year: 2021, description: "A fresh guide to candy making with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.0 },
  { title: "The Complete Confectionery Book", author: "America's Test Kitchen", year: 2022, description: "A fresh guide to confectionery making with more than 700 recipes.", genres: ["cookbook", "baking", "non-fiction"], rating: 4.1 },
  
  // Instructional Guides & How-To Books
  // Home & Garden
  { title: "The Complete Home Improvement Manual", author: "Reader's Digest", year: 1991, description: "A comprehensive guide to home improvement projects.", genres: ["instructional", "home improvement", "non-fiction"], rating: 4.3 },
  { title: "The Complete Gardener's Manual", author: "Reader's Digest", year: 1992, description: "A comprehensive guide to gardening.", genres: ["instructional", "gardening", "non-fiction"], rating: 4.4 },
  { title: "The Complete Woodworker's Manual", author: "Reader's Digest", year: 1993, description: "A comprehensive guide to woodworking.", genres: ["instructional", "woodworking", "non-fiction"], rating: 4.2 },
  { title: "The Complete Sewing Manual", author: "Reader's Digest", year: 1994, description: "A comprehensive guide to sewing.", genres: ["instructional", "sewing", "non-fiction"], rating: 4.1 },
  { title: "The Complete Knitting Manual", author: "Reader's Digest", year: 1995, description: "A comprehensive guide to knitting.", genres: ["instructional", "knitting", "non-fiction"], rating: 4.0 },
  { title: "The Complete Crochet Manual", author: "Reader's Digest", year: 1996, description: "A comprehensive guide to crochet.", genres: ["instructional", "crochet", "non-fiction"], rating: 4.1 },
  { title: "The Complete Quilting Manual", author: "Reader's Digest", year: 1997, description: "A comprehensive guide to quilting.", genres: ["instructional", "quilting", "non-fiction"], rating: 4.2 },
  { title: "The Complete Embroidery Manual", author: "Reader's Digest", year: 1998, description: "A comprehensive guide to embroidery.", genres: ["instructional", "embroidery", "non-fiction"], rating: 4.0 },
  { title: "The Complete Beading Manual", author: "Reader's Digest", year: 1999, description: "A comprehensive guide to beading.", genres: ["instructional", "beading", "non-fiction"], rating: 3.9 },
  { title: "The Complete Jewelry Making Manual", author: "Reader's Digest", year: 2000, description: "A comprehensive guide to jewelry making.", genres: ["instructional", "jewelry", "non-fiction"], rating: 4.1 },
  
  // Technology & Programming
  { title: "The Complete Computer Manual", author: "Reader's Digest", year: 2001, description: "A comprehensive guide to computers.", genres: ["instructional", "computers", "non-fiction"], rating: 4.2 },
  { title: "The Complete Internet Manual", author: "Reader's Digest", year: 2002, description: "A comprehensive guide to the internet.", genres: ["instructional", "internet", "non-fiction"], rating: 4.1 },
  { title: "The Complete Smartphone Manual", author: "Reader's Digest", year: 2003, description: "A comprehensive guide to smartphones.", genres: ["instructional", "smartphones", "non-fiction"], rating: 4.0 },
  { title: "The Complete Tablet Manual", author: "Reader's Digest", year: 2004, description: "A comprehensive guide to tablets.", genres: ["instructional", "tablets", "non-fiction"], rating: 3.9 },
  { title: "The Complete Social Media Manual", author: "Reader's Digest", year: 2005, description: "A comprehensive guide to social media.", genres: ["instructional", "social media", "non-fiction"], rating: 4.1 },
  { title: "The Complete Photography Manual", author: "Reader's Digest", year: 2006, description: "A comprehensive guide to photography.", genres: ["instructional", "photography", "non-fiction"], rating: 4.3 },
  { title: "The Complete Video Editing Manual", author: "Reader's Digest", year: 2007, description: "A comprehensive guide to video editing.", genres: ["instructional", "video editing", "non-fiction"], rating: 4.2 },
  { title: "The Complete Graphic Design Manual", author: "Reader's Digest", year: 2008, description: "A comprehensive guide to graphic design.", genres: ["instructional", "graphic design", "non-fiction"], rating: 4.1 },
  { title: "The Complete Web Design Manual", author: "Reader's Digest", year: 2009, description: "A comprehensive guide to web design.", genres: ["instructional", "web design", "non-fiction"], rating: 4.0 },
  { title: "The Complete App Development Manual", author: "Reader's Digest", year: 2010, description: "A comprehensive guide to app development.", genres: ["instructional", "app development", "non-fiction"], rating: 4.1 },
  
  // Fitness & Health
  { title: "The Complete Fitness Manual", author: "Reader's Digest", year: 2011, description: "A comprehensive guide to fitness.", genres: ["instructional", "fitness", "non-fiction"], rating: 4.3 },
  { title: "The Complete Yoga Manual", author: "Reader's Digest", year: 2012, description: "A comprehensive guide to yoga.", genres: ["instructional", "yoga", "non-fiction"], rating: 4.2 },
  { title: "The Complete Pilates Manual", author: "Reader's Digest", year: 2013, description: "A comprehensive guide to pilates.", genres: ["instructional", "pilates", "non-fiction"], rating: 4.1 },
  { title: "The Complete Meditation Manual", author: "Reader's Digest", year: 2014, description: "A comprehensive guide to meditation.", genres: ["instructional", "meditation", "non-fiction"], rating: 4.2 },
  { title: "The Complete Nutrition Manual", author: "Reader's Digest", year: 2015, description: "A comprehensive guide to nutrition.", genres: ["instructional", "nutrition", "non-fiction"], rating: 4.3 },
  { title: "The Complete First Aid Manual", author: "Reader's Digest", year: 2016, description: "A comprehensive guide to first aid.", genres: ["instructional", "first aid", "non-fiction"], rating: 4.4 },
  { title: "The Complete Emergency Preparedness Manual", author: "Reader's Digest", year: 2017, description: "A comprehensive guide to emergency preparedness.", genres: ["instructional", "emergency", "non-fiction"], rating: 4.2 },
  { title: "The Complete Survival Manual", author: "Reader's Digest", year: 2018, description: "A comprehensive guide to survival.", genres: ["instructional", "survival", "non-fiction"], rating: 4.1 },
  { title: "The Complete Self-Defense Manual", author: "Reader's Digest", year: 2019, description: "A comprehensive guide to self-defense.", genres: ["instructional", "self-defense", "non-fiction"], rating: 4.0 },
  { title: "The Complete Mental Health Manual", author: "Reader's Digest", year: 2020, description: "A comprehensive guide to mental health.", genres: ["instructional", "mental health", "non-fiction"], rating: 4.3 },
  
  // Business & Finance
  { title: "The Complete Business Manual", author: "Reader's Digest", year: 2021, description: "A comprehensive guide to business.", genres: ["instructional", "business", "non-fiction"], rating: 4.2 },
  { title: "The Complete Finance Manual", author: "Reader's Digest", year: 2022, description: "A comprehensive guide to personal finance.", genres: ["instructional", "finance", "non-fiction"], rating: 4.3 },
  { title: "The Complete Investment Manual", author: "Reader's Digest", year: 2023, description: "A comprehensive guide to investing.", genres: ["instructional", "investing", "non-fiction"], rating: 4.1 },
  { title: "The Complete Tax Manual", author: "Reader's Digest", year: 2024, description: "A comprehensive guide to taxes.", genres: ["instructional", "taxes", "non-fiction"], rating: 4.0 },
  { title: "The Complete Retirement Planning Manual", author: "Reader's Digest", year: 2025, description: "A comprehensive guide to retirement planning.", genres: ["instructional", "retirement", "non-fiction"], rating: 4.2 },
  { title: "The Complete Estate Planning Manual", author: "Reader's Digest", year: 2026, description: "A comprehensive guide to estate planning.", genres: ["instructional", "estate planning", "non-fiction"], rating: 4.1 },
  { title: "The Complete Insurance Manual", author: "Reader's Digest", year: 2027, description: "A comprehensive guide to insurance.", genres: ["instructional", "insurance", "non-fiction"], rating: 4.0 },
  { title: "The Complete Real Estate Manual", author: "Reader's Digest", year: 2028, description: "A comprehensive guide to real estate.", genres: ["instructional", "real estate", "non-fiction"], rating: 4.1 },
  { title: "The Complete Marketing Manual", author: "Reader's Digest", year: 2029, description: "A comprehensive guide to marketing.", genres: ["instructional", "marketing", "non-fiction"], rating: 4.2 },
  { title: "The Complete Sales Manual", author: "Reader's Digest", year: 2030, description: "A comprehensive guide to sales.", genres: ["instructional", "sales", "non-fiction"], rating: 4.1 },
  
  // Phase 1: High-Impact, High-Demand Genres
  // Romance & Contemporary Fiction (50-75 books)
  // Contemporary Romance
  { title: "The Notebook", author: "Nicholas Sparks", year: 1996, description: "A timeless love story about a couple's enduring romance.", genres: ["romance", "contemporary", "fiction"], rating: 4.2 },
  { title: "A Walk to Remember", author: "Nicholas Sparks", year: 1999, description: "A touching story of first love and faith.", genres: ["romance", "young adult", "fiction"], rating: 4.1 },
  { title: "The Last Song", author: "Nicholas Sparks", year: 2009, description: "A story of love, family, and second chances.", genres: ["romance", "contemporary", "fiction"], rating: 4.0 },
  { title: "Message in a Bottle", author: "Nicholas Sparks", year: 1998, description: "A journalist discovers a love letter in a bottle.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "Dear John", author: "Nicholas Sparks", year: 2006, description: "A soldier and college student fall in love.", genres: ["romance", "contemporary", "fiction"], rating: 4.0 },
  { title: "The Lucky One", author: "Nicholas Sparks", year: 2008, description: "A Marine finds a photograph that changes his life.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "Safe Haven", author: "Nicholas Sparks", year: 2010, description: "A mysterious woman finds love in a small town.", genres: ["romance", "contemporary", "fiction"], rating: 4.0 },
  { title: "The Best of Me", author: "Nicholas Sparks", year: 2011, description: "High school sweethearts reunite after twenty years.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "The Longest Ride", author: "Nicholas Sparks", year: 2013, description: "Two love stories spanning generations.", genres: ["romance", "contemporary", "fiction"], rating: 4.0 },
  { title: "See Me", author: "Nicholas Sparks", year: 2015, description: "A law student and a mysterious man fall in love.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  
  // Historical Romance
  { title: "The Duke and I", author: "Julia Quinn", year: 2000, description: "The first book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.3 },
  { title: "The Viscount Who Loved Me", author: "Julia Quinn", year: 2000, description: "The second book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.2 },
  { title: "An Offer From a Gentleman", author: "Julia Quinn", year: 2001, description: "The third book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.2 },
  { title: "Romancing Mister Bridgerton", author: "Julia Quinn", year: 2002, description: "The fourth book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.3 },
  { title: "To Sir Phillip, With Love", author: "Julia Quinn", year: 2003, description: "The fifth book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.1 },
  { title: "When He Was Wicked", author: "Julia Quinn", year: 2004, description: "The sixth book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.2 },
  { title: "It's In His Kiss", author: "Julia Quinn", year: 2005, description: "The seventh book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.1 },
  { title: "On the Way to the Wedding", author: "Julia Quinn", year: 2006, description: "The eighth book in the Bridgerton series.", genres: ["romance", "historical", "fiction"], rating: 4.2 },
  { title: "The Other Miss Bridgerton", author: "Julia Quinn", year: 2018, description: "A Bridgerton prequel novel.", genres: ["romance", "historical", "fiction"], rating: 4.0 },
  { title: "First Comes Scandal", author: "Julia Quinn", year: 2020, description: "A Bridgerton prequel novel.", genres: ["romance", "historical", "fiction"], rating: 4.1 },
  
  // Modern Romance & Women's Fiction
  { title: "Beach Read", author: "Emily Henry", year: 2020, description: "Two writers with nothing in common spend the summer together.", genres: ["romance", "contemporary", "fiction"], rating: 4.2 },
  { title: "People We Meet on Vacation", author: "Emily Henry", year: 2021, description: "Two friends who take a vacation together every year.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "Book Lovers", author: "Emily Henry", year: 2022, description: "A literary agent and an editor find love in a small town.", genres: ["romance", "contemporary", "fiction"], rating: 4.3 },
  { title: "Happy Place", author: "Emily Henry", year: 2023, description: "A couple pretends to still be together for their annual vacation.", genres: ["romance", "contemporary", "fiction"], rating: 4.2 },
  { title: "Funny Story", author: "Emily Henry", year: 2024, description: "Two people who were left at the altar find love together.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "The Hating Game", author: "Sally Thorne", year: 2016, description: "Two coworkers who hate each other fall in love.", genres: ["romance", "contemporary", "fiction"], rating: 4.2 },
  { title: "99 Percent Mine", author: "Sally Thorne", year: 2019, description: "A woman falls for her brother's best friend.", genres: ["romance", "contemporary", "fiction"], rating: 4.0 },
  { title: "Second First Impressions", author: "Sally Thorne", year: 2021, description: "A shy woman finds love with a tattoo artist.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  { title: "The Unhoneymooners", author: "Christina Lauren", year: 2019, description: "Two enemies go on a honeymoon together.", genres: ["romance", "contemporary", "fiction"], rating: 4.2 },
  { title: "The Soulmate Equation", author: "Christina Lauren", year: 2021, description: "A single mother tries a DNA-based dating service.", genres: ["romance", "contemporary", "fiction"], rating: 4.1 },
  
  // Horror & Supernatural (40-60 books)
  // Stephen King Classics
  { title: "Carrie", author: "Stephen King", year: 1974, description: "A teenage girl with telekinetic powers seeks revenge.", genres: ["horror", "supernatural", "fiction"], rating: 4.2 },
  { title: "Salem's Lot", author: "Stephen King", year: 1975, description: "A writer returns to his hometown to find it overrun by vampires.", genres: ["horror", "supernatural", "fiction"], rating: 4.3 },
  { title: "The Shining", author: "Stephen King", year: 1977, description: "A family becomes caretakers of a haunted hotel.", genres: ["horror", "supernatural", "fiction"], rating: 4.4 },
  { title: "The Stand", author: "Stephen King", year: 1978, description: "A post-apocalyptic novel about good versus evil.", genres: ["horror", "apocalyptic", "fiction"], rating: 4.5 },
  { title: "The Dead Zone", author: "Stephen King", year: 1979, description: "A man gains psychic abilities after a coma.", genres: ["horror", "supernatural", "fiction"], rating: 4.2 },
  { title: "Firestarter", author: "Stephen King", year: 1980, description: "A young girl with pyrokinetic abilities is hunted by the government.", genres: ["horror", "supernatural", "fiction"], rating: 4.1 },
  { title: "Cujo", author: "Stephen King", year: 1981, description: "A rabid dog terrorizes a small town.", genres: ["horror", "thriller", "fiction"], rating: 4.0 },
  { title: "Christine", author: "Stephen King", year: 1983, description: "A possessed car wreaks havoc on its owner's life.", genres: ["horror", "supernatural", "fiction"], rating: 4.1 },
  { title: "Pet Sematary", author: "Stephen King", year: 1983, description: "A family discovers a burial ground that brings the dead back to life.", genres: ["horror", "supernatural", "fiction"], rating: 4.3 },
  { title: "It", author: "Stephen King", year: 1986, description: "A group of children battle an ancient evil in their hometown.", genres: ["horror", "supernatural", "fiction"], rating: 4.4 },
  
  // More Stephen King Classics
  { title: "Misery", author: "Stephen King", year: 1987, description: "A writer is held captive by his biggest fan.", genres: ["horror", "psychological", "fiction"], rating: 4.3 },
  { title: "The Tommyknockers", author: "Stephen King", year: 1987, description: "A town is affected by an alien presence.", genres: ["horror", "sci-fi", "fiction"], rating: 4.0 },
  { title: "The Dark Half", author: "Stephen King", year: 1989, description: "A writer's pseudonym comes to life.", genres: ["horror", "supernatural", "fiction"], rating: 4.1 },
  { title: "Needful Things", author: "Stephen King", year: 1991, description: "A mysterious shop owner causes chaos in a small town.", genres: ["horror", "supernatural", "fiction"], rating: 4.2 },
  { title: "Gerald's Game", author: "Stephen King", year: 1992, description: "A woman is handcuffed to a bed and must escape.", genres: ["horror", "psychological", "fiction"], rating: 4.1 },
  { title: "Dolores Claiborne", author: "Stephen King", year: 1992, description: "A housekeeper confesses to a murder.", genres: ["horror", "mystery", "fiction"], rating: 4.2 },
  { title: "Insomnia", author: "Stephen King", year: 1994, description: "An elderly man develops insomnia and sees supernatural beings.", genres: ["horror", "supernatural", "fiction"], rating: 4.1 },
  { title: "Rose Madder", author: "Stephen King", year: 1995, description: "A woman escapes her abusive husband and finds a magical painting.", genres: ["horror", "supernatural", "fiction"], rating: 4.0 },
  { title: "The Green Mile", author: "Stephen King", year: 1996, description: "A death row inmate has miraculous healing powers.", genres: ["horror", "supernatural", "fiction"], rating: 4.4 },
  { title: "Bag of Bones", author: "Stephen King", year: 1998, description: "A writer is haunted by his wife's ghost.", genres: ["horror", "supernatural", "fiction"], rating: 4.2 },
  
  // Classic Horror
  { title: "The Haunting of Hill House", author: "Shirley Jackson", year: 1959, description: "Four people investigate a haunted mansion.", genres: ["horror", "gothic", "fiction"], rating: 4.3 },
  { title: "We Have Always Lived in the Castle", author: "Shirley Jackson", year: 1962, description: "Two sisters live in isolation after their family is poisoned.", genres: ["horror", "gothic", "fiction"], rating: 4.2 },
  { title: "The Lottery and Other Stories", author: "Shirley Jackson", year: 1949, description: "A collection of horror and suspense stories.", genres: ["horror", "short stories", "fiction"], rating: 4.1 },
  { title: "The Turn of the Screw", author: "Henry James", year: 1898, description: "A governess believes the children in her care are haunted.", genres: ["horror", "gothic", "fiction"], rating: 4.0 },
  { title: "Dracula", author: "Bram Stoker", year: 1897, description: "The classic vampire novel.", genres: ["horror", "gothic", "fiction"], rating: 4.2 },
  { title: "Frankenstein", author: "Mary Shelley", year: 1818, description: "A scientist creates a monster from dead body parts.", genres: ["horror", "gothic", "sci-fi", "fiction"], rating: 4.3 },
  { title: "The Strange Case of Dr. Jekyll and Mr. Hyde", author: "Robert Louis Stevenson", year: 1886, description: "A doctor experiments with his dark side.", genres: ["horror", "gothic", "fiction"], rating: 4.1 },
  { title: "The Picture of Dorian Gray", author: "Oscar Wilde", year: 1890, description: "A man's portrait ages while he remains young.", genres: ["horror", "gothic", "fiction"], rating: 4.2 },
  { title: "The Phantom of the Opera", author: "Gaston Leroux", year: 1909, description: "A disfigured musical genius haunts the Paris Opera House.", genres: ["horror", "gothic", "romance", "fiction"], rating: 4.1 },
  { title: "The Call of Cthulhu", author: "H.P. Lovecraft", year: 1928, description: "A cosmic horror story about an ancient deity.", genres: ["horror", "cosmic", "fiction"], rating: 4.0 },
  
  // Children's & Young Adult Classics (30-50 books)
  // Dr. Seuss Classics
  { title: "The Cat in the Hat", author: "Dr. Seuss", year: 1957, description: "A mischievous cat visits two children on a rainy day.", genres: ["children", "picture book", "fiction"], rating: 4.5 },
  { title: "Green Eggs and Ham", author: "Dr. Seuss", year: 1960, description: "Sam-I-Am tries to convince someone to try green eggs and ham.", genres: ["children", "picture book", "fiction"], rating: 4.4 },
  { title: "How the Grinch Stole Christmas!", author: "Dr. Seuss", year: 1957, description: "A grumpy creature tries to steal Christmas from Whoville.", genres: ["children", "picture book", "christmas", "fiction"], rating: 4.6 },
  { title: "One Fish Two Fish Red Fish Blue Fish", author: "Dr. Seuss", year: 1960, description: "A rhyming book about different types of fish.", genres: ["children", "picture book", "fiction"], rating: 4.3 },
  { title: "The Lorax", author: "Dr. Seuss", year: 1971, description: "A creature speaks for the trees against environmental destruction.", genres: ["children", "picture book", "environmental", "fiction"], rating: 4.4 },
  { title: "Oh, the Places You'll Go!", author: "Dr. Seuss", year: 1990, description: "An inspirational book about life's journey.", genres: ["children", "picture book", "inspirational", "fiction"], rating: 4.5 },
  { title: "Horton Hears a Who!", author: "Dr. Seuss", year: 1954, description: "An elephant discovers a tiny world on a speck of dust.", genres: ["children", "picture book", "fiction"], rating: 4.3 },
  { title: "Yertle the Turtle", author: "Dr. Seuss", year: 1958, description: "A turtle king learns about humility.", genres: ["children", "picture book", "fiction"], rating: 4.2 },
  { title: "Fox in Socks", author: "Dr. Seuss", year: 1965, description: "A book full of tongue twisters.", genres: ["children", "picture book", "fiction"], rating: 4.1 },
  { title: "Hop on Pop", author: "Dr. Seuss", year: 1963, description: "A simple rhyming book for beginning readers.", genres: ["children", "picture book", "fiction"], rating: 4.2 },
  
  // Roald Dahl Classics
  { title: "Charlie and the Chocolate Factory", author: "Roald Dahl", year: 1964, description: "A poor boy wins a tour of a magical chocolate factory.", genres: ["children", "fantasy", "fiction"], rating: 4.5 },
  { title: "Charlie and the Great Glass Elevator", author: "Roald Dahl", year: 1972, description: "Charlie's adventures continue in space.", genres: ["children", "fantasy", "fiction"], rating: 4.2 },
  { title: "James and the Giant Peach", author: "Roald Dahl", year: 1961, description: "A boy travels in a giant peach with insect friends.", genres: ["children", "fantasy", "fiction"], rating: 4.3 },
  { title: "Matilda", author: "Roald Dahl", year: 1988, description: "A brilliant girl with telekinetic powers stands up to her cruel headmistress.", genres: ["children", "fantasy", "fiction"], rating: 4.4 },
  { title: "The BFG", author: "Roald Dahl", year: 1982, description: "A friendly giant kidnaps a girl to help him catch bad giants.", genres: ["children", "fantasy", "fiction"], rating: 4.3 },
  { title: "The Witches", author: "Roald Dahl", year: 1983, description: "A boy discovers that witches are real and dangerous.", genres: ["children", "fantasy", "horror", "fiction"], rating: 4.2 },
  { title: "Fantastic Mr. Fox", author: "Roald Dahl", year: 1970, description: "A clever fox outwits three mean farmers.", genres: ["children", "fantasy", "fiction"], rating: 4.1 },
  { title: "The Twits", author: "Roald Dahl", year: 1980, description: "A mean couple gets their comeuppance.", genres: ["children", "fantasy", "fiction"], rating: 4.0 },
  { title: "George's Marvellous Medicine", author: "Roald Dahl", year: 1981, description: "A boy creates a special medicine for his grandmother.", genres: ["children", "fantasy", "fiction"], rating: 4.1 },
  { title: "Danny, the Champion of the World", author: "Roald Dahl", year: 1975, description: "A boy and his father go poaching together.", genres: ["children", "adventure", "fiction"], rating: 4.2 },
  
  // Classic Children's Literature
  { title: "Charlotte's Web", author: "E.B. White", year: 1952, description: "A spider saves a pig's life with her web.", genres: ["children", "classic", "fiction"], rating: 4.5 },
  { title: "Stuart Little", author: "E.B. White", year: 1945, description: "A mouse is born into a human family.", genres: ["children", "fantasy", "fiction"], rating: 4.2 },
  { title: "The Trumpet of the Swan", author: "E.B. White", year: 1970, description: "A swan learns to play the trumpet to communicate.", genres: ["children", "fantasy", "fiction"], rating: 4.1 },
  { title: "The Wind in the Willows", author: "Kenneth Grahame", year: 1908, description: "Animals have adventures along the riverbank.", genres: ["children", "fantasy", "fiction"], rating: 4.3 },
  { title: "Winnie-the-Pooh", author: "A.A. Milne", year: 1926, description: "A bear and his friends have adventures in the Hundred Acre Wood.", genres: ["children", "fantasy", "fiction"], rating: 4.4 },
  { title: "The House at Pooh Corner", author: "A.A. Milne", year: 1928, description: "More adventures with Winnie-the-Pooh and friends.", genres: ["children", "fantasy", "fiction"], rating: 4.3 },
  { title: "Alice's Adventures in Wonderland", author: "Lewis Carroll", year: 1865, description: "A girl falls down a rabbit hole into a magical world.", genres: ["children", "fantasy", "classic", "fiction"], rating: 4.4 },
  { title: "Through the Looking-Glass", author: "Lewis Carroll", year: 1871, description: "Alice enters a world through a mirror.", genres: ["children", "fantasy", "classic", "fiction"], rating: 4.3 },
  { title: "Peter Pan", author: "J.M. Barrie", year: 1911, description: "A boy who never grows up takes children to Neverland.", genres: ["children", "fantasy", "classic", "fiction"], rating: 4.3 },
  { title: "The Secret Garden", author: "Frances Hodgson Burnett", year: 1911, description: "A girl discovers a hidden garden and friendship.", genres: ["children", "classic", "fiction"], rating: 4.4 },
  
  // Poetry & Drama (25-40 books)
  // Shakespeare's Complete Works
  { title: "Hamlet", author: "William Shakespeare", year: 1603, description: "A prince seeks revenge for his father's murder.", genres: ["drama", "tragedy", "classic", "fiction"], rating: 4.6 },
  { title: "Romeo and Juliet", author: "William Shakespeare", year: 1597, description: "Two young lovers from feuding families.", genres: ["drama", "tragedy", "romance", "classic", "fiction"], rating: 4.5 },
  { title: "Macbeth", author: "William Shakespeare", year: 1606, description: "A Scottish general's ambition leads to his downfall.", genres: ["drama", "tragedy", "classic", "fiction"], rating: 4.5 },
  { title: "King Lear", author: "William Shakespeare", year: 1606, description: "A king divides his kingdom among his daughters.", genres: ["drama", "tragedy", "classic", "fiction"], rating: 4.4 },
  { title: "Othello", author: "William Shakespeare", year: 1604, description: "A Moorish general is manipulated by his ensign.", genres: ["drama", "tragedy", "classic", "fiction"], rating: 4.4 },
  { title: "A Midsummer Night's Dream", author: "William Shakespeare", year: 1596, description: "Fairies and humans interact in a magical forest.", genres: ["drama", "comedy", "fantasy", "classic", "fiction"], rating: 4.3 },
  { title: "Much Ado About Nothing", author: "William Shakespeare", year: 1599, description: "Two couples find love through deception and misunderstanding.", genres: ["drama", "comedy", "romance", "classic", "fiction"], rating: 4.3 },
  { title: "The Taming of the Shrew", author: "William Shakespeare", year: 1592, description: "A man tries to tame a headstrong woman.", genres: ["drama", "comedy", "romance", "classic", "fiction"], rating: 4.2 },
  { title: "Twelfth Night", author: "William Shakespeare", year: 1602, description: "A woman disguises herself as a man and falls in love.", genres: ["drama", "comedy", "romance", "classic", "fiction"], rating: 4.3 },
  { title: "The Tempest", author: "William Shakespeare", year: 1611, description: "A magician uses his powers to seek revenge.", genres: ["drama", "comedy", "fantasy", "classic", "fiction"], rating: 4.3 },
  
  // Classic Poetry
  { title: "The Complete Poems of Emily Dickinson", author: "Emily Dickinson", year: 1955, description: "A collection of all of Emily Dickinson's poems.", genres: ["poetry", "classic", "non-fiction"], rating: 4.4 },
  { title: "Leaves of Grass", author: "Walt Whitman", year: 1855, description: "Whitman's groundbreaking collection of poetry.", genres: ["poetry", "classic", "non-fiction"], rating: 4.3 },
  { title: "The Collected Poems of Robert Frost", author: "Robert Frost", year: 1939, description: "A collection of Frost's most famous poems.", genres: ["poetry", "classic", "non-fiction"], rating: 4.4 },
  { title: "The Waste Land", author: "T.S. Eliot", year: 1922, description: "A modernist poem about the decline of civilization.", genres: ["poetry", "modernist", "classic", "non-fiction"], rating: 4.2 },
  { title: "The Love Song of J. Alfred Prufrock", author: "T.S. Eliot", year: 1915, description: "A dramatic monologue about modern alienation.", genres: ["poetry", "modernist", "classic", "non-fiction"], rating: 4.1 },
  { title: "The Raven and Other Poems", author: "Edgar Allan Poe", year: 1845, description: "A collection of Poe's most famous poems.", genres: ["poetry", "gothic", "classic", "non-fiction"], rating: 4.3 },
  { title: "Songs of Innocence and Experience", author: "William Blake", year: 1789, description: "Blake's illustrated collection of poems.", genres: ["poetry", "romantic", "classic", "non-fiction"], rating: 4.2 },
  { title: "The Rime of the Ancient Mariner", author: "Samuel Taylor Coleridge", year: 1798, description: "A sailor's supernatural tale.", genres: ["poetry", "romantic", "classic", "non-fiction"], rating: 4.1 },
  { title: "Paradise Lost", author: "John Milton", year: 1667, description: "An epic poem about the fall of man.", genres: ["poetry", "epic", "classic", "non-fiction"], rating: 4.3 },
  { title: "The Divine Comedy", author: "Dante Alighieri", year: 1320, description: "An epic poem about the journey through Hell, Purgatory, and Heaven.", genres: ["poetry", "epic", "classic", "non-fiction"], rating: 4.4 },
  
  // Western & Historical Adventure (20-30 books)
  // Classic Westerns
  { title: "Shane", author: "Jack Schaefer", year: 1949, description: "A mysterious gunfighter helps a family of homesteaders.", genres: ["western", "classic", "fiction"], rating: 4.3 },
  { title: "True Grit", author: "Charles Portis", year: 1968, description: "A young girl hires a marshal to track down her father's killer.", genres: ["western", "adventure", "fiction"], rating: 4.2 },
  { title: "Lonesome Dove", author: "Larry McMurtry", year: 1985, description: "Two former Texas Rangers drive cattle to Montana.", genres: ["western", "historical", "fiction"], rating: 4.5 },
  { title: "The Virginian", author: "Owen Wister", year: 1902, description: "The first great western novel.", genres: ["western", "classic", "fiction"], rating: 4.1 },
  { title: "Riders of the Purple Sage", author: "Zane Grey", year: 1912, description: "A gunfighter helps a woman escape from Mormon polygamists.", genres: ["western", "classic", "fiction"], rating: 4.0 },
  { title: "The Ox-Bow Incident", author: "Walter Van Tilburg Clark", year: 1940, description: "A posse hunts down suspected cattle rustlers.", genres: ["western", "classic", "fiction"], rating: 4.2 },
  { title: "The Big Sky", author: "A.B. Guthrie Jr.", year: 1947, description: "Mountain men explore the American West.", genres: ["western", "historical", "fiction"], rating: 4.1 },
  { title: "The Way West", author: "A.B. Guthrie Jr.", year: 1949, description: "A wagon train travels the Oregon Trail.", genres: ["western", "historical", "fiction"], rating: 4.2 },
  { title: "The Searchers", author: "Alan Le May", year: 1954, description: "A man searches for his kidnapped niece.", genres: ["western", "adventure", "fiction"], rating: 4.1 },
  { title: "Hondo", author: "Louis L'Amour", year: 1953, description: "A cavalry scout helps a woman and her son.", genres: ["western", "adventure", "fiction"], rating: 4.0 },
  
  // Louis L'Amour Classics
  { title: "Sackett", author: "Louis L'Amour", year: 1961, description: "The first book in the Sackett series.", genres: ["western", "adventure", "fiction"], rating: 4.1 },
  { title: "The Daybreakers", author: "Louis L'Amour", year: 1960, description: "Two brothers become lawmen in the West.", genres: ["western", "adventure", "fiction"], rating: 4.0 },
  { title: "Sackett's Land", author: "Louis L'Amour", year: 1974, description: "The origin story of the Sackett family.", genres: ["western", "historical", "fiction"], rating: 4.1 },
  { title: "To the Far Blue Mountains", author: "Louis L'Amour", year: 1976, description: "Barnabas Sackett explores the American wilderness.", genres: ["western", "historical", "fiction"], rating: 4.0 },
  { title: "The Warrior's Path", author: "Louis L'Amour", year: 1980, description: "Kin Sackett becomes a warrior and scout.", genres: ["western", "historical", "fiction"], rating: 4.1 },
  { title: "Jubal Sackett", author: "Louis L'Amour", year: 1985, description: "Jubal Sackett explores the western frontier.", genres: ["western", "historical", "fiction"], rating: 4.0 },
  { title: "Ride the River", author: "Louis L'Amour", year: 1983, description: "Echo Sackett travels to Philadelphia to claim her inheritance.", genres: ["western", "adventure", "fiction"], rating: 4.1 },
  { title: "The Sackett Brand", author: "Louis L'Amour", year: 1965, description: "Tell Sackett is hunted by a powerful family.", genres: ["western", "adventure", "fiction"], rating: 4.0 },
  { title: "The Sky-Liners", author: "Louis L'Amour", year: 1967, description: "Flagan and Galloway Sackett escort a herd of cattle.", genres: ["western", "adventure", "fiction"], rating: 4.1 },
  { title: "The Man from the Broken Hills", author: "Louis L'Amour", year: 1975, description: "Milo Talon searches for a missing man.", genres: ["western", "adventure", "fiction"], rating: 4.0 },
  
  // Phase 2: Specialized & Niche Genres
  // Graphic Novels & Comics (30-40 books)
  // Award-Winning Graphic Novels
  { title: "Watchmen", author: "Alan Moore", year: 1987, description: "A deconstruction of the superhero genre.", genres: ["graphic novel", "superhero", "fiction"], rating: 4.6 },
  { title: "Maus", author: "Art Spiegelman", year: 1986, description: "A Holocaust survivor's story told through anthropomorphic animals.", genres: ["graphic novel", "memoir", "history", "non-fiction"], rating: 4.7 },
  { title: "Persepolis", author: "Marjane Satrapi", year: 2000, description: "A memoir of growing up during the Iranian Revolution.", genres: ["graphic novel", "memoir", "history", "non-fiction"], rating: 4.4 },
  { title: "Fun Home", author: "Alison Bechdel", year: 2006, description: "A family tragicomic about coming out and family secrets.", genres: ["graphic novel", "memoir", "lgbtq", "non-fiction"], rating: 4.3 },
  { title: "Blankets", author: "Craig Thompson", year: 2003, description: "A coming-of-age story about first love and faith.", genres: ["graphic novel", "memoir", "romance", "non-fiction"], rating: 4.2 },
  { title: "American Born Chinese", author: "Gene Luen Yang", year: 2006, description: "A story about cultural identity and acceptance.", genres: ["graphic novel", "young adult", "cultural", "fiction"], rating: 4.1 },
  { title: "Ghost World", author: "Daniel Clowes", year: 1997, description: "Two teenage girls navigate post-high school life.", genres: ["graphic novel", "coming-of-age", "fiction"], rating: 4.0 },
  { title: "Jimmy Corrigan, the Smartest Kid on Earth", author: "Chris Ware", year: 2000, description: "A complex story about family relationships.", genres: ["graphic novel", "literary", "fiction"], rating: 4.1 },
  { title: "Palestine", author: "Joe Sacco", year: 1993, description: "A journalistic graphic novel about the Palestinian territories.", genres: ["graphic novel", "journalism", "history", "non-fiction"], rating: 4.2 },
  { title: "Safe Area Gorazde", author: "Joe Sacco", year: 2000, description: "A war correspondent's account of the Bosnian War.", genres: ["graphic novel", "journalism", "war", "non-fiction"], rating: 4.1 },
  
  // Modern Graphic Novels
  { title: "Saga", author: "Brian K. Vaughan", year: 2012, description: "A space opera about a family on the run.", genres: ["graphic novel", "sci-fi", "fantasy", "fiction"], rating: 4.5 },
  { title: "Y: The Last Man", author: "Brian K. Vaughan", year: 2002, description: "The last man on Earth after a global catastrophe.", genres: ["graphic novel", "sci-fi", "post-apocalyptic", "fiction"], rating: 4.3 },
  { title: "Ex Machina", author: "Brian K. Vaughan", year: 2004, description: "A superhero becomes mayor of New York City.", genres: ["graphic novel", "superhero", "political", "fiction"], rating: 4.2 },
  { title: "Paper Girls", author: "Brian K. Vaughan", year: 2015, description: "Four paper delivery girls encounter time travelers.", genres: ["graphic novel", "sci-fi", "young adult", "fiction"], rating: 4.1 },
  { title: "The Walking Dead", author: "Robert Kirkman", year: 2003, description: "A group of survivors in a zombie apocalypse.", genres: ["graphic novel", "horror", "post-apocalyptic", "fiction"], rating: 4.4 },
  { title: "Invincible", author: "Robert Kirkman", year: 2003, description: "A teenage superhero discovers his true heritage.", genres: ["graphic novel", "superhero", "young adult", "fiction"], rating: 4.2 },
  { title: "Bone", author: "Jeff Smith", year: 1991, description: "Three cartoon cousins explore a mysterious valley.", genres: ["graphic novel", "fantasy", "adventure", "fiction"], rating: 4.3 },
  { title: "Scott Pilgrim vs. the World", author: "Bryan Lee O'Malley", year: 2004, description: "A slacker must defeat his girlfriend's seven evil exes.", genres: ["graphic novel", "romance", "comedy", "fiction"], rating: 4.1 },
  { title: "Seconds", author: "Bryan Lee O'Malley", year: 2014, description: "A chef discovers she can fix her mistakes with magic mushrooms.", genres: ["graphic novel", "fantasy", "coming-of-age", "fiction"], rating: 4.0 },
  { title: "Lost at Sea", author: "Bryan Lee O'Malley", year: 2003, description: "A teenage girl takes a road trip to find her soul.", genres: ["graphic novel", "coming-of-age", "fiction"], rating: 3.9 },
  
  // Travel & Geography (25-35 books)
  // Travel Literature
  { title: "A Walk in the Woods", author: "Bill Bryson", year: 1998, description: "Rediscovering America on the Appalachian Trail.", genres: ["travel", "memoir", "humor", "non-fiction"], rating: 4.3 },
  { title: "In a Sunburned Country", author: "Bill Bryson", year: 2000, description: "Traveling through Australia.", genres: ["travel", "memoir", "humor", "non-fiction"], rating: 4.2 },
  { title: "Notes from a Small Island", author: "Bill Bryson", year: 1995, description: "Traveling through Britain.", genres: ["travel", "memoir", "humor", "non-fiction"], rating: 4.1 },
  { title: "The Lost Continent", author: "Bill Bryson", year: 1989, description: "Travels in small-town America.", genres: ["travel", "memoir", "humor", "non-fiction"], rating: 4.0 },
  { title: "Neither Here Nor There", author: "Bill Bryson", year: 1991, description: "Travels in Europe.", genres: ["travel", "memoir", "humor", "non-fiction"], rating: 4.1 },
  { title: "The Great Railway Bazaar", author: "Paul Theroux", year: 1975, description: "By train through Asia.", genres: ["travel", "memoir", "non-fiction"], rating: 4.2 },
  { title: "The Old Patagonian Express", author: "Paul Theroux", year: 1979, description: "By train through the Americas.", genres: ["travel", "memoir", "non-fiction"], rating: 4.1 },
  { title: "Dark Star Safari", author: "Paul Theroux", year: 2002, description: "Overland from Cairo to Cape Town.", genres: ["travel", "memoir", "non-fiction"], rating: 4.0 },
  { title: "The Tao of Travel", author: "Paul Theroux", year: 2011, description: "Enlightenments from lives on the road.", genres: ["travel", "philosophy", "non-fiction"], rating: 4.1 },
  { title: "Ghost Train to the Eastern Star", author: "Paul Theroux", year: 2008, description: "On the tracks of the Great Railway Bazaar.", genres: ["travel", "memoir", "non-fiction"], rating: 4.0 },
  
  // Classic Travel Literature
  { title: "The Travels of Marco Polo", author: "Marco Polo", year: 1300, description: "A Venetian merchant's journey to China.", genres: ["travel", "history", "memoir", "non-fiction"], rating: 4.1 },
  { title: "Gulliver's Travels", author: "Jonathan Swift", year: 1726, description: "A satirical novel about travel to strange lands.", genres: ["travel", "satire", "fantasy", "fiction"], rating: 4.2 },
  { title: "Around the World in Eighty Days", author: "Jules Verne", year: 1872, description: "A gentleman's wager to circumnavigate the globe.", genres: ["travel", "adventure", "sci-fi", "fiction"], rating: 4.1 },
  { title: "Journey to the Center of the Earth", author: "Jules Verne", year: 1864, description: "An expedition to the Earth's core.", genres: ["travel", "adventure", "sci-fi", "fiction"], rating: 4.0 },
  { title: "Twenty Thousand Leagues Under the Sea", author: "Jules Verne", year: 1870, description: "A submarine voyage around the world.", genres: ["travel", "adventure", "sci-fi", "fiction"], rating: 4.2 },
  { title: "The Kon-Tiki Expedition", author: "Thor Heyerdahl", year: 1948, description: "By raft across the Pacific Ocean.", genres: ["travel", "adventure", "memoir", "non-fiction"], rating: 4.3 },
  { title: "The Long Walk", author: "Slavomir Rawicz", year: 1956, description: "A true story of escape from a Siberian labor camp.", genres: ["travel", "memoir", "history", "non-fiction"], rating: 4.2 },
  { title: "Into the Wild", author: "Jon Krakauer", year: 1996, description: "The story of Christopher McCandless's Alaskan adventure.", genres: ["travel", "memoir", "adventure", "non-fiction"], rating: 4.3 },
  { title: "Wild", author: "Cheryl Strayed", year: 2012, description: "A woman hikes the Pacific Crest Trail alone.", genres: ["travel", "memoir", "adventure", "non-fiction"], rating: 4.2 },
  { title: "Eat, Pray, Love", author: "Elizabeth Gilbert", year: 2006, description: "One woman's search for everything across Italy, India, and Indonesia.", genres: ["travel", "memoir", "spiritual", "non-fiction"], rating: 4.1 },
  
  // Science & Technology (25-35 books)
  // Popular Science
  { title: "A Brief History of Time", author: "Stephen Hawking", year: 1988, description: "From the Big Bang to Black Holes.", genres: ["science", "physics", "cosmology", "non-fiction"], rating: 4.4 },
  { title: "The Universe in a Nutshell", author: "Stephen Hawking", year: 2001, description: "A sequel to A Brief History of Time.", genres: ["science", "physics", "cosmology", "non-fiction"], rating: 4.2 },
  { title: "The Grand Design", author: "Stephen Hawking", year: 2010, description: "New answers to the ultimate questions of life.", genres: ["science", "physics", "philosophy", "non-fiction"], rating: 4.1 },
  { title: "Cosmos", author: "Carl Sagan", year: 1980, description: "A personal voyage through the universe.", genres: ["science", "astronomy", "cosmology", "non-fiction"], rating: 4.5 },
  { title: "The Demon-Haunted World", author: "Carl Sagan", year: 1995, description: "Science as a candle in the dark.", genres: ["science", "skepticism", "philosophy", "non-fiction"], rating: 4.3 },
  { title: "Contact", author: "Carl Sagan", year: 1985, description: "A novel about first contact with extraterrestrial life.", genres: ["science", "sci-fi", "fiction"], rating: 4.2 },
  { title: "The Selfish Gene", author: "Richard Dawkins", year: 1976, description: "A new look at evolution.", genres: ["science", "biology", "evolution", "non-fiction"], rating: 4.4 },
  { title: "The Blind Watchmaker", author: "Richard Dawkins", year: 1986, description: "Why the evidence of evolution reveals a universe without design.", genres: ["science", "biology", "evolution", "non-fiction"], rating: 4.3 },
  { title: "The God Delusion", author: "Richard Dawkins", year: 2006, description: "A critique of religion and belief in God.", genres: ["science", "philosophy", "religion", "non-fiction"], rating: 4.2 },
  { title: "The Ancestor's Tale", author: "Richard Dawkins", year: 2004, description: "A pilgrimage to the dawn of evolution.", genres: ["science", "biology", "evolution", "non-fiction"], rating: 4.1 },
  
  // Modern Science & Technology
  { title: "Astrophysics for People in a Hurry", author: "Neil deGrasse Tyson", year: 2017, description: "A concise introduction to the universe.", genres: ["science", "astrophysics", "cosmology", "non-fiction"], rating: 4.3 },
  { title: "Death by Black Hole", author: "Neil deGrasse Tyson", year: 2007, description: "And other cosmic quandaries.", genres: ["science", "astrophysics", "cosmology", "non-fiction"], rating: 4.2 },
  { title: "Space Chronicles", author: "Neil deGrasse Tyson", year: 2012, description: "Facing the ultimate frontier.", genres: ["science", "space", "technology", "non-fiction"], rating: 4.1 },
  { title: "The Elegant Universe", author: "Brian Greene", year: 1999, description: "Superstrings, hidden dimensions, and the quest for the ultimate theory.", genres: ["science", "physics", "string theory", "non-fiction"], rating: 4.3 },
  { title: "The Fabric of the Cosmos", author: "Brian Greene", year: 2004, description: "Space, time, and the texture of reality.", genres: ["science", "physics", "cosmology", "non-fiction"], rating: 4.2 },
  { title: "The Hidden Reality", author: "Brian Greene", year: 2011, description: "Parallel universes and the deep laws of the cosmos.", genres: ["science", "physics", "multiverse", "non-fiction"], rating: 4.1 },
  { title: "The Innovators", author: "Walter Isaacson", year: 2014, description: "How a group of hackers, geniuses, and geeks created the digital revolution.", genres: ["science", "technology", "history", "non-fiction"], rating: 4.3 },
  { title: "Steve Jobs", author: "Walter Isaacson", year: 2011, description: "The exclusive biography of the Apple co-founder.", genres: ["biography", "technology", "business", "non-fiction"], rating: 4.4 },
  { title: "Leonardo da Vinci", author: "Walter Isaacson", year: 2017, description: "The biography of the Renaissance genius.", genres: ["biography", "art", "science", "non-fiction"], rating: 4.3 },
  { title: "Einstein", author: "Walter Isaacson", year: 2007, description: "His life and universe.", genres: ["biography", "science", "physics", "non-fiction"], rating: 4.4 },
  
  // Art & Music (20-30 books)
  // Art History & Theory
  { title: "The Story of Art", author: "E.H. Gombrich", year: 1950, description: "A comprehensive history of art from prehistoric times to the present.", genres: ["art", "history", "non-fiction"], rating: 4.4 },
  { title: "Ways of Seeing", author: "John Berger", year: 1972, description: "A revolutionary look at how we view art.", genres: ["art", "criticism", "philosophy", "non-fiction"], rating: 4.3 },
  { title: "The Art Book", author: "Phaidon Press", year: 1994, description: "A comprehensive guide to 500 great painters and sculptors.", genres: ["art", "reference", "non-fiction"], rating: 4.2 },
  { title: "The Lives of the Artists", author: "Giorgio Vasari", year: 1550, description: "Biographies of Italian Renaissance artists.", genres: ["art", "biography", "history", "non-fiction"], rating: 4.1 },
  { title: "The Agony and the Ecstasy", author: "Irving Stone", year: 1961, description: "A biographical novel about Michelangelo.", genres: ["art", "biography", "historical fiction"], rating: 4.2 },
  { title: "Lust for Life", author: "Irving Stone", year: 1934, description: "A biographical novel about Vincent van Gogh.", genres: ["art", "biography", "historical fiction"], rating: 4.1 },
  { title: "The Painted Word", author: "Tom Wolfe", year: 1975, description: "A critique of modern art theory.", genres: ["art", "criticism", "non-fiction"], rating: 4.0 },
  { title: "Art and Illusion", author: "E.H. Gombrich", year: 1960, description: "A study in the psychology of pictorial representation.", genres: ["art", "psychology", "non-fiction"], rating: 4.1 },
  { title: "The Power of Images", author: "David Freedberg", year: 1989, description: "Studies in the history and theory of response.", genres: ["art", "psychology", "history", "non-fiction"], rating: 4.0 },
  { title: "Art Since 1900", author: "Hal Foster", year: 2004, description: "Modernism, antimodernism, postmodernism.", genres: ["art", "history", "modern art", "non-fiction"], rating: 4.1 },
  
  // Music & Musician Biographies
  { title: "Mozart: A Life", author: "Paul Johnson", year: 2013, description: "A concise biography of the musical genius.", genres: ["music", "biography", "classical", "non-fiction"], rating: 4.2 },
  { title: "Beethoven: Anguish and Triumph", author: "Jan Swafford", year: 2014, description: "A comprehensive biography of the composer.", genres: ["music", "biography", "classical", "non-fiction"], rating: 4.3 },
  { title: "Bach: Music in the Castle of Heaven", author: "John Eliot Gardiner", year: 2013, description: "A biography of Johann Sebastian Bach.", genres: ["music", "biography", "classical", "non-fiction"], rating: 4.1 },
  { title: "The Beatles", author: "Hunter Davies", year: 1968, description: "The authorized biography of the Fab Four.", genres: ["music", "biography", "rock", "non-fiction"], rating: 4.2 },
  { title: "Bob Dylan: Chronicles", author: "Bob Dylan", year: 2004, description: "Volume One of the musician's autobiography.", genres: ["music", "autobiography", "folk", "non-fiction"], rating: 4.3 },
  { title: "Just Kids", author: "Patti Smith", year: 2010, description: "A memoir of friendship with Robert Mapplethorpe.", genres: ["music", "memoir", "art", "non-fiction"], rating: 4.4 },
  { title: "Life", author: "Keith Richards", year: 2010, description: "The autobiography of the Rolling Stones guitarist.", genres: ["music", "autobiography", "rock", "non-fiction"], rating: 4.2 },
  { title: "Clapton", author: "Eric Clapton", year: 2007, description: "The autobiography of the guitar legend.", genres: ["music", "autobiography", "rock", "non-fiction"], rating: 4.1 },
  { title: "Scar Tissue", author: "Anthony Kiedis", year: 2004, description: "The autobiography of the Red Hot Chili Peppers frontman.", genres: ["music", "autobiography", "rock", "non-fiction"], rating: 4.0 },
  { title: "The Dirt", author: "Mötley Crüe", year: 2001, description: "Confessions of the world's most notorious rock band.", genres: ["music", "autobiography", "rock", "non-fiction"], rating: 4.1 }
];

// Comprehensive movie dataset
export const COMPREHENSIVE_MOVIE_DATA = [
  // Adventure Movies
  { title: "Jurassic World: Dominion", author: "Colin Trevorrow", year: 2022, description: "Final installment in the Jurassic World trilogy.", genres: ["adventure", "action", "sci-fi"], rating: 4.0, isBook: false },
  { title: "Mission: Impossible - Dead Reckoning Part One", author: "Christopher McQuarrie", year: 2023, description: "Action-packed spy thriller with Tom Cruise.", genres: ["adventure", "action", "thriller"], rating: 4.2, isBook: false },
  { title: "Indiana Jones and the Dial of Destiny", author: "James Mangold", year: 2023, description: "Harrison Ford's final adventure as Indiana Jones.", genres: ["adventure", "action", "fantasy"], rating: 3.8, isBook: false },
  { title: "The Lost City", author: "Aaron and Adam Nee", year: 2022, description: "Romantic adventure comedy starring Sandra Bullock and Channing Tatum.", genres: ["adventure", "comedy", "romance"], rating: 3.9, isBook: false },
  { title: "Uncharted", author: "Ruben Fleischer", year: 2022, description: "Action-adventure film based on the video game series.", genres: ["adventure", "action", "thriller"], rating: 3.7, isBook: false },
  
  // Popular Movies from Recent Years
  { title: "Oppenheimer", author: "Christopher Nolan", year: 2023, description: "Biographical drama about J. Robert Oppenheimer.", genres: ["drama", "biography", "history"], rating: 4.5, isBook: false },
  { title: "Barbie", author: "Greta Gerwig", year: 2023, description: "Live-action Barbie film.", genres: ["comedy", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "Killers of the Flower Moon", author: "Martin Scorsese", year: 2023, description: "Western crime drama about the Osage murders.", genres: ["drama", "crime", "western"], rating: 4.3, isBook: false },
  { title: "Poor Things", author: "Yorgos Lanthimos", year: 2023, description: "Dark comedy fantasy film.", genres: ["comedy", "fantasy", "drama"], rating: 4.1, isBook: false },
  { title: "The Holdovers", author: "Alexander Payne", year: 2023, description: "Comedy-drama about a prep school teacher.", genres: ["comedy", "drama"], rating: 4.0, isBook: false },
  { title: "Past Lives", author: "Celine Song", year: 2023, description: "Romantic drama about childhood sweethearts.", genres: ["drama", "romance"], rating: 4.2, isBook: false },
  { title: "Anatomy of a Fall", author: "Justine Triet", year: 2023, description: "French legal drama thriller.", genres: ["drama", "thriller", "mystery"], rating: 4.3, isBook: false },
  { title: "The Zone of Interest", author: "Jonathan Glazer", year: 2023, description: "Historical drama about the Holocaust.", genres: ["drama", "history", "war"], rating: 4.4, isBook: false },
  { title: "American Fiction", author: "Cord Jefferson", year: 2023, description: "Satirical comedy-drama about race and publishing.", genres: ["comedy", "drama"], rating: 4.1, isBook: false },
  { title: "May December", author: "Todd Haynes", year: 2023, description: "Drama about an actress researching a controversial relationship.", genres: ["drama", "romance"], rating: 4.0, isBook: false },
  
  // Classic Movies
  { title: "The Godfather", author: "Francis Ford Coppola", year: 1972, description: "Crime drama about the Corleone family.", genres: ["drama", "crime"], rating: 4.8, isBook: false },
  { title: "The Shawshank Redemption", author: "Frank Darabont", year: 1994, description: "Drama about friendship in prison.", genres: ["drama", "crime"], rating: 4.9, isBook: false },
  { title: "Pulp Fiction", author: "Quentin Tarantino", year: 1994, description: "Crime anthology film.", genres: ["crime", "drama"], rating: 4.7, isBook: false },
  { title: "Fight Club", author: "David Fincher", year: 1999, description: "Drama about an underground fighting club.", genres: ["drama", "thriller"], rating: 4.6, isBook: false },
  { title: "The Matrix", author: "Lana and Lilly Wachowski", year: 1999, description: "Sci-fi action film about reality and illusion.", genres: ["sci-fi", "action"], rating: 4.7, isBook: false },
  { title: "Inception", author: "Christopher Nolan", year: 2010, description: "Sci-fi thriller about dream infiltration.", genres: ["sci-fi", "thriller"], rating: 4.6, isBook: false },
  { title: "Interstellar", author: "Christopher Nolan", year: 2014, description: "Sci-fi drama about space exploration.", genres: ["sci-fi", "drama"], rating: 4.5, isBook: false },
  { title: "Mad Max: Fury Road", author: "George Miller", year: 2015, description: "Post-apocalyptic action film.", genres: ["action", "adventure"], rating: 4.4, isBook: false },
  { title: "Parasite", author: "Bong Joon-ho", year: 2019, description: "South Korean thriller about class inequality.", genres: ["thriller", "drama"], rating: 4.7, isBook: false },
  { title: "Joker", author: "Todd Phillips", year: 2019, description: "Psychological thriller about the Joker's origin.", genres: ["thriller", "drama"], rating: 4.3, isBook: false },
  
  // Recent Blockbusters
  { title: "Dune", author: "Denis Villeneuve", year: 2021, description: "Sci-fi epic based on Frank Herbert's novel.", genres: ["sci-fi", "adventure"], rating: 4.4, isBook: false },
  { title: "No Time to Die", author: "Cary Joji Fukunaga", year: 2021, description: "James Bond action thriller.", genres: ["action", "thriller"], rating: 4.1, isBook: false },
  { title: "Spider-Man: No Way Home", author: "Jon Watts", year: 2021, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.3, isBook: false },
  { title: "The Batman", author: "Matt Reeves", year: 2022, description: "Dark superhero film about Batman.", genres: ["action", "crime", "superhero"], rating: 4.2, isBook: false },
  { title: "Top Gun: Maverick", author: "Joseph Kosinski", year: 2022, description: "Action drama about fighter pilots.", genres: ["action", "drama"], rating: 4.4, isBook: false },
  { title: "Avatar: The Way of Water", author: "James Cameron", year: 2022, description: "Sci-fi adventure sequel.", genres: ["sci-fi", "adventure"], rating: 4.1, isBook: false },
  { title: "Black Panther: Wakanda Forever", author: "Ryan Coogler", year: 2022, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Everything Everywhere All at Once", author: "Daniel Kwan and Daniel Scheinert", year: 2022, description: "Sci-fi comedy-drama about multiverses.", genres: ["sci-fi", "comedy", "drama"], rating: 4.6, isBook: false },
  { title: "The Fabelmans", author: "Steven Spielberg", year: 2022, description: "Semi-autobiographical drama about filmmaking.", genres: ["drama", "biography"], rating: 4.2, isBook: false },
  { title: "Tár", author: "Todd Field", year: 2022, description: "Drama about a renowned conductor.", genres: ["drama", "biography"], rating: 4.3, isBook: false },
  
  // Additional Recent Movies (2020-2024)
  { title: "Nomadland", author: "Chloé Zhao", year: 2020, description: "Drama about a woman living in a van.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "The Trial of the Chicago 7", author: "Aaron Sorkin", year: 2020, description: "Historical drama about the 1968 Democratic National Convention.", genres: ["drama", "history"], rating: 4.1, isBook: false },
  { title: "Minari", author: "Lee Isaac Chung", year: 2020, description: "Drama about a Korean-American family.", genres: ["drama"], rating: 4.3, isBook: false },
  { title: "Sound of Metal", author: "Darius Marder", year: 2020, description: "Drama about a drummer losing his hearing.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "Promising Young Woman", author: "Emerald Fennell", year: 2020, description: "Thriller about revenge and justice.", genres: ["thriller", "drama"], rating: 4.1, isBook: false },
  { title: "The Father", author: "Florian Zeller", year: 2020, description: "Drama about dementia and aging.", genres: ["drama"], rating: 4.4, isBook: false },
  { title: "Judas and the Black Messiah", author: "Shaka King", year: 2021, description: "Biographical drama about Fred Hampton.", genres: ["drama", "biography"], rating: 4.2, isBook: false },
  { title: "The Green Knight", author: "David Lowery", year: 2021, description: "Medieval fantasy adventure.", genres: ["fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "The French Dispatch", author: "Wes Anderson", year: 2021, description: "Comedy-drama anthology film.", genres: ["comedy", "drama"], rating: 4.1, isBook: false },
  { title: "Licorice Pizza", author: "Paul Thomas Anderson", year: 2021, description: "Coming-of-age comedy-drama.", genres: ["comedy", "drama"], rating: 4.0, isBook: false },
  { title: "West Side Story", author: "Steven Spielberg", year: 2021, description: "Musical drama about rival gangs.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Nightmare Alley", author: "Guillermo del Toro", year: 2021, description: "Neo-noir psychological thriller.", genres: ["thriller", "drama"], rating: 4.1, isBook: false },
  { title: "The Power of the Dog", author: "Jane Campion", year: 2021, description: "Western drama about toxic masculinity.", genres: ["western", "drama"], rating: 4.3, isBook: false },
  { title: "CODA", author: "Sian Heder", year: 2021, description: "Drama about a hearing child of deaf parents.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "Drive My Car", author: "Ryusuke Hamaguchi", year: 2021, description: "Japanese drama about grief and theater.", genres: ["drama"], rating: 4.4, isBook: false },
  { title: "The Worst Person in the World", author: "Joachim Trier", year: 2021, description: "Norwegian romantic comedy-drama.", genres: ["comedy", "drama", "romance"], rating: 4.1, isBook: false },
  { title: "Flee", author: "Jonas Poher Rasmussen", year: 2021, description: "Animated documentary about a refugee.", genres: ["documentary", "animation"], rating: 4.3, isBook: false },
  { title: "The Lost Daughter", author: "Maggie Gyllenhaal", year: 2021, description: "Psychological drama about motherhood.", genres: ["drama"], rating: 4.0, isBook: false },
  { title: "Parallel Mothers", author: "Pedro Almodóvar", year: 2021, description: "Spanish drama about motherhood.", genres: ["drama"], rating: 4.1, isBook: false },
  { title: "Belfast", author: "Kenneth Branagh", year: 2021, description: "Coming-of-age drama set in Northern Ireland.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "King Richard", author: "Reinaldo Marcus Green", year: 2021, description: "Biographical drama about Venus and Serena Williams' father.", genres: ["drama", "biography", "sports"], rating: 4.1, isBook: false },
  { title: "Don't Look Up", author: "Adam McKay", year: 2021, description: "Satirical comedy about climate change.", genres: ["comedy", "satire"], rating: 4.0, isBook: false },
  { title: "The Tragedy of Macbeth", author: "Joel Coen", year: 2021, description: "Shakespeare adaptation starring Denzel Washington.", genres: ["drama", "tragedy"], rating: 4.2, isBook: false },
  { title: "Spencer", author: "Pablo Larraín", year: 2021, description: "Biographical drama about Princess Diana.", genres: ["drama", "biography"], rating: 4.1, isBook: false },
  { title: "Tick, Tick... Boom!", author: "Lin-Manuel Miranda", year: 2021, description: "Musical drama about Jonathan Larson.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "The Eyes of Tammy Faye", author: "Michael Showalter", year: 2021, description: "Biographical drama about televangelist Tammy Faye Bakker.", genres: ["drama", "biography"], rating: 4.0, isBook: false },
  { title: "Being the Ricardos", author: "Aaron Sorkin", year: 2021, description: "Biographical drama about Lucille Ball and Desi Arnaz.", genres: ["drama", "biography"], rating: 4.1, isBook: false },
  { title: "Cyrano", author: "Joe Wright", year: 2021, description: "Musical romantic drama.", genres: ["musical", "romance", "drama"], rating: 4.0, isBook: false },
  { title: "The Card Counter", author: "Paul Schrader", year: 2021, description: "Crime drama about a gambler.", genres: ["crime", "drama"], rating: 4.1, isBook: false },
  { title: "The Last Duel", author: "Ridley Scott", year: 2021, description: "Historical drama about a medieval duel.", genres: ["historical", "drama"], rating: 4.2, isBook: false },
  { title: "House of Gucci", author: "Ridley Scott", year: 2021, description: "Biographical crime drama about the Gucci family.", genres: ["crime", "drama", "biography"], rating: 4.0, isBook: false },
  { title: "Shang-Chi and the Legend of the Ten Rings", author: "Destin Daniel Cretton", year: 2021, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Eternals", author: "Chloé Zhao", year: 2021, description: "Marvel superhero film about immortal beings.", genres: ["action", "adventure", "superhero"], rating: 3.9, isBook: false },
  { title: "Black Widow", author: "Cate Shortland", year: 2021, description: "Marvel superhero film about Natasha Romanoff.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Venom: Let There Be Carnage", author: "Andy Serkis", year: 2021, description: "Superhero film about Venom.", genres: ["action", "adventure", "superhero"], rating: 3.8, isBook: false },
  { title: "The Suicide Squad", author: "James Gunn", year: 2021, description: "DC superhero film about antiheroes.", genres: ["action", "adventure", "superhero"], rating: 4.1, isBook: false },
  { title: "Godzilla vs. Kong", author: "Adam Wingard", year: 2021, description: "Monster film about giant creatures.", genres: ["action", "sci-fi"], rating: 3.9, isBook: false },
  { title: "A Quiet Place Part II", author: "John Krasinski", year: 2021, description: "Horror thriller about sound-sensitive creatures.", genres: ["horror", "thriller"], rating: 4.1, isBook: false },
  { title: "Halloween Kills", author: "David Gordon Green", year: 2021, description: "Horror film about Michael Myers.", genres: ["horror"], rating: 3.8, isBook: false },
  { title: "Candyman", author: "Nia DaCosta", year: 2021, description: "Horror film about an urban legend.", genres: ["horror", "thriller"], rating: 4.0, isBook: false },
  { title: "The Conjuring: The Devil Made Me Do It", author: "Michael Chaves", year: 2021, description: "Horror film about demonic possession.", genres: ["horror"], rating: 3.9, isBook: false },
  { title: "Malignant", author: "James Wan", year: 2021, description: "Horror thriller about a mysterious condition.", genres: ["horror", "thriller"], rating: 3.8, isBook: false },
  { title: "Old", author: "M. Night Shyamalan", year: 2021, description: "Thriller about rapid aging on a beach.", genres: ["thriller", "mystery"], rating: 3.9, isBook: false },
  { title: "The Forever Purge", author: "Everardo Gout", year: 2021, description: "Action thriller about a never-ending purge.", genres: ["action", "thriller"], rating: 3.7, isBook: false },
  { title: "Nobody", author: "Ilya Naishuller", year: 2021, description: "Action thriller about a retired assassin.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "The Marksman", author: "Robert Lorenz", year: 2021, description: "Action thriller about a veteran protecting a boy.", genres: ["action", "thriller"], rating: 3.8, isBook: false },
  { title: "Wrath of Man", author: "Guy Ritchie", year: 2021, description: "Action thriller about a mysterious security guard.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "The Hitman's Wife's Bodyguard", author: "Patrick Hughes", year: 2021, description: "Action comedy about a bodyguard.", genres: ["action", "comedy"], rating: 3.7, isBook: false },
  { title: "F9: The Fast Saga", author: "Justin Lin", year: 2021, description: "Action film about street racing and family.", genres: ["action", "adventure"], rating: 3.8, isBook: false },
  { title: "Mission: Impossible 7", author: "Christopher McQuarrie", year: 2023, description: "Action thriller about Ethan Hunt's mission.", genres: ["action", "thriller"], rating: 4.2, isBook: false },
  { title: "John Wick: Chapter 4", author: "Chad Stahelski", year: 2023, description: "Action thriller about an assassin.", genres: ["action", "thriller"], rating: 4.3, isBook: false },
  { title: "The Equalizer 3", author: "Antoine Fuqua", year: 2023, description: "Action thriller about a retired CIA agent.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "Extraction 2", author: "Sam Hargrave", year: 2023, description: "Action thriller about a mercenary.", genres: ["action", "thriller"], rating: 4.1, isBook: false },
  { title: "The Gray Man", author: "Anthony and Joe Russo", year: 2022, description: "Action thriller about a CIA assassin.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "Bullet Train", author: "David Leitch", year: 2022, description: "Action comedy about assassins on a train.", genres: ["action", "comedy"], rating: 4.1, isBook: false },
  { title: "The Northman", author: "Robert Eggers", year: 2022, description: "Historical action drama about a Viking prince.", genres: ["action", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Ambulance", author: "Michael Bay", year: 2022, description: "Action thriller about a bank robbery gone wrong.", genres: ["action", "thriller"], rating: 3.9, isBook: false },

  { title: "The Adam Project", author: "Shawn Levy", year: 2022, description: "Sci-fi action comedy about time travel.", genres: ["sci-fi", "action", "comedy"], rating: 4.0, isBook: false },
  { title: "Free Guy", author: "Shawn Levy", year: 2021, description: "Sci-fi action comedy about a video game character.", genres: ["sci-fi", "action", "comedy"], rating: 4.1, isBook: false },
  { title: "The Tomorrow War", author: "Chris McKay", year: 2021, description: "Sci-fi action film about time travel and aliens.", genres: ["sci-fi", "action"], rating: 3.9, isBook: false },
  { title: "Chaos Walking", author: "Doug Liman", year: 2021, description: "Sci-fi adventure about a world where thoughts are visible.", genres: ["sci-fi", "adventure"], rating: 3.7, isBook: false },
  { title: "Reminiscence", author: "Lisa Joy", year: 2021, description: "Sci-fi thriller about memory technology.", genres: ["sci-fi", "thriller"], rating: 3.8, isBook: false },
  { title: "Infinite", author: "Antoine Fuqua", year: 2021, description: "Sci-fi action about reincarnation.", genres: ["sci-fi", "action"], rating: 3.6, isBook: false },
  { title: "Boss Level", author: "Joe Carnahan", year: 2021, description: "Sci-fi action about a time loop.", genres: ["sci-fi", "action"], rating: 3.9, isBook: false },
  { title: "Outside the Wire", author: "Mikael Håfström", year: 2021, description: "Sci-fi action about AI and war.", genres: ["sci-fi", "action"], rating: 3.8, isBook: false },
  { title: "Stowaway", author: "Joe Penna", year: 2021, description: "Sci-fi thriller about a space mission.", genres: ["sci-fi", "thriller"], rating: 3.9, isBook: false },
  { title: "Voyagers", author: "Neil Burger", year: 2021, description: "Sci-fi thriller about a space colonization mission.", genres: ["sci-fi", "thriller"], rating: 3.7, isBook: false },
  { title: "Cosmic Sin", author: "Edward Drake", year: 2021, description: "Sci-fi action about space warfare.", genres: ["sci-fi", "action"], rating: 3.5, isBook: false },
  { title: "The Midnight Sky", author: "George Clooney", year: 2020, description: "Sci-fi drama about a dying Earth.", genres: ["sci-fi", "drama"], rating: 3.8, isBook: false },
  { title: "Tenet", author: "Christopher Nolan", year: 2020, description: "Sci-fi thriller about time inversion.", genres: ["sci-fi", "thriller"], rating: 4.2, isBook: false },
  { title: "The Invisible Man", author: "Leigh Whannell", year: 2020, description: "Sci-fi horror about an invisible stalker.", genres: ["sci-fi", "horror"], rating: 4.1, isBook: false },
  { title: "Underwater", author: "William Eubank", year: 2020, description: "Sci-fi horror about deep sea creatures.", genres: ["sci-fi", "horror"], rating: 3.8, isBook: false },
  { title: "The Call of the Wild", author: "Chris Sanders", year: 2020, description: "Adventure drama about a dog in the Yukon.", genres: ["adventure", "drama"], rating: 3.9, isBook: false },
  { title: "Onward", author: "Dan Scanlon", year: 2020, description: "Animated fantasy adventure about magic.", genres: ["animation", "fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Soul", author: "Pete Docter", year: 2020, description: "Animated fantasy about the meaning of life.", genres: ["animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Wolfwalkers", author: "Tomm Moore", year: 2020, description: "Animated fantasy about Irish mythology.", genres: ["animation", "fantasy"], rating: 4.2, isBook: false },
  { title: "The Croods: A New Age", author: "Joel Crawford", year: 2020, description: "Animated comedy adventure about prehistoric families.", genres: ["animation", "comedy", "adventure"], rating: 3.9, isBook: false },
  { title: "Raya and the Last Dragon", author: "Don Hall", year: 2021, description: "Animated fantasy adventure about dragons.", genres: ["animation", "fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "Luca", author: "Enrico Casarosa", year: 2021, description: "Animated coming-of-age story about sea monsters.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Encanto", author: "Jared Bush", year: 2021, description: "Animated musical fantasy about a magical family.", genres: ["animation", "musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "Turning Red", author: "Domee Shi", year: 2022, description: "Animated coming-of-age comedy about puberty.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Lightyear", author: "Angus MacLane", year: 2022, description: "Animated sci-fi adventure about space exploration.", genres: ["animation", "sci-fi", "adventure"], rating: 3.9, isBook: false },
  { title: "Strange World", author: "Don Hall", year: 2022, description: "Animated adventure about exploration.", genres: ["animation", "adventure"], rating: 3.8, isBook: false },
  { title: "Puss in Boots: The Last Wish", author: "Joel Crawford", year: 2022, description: "Animated fantasy adventure about a legendary cat.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "The Bad Guys", author: "Pierre Perifel", year: 2022, description: "Animated comedy about reformed criminals.", genres: ["animation", "comedy"], rating: 4.0, isBook: false },
  { title: "DC League of Super-Pets", author: "Jared Stern", year: 2022, description: "Animated superhero comedy about pets.", genres: ["animation", "comedy", "superhero"], rating: 3.8, isBook: false },
  { title: "Minions: The Rise of Gru", author: "Kyle Balda", year: 2022, description: "Animated comedy about young Gru and his minions.", genres: ["animation", "comedy"], rating: 4.0, isBook: false },
  { title: "Super Mario Bros. Movie", author: "Aaron Horvath", year: 2023, description: "Animated adventure based on the video game.", genres: ["animation", "adventure", "comedy"], rating: 4.1, isBook: false },
  { title: "Spider-Man: Across the Spider-Verse", author: "Joaquim Dos Santos", year: 2023, description: "Animated superhero film about multiple Spider-Men.", genres: ["animation", "superhero", "adventure"], rating: 4.5, isBook: false },
  { title: "Elemental", author: "Peter Sohn", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "romance"], rating: 4.0, isBook: false },
  { title: "Teenage Mutant Ninja Turtles: Mutant Mayhem", author: "Jeff Rowe", year: 2023, description: "Animated superhero comedy about the turtles.", genres: ["animation", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "Trolls Band Together", author: "Walt Dohrn", year: 2023, description: "Animated musical comedy about trolls.", genres: ["animation", "musical", "comedy"], rating: 3.9, isBook: false },
  { title: "Wish", author: "Chris Buck", year: 2023, description: "Animated musical fantasy about wishes.", genres: ["animation", "musical", "fantasy"], rating: 3.8, isBook: false },
  { title: "Migration", author: "Benjamin Renner", year: 2023, description: "Animated adventure comedy about migrating ducks.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Leo", author: "Robert Marianetti", year: 2023, description: "Animated comedy about a talking lizard.", genres: ["animation", "comedy"], rating: 3.8, isBook: false },
  { title: "Chicken Run: Dawn of the Nugget", author: "Sam Fell", year: 2023, description: "Animated adventure comedy about chickens.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Ruby Gillman, Teenage Kraken", author: "Kirk DeMicco", year: 2023, description: "Animated fantasy comedy about a teenage kraken.", genres: ["animation", "fantasy", "comedy"], rating: 3.7, isBook: false },
  { title: "Nimona", author: "Nick Bruno", year: 2023, description: "Animated fantasy adventure about a shapeshifter.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },

  { title: "The Little Mermaid", author: "Rob Marshall", year: 2023, description: "Live-action musical fantasy about a mermaid.", genres: ["musical", "fantasy", "romance"], rating: 4.0, isBook: false },
  { title: "The Color Purple", author: "Blitz Bazawule", year: 2023, description: "Musical drama about African American women.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Wonka", author: "Paul King", year: 2023, description: "Musical fantasy about young Willy Wonka.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Mean Girls", author: "Samantha Jayne", year: 2024, description: "Musical comedy about high school cliques.", genres: ["musical", "comedy"], rating: 4.0, isBook: false },
  { title: "Bob Marley: One Love", author: "Reinaldo Marcus Green", year: 2024, description: "Biographical musical drama about Bob Marley.", genres: ["musical", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Joker: Folie à Deux", author: "Todd Phillips", year: 2024, description: "Musical thriller sequel about the Joker.", genres: ["musical", "thriller"], rating: 4.2, isBook: false },
  { title: "Mamma Mia! Here We Go Again", author: "Ol Parker", year: 2018, description: "Musical comedy sequel about love and family.", genres: ["musical", "comedy", "romance"], rating: 4.0, isBook: false },
  { title: "La La Land", author: "Damien Chazelle", year: 2016, description: "Musical romantic comedy about aspiring artists.", genres: ["musical", "romance", "comedy"], rating: 4.3, isBook: false },
  { title: "The Greatest Showman", author: "Michael Gracey", year: 2017, description: "Musical biographical drama about P.T. Barnum.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "A Star Is Born", author: "Bradley Cooper", year: 2018, description: "Musical romantic drama about musicians.", genres: ["musical", "romance", "drama"], rating: 4.3, isBook: false },
  { title: "Bohemian Rhapsody", author: "Bryan Singer", year: 2018, description: "Musical biographical drama about Queen.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Rocketman", author: "Dexter Fletcher", year: 2019, description: "Musical biographical drama about Elton John.", genres: ["musical", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Cats", author: "Tom Hooper", year: 2019, description: "Musical fantasy about cats.", genres: ["musical", "fantasy"], rating: 3.5, isBook: false },
  { title: "In the Heights", author: "Jon M. Chu", year: 2021, description: "Musical drama about a Latino neighborhood.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Dear Evan Hansen", author: "Stephen Chbosky", year: 2021, description: "Musical drama about teen mental health.", genres: ["musical", "drama"], rating: 4.0, isBook: false },
  { title: "Tick, Tick... Boom!", author: "Lin-Manuel Miranda", year: 2021, description: "Musical biographical drama about Jonathan Larson.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Cyrano", author: "Joe Wright", year: 2021, description: "Musical romantic drama.", genres: ["musical", "romance", "drama"], rating: 4.0, isBook: false },
  { title: "Matilda the Musical", author: "Matthew Warchus", year: 2022, description: "Musical fantasy about a gifted girl.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Roald Dahl's Matilda the Musical", author: "Matthew Warchus", year: 2022, description: "Musical fantasy about a gifted girl.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Spirited", author: "Sean Anders", year: 2022, description: "Musical fantasy comedy about Christmas spirits.", genres: ["musical", "fantasy", "comedy"], rating: 4.0, isBook: false },
  { title: "Disenchanted", author: "Adam Shankman", year: 2022, description: "Musical fantasy comedy about fairy tales.", genres: ["musical", "fantasy", "comedy"], rating: 3.9, isBook: false },
  { title: "Lyle, Lyle, Crocodile", author: "Josh Gordon", year: 2022, description: "Musical comedy about a singing crocodile.", genres: ["musical", "comedy"], rating: 3.8, isBook: false },
  { title: "I Wanna Dance with Somebody", author: "Kasi Lemmons", year: 2022, description: "Musical biographical drama about Whitney Houston.", genres: ["musical", "drama", "biography"], rating: 4.0, isBook: false },
  { title: "Elvis", author: "Baz Luhrmann", year: 2022, description: "Musical biographical drama about Elvis Presley.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Weird: The Al Yankovic Story", author: "Eric Appel", year: 2022, description: "Musical biographical comedy about Weird Al.", genres: ["musical", "comedy", "biography"], rating: 4.1, isBook: false },
  
  // Classic Movies (1950s-1990s)
  { title: "Casablanca", author: "Michael Curtiz", year: 1942, description: "Romantic drama set in WWII Morocco.", genres: ["drama", "romance", "war"], rating: 4.8, isBook: false },
  { title: "Citizen Kane", author: "Orson Welles", year: 1941, description: "Drama about a newspaper magnate's life.", genres: ["drama"], rating: 4.7, isBook: false },
  { title: "Gone with the Wind", author: "Victor Fleming", year: 1939, description: "Epic romance set during the Civil War.", genres: ["drama", "romance", "historical"], rating: 4.6, isBook: false },
  { title: "The Wizard of Oz", author: "Victor Fleming", year: 1939, description: "Musical fantasy about a girl's journey to Oz.", genres: ["musical", "fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "Snow White and the Seven Dwarfs", author: "Walt Disney", year: 1937, description: "Animated fairy tale about a princess.", genres: ["animation", "fantasy", "musical"], rating: 4.5, isBook: false },
  { title: "Psycho", author: "Alfred Hitchcock", year: 1960, description: "Psychological horror about a motel owner.", genres: ["horror", "thriller"], rating: 4.6, isBook: false },
  { title: "Vertigo", author: "Alfred Hitchcock", year: 1958, description: "Psychological thriller about obsession.", genres: ["thriller", "mystery"], rating: 4.5, isBook: false },
  { title: "Rear Window", author: "Alfred Hitchcock", year: 1954, description: "Thriller about a photographer who witnesses a crime.", genres: ["thriller", "mystery"], rating: 4.6, isBook: false },
  { title: "North by Northwest", author: "Alfred Hitchcock", year: 1959, description: "Thriller about mistaken identity.", genres: ["thriller", "adventure"], rating: 4.5, isBook: false },
  { title: "The Birds", author: "Alfred Hitchcock", year: 1963, description: "Horror about birds attacking humans.", genres: ["horror", "thriller"], rating: 4.3, isBook: false },
  { title: "12 Angry Men", author: "Sidney Lumet", year: 1957, description: "Drama about jury deliberation.", genres: ["drama"], rating: 4.8, isBook: false },
  { title: "On the Waterfront", author: "Elia Kazan", year: 1954, description: "Drama about corruption in the docks.", genres: ["drama", "crime"], rating: 4.6, isBook: false },
  { title: "A Streetcar Named Desire", author: "Elia Kazan", year: 1951, description: "Drama about a troubled family in New Orleans.", genres: ["drama"], rating: 4.5, isBook: false },
  { title: "Sunset Boulevard", author: "Billy Wilder", year: 1950, description: "Film noir about a fading silent film star.", genres: ["drama", "noir"], rating: 4.6, isBook: false },
  { title: "Some Like It Hot", author: "Billy Wilder", year: 1959, description: "Comedy about musicians disguised as women.", genres: ["comedy", "romance"], rating: 4.5, isBook: false },
  { title: "The Apartment", author: "Billy Wilder", year: 1960, description: "Romantic comedy about office politics.", genres: ["comedy", "romance"], rating: 4.4, isBook: false },
  { title: "Double Indemnity", author: "Billy Wilder", year: 1944, description: "Film noir about insurance fraud and murder.", genres: ["noir", "crime"], rating: 4.5, isBook: false },
  { title: "The Bridge on the River Kwai", author: "David Lean", year: 1957, description: "War drama about British POWs in Burma.", genres: ["drama", "war"], rating: 4.6, isBook: false },
  { title: "Lawrence of Arabia", author: "David Lean", year: 1962, description: "Epic drama about T.E. Lawrence in WWI.", genres: ["drama", "war", "biography"], rating: 4.7, isBook: false },
  { title: "Doctor Zhivago", author: "David Lean", year: 1965, description: "Epic romance set during the Russian Revolution.", genres: ["drama", "romance", "historical"], rating: 4.4, isBook: false },
  { title: "The Sound of Music", author: "Robert Wise", year: 1965, description: "Musical about a governess in Austria.", genres: ["musical", "drama"], rating: 4.5, isBook: false },
  { title: "West Side Story", author: "Robert Wise", year: 1961, description: "Musical about rival gangs in New York.", genres: ["musical", "drama", "romance"], rating: 4.6, isBook: false },
  { title: "My Fair Lady", author: "George Cukor", year: 1964, description: "Musical about a professor teaching a flower girl.", genres: ["musical", "comedy", "romance"], rating: 4.4, isBook: false },
  { title: "Singin' in the Rain", author: "Stanley Donen", year: 1952, description: "Musical comedy about the transition to sound films.", genres: ["musical", "comedy"], rating: 4.6, isBook: false },
  { title: "An American in Paris", author: "Vincente Minnelli", year: 1951, description: "Musical romance about an American artist in Paris.", genres: ["musical", "romance"], rating: 4.3, isBook: false },
  { title: "Gigi", author: "Vincente Minnelli", year: 1958, description: "Musical romance about a young girl in Paris.", genres: ["musical", "romance"], rating: 4.2, isBook: false },
  { title: "The King and I", author: "Walter Lang", year: 1956, description: "Musical about a British governess in Siam.", genres: ["musical", "drama"], rating: 4.3, isBook: false },
  { title: "Oklahoma!", author: "Fred Zinnemann", year: 1955, description: "Musical about romance in the Oklahoma Territory.", genres: ["musical", "romance"], rating: 4.2, isBook: false },
  { title: "Carousel", author: "Henry King", year: 1956, description: "Musical drama about a carnival barker.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "South Pacific", author: "Joshua Logan", year: 1958, description: "Musical romance set during WWII.", genres: ["musical", "romance", "war"], rating: 4.2, isBook: false },
  { title: "The Music Man", author: "Morton DaCosta", year: 1962, description: "Musical comedy about a traveling salesman.", genres: ["musical", "comedy"], rating: 4.3, isBook: false },
  { title: "Mary Poppins", author: "Robert Stevenson", year: 1964, description: "Musical fantasy about a magical nanny.", genres: ["musical", "fantasy"], rating: 4.5, isBook: false },
  { title: "Chitty Chitty Bang Bang", author: "Ken Hughes", year: 1968, description: "Musical fantasy about a magical car.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Bedknobs and Broomsticks", author: "Robert Stevenson", year: 1971, description: "Musical fantasy about a witch and children.", genres: ["musical", "fantasy"], rating: 4.0, isBook: false },
  { title: "Willy Wonka & the Chocolate Factory", author: "Mel Stuart", year: 1971, description: "Musical fantasy about a chocolate factory.", genres: ["musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "The Rocky Horror Picture Show", author: "Jim Sharman", year: 1975, description: "Musical horror comedy about aliens.", genres: ["musical", "horror", "comedy"], rating: 4.2, isBook: false },
  { title: "Grease", author: "Randal Kleiser", year: 1978, description: "Musical romance about high school students.", genres: ["musical", "romance", "comedy"], rating: 4.3, isBook: false },
  { title: "Saturday Night Fever", author: "John Badham", year: 1977, description: "Drama about disco dancing in Brooklyn.", genres: ["drama", "musical"], rating: 4.2, isBook: false },
  { title: "Fame", author: "Alan Parker", year: 1980, description: "Musical drama about performing arts students.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "Flashdance", author: "Adrian Lyne", year: 1983, description: "Drama about a welder who wants to dance.", genres: ["drama", "musical"], rating: 4.0, isBook: false },
  { title: "Footloose", author: "Herbert Ross", year: 1984, description: "Musical drama about dancing in a small town.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "Dirty Dancing", author: "Emile Ardolino", year: 1987, description: "Romantic drama about dance lessons.", genres: ["drama", "romance", "musical"], rating: 4.2, isBook: false },
  { title: "The Little Mermaid", author: "Ron Clements", year: 1989, description: "Animated musical fantasy about a mermaid.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "Beauty and the Beast", author: "Gary Trousdale", year: 1991, description: "Animated musical fantasy about love and transformation.", genres: ["animation", "musical", "fantasy"], rating: 4.5, isBook: false },
  { title: "Aladdin", author: "Ron Clements", year: 1992, description: "Animated musical fantasy about a street rat and a genie.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "The Lion King", author: "Roger Allers", year: 1994, description: "Animated musical drama about a lion prince.", genres: ["animation", "musical", "drama"], rating: 4.6, isBook: false },
  { title: "Pocahontas", author: "Mike Gabriel", year: 1995, description: "Animated musical drama about Native American history.", genres: ["animation", "musical", "drama"], rating: 4.2, isBook: false },
  { title: "The Hunchback of Notre Dame", author: "Gary Trousdale", year: 1996, description: "Animated musical drama about a deformed bell ringer.", genres: ["animation", "musical", "drama"], rating: 4.1, isBook: false },
  { title: "Hercules", author: "Ron Clements", year: 1997, description: "Animated musical fantasy about Greek mythology.", genres: ["animation", "musical", "fantasy"], rating: 4.0, isBook: false },
  { title: "Mulan", author: "Tony Bancroft", year: 1998, description: "Animated musical adventure about a female warrior.", genres: ["animation", "musical", "adventure"], rating: 4.3, isBook: false },
  { title: "Tarzan", author: "Chris Buck", year: 1999, description: "Animated musical adventure about a man raised by apes.", genres: ["animation", "musical", "adventure"], rating: 4.2, isBook: false },
  { title: "Fantasia", author: "Walt Disney", year: 1940, description: "Animated musical anthology set to classical music.", genres: ["animation", "musical"], rating: 4.4, isBook: false },
  { title: "Dumbo", author: "Walt Disney", year: 1941, description: "Animated musical about a flying elephant.", genres: ["animation", "musical", "fantasy"], rating: 4.2, isBook: false },
  { title: "Bambi", author: "Walt Disney", year: 1942, description: "Animated drama about a young deer.", genres: ["animation", "drama"], rating: 4.3, isBook: false },
  { title: "Cinderella", author: "Walt Disney", year: 1950, description: "Animated musical fantasy about a fairy tale princess.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "Alice in Wonderland", author: "Walt Disney", year: 1951, description: "Animated fantasy about a girl's adventures in Wonderland.", genres: ["animation", "fantasy"], rating: 4.2, isBook: false },
  { title: "Peter Pan", author: "Walt Disney", year: 1953, description: "Animated fantasy about a boy who never grows up.", genres: ["animation", "fantasy", "adventure"], rating: 4.3, isBook: false },
  { title: "Lady and the Tramp", author: "Walt Disney", year: 1955, description: "Animated romance about two dogs from different worlds.", genres: ["animation", "romance"], rating: 4.2, isBook: false },
  { title: "Sleeping Beauty", author: "Walt Disney", year: 1959, description: "Animated musical fantasy about a sleeping princess.", genres: ["animation", "musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "101 Dalmatians", author: "Walt Disney", year: 1961, description: "Animated comedy about dogs protecting puppies.", genres: ["animation", "comedy"], rating: 4.2, isBook: false },
  { title: "The Jungle Book", author: "Walt Disney", year: 1967, description: "Animated musical adventure about a boy raised by animals.", genres: ["animation", "musical", "adventure"], rating: 4.3, isBook: false },
  { title: "The Aristocats", author: "Walt Disney", year: 1970, description: "Animated musical comedy about aristocratic cats.", genres: ["animation", "musical", "comedy"], rating: 4.0, isBook: false },
  { title: "Robin Hood", author: "Walt Disney", year: 1973, description: "Animated musical adventure about the legendary outlaw.", genres: ["animation", "musical", "adventure"], rating: 4.1, isBook: false },
  { title: "The Many Adventures of Winnie the Pooh", author: "Walt Disney", year: 1977, description: "Animated musical about a bear and his friends.", genres: ["animation", "musical"], rating: 4.2, isBook: false },
  { title: "The Rescuers", author: "Walt Disney", year: 1977, description: "Animated adventure about mice helping a girl.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "The Fox and the Hound", author: "Walt Disney", year: 1981, description: "Animated drama about an unlikely friendship.", genres: ["animation", "drama"], rating: 4.1, isBook: false },
  { title: "The Black Cauldron", author: "Walt Disney", year: 1985, description: "Animated fantasy adventure about a magical cauldron.", genres: ["animation", "fantasy", "adventure"], rating: 3.8, isBook: false },
  { title: "The Great Mouse Detective", author: "Walt Disney", year: 1986, description: "Animated mystery about a mouse detective.", genres: ["animation", "mystery"], rating: 4.0, isBook: false },
  { title: "Oliver & Company", author: "Walt Disney", year: 1988, description: "Animated musical about a cat and dog in New York.", genres: ["animation", "musical"], rating: 3.9, isBook: false },
  { title: "The Rescuers Down Under", author: "Walt Disney", year: 1990, description: "Animated adventure sequel about mice helping a boy.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "A Goofy Movie", author: "Walt Disney", year: 1995, description: "Animated comedy about Goofy and his son.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Toy Story", author: "Pixar", year: 1995, description: "Animated adventure about toys that come to life.", genres: ["animation", "adventure", "comedy"], rating: 4.6, isBook: false },
  { title: "A Bug's Life", author: "Pixar", year: 1998, description: "Animated adventure about ants fighting grasshoppers.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Toy Story 2", author: "Pixar", year: 1999, description: "Animated adventure sequel about toys.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "Monsters, Inc.", author: "Pixar", year: 2001, description: "Animated comedy about monsters who scare children.", genres: ["animation", "comedy", "fantasy"], rating: 4.4, isBook: false },
  { title: "Finding Nemo", author: "Pixar", year: 2003, description: "Animated adventure about a fish searching for his son.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "The Incredibles", author: "Pixar", year: 2004, description: "Animated superhero adventure about a family of heroes.", genres: ["animation", "adventure", "superhero"], rating: 4.6, isBook: false },
  { title: "Cars", author: "Pixar", year: 2006, description: "Animated adventure about talking cars.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Ratatouille", author: "Pixar", year: 2007, description: "Animated comedy about a rat who wants to cook.", genres: ["animation", "comedy"], rating: 4.4, isBook: false },
  { title: "WALL-E", author: "Pixar", year: 2008, description: "Animated sci-fi romance about robots.", genres: ["animation", "sci-fi", "romance"], rating: 4.6, isBook: false },
  { title: "Up", author: "Pixar", year: 2009, description: "Animated adventure about an old man and a boy scout.", genres: ["animation", "adventure", "comedy"], rating: 4.7, isBook: false },
  { title: "Toy Story 3", author: "Pixar", year: 2010, description: "Animated adventure about toys dealing with growing up.", genres: ["animation", "adventure", "comedy"], rating: 4.7, isBook: false },
  { title: "Cars 2", author: "Pixar", year: 2011, description: "Animated adventure sequel about talking cars.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Brave", author: "Pixar", year: 2012, description: "Animated fantasy adventure about a Scottish princess.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "Monsters University", author: "Pixar", year: 2013, description: "Animated comedy prequel about monsters in college.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Inside Out", author: "Pixar", year: 2015, description: "Animated fantasy about emotions inside a girl's mind.", genres: ["animation", "fantasy", "comedy"], rating: 4.6, isBook: false },
  { title: "The Good Dinosaur", author: "Pixar", year: 2015, description: "Animated adventure about a dinosaur and a boy.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "Finding Dory", author: "Pixar", year: 2016, description: "Animated adventure sequel about a forgetful fish.", genres: ["animation", "adventure", "comedy"], rating: 4.3, isBook: false },
  { title: "Cars 3", author: "Pixar", year: 2017, description: "Animated adventure about an aging race car.", genres: ["animation", "adventure"], rating: 4.1, isBook: false },
  { title: "Coco", author: "Pixar", year: 2017, description: "Animated fantasy about a boy in the Land of the Dead.", genres: ["animation", "fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "Incredibles 2", author: "Pixar", year: 2018, description: "Animated superhero sequel about a family of heroes.", genres: ["animation", "adventure", "superhero"], rating: 4.4, isBook: false },
  { title: "Toy Story 4", author: "Pixar", year: 2019, description: "Animated adventure about toys finding their purpose.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "Onward", author: "Pixar", year: 2020, description: "Animated fantasy adventure about magic in modern times.", genres: ["animation", "fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Soul", author: "Pixar", year: 2020, description: "Animated fantasy about the meaning of life.", genres: ["animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Luca", author: "Pixar", year: 2021, description: "Animated coming-of-age story about sea monsters.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Turning Red", author: "Pixar", year: 2022, description: "Animated coming-of-age comedy about puberty.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Lightyear", author: "Pixar", year: 2022, description: "Animated sci-fi adventure about space exploration.", genres: ["animation", "sci-fi", "adventure"], rating: 3.9, isBook: false },
  { title: "Elemental", author: "Pixar", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "romance"], rating: 4.0, isBook: false },
  
  // Modern Blockbusters & Popular Films (2000s-2020s)
  { title: "The Dark Knight", author: "Christopher Nolan", year: 2008, description: "Superhero film about Batman facing the Joker.", genres: ["action", "crime", "superhero"], rating: 4.8, isBook: false },
  { title: "Inception", author: "Christopher Nolan", year: 2010, description: "Sci-fi thriller about dream infiltration.", genres: ["sci-fi", "thriller"], rating: 4.6, isBook: false },
  { title: "Interstellar", author: "Christopher Nolan", year: 2014, description: "Sci-fi drama about space exploration.", genres: ["sci-fi", "drama"], rating: 4.5, isBook: false },
  { title: "Dunkirk", author: "Christopher Nolan", year: 2017, description: "War drama about the evacuation of Dunkirk.", genres: ["war", "drama"], rating: 4.4, isBook: false },
  { title: "Tenet", author: "Christopher Nolan", year: 2020, description: "Sci-fi thriller about time inversion.", genres: ["sci-fi", "thriller"], rating: 4.2, isBook: false },
  { title: "Oppenheimer", author: "Christopher Nolan", year: 2023, description: "Biographical drama about J. Robert Oppenheimer.", genres: ["drama", "biography", "history"], rating: 4.5, isBook: false },
  { title: "The Lord of the Rings: The Fellowship of the Ring", author: "Peter Jackson", year: 2001, description: "Fantasy adventure about a hobbit's quest.", genres: ["fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "The Lord of the Rings: The Two Towers", author: "Peter Jackson", year: 2002, description: "Fantasy adventure sequel about Middle-earth.", genres: ["fantasy", "adventure"], rating: 4.6, isBook: false },
  { title: "The Lord of the Rings: The Return of the King", author: "Peter Jackson", year: 2003, description: "Fantasy adventure finale about the ring's destruction.", genres: ["fantasy", "adventure"], rating: 4.8, isBook: false },
  { title: "The Hobbit: An Unexpected Journey", author: "Peter Jackson", year: 2012, description: "Fantasy adventure about Bilbo Baggins.", genres: ["fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "The Hobbit: The Desolation of Smaug", author: "Peter Jackson", year: 2013, description: "Fantasy adventure about the dragon Smaug.", genres: ["fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "The Hobbit: The Battle of the Five Armies", author: "Peter Jackson", year: 2014, description: "Fantasy adventure about the final battle.", genres: ["fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Avatar", author: "James Cameron", year: 2009, description: "Sci-fi adventure about aliens on Pandora.", genres: ["sci-fi", "adventure"], rating: 4.3, isBook: false },
  { title: "Avatar: The Way of Water", author: "James Cameron", year: 2022, description: "Sci-fi adventure sequel about underwater exploration.", genres: ["sci-fi", "adventure"], rating: 4.1, isBook: false },
  { title: "Titanic", author: "James Cameron", year: 1997, description: "Romantic drama about the Titanic disaster.", genres: ["drama", "romance"], rating: 4.5, isBook: false },
  { title: "Terminator 2: Judgment Day", author: "James Cameron", year: 1991, description: "Sci-fi action about a cyborg protecting a boy.", genres: ["sci-fi", "action"], rating: 4.6, isBook: false },
  { title: "Aliens", author: "James Cameron", year: 1986, description: "Sci-fi horror about space marines fighting aliens.", genres: ["sci-fi", "horror"], rating: 4.5, isBook: false },
  { title: "The Terminator", author: "James Cameron", year: 1984, description: "Sci-fi action about a cyborg assassin.", genres: ["sci-fi", "action"], rating: 4.4, isBook: false },
  { title: "True Lies", author: "James Cameron", year: 1994, description: "Action comedy about a spy's double life.", genres: ["action", "comedy"], rating: 4.2, isBook: false },
  { title: "The Abyss", author: "James Cameron", year: 1989, description: "Sci-fi thriller about underwater aliens.", genres: ["sci-fi", "thriller"], rating: 4.1, isBook: false },
  { title: "Spider-Man", author: "Sam Raimi", year: 2002, description: "Superhero film about Peter Parker becoming Spider-Man.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Spider-Man 2", author: "Sam Raimi", year: 2004, description: "Superhero sequel about Spider-Man vs Doctor Octopus.", genres: ["action", "superhero"], rating: 4.5, isBook: false },
  { title: "Spider-Man 3", author: "Sam Raimi", year: 2007, description: "Superhero film about Spider-Man facing multiple villains.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Iron Man", author: "Jon Favreau", year: 2008, description: "Superhero film about Tony Stark becoming Iron Man.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Iron Man 2", author: "Jon Favreau", year: 2010, description: "Superhero sequel about Iron Man vs Whiplash.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Iron Man 3", author: "Shane Black", year: 2013, description: "Superhero film about Iron Man vs the Mandarin.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Captain America: The First Avenger", author: "Joe Johnston", year: 2011, description: "Superhero film about Steve Rogers becoming Captain America.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Captain America: The Winter Soldier", author: "Anthony and Joe Russo", year: 2014, description: "Superhero thriller about Captain America vs the Winter Soldier.", genres: ["action", "superhero", "thriller"], rating: 4.5, isBook: false },
  { title: "Captain America: Civil War", author: "Anthony and Joe Russo", year: 2016, description: "Superhero film about Avengers fighting each other.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Thor", author: "Kenneth Branagh", year: 2011, description: "Superhero film about Thor's journey to Earth.", genres: ["action", "superhero", "fantasy"], rating: 4.1, isBook: false },
  { title: "Thor: The Dark World", author: "Alan Taylor", year: 2013, description: "Superhero sequel about Thor vs the Dark Elves.", genres: ["action", "superhero", "fantasy"], rating: 4.0, isBook: false },
  { title: "Thor: Ragnarok", author: "Taika Waititi", year: 2017, description: "Superhero comedy about Thor's battle with Hela.", genres: ["action", "superhero", "comedy"], rating: 4.5, isBook: false },
  { title: "Thor: Love and Thunder", author: "Taika Waititi", year: 2022, description: "Superhero comedy about Thor's love story.", genres: ["action", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "The Avengers", author: "Joss Whedon", year: 2012, description: "Superhero film about Earth's mightiest heroes.", genres: ["action", "superhero"], rating: 4.5, isBook: false },
  { title: "Avengers: Age of Ultron", author: "Joss Whedon", year: 2015, description: "Superhero sequel about Avengers vs Ultron.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Avengers: Infinity War", author: "Anthony and Joe Russo", year: 2018, description: "Superhero film about Avengers vs Thanos.", genres: ["action", "superhero"], rating: 4.6, isBook: false },
  { title: "Avengers: Endgame", author: "Anthony and Joe Russo", year: 2019, description: "Superhero finale about Avengers' final battle.", genres: ["action", "superhero"], rating: 4.7, isBook: false },
  { title: "Black Panther", author: "Ryan Coogler", year: 2018, description: "Superhero film about the king of Wakanda.", genres: ["action", "superhero"], rating: 4.6, isBook: false },
  { title: "Black Panther: Wakanda Forever", author: "Ryan Coogler", year: 2022, description: "Superhero sequel about Wakanda's new protector.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Doctor Strange", author: "Scott Derrickson", year: 2016, description: "Superhero film about a surgeon becoming a sorcerer.", genres: ["action", "superhero", "fantasy"], rating: 4.2, isBook: false },
  { title: "Doctor Strange in the Multiverse of Madness", author: "Sam Raimi", year: 2022, description: "Superhero sequel about multiverse exploration.", genres: ["action", "superhero", "fantasy"], rating: 4.1, isBook: false },
  { title: "Guardians of the Galaxy", author: "James Gunn", year: 2014, description: "Superhero comedy about space misfits.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Guardians of the Galaxy Vol. 2", author: "James Gunn", year: 2017, description: "Superhero comedy sequel about family.", genres: ["action", "superhero", "comedy"], rating: 4.3, isBook: false },
  { title: "Guardians of the Galaxy Vol. 3", author: "James Gunn", year: 2023, description: "Superhero comedy finale about Rocket's origin.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Ant-Man", author: "Peyton Reed", year: 2015, description: "Superhero comedy about a shrinking hero.", genres: ["action", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "Ant-Man and the Wasp", author: "Peyton Reed", year: 2018, description: "Superhero comedy sequel about quantum realm.", genres: ["action", "superhero", "comedy"], rating: 4.0, isBook: false },
  { title: "Ant-Man and the Wasp: Quantumania", author: "Peyton Reed", year: 2023, description: "Superhero comedy about quantum realm adventure.", genres: ["action", "superhero", "comedy"], rating: 3.9, isBook: false },
  { title: "Captain Marvel", author: "Anna Boden", year: 2019, description: "Superhero film about Carol Danvers becoming Captain Marvel.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "The Marvels", author: "Nia DaCosta", year: 2023, description: "Superhero film about three heroes teaming up.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Shang-Chi and the Legend of the Ten Rings", author: "Destin Daniel Cretton", year: 2021, description: "Superhero film about a martial artist's journey.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Eternals", author: "Chloé Zhao", year: 2021, description: "Superhero film about immortal beings.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Black Widow", author: "Cate Shortland", year: 2021, description: "Superhero film about Natasha Romanoff's past.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Spider-Man: Homecoming", author: "Jon Watts", year: 2017, description: "Superhero film about young Spider-Man.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Spider-Man: Far From Home", author: "Jon Watts", year: 2019, description: "Superhero sequel about Spider-Man in Europe.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Spider-Man: No Way Home", author: "Jon Watts", year: 2021, description: "Superhero film about multiverse Spider-Men.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Venom", author: "Ruben Fleischer", year: 2018, description: "Superhero film about Eddie Brock and Venom.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Venom: Let There Be Carnage", author: "Andy Serkis", year: 2021, description: "Superhero sequel about Venom vs Carnage.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Morbius", author: "Daniel Espinosa", year: 2022, description: "Superhero film about a vampire doctor.", genres: ["action", "superhero", "horror"], rating: 3.5, isBook: false },
  { title: "Deadpool", author: "Tim Miller", year: 2016, description: "Superhero comedy about a wisecracking mercenary.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Deadpool 2", author: "David Leitch", year: 2018, description: "Superhero comedy sequel about Deadpool's team.", genres: ["action", "superhero", "comedy"], rating: 4.2, isBook: false },
  { title: "Logan", author: "James Mangold", year: 2017, description: "Superhero drama about an aging Wolverine.", genres: ["action", "superhero", "drama"], rating: 4.6, isBook: false },
  { title: "X-Men", author: "Bryan Singer", year: 2000, description: "Superhero film about mutant superheroes.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "X2: X-Men United", author: "Bryan Singer", year: 2003, description: "Superhero sequel about X-Men vs military.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "X-Men: The Last Stand", author: "Brett Ratner", year: 2006, description: "Superhero film about a cure for mutants.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "X-Men: First Class", author: "Matthew Vaughn", year: 2011, description: "Superhero prequel about young X-Men.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "X-Men: Days of Future Past", author: "Bryan Singer", year: 2014, description: "Superhero film about time travel to save mutants.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "X-Men: Apocalypse", author: "Bryan Singer", year: 2016, description: "Superhero film about ancient mutant Apocalypse.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Dark Phoenix", author: "Simon Kinberg", year: 2019, description: "Superhero film about Jean Grey's dark powers.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "The New Mutants", author: "Josh Boone", year: 2020, description: "Superhero horror about young mutants.", genres: ["action", "superhero", "horror"], rating: 3.6, isBook: false },
  { title: "Fantastic Four", author: "Tim Story", year: 2005, description: "Superhero film about a family of superheroes.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Fantastic Four: Rise of the Silver Surfer", author: "Tim Story", year: 2007, description: "Superhero sequel about the Silver Surfer.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Fantastic Four", author: "Josh Trank", year: 2015, description: "Superhero reboot about the Fantastic Four.", genres: ["action", "superhero"], rating: 3.4, isBook: false },
  { title: "Blade", author: "Stephen Norrington", year: 1998, description: "Superhero horror about a vampire hunter.", genres: ["action", "superhero", "horror"], rating: 4.2, isBook: false },
  { title: "Blade II", author: "Guillermo del Toro", year: 2002, description: "Superhero horror sequel about vampire war.", genres: ["action", "superhero", "horror"], rating: 4.1, isBook: false },
  { title: "Blade: Trinity", author: "David S. Goyer", year: 2004, description: "Superhero horror finale about Dracula.", genres: ["action", "superhero", "horror"], rating: 3.8, isBook: false },
  { title: "The Punisher", author: "Jonathan Hensleigh", year: 2004, description: "Superhero action about a vigilante.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Punisher: War Zone", author: "Lexi Alexander", year: 2008, description: "Superhero action about the Punisher's war.", genres: ["action", "superhero"], rating: 3.6, isBook: false },
  { title: "Ghost Rider", author: "Mark Steven Johnson", year: 2007, description: "Superhero film about a demonic motorcyclist.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Ghost Rider: Spirit of Vengeance", author: "Mark Neveldine", year: 2012, description: "Superhero sequel about Ghost Rider's vengeance.", genres: ["action", "superhero"], rating: 3.5, isBook: false },
  { title: "Daredevil", author: "Mark Steven Johnson", year: 2003, description: "Superhero film about a blind vigilante.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Elektra", author: "Rob Bowman", year: 2005, description: "Superhero film about an assassin.", genres: ["action", "superhero"], rating: 3.6, isBook: false },
  { title: "Hulk", author: "Ang Lee", year: 2003, description: "Superhero film about Bruce Banner and the Hulk.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "The Incredible Hulk", author: "Louis Leterrier", year: 2008, description: "Superhero reboot about the Hulk.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Man of Steel", author: "Zack Snyder", year: 2013, description: "Superhero film about Superman's origin.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Batman v Superman: Dawn of Justice", author: "Zack Snyder", year: 2016, description: "Superhero film about Batman vs Superman.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Suicide Squad", author: "David Ayer", year: 2016, description: "Superhero film about villainous antiheroes.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Wonder Woman", author: "Patty Jenkins", year: 2017, description: "Superhero film about Wonder Woman in WWI.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Wonder Woman 1984", author: "Patty Jenkins", year: 2020, description: "Superhero sequel about Wonder Woman in the 80s.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Justice League", author: "Zack Snyder", year: 2017, description: "Superhero film about DC's greatest heroes.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Zack Snyder's Justice League", author: "Zack Snyder", year: 2021, description: "Director's cut of Justice League.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Aquaman", author: "James Wan", year: 2018, description: "Superhero film about the king of Atlantis.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Aquaman and the Lost Kingdom", author: "James Wan", year: 2023, description: "Superhero sequel about Aquaman's family.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Shazam!", author: "David F. Sandberg", year: 2019, description: "Superhero comedy about a boy who becomes a hero.", genres: ["action", "superhero", "comedy"], rating: 4.2, isBook: false },
  { title: "Shazam! Fury of the Gods", author: "David F. Sandberg", year: 2023, description: "Superhero comedy sequel about ancient gods.", genres: ["action", "superhero", "comedy"], rating: 3.8, isBook: false },
  { title: "Birds of Prey", author: "Cathy Yan", year: 2020, description: "Superhero film about Harley Quinn and her team.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "The Suicide Squad", author: "James Gunn", year: 2021, description: "Superhero film about villainous antiheroes.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Black Adam", author: "Jaume Collet-Serra", year: 2022, description: "Superhero film about an ancient antihero.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "The Flash", author: "Andy Muschietti", year: 2023, description: "Superhero film about the Flash's multiverse adventure.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Blue Beetle", author: "Ángel Manuel Soto", year: 2023, description: "Superhero film about a young hero with alien technology.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  
  // Holiday & Seasonal Movies
  // Christmas Movies
  { title: "It's a Wonderful Life", author: "Frank Capra", year: 1946, description: "Classic Christmas drama about a man who learns the value of his life.", genres: ["drama", "christmas", "fantasy"], rating: 4.7, isBook: false },
  { title: "A Christmas Story", author: "Bob Clark", year: 1983, description: "Comedy about a boy who wants a Red Ryder BB gun for Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.4, isBook: false },
  { title: "Home Alone", author: "Chris Columbus", year: 1990, description: "Comedy about a boy who defends his home from burglars during Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.5, isBook: false },
  { title: "Home Alone 2: Lost in New York", author: "Chris Columbus", year: 1992, description: "Comedy sequel about a boy lost in New York during Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.2, isBook: false },
  { title: "Miracle on 34th Street", author: "George Seaton", year: 1947, description: "Christmas drama about a man who claims to be Santa Claus.", genres: ["drama", "christmas", "family"], rating: 4.5, isBook: false },
  { title: "Miracle on 34th Street", author: "Les Mayfield", year: 1994, description: "Remake of the classic Christmas drama about Santa Claus.", genres: ["drama", "christmas", "family"], rating: 4.1, isBook: false },
  { title: "Elf", author: "Jon Favreau", year: 2003, description: "Comedy about a human raised as an elf who visits New York.", genres: ["comedy", "christmas", "family"], rating: 4.4, isBook: false },
  { title: "The Santa Clause", author: "John Pasquin", year: 1994, description: "Comedy about a man who becomes Santa Claus.", genres: ["comedy", "christmas", "family"], rating: 4.2, isBook: false },
  { title: "The Santa Clause 2", author: "Michael Lembeck", year: 2002, description: "Comedy sequel about Santa finding a wife.", genres: ["comedy", "christmas", "family"], rating: 3.9, isBook: false },
  { title: "The Santa Clause 3: The Escape Clause", author: "Michael Lembeck", year: 2006, description: "Comedy about Santa dealing with Jack Frost.", genres: ["comedy", "christmas", "family"], rating: 3.7, isBook: false },
  { title: "How the Grinch Stole Christmas", author: "Ron Howard", year: 2000, description: "Comedy about the Grinch trying to steal Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.3, isBook: false },
  { title: "The Grinch", author: "Scott Mosier", year: 2018, description: "Animated comedy about the Grinch's heart growing three sizes.", genres: ["animation", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "A Christmas Carol", author: "Robert Zemeckis", year: 2009, description: "Animated adaptation of Dickens' classic Christmas story.", genres: ["animation", "drama", "christmas"], rating: 4.1, isBook: false },
  { title: "Scrooged", author: "Richard Donner", year: 1988, description: "Comedy adaptation of A Christmas Carol set in modern times.", genres: ["comedy", "christmas", "fantasy"], rating: 4.2, isBook: false },
  { title: "The Polar Express", author: "Robert Zemeckis", year: 2004, description: "Animated adventure about a magical train to the North Pole.", genres: ["animation", "adventure", "christmas"], rating: 4.3, isBook: false },
  { title: "The Nightmare Before Christmas", author: "Henry Selick", year: 1993, description: "Animated musical about Jack Skellington discovering Christmas.", genres: ["animation", "musical", "christmas"], rating: 4.4, isBook: false },
  { title: "White Christmas", author: "Michael Curtiz", year: 1954, description: "Musical about two performers helping a retired general.", genres: ["musical", "romance", "christmas"], rating: 4.3, isBook: false },
  { title: "Holiday Inn", author: "Mark Sandrich", year: 1942, description: "Musical about a performer who opens a hotel for holidays.", genres: ["musical", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Meet Me in St. Louis", author: "Vincente Minnelli", year: 1944, description: "Musical about a family's year in St. Louis.", genres: ["musical", "drama", "christmas"], rating: 4.1, isBook: false },
  { title: "Love Actually", author: "Richard Curtis", year: 2003, description: "Romantic comedy about love stories during Christmas in London.", genres: ["comedy", "romance", "christmas"], rating: 4.3, isBook: false },
  { title: "The Holiday", author: "Nancy Meyers", year: 2006, description: "Romantic comedy about two women swapping homes for Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Last Christmas", author: "Paul Feig", year: 2019, description: "Romantic comedy about a woman finding love during Christmas.", genres: ["comedy", "romance", "christmas"], rating: 3.8, isBook: false },
  { title: "The Family Stone", author: "Thomas Bezucha", year: 2005, description: "Comedy-drama about a family gathering for Christmas.", genres: ["comedy", "drama", "christmas"], rating: 4.0, isBook: false },
  { title: "Four Christmases", author: "Seth Gordon", year: 2008, description: "Comedy about a couple visiting four different families on Christmas.", genres: ["comedy", "romance", "christmas"], rating: 3.9, isBook: false },
  { title: "Christmas with the Kranks", author: "Joe Roth", year: 2004, description: "Comedy about a couple trying to skip Christmas.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Jingle All the Way", author: "Brian Levant", year: 1996, description: "Comedy about a father's quest to find a popular toy for Christmas.", genres: ["comedy", "family", "christmas"], rating: 3.8, isBook: false },
  { title: "Deck the Halls", author: "John Whitesell", year: 2006, description: "Comedy about neighbors competing with Christmas decorations.", genres: ["comedy", "family", "christmas"], rating: 3.6, isBook: false },
  { title: "Fred Claus", author: "David Dobkin", year: 2007, description: "Comedy about Santa's brother coming to the North Pole.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Arthur Christmas", author: "Sarah Smith", year: 2011, description: "Animated comedy about Santa's son delivering a missed present.", genres: ["animation", "comedy", "christmas"], rating: 4.1, isBook: false },
  { title: "Rise of the Guardians", author: "Peter Ramsey", year: 2012, description: "Animated adventure about holiday legends protecting children.", genres: ["animation", "adventure", "christmas"], rating: 4.2, isBook: false },
  { title: "Klaus", author: "Sergio Pablos", year: 2019, description: "Animated comedy about a postman helping a toymaker become Santa.", genres: ["animation", "comedy", "christmas"], rating: 4.4, isBook: false },
  { title: "Noelle", author: "Marc Lawrence", year: 2019, description: "Comedy about Santa's daughter taking over the family business.", genres: ["comedy", "family", "christmas"], rating: 3.9, isBook: false },
  { title: "The Christmas Chronicles", author: "Clay Kaytis", year: 2018, description: "Adventure comedy about two siblings helping Santa save Christmas.", genres: ["adventure", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "The Christmas Chronicles 2", author: "Chris Columbus", year: 2020, description: "Adventure sequel about saving Christmas from an evil force.", genres: ["adventure", "comedy", "christmas"], rating: 3.8, isBook: false },
  { title: "A Boy Called Christmas", author: "Gil Kenan", year: 2021, description: "Fantasy adventure about a boy's journey to find his father and Christmas.", genres: ["fantasy", "adventure", "christmas"], rating: 4.0, isBook: false },
  { title: "Spirited", author: "Sean Anders", year: 2022, description: "Musical comedy about Christmas spirits reforming a cynic.", genres: ["musical", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "Violent Night", author: "Tommy Wirkola", year: 2022, description: "Action comedy about Santa fighting criminals on Christmas Eve.", genres: ["action", "comedy", "christmas"], rating: 3.9, isBook: false },
  { title: "Candy Cane Lane", author: "Reginald Hudlin", year: 2023, description: "Comedy about a man making a deal with an elf for Christmas decorations.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Genie", author: "Sam Boyd", year: 2023, description: "Comedy about a man who gets three wishes from a genie during Christmas.", genres: ["comedy", "fantasy", "christmas"], rating: 3.8, isBook: false },
  
  // Halloween Movies
  { title: "Halloween", author: "John Carpenter", year: 1978, description: "Horror film about Michael Myers stalking babysitters.", genres: ["horror", "thriller", "halloween"], rating: 4.5, isBook: false },
  { title: "Halloween II", author: "Rick Rosenthal", year: 1981, description: "Horror sequel about Michael Myers continuing his killing spree.", genres: ["horror", "thriller", "halloween"], rating: 4.1, isBook: false },
  { title: "Halloween III: Season of the Witch", author: "Tommy Lee Wallace", year: 1982, description: "Horror about a doctor investigating mysterious Halloween masks.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween 4: The Return of Michael Myers", author: "Dwight H. Little", year: 1988, description: "Horror about Michael Myers returning to kill his niece.", genres: ["horror", "thriller", "halloween"], rating: 3.9, isBook: false },
  { title: "Halloween 5: The Revenge of Michael Myers", author: "Dominique Othenin-Girard", year: 1989, description: "Horror about Michael Myers seeking revenge on his niece.", genres: ["horror", "thriller", "halloween"], rating: 3.7, isBook: false },
  { title: "Halloween: The Curse of Michael Myers", author: "Joe Chappelle", year: 1995, description: "Horror about Michael Myers and a mysterious cult.", genres: ["horror", "thriller", "halloween"], rating: 3.6, isBook: false },
  { title: "Halloween H20: 20 Years Later", author: "Steve Miner", year: 1998, description: "Horror about Laurie Strode facing Michael Myers again.", genres: ["horror", "thriller", "halloween"], rating: 4.0, isBook: false },
  { title: "Halloween: Resurrection", author: "Rick Rosenthal", year: 2002, description: "Horror about a reality show in Michael Myers' house.", genres: ["horror", "thriller", "halloween"], rating: 3.5, isBook: false },
  { title: "Halloween", author: "Rob Zombie", year: 2007, description: "Horror remake about Michael Myers' origin story.", genres: ["horror", "thriller", "halloween"], rating: 4.0, isBook: false },
  { title: "Halloween II", author: "Rob Zombie", year: 2009, description: "Horror sequel about Michael Myers and his sister.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween", author: "David Gordon Green", year: 2018, description: "Horror sequel about Laurie Strode's final confrontation with Michael Myers.", genres: ["horror", "thriller", "halloween"], rating: 4.2, isBook: false },
  { title: "Halloween Kills", author: "David Gordon Green", year: 2021, description: "Horror sequel about the town fighting back against Michael Myers.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween Ends", author: "David Gordon Green", year: 2022, description: "Horror finale about the final battle between Laurie and Michael.", genres: ["horror", "thriller", "halloween"], rating: 3.9, isBook: false },
  { title: "Hocus Pocus", author: "Kenny Ortega", year: 1993, description: "Comedy about three witches resurrected on Halloween.", genres: ["comedy", "fantasy", "halloween"], rating: 4.3, isBook: false },
  { title: "Hocus Pocus 2", author: "Anne Fletcher", year: 2022, description: "Comedy sequel about the Sanderson sisters returning on Halloween.", genres: ["comedy", "fantasy", "halloween"], rating: 3.9, isBook: false },
  { title: "The Nightmare Before Christmas", author: "Henry Selick", year: 1993, description: "Animated musical about Jack Skellington discovering Christmas.", genres: ["animation", "musical", "halloween"], rating: 4.4, isBook: false },
  { title: "Beetlejuice", author: "Tim Burton", year: 1988, description: "Comedy about a ghost couple hiring a bio-exorcist.", genres: ["comedy", "fantasy", "halloween"], rating: 4.3, isBook: false },
  { title: "The Addams Family", author: "Barry Sonnenfeld", year: 1991, description: "Comedy about a quirky family dealing with a con artist.", genres: ["comedy", "fantasy", "halloween"], rating: 4.2, isBook: false },
  { title: "Addams Family Values", author: "Barry Sonnenfeld", year: 1993, description: "Comedy sequel about the Addams family and a gold digger.", genres: ["comedy", "fantasy", "halloween"], rating: 4.1, isBook: false },
  { title: "Casper", author: "Brad Silberling", year: 1995, description: "Comedy about a friendly ghost and a paranormal expert.", genres: ["comedy", "fantasy", "halloween"], rating: 4.0, isBook: false },
  { title: "The Craft", author: "Andrew Fleming", year: 1996, description: "Horror about four teenage girls practicing witchcraft.", genres: ["horror", "thriller", "halloween"], rating: 4.1, isBook: false },
  { title: "Practical Magic", author: "Griffin Dunne", year: 1998, description: "Romantic comedy about two witch sisters.", genres: ["comedy", "romance", "halloween"], rating: 4.0, isBook: false },
  { title: "Sleepy Hollow", author: "Tim Burton", year: 1999, description: "Horror mystery about the Headless Horseman.", genres: ["horror", "mystery", "halloween"], rating: 4.2, isBook: false },
  { title: "The Haunted Mansion", author: "Rob Minkoff", year: 2003, description: "Comedy about a family trapped in a haunted mansion.", genres: ["comedy", "fantasy", "halloween"], rating: 3.8, isBook: false },
  { title: "Monster House", author: "Gil Kenan", year: 2006, description: "Animated horror comedy about a house that eats people.", genres: ["animation", "horror", "halloween"], rating: 4.1, isBook: false },
  { title: "ParaNorman", author: "Chris Butler", year: 2012, description: "Animated comedy about a boy who can see and talk to ghosts.", genres: ["animation", "comedy", "halloween"], rating: 4.2, isBook: false },
  { title: "The Book of Life", author: "Jorge R. Gutierrez", year: 2014, description: "Animated adventure about a man's journey through the Land of the Dead.", genres: ["animation", "adventure", "halloween"], rating: 4.1, isBook: false },
  { title: "Coco", author: "Lee Unkrich", year: 2017, description: "Animated adventure about a boy's journey to the Land of the Dead.", genres: ["animation", "adventure", "halloween"], rating: 4.5, isBook: false },
  { title: "The Addams Family", author: "Conrad Vernon", year: 2019, description: "Animated comedy about the Addams family moving to a new town.", genres: ["animation", "comedy", "halloween"], rating: 3.9, isBook: false },
  { title: "The Addams Family 2", author: "Greg Tiernan", year: 2021, description: "Animated comedy sequel about the Addams family on a road trip.", genres: ["animation", "comedy", "halloween"], rating: 3.7, isBook: false },
  { title: "Wendell & Wild", author: "Henry Selick", year: 2022, description: "Animated comedy about two demon brothers and a teenage girl.", genres: ["animation", "comedy", "halloween"], rating: 3.8, isBook: false },
  
  // Thanksgiving Movies
  { title: "Planes, Trains and Automobiles", author: "John Hughes", year: 1987, description: "Comedy about two men trying to get home for Thanksgiving.", genres: ["comedy", "thanksgiving"], rating: 4.4, isBook: false },
  { title: "Home for the Holidays", author: "Jodie Foster", year: 1995, description: "Comedy-drama about a family gathering for Thanksgiving.", genres: ["comedy", "drama", "thanksgiving"], rating: 4.1, isBook: false },
  { title: "The Ice Storm", author: "Ang Lee", year: 1997, description: "Drama about two families during Thanksgiving weekend.", genres: ["drama", "thanksgiving"], rating: 4.2, isBook: false },
  { title: "Pieces of April", author: "Peter Hedges", year: 2003, description: "Drama about a young woman cooking Thanksgiving dinner.", genres: ["drama", "thanksgiving"], rating: 4.0, isBook: false },
  { title: "The Blind Side", author: "John Lee Hancock", year: 2009, description: "Drama about a family taking in a homeless teenager.", genres: ["drama", "sports", "thanksgiving"], rating: 4.3, isBook: false },
  { title: "Free Birds", author: "Jimmy Hayward", year: 2013, description: "Animated comedy about turkeys trying to change Thanksgiving.", genres: ["animation", "comedy", "thanksgiving"], rating: 3.8, isBook: false },
  { title: "Addams Family Values", author: "Barry Sonnenfeld", year: 1993, description: "Comedy about the Addams family at summer camp.", genres: ["comedy", "fantasy", "thanksgiving"], rating: 4.1, isBook: false },
  
  // Valentine's Day Movies
  { title: "Valentine's Day", author: "Garry Marshall", year: 2010, description: "Romantic comedy about love stories on Valentine's Day.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "The Notebook", author: "Nick Cassavetes", year: 2004, description: "Romantic drama about a couple's love story.", genres: ["drama", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Titanic", author: "James Cameron", year: 1997, description: "Romantic drama about love on the Titanic.", genres: ["drama", "romance", "valentines"], rating: 4.5, isBook: false },
  { title: "La La Land", author: "Damien Chazelle", year: 2016, description: "Musical romantic comedy about aspiring artists.", genres: ["musical", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "500 Days of Summer", author: "Marc Webb", year: 2009, description: "Romantic comedy about a man's relationship with Summer.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "Eternal Sunshine of the Spotless Mind", author: "Michel Gondry", year: 2004, description: "Romantic sci-fi about erasing memories of love.", genres: ["sci-fi", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Before Sunrise", author: "Richard Linklater", year: 1995, description: "Romantic drama about two strangers spending a night together.", genres: ["drama", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Before Sunset", author: "Richard Linklater", year: 2004, description: "Romantic drama sequel about the couple reuniting.", genres: ["drama", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Before Midnight", author: "Richard Linklater", year: 2013, description: "Romantic drama about the couple's relationship challenges.", genres: ["drama", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Crazy, Stupid, Love", author: "Glenn Ficarra", year: 2011, description: "Romantic comedy about love and relationships.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "The Proposal", author: "Anne Fletcher", year: 2009, description: "Romantic comedy about a fake engagement.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "27 Dresses", author: "Anne Fletcher", year: 2008, description: "Romantic comedy about a perpetual bridesmaid.", genres: ["comedy", "romance", "valentines"], rating: 4.0, isBook: false },
  { title: "The Wedding Planner", author: "Adam Shankman", year: 2001, description: "Romantic comedy about a wedding planner falling in love.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "My Best Friend's Wedding", author: "P.J. Hogan", year: 1997, description: "Romantic comedy about a woman trying to break up a wedding.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Pretty Woman", author: "Garry Marshall", year: 1990, description: "Romantic comedy about a businessman and a prostitute.", genres: ["comedy", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "When Harry Met Sally", author: "Rob Reiner", year: 1989, description: "Romantic comedy about friends becoming lovers.", genres: ["comedy", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Sleepless in Seattle", author: "Nora Ephron", year: 1993, description: "Romantic comedy about love letters and destiny.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "You've Got Mail", author: "Nora Ephron", year: 1998, description: "Romantic comedy about online romance.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Notting Hill", author: "Roger Michell", year: 1999, description: "Romantic comedy about a bookseller and a movie star.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "Four Weddings and a Funeral", author: "Mike Newell", year: 1994, description: "Romantic comedy about love and weddings.", genres: ["comedy", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Bridget Jones's Diary", author: "Sharon Maguire", year: 2001, description: "Romantic comedy about a single woman's diary.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Bridget Jones: The Edge of Reason", author: "Beeban Kidron", year: 2004, description: "Romantic comedy sequel about Bridget's relationship.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "Bridget Jones's Baby", author: "Sharon Maguire", year: 2016, description: "Romantic comedy about Bridget's unexpected pregnancy.", genres: ["comedy", "romance", "valentines"], rating: 3.8, isBook: false },
  
  // Additional Romantic Comedies
  { title: "How to Lose a Guy in 10 Days", author: "Donald Petrie", year: 2003, description: "Romantic comedy about a bet between a woman and a man.", genres: ["comedy", "romance"], rating: 4.0, isBook: false },
  { title: "13 Going on 30", author: "Gary Winick", year: 2004, description: "Romantic comedy about a girl who wakes up as her 30-year-old self.", genres: ["comedy", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "The Devil Wears Prada", author: "David Frankel", year: 2006, description: "Comedy-drama about a young woman working for a demanding fashion editor.", genres: ["comedy", "drama", "fashion"], rating: 4.2, isBook: false },
  { title: "Legally Blonde", author: "Robert Luketic", year: 2001, description: "Comedy about a sorority girl who goes to Harvard Law School.", genres: ["comedy", "romance"], rating: 4.1, isBook: false },
  { title: "Legally Blonde 2: Red, White & Blonde", author: "Charles Herman-Wurmfeld", year: 2003, description: "Comedy sequel about Elle Woods fighting for animal rights.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Miss Congeniality", author: "Donald Petrie", year: 2000, description: "Comedy about an FBI agent going undercover at a beauty pageant.", genres: ["comedy", "romance", "crime"], rating: 4.0, isBook: false },
  { title: "Miss Congeniality 2: Armed and Fabulous", author: "John Pasquin", year: 2005, description: "Comedy sequel about an FBI agent protecting a beauty pageant.", genres: ["comedy", "romance", "crime"], rating: 3.7, isBook: false },
  { title: "The Princess Diaries", author: "Garry Marshall", year: 2001, description: "Comedy about a teenager discovering she's a princess.", genres: ["comedy", "family", "romance"], rating: 4.1, isBook: false },
  { title: "The Princess Diaries 2: Royal Engagement", author: "Garry Marshall", year: 2004, description: "Comedy sequel about a princess finding love.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "Confessions of a Shopaholic", author: "P.J. Hogan", year: 2009, description: "Romantic comedy about a shopaholic trying to get her life together.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "The Ugly Truth", author: "Robert Luketic", year: 2009, description: "Romantic comedy about a TV producer and a relationship expert.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "He's Just Not That Into You", author: "Ken Kwapis", year: 2009, description: "Romantic comedy about various relationship scenarios.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "The Break-Up", author: "Peyton Reed", year: 2006, description: "Romantic comedy about a couple who break up but continue living together.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Failure to Launch", author: "Tom Dey", year: 2006, description: "Romantic comedy about a man who still lives with his parents.", genres: ["comedy", "romance"], rating: 3.7, isBook: false },
  { title: "The Wedding Date", author: "Clare Kilner", year: 2005, description: "Romantic comedy about a woman hiring a male escort for her sister's wedding.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Just Like Heaven", author: "Mark Waters", year: 2005, description: "Romantic comedy about a man who falls in love with a ghost.", genres: ["comedy", "romance", "fantasy"], rating: 3.9, isBook: false },
  { title: "The Family Stone", author: "Thomas Bezucha", year: 2005, description: "Romantic comedy about a woman meeting her boyfriend's family at Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.0, isBook: false },
  { title: "The Holiday", author: "Nancy Meyers", year: 2006, description: "Romantic comedy about two women swapping homes for Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Something's Gotta Give", author: "Nancy Meyers", year: 2003, description: "Romantic comedy about love between older adults.", genres: ["comedy", "romance"], rating: 4.1, isBook: false },
  { title: "It's Complicated", author: "Nancy Meyers", year: 2009, description: "Romantic comedy about a divorced woman's complicated love life.", genres: ["comedy", "romance"], rating: 4.0, isBook: false },
  
  // Easter Movies
  { title: "The Ten Commandments", author: "Cecil B. DeMille", year: 1956, description: "Epic drama about Moses leading the Israelites.", genres: ["drama", "history", "easter"], rating: 4.4, isBook: false },
  { title: "Ben-Hur", author: "William Wyler", year: 1959, description: "Epic drama about a Jewish prince seeking revenge.", genres: ["drama", "history", "easter"], rating: 4.5, isBook: false },
  { title: "The Passion of the Christ", author: "Mel Gibson", year: 2004, description: "Drama about the final hours of Jesus Christ.", genres: ["drama", "history", "easter"], rating: 4.2, isBook: false },
  { title: "Braveheart", author: "Mel Gibson", year: 1995, description: "Epic historical drama about Scottish warrior William Wallace fighting for freedom.", genres: ["drama", "history", "war", "action"], rating: 4.5, isBook: false },
  { title: "Lethal Weapon", author: "Richard Donner", year: 1987, description: "Action comedy about two mismatched LAPD detectives.", genres: ["action", "comedy", "crime"], rating: 4.3, isBook: false },
  { title: "Lethal Weapon 2", author: "Richard Donner", year: 1989, description: "Action comedy sequel about detectives fighting South African drug smugglers.", genres: ["action", "comedy", "crime"], rating: 4.2, isBook: false },
  { title: "Lethal Weapon 3", author: "Richard Donner", year: 1992, description: "Action comedy about detectives investigating police corruption.", genres: ["action", "comedy", "crime"], rating: 4.1, isBook: false },
  { title: "Lethal Weapon 4", author: "Richard Donner", year: 1998, description: "Action comedy about detectives fighting Chinese triads.", genres: ["action", "comedy", "crime"], rating: 4.0, isBook: false },
  { title: "Mad Max", author: "George Miller", year: 1979, description: "Post-apocalyptic action film about a police officer seeking revenge.", genres: ["action", "sci-fi", "dystopian"], rating: 4.2, isBook: false },
  { title: "Mad Max 2: The Road Warrior", author: "George Miller", year: 1981, description: "Post-apocalyptic action sequel about protecting a fuel convoy.", genres: ["action", "sci-fi", "dystopian"], rating: 4.4, isBook: false },
  { title: "Mad Max Beyond Thunderdome", author: "George Miller", year: 1985, description: "Post-apocalyptic action about Max in a desert city.", genres: ["action", "sci-fi", "dystopian"], rating: 4.1, isBook: false },
  { title: "Mad Max: Fury Road", author: "George Miller", year: 2015, description: "Post-apocalyptic action about Max helping women escape a tyrant.", genres: ["action", "sci-fi", "dystopian"], rating: 4.5, isBook: false },
  { title: "What Women Want", author: "Nancy Meyers", year: 2000, description: "Romantic comedy about a man who can hear women's thoughts.", genres: ["comedy", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "Signs", author: "M. Night Shyamalan", year: 2002, description: "Sci-fi thriller about a family dealing with crop circles and aliens.", genres: ["sci-fi", "thriller", "mystery"], rating: 4.2, isBook: false },
  { title: "We Were Soldiers", author: "Randall Wallace", year: 2002, description: "War drama about the Battle of Ia Drang during the Vietnam War.", genres: ["war", "drama", "history"], rating: 4.1, isBook: false },
  { title: "Apocalypto", author: "Mel Gibson", year: 2006, description: "Action adventure about a Mayan man's journey to save his family.", genres: ["action", "adventure", "history"], rating: 4.3, isBook: false },
  { title: "Hacksaw Ridge", author: "Mel Gibson", year: 2016, description: "War drama about a conscientious objector who saved 75 men in WWII.", genres: ["war", "drama", "history"], rating: 4.4, isBook: false },
  { title: "Risen", author: "Kevin Reynolds", year: 2016, description: "Drama about a Roman soldier investigating Jesus' resurrection.", genres: ["drama", "history", "easter"], rating: 4.0, isBook: false },
  { title: "Hop", author: "Tim Hill", year: 2011, description: "Animated comedy about the Easter Bunny's son.", genres: ["animation", "comedy", "easter"], rating: 3.8, isBook: false },
  { title: "Peter Rabbit", author: "Will Gluck", year: 2018, description: "Animated comedy about Peter Rabbit and his adventures.", genres: ["animation", "comedy", "easter"], rating: 3.9, isBook: false },
  { title: "Peter Rabbit 2: The Runaway", author: "Will Gluck", year: 2021, description: "Animated comedy sequel about Peter Rabbit's city adventure.", genres: ["animation", "comedy", "easter"], rating: 3.7, isBook: false },
  
  // St. Patrick's Day Movies
  { title: "The Quiet Man", author: "John Ford", year: 1952, description: "Romantic drama about an American returning to Ireland.", genres: ["drama", "romance", "stpatricks"], rating: 4.3, isBook: false },
  { title: "Waking Ned Devine", author: "Kirk Jones", year: 1998, description: "Comedy about a village trying to claim lottery winnings.", genres: ["comedy", "stpatricks"], rating: 4.1, isBook: false },
  { title: "The Commitments", author: "Alan Parker", year: 1991, description: "Musical comedy about an Irish soul band.", genres: ["musical", "comedy", "stpatricks"], rating: 4.2, isBook: false },
  { title: "In the Name of the Father", author: "Jim Sheridan", year: 1993, description: "Drama about the Guildford Four case.", genres: ["drama", "stpatricks"], rating: 4.4, isBook: false },
  { title: "My Left Foot", author: "Jim Sheridan", year: 1989, description: "Drama about Christy Brown overcoming cerebral palsy.", genres: ["drama", "biography", "stpatricks"], rating: 4.3, isBook: false },
  { title: "The Wind That Shakes the Barley", author: "Ken Loach", year: 2006, description: "Drama about the Irish War of Independence.", genres: ["drama", "history", "stpatricks"], rating: 4.2, isBook: false },
  { title: "Brooklyn", author: "John Crowley", year: 2015, description: "Romantic drama about an Irish immigrant in 1950s Brooklyn.", genres: ["drama", "romance", "stpatricks"], rating: 4.1, isBook: false },
  { title: "Sing Street", author: "John Carney", year: 2016, description: "Musical comedy about a boy forming a band in 1980s Dublin.", genres: ["musical", "comedy", "stpatricks"], rating: 4.3, isBook: false },
  
  // Independence Day Movies
  { title: "Independence Day", author: "Roland Emmerich", year: 1996, description: "Sci-fi action about aliens attacking Earth on July 4th.", genres: ["sci-fi", "action", "independenceday"], rating: 4.3, isBook: false },
  { title: "Independence Day: Resurgence", author: "Roland Emmerich", year: 2016, description: "Sci-fi action sequel about aliens returning to Earth.", genres: ["sci-fi", "action", "independenceday"], rating: 3.8, isBook: false },
  { title: "The Patriot", author: "Roland Emmerich", year: 2000, description: "War drama about a father fighting in the American Revolution.", genres: ["war", "drama", "independenceday"], rating: 4.2, isBook: false },
  { title: "1776", author: "Peter H. Hunt", year: 1972, description: "Musical about the signing of the Declaration of Independence.", genres: ["musical", "history", "independenceday"], rating: 4.1, isBook: false },
  { title: "National Treasure", author: "Jon Turteltaub", year: 2004, description: "Adventure about a treasure hunter seeking the Declaration of Independence.", genres: ["adventure", "mystery", "independenceday"], rating: 4.0, isBook: false },
  { title: "National Treasure: Book of Secrets", author: "Jon Turteltaub", year: 2007, description: "Adventure sequel about searching for a lost city of gold.", genres: ["adventure", "mystery", "independenceday"], rating: 3.9, isBook: false },
  { title: "Jaws", author: "Steven Spielberg", year: 1975, description: "Thriller about a shark terrorizing a beach town on July 4th.", genres: ["thriller", "horror", "independenceday"], rating: 4.5, isBook: false },
  { title: "Born on the Fourth of July", author: "Oliver Stone", year: 1989, description: "Drama about a Vietnam War veteran's journey.", genres: ["drama", "war", "independenceday"], rating: 4.3, isBook: false },
  
  // New Year's Movies
  { title: "When Harry Met Sally", author: "Rob Reiner", year: 1989, description: "Romantic comedy about friends becoming lovers over New Year's.", genres: ["comedy", "romance", "newyear"], rating: 4.4, isBook: false },
  { title: "New Year's Eve", author: "Garry Marshall", year: 2011, description: "Romantic comedy about love stories on New Year's Eve.", genres: ["comedy", "romance", "newyear"], rating: 3.7, isBook: false },
  { title: "About Time", author: "Richard Curtis", year: 2013, description: "Romantic comedy about a man who can travel through time.", genres: ["comedy", "romance", "newyear"], rating: 4.3, isBook: false },
  { title: "The Apartment", author: "Billy Wilder", year: 1960, description: "Romantic comedy about an office worker lending his apartment.", genres: ["comedy", "romance", "newyear"], rating: 4.4, isBook: false },
  { title: "Ghostbusters II", author: "Ivan Reitman", year: 1989, description: "Comedy about ghostbusters saving New York on New Year's.", genres: ["comedy", "fantasy", "newyear"], rating: 4.0, isBook: false },
  { title: "Ocean's Eleven", author: "Steven Soderbergh", year: 2001, description: "Heist comedy about robbing casinos on New Year's Eve.", genres: ["comedy", "crime", "newyear"], rating: 4.2, isBook: false },
  { title: "Ocean's Twelve", author: "Steven Soderbergh", year: 2004, description: "Heist comedy sequel about a European robbery.", genres: ["comedy", "crime", "newyear"], rating: 4.0, isBook: false },
  { title: "Ocean's Thirteen", author: "Steven Soderbergh", year: 2007, description: "Heist comedy about revenge against a casino owner.", genres: ["comedy", "crime", "newyear"], rating: 4.1, isBook: false },
  
  // Summer Movies
  { title: "Jaws", author: "Steven Spielberg", year: 1975, description: "Thriller about a shark terrorizing a beach town.", genres: ["thriller", "horror", "summer"], rating: 4.5, isBook: false },
  { title: "The Sandlot", author: "David Mickey Evans", year: 1993, description: "Comedy about kids playing baseball during summer.", genres: ["comedy", "family", "summer"], rating: 4.3, isBook: false },
  { title: "Stand by Me", author: "Rob Reiner", year: 1986, description: "Drama about four friends on a summer adventure.", genres: ["drama", "adventure", "summer"], rating: 4.4, isBook: false },
  { title: "The Goonies", author: "Richard Donner", year: 1985, description: "Adventure comedy about kids searching for pirate treasure.", genres: ["adventure", "comedy", "summer"], rating: 4.3, isBook: false },
  { title: "E.T. the Extra-Terrestrial", author: "Steven Spielberg", year: 1982, description: "Sci-fi adventure about a boy helping an alien go home.", genres: ["sci-fi", "adventure", "summer"], rating: 4.6, isBook: false },
  { title: "Jurassic Park", author: "Steven Spielberg", year: 1993, description: "Sci-fi adventure about dinosaurs in a theme park.", genres: ["sci-fi", "adventure", "summer"], rating: 4.7, isBook: false },
  { title: "Independence Day", author: "Roland Emmerich", year: 1996, description: "Sci-fi action about aliens attacking Earth on July 4th.", genres: ["sci-fi", "action", "summer"], rating: 4.3, isBook: false },
  { title: "Men in Black", author: "Barry Sonnenfeld", year: 1997, description: "Sci-fi comedy about secret agents protecting Earth from aliens.", genres: ["sci-fi", "comedy", "summer"], rating: 4.2, isBook: false },
  { title: "Armageddon", author: "Michael Bay", year: 1998, description: "Sci-fi action about drilling into an asteroid to save Earth.", genres: ["sci-fi", "action", "summer"], rating: 4.1, isBook: false },
  { title: "Deep Impact", author: "Mimi Leder", year: 1998, description: "Sci-fi drama about a comet heading toward Earth.", genres: ["sci-fi", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "The Parent Trap", author: "Nancy Meyers", year: 1998, description: "Comedy about twin sisters reuniting their divorced parents.", genres: ["comedy", "family", "summer"], rating: 4.2, isBook: false },
  { title: "Mamma Mia!", author: "Phyllida Lloyd", year: 2008, description: "Musical comedy about a daughter finding her father.", genres: ["musical", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Mamma Mia! Here We Go Again", author: "Ol Parker", year: 2018, description: "Musical comedy sequel about love and family.", genres: ["musical", "comedy", "summer"], rating: 4.0, isBook: false },
  { title: "The Sisterhood of the Traveling Pants", author: "Ken Kwapis", year: 2005, description: "Drama about four friends sharing a magical pair of jeans.", genres: ["drama", "romance", "summer"], rating: 4.0, isBook: false },
  { title: "The Sisterhood of the Traveling Pants 2", author: "Sanaa Hamri", year: 2008, description: "Drama sequel about the friends' college experiences.", genres: ["drama", "romance", "summer"], rating: 3.9, isBook: false },
  { title: "Dirty Dancing", author: "Emile Ardolino", year: 1987, description: "Romantic drama about a summer romance at a resort.", genres: ["drama", "romance", "summer"], rating: 4.3, isBook: false },
  { title: "Grease", author: "Randal Kleiser", year: 1978, description: "Musical about summer love and high school romance.", genres: ["musical", "romance", "summer"], rating: 4.4, isBook: false },
  { title: "The Notebook", author: "Nick Cassavetes", year: 2004, description: "Romantic drama about a couple's love story.", genres: ["drama", "romance", "summer"], rating: 4.4, isBook: false },
  { title: "Call Me by Your Name", author: "Luca Guadagnino", year: 2017, description: "Romantic drama about a summer romance in Italy.", genres: ["drama", "romance", "summer"], rating: 4.3, isBook: false },
  { title: "The Way Way Back", author: "Nat Faxon", year: 2013, description: "Comedy-drama about a boy's summer at a water park.", genres: ["comedy", "drama", "summer"], rating: 4.1, isBook: false },
  { title: "Adventureland", author: "Greg Mottola", year: 2009, description: "Comedy-drama about working at an amusement park.", genres: ["comedy", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "The Kings of Summer", author: "Jordan Vogt-Roberts", year: 2013, description: "Comedy about three friends building a house in the woods.", genres: ["comedy", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "Moonrise Kingdom", author: "Wes Anderson", year: 2012, description: "Comedy-drama about young love on a New England island.", genres: ["comedy", "drama", "summer"], rating: 4.2, isBook: false },
  { title: "The Grand Budapest Hotel", author: "Wes Anderson", year: 2014, description: "Comedy about a concierge and his lobby boy.", genres: ["comedy", "adventure", "summer"], rating: 4.3, isBook: false },
  { title: "The Secret Life of Walter Mitty", author: "Ben Stiller", year: 2013, description: "Adventure comedy about a daydreamer's real adventure.", genres: ["adventure", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Into the Wild", author: "Sean Penn", year: 2007, description: "Drama about a young man's journey into the wilderness.", genres: ["drama", "adventure", "summer"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "Drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "summer"], rating: 4.2, isBook: false },
  { title: "127 Hours", author: "Danny Boyle", year: 2010, description: "Drama about a hiker trapped in a canyon.", genres: ["drama", "adventure", "summer"], rating: 4.1, isBook: false },
  { title: "The Beach", author: "Danny Boyle", year: 2000, description: "Drama about backpackers finding a hidden paradise.", genres: ["drama", "adventure", "summer"], rating: 4.0, isBook: false },
  { title: "The Descendants", author: "Alexander Payne", year: 2011, description: "Drama about a father reconnecting with his daughters.", genres: ["drama", "family", "summer"], rating: 4.2, isBook: false },
  { title: "The Secret Garden", author: "Agnieszka Holland", year: 1993, description: "Drama about an orphan discovering a magical garden.", genres: ["drama", "fantasy", "summer"], rating: 4.1, isBook: false },
  { title: "A Little Princess", author: "Alfonso Cuarón", year: 1995, description: "Drama about a girl's imagination during difficult times.", genres: ["drama", "fantasy", "summer"], rating: 4.2, isBook: false },
  { title: "The Princess Diaries", author: "Garry Marshall", year: 2001, description: "Comedy about a teenager discovering she's a princess.", genres: ["comedy", "family", "summer"], rating: 4.1, isBook: false },
  { title: "The Princess Diaries 2: Royal Engagement", author: "Garry Marshall", year: 2004, description: "Comedy sequel about a princess finding love.", genres: ["comedy", "romance", "summer"], rating: 3.9, isBook: false },
  { title: "Ella Enchanted", author: "Tommy O'Haver", year: 2004, description: "Fantasy comedy about a girl cursed with obedience.", genres: ["fantasy", "comedy", "summer"], rating: 4.0, isBook: false },
  { title: "Enchanted", author: "Kevin Lima", year: 2007, description: "Fantasy comedy about a princess in modern New York.", genres: ["fantasy", "comedy", "summer"], rating: 4.2, isBook: false },
  { title: "The Princess and the Frog", author: "Ron Clements", year: 2009, description: "Animated musical about a princess turned into a frog.", genres: ["animation", "musical", "summer"], rating: 4.1, isBook: false },
  { title: "Tangled", author: "Nathan Greno", year: 2010, description: "Animated musical about Rapunzel's adventure.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Brave", author: "Mark Andrews", year: 2012, description: "Animated adventure about a Scottish princess.", genres: ["animation", "adventure", "summer"], rating: 4.2, isBook: false },
  { title: "Frozen", author: "Chris Buck", year: 2013, description: "Animated musical about two sisters and magical powers.", genres: ["animation", "musical", "summer"], rating: 4.4, isBook: false },
  { title: "Frozen II", author: "Chris Buck", year: 2019, description: "Animated musical sequel about discovering the past.", genres: ["animation", "musical", "summer"], rating: 4.1, isBook: false },
  { title: "Moana", author: "Ron Clements", year: 2016, description: "Animated musical about a Polynesian princess's ocean journey.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Raya and the Last Dragon", author: "Don Hall", year: 2021, description: "Animated adventure about a warrior and the last dragon.", genres: ["animation", "adventure", "summer"], rating: 4.1, isBook: false },
  { title: "Encanto", author: "Jared Bush", year: 2021, description: "Animated musical about a magical family in Colombia.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Turning Red", author: "Domee Shi", year: 2022, description: "Animated comedy about a girl turning into a red panda.", genres: ["animation", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Elemental", author: "Peter Sohn", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "summer"], rating: 4.0, isBook: false },
  { title: "Wish", author: "Chris Buck", year: 2023, description: "Animated musical fantasy about wishes.", genres: ["animation", "musical", "summer"], rating: 3.8, isBook: false },
  
  // Women-Focused & Female-Directed Movies
  // Female Directors & Women-Centric Stories
  { title: "Little Women", author: "Greta Gerwig", year: 2019, description: "A modern retelling of Louisa May Alcott's classic about four sisters.", genres: ["drama", "historical", "family"], rating: 4.3, isBook: false },
  { title: "Lady Bird", author: "Greta Gerwig", year: 2017, description: "A coming-of-age story about a teenage girl navigating her senior year.", genres: ["drama", "coming-of-age", "family"], rating: 4.2, isBook: false },
  { title: "Barbie", author: "Greta Gerwig", year: 2023, description: "A fantasy comedy about Barbie discovering the real world.", genres: ["comedy", "fantasy", "feminism"], rating: 4.1, isBook: false },
  { title: "Frances Ha", author: "Noah Baumbach", year: 2012, description: "A comedy-drama about a 27-year-old dancer trying to find her place.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "Mistress America", author: "Noah Baumbach", year: 2015, description: "A comedy about a college freshman and her soon-to-be stepsister.", genres: ["comedy", "drama", "family"], rating: 3.9, isBook: false },
  { title: "Lost in Translation", author: "Sofia Coppola", year: 2003, description: "A drama about two Americans forming a bond in Tokyo.", genres: ["drama", "romance", "travel"], rating: 4.3, isBook: false },
  { title: "The Virgin Suicides", author: "Sofia Coppola", year: 1999, description: "A drama about five sisters in 1970s Michigan.", genres: ["drama", "coming-of-age", "mystery"], rating: 4.1, isBook: false },
  { title: "Marie Antoinette", author: "Sofia Coppola", year: 2006, description: "A historical drama about the life of Marie Antoinette.", genres: ["drama", "historical", "biography"], rating: 4.0, isBook: false },
  { title: "Somewhere", author: "Sofia Coppola", year: 2010, description: "A drama about a movie star and his daughter in Los Angeles.", genres: ["drama", "family", "hollywood"], rating: 3.8, isBook: false },
  { title: "The Bling Ring", author: "Sofia Coppola", year: 2013, description: "A crime drama about teenagers robbing celebrities.", genres: ["crime", "drama", "teen"], rating: 3.7, isBook: false },
  { title: "The Beguiled", author: "Sofia Coppola", year: 2017, description: "A thriller about a wounded soldier taken in by a girls' school.", genres: ["thriller", "drama", "historical"], rating: 3.9, isBook: false },
  { title: "On the Rocks", author: "Sofia Coppola", year: 2020, description: "A comedy-drama about a woman investigating her husband with her father.", genres: ["comedy", "drama", "family"], rating: 3.8, isBook: false },
  { title: "Priscilla", author: "Sofia Coppola", year: 2023, description: "A biographical drama about Priscilla Presley's life with Elvis.", genres: ["drama", "biography", "romance"], rating: 4.0, isBook: false },
  { title: "The Hurt Locker", author: "Kathryn Bigelow", year: 2008, description: "A war drama about a bomb disposal team in Iraq.", genres: ["war", "drama", "action"], rating: 4.4, isBook: false },
  { title: "Zero Dark Thirty", author: "Kathryn Bigelow", year: 2012, description: "A thriller about the hunt for Osama bin Laden.", genres: ["thriller", "drama", "war"], rating: 4.2, isBook: false },
  { title: "Point Break", author: "Kathryn Bigelow", year: 1991, description: "An action thriller about an FBI agent infiltrating a surfing gang.", genres: ["action", "thriller", "crime"], rating: 4.1, isBook: false },
  { title: "Strange Days", author: "Kathryn Bigelow", year: 1995, description: "A sci-fi thriller about virtual reality and crime.", genres: ["sci-fi", "thriller", "crime"], rating: 4.0, isBook: false },
  { title: "Near Dark", author: "Kathryn Bigelow", year: 1987, description: "A horror western about a vampire family.", genres: ["horror", "western", "romance"], rating: 3.9, isBook: false },
  { title: "Blue Steel", author: "Kathryn Bigelow", year: 1990, description: "A thriller about a female police officer.", genres: ["thriller", "crime", "drama"], rating: 3.8, isBook: false },
  { title: "The Weight of Water", author: "Kathryn Bigelow", year: 2000, description: "A thriller about a photographer investigating a murder.", genres: ["thriller", "mystery", "drama"], rating: 3.7, isBook: false },
  { title: "K-19: The Widowmaker", author: "Kathryn Bigelow", year: 2002, description: "A war drama about a Soviet submarine crew.", genres: ["war", "drama", "historical"], rating: 3.8, isBook: false },
  { title: "Detroit", author: "Kathryn Bigelow", year: 2017, description: "A crime drama about the 1967 Detroit riots.", genres: ["crime", "drama", "historical"], rating: 4.0, isBook: false },
  { title: "Frida", author: "Julie Taymor", year: 2002, description: "A biographical drama about artist Frida Kahlo.", genres: ["drama", "biography", "art"], rating: 4.2, isBook: false },
  { title: "Across the Universe", author: "Julie Taymor", year: 2007, description: "A musical drama set to Beatles songs.", genres: ["musical", "drama", "romance"], rating: 4.0, isBook: false },
  { title: "The Tempest", author: "Julie Taymor", year: 2010, description: "A fantasy drama adaptation of Shakespeare's play.", genres: ["fantasy", "drama", "shakespeare"], rating: 3.8, isBook: false },
  { title: "Gloria Bell", author: "Sebastián Lelio", year: 2018, description: "A drama about a free-spirited woman in her 50s.", genres: ["drama", "romance", "comedy"], rating: 4.1, isBook: false },
  { title: "A Fantastic Woman", author: "Sebastián Lelio", year: 2017, description: "A drama about a transgender woman dealing with loss.", genres: ["drama", "lgbtq", "romance"], rating: 4.3, isBook: false },
  { title: "Disobedience", author: "Sebastián Lelio", year: 2017, description: "A drama about a woman returning to her Orthodox Jewish community.", genres: ["drama", "romance", "lgbtq"], rating: 4.0, isBook: false },
  { title: "The Wonder", author: "Sebastián Lelio", year: 2022, description: "A drama about a nurse investigating a miracle in 1860s Ireland.", genres: ["drama", "mystery", "historical"], rating: 3.9, isBook: false },
  { title: "The Babadook", author: "Jennifer Kent", year: 2014, description: "A horror film about a mother and son haunted by a monster.", genres: ["horror", "drama", "psychological"], rating: 4.2, isBook: false },
  { title: "The Nightingale", author: "Jennifer Kent", year: 2018, description: "A revenge thriller set in 1825 Tasmania.", genres: ["thriller", "drama", "historical"], rating: 4.1, isBook: false },
  { title: "Monster", author: "Patty Jenkins", year: 2003, description: "A biographical crime drama about serial killer Aileen Wuornos.", genres: ["crime", "drama", "biography"], rating: 4.3, isBook: false },
  { title: "Wonder Woman", author: "Patty Jenkins", year: 2017, description: "A superhero film about Wonder Woman in World War I.", genres: ["action", "adventure", "superhero"], rating: 4.2, isBook: false },
  { title: "Wonder Woman 1984", author: "Patty Jenkins", year: 2020, description: "A superhero sequel set in the 1980s.", genres: ["action", "adventure", "superhero"], rating: 3.8, isBook: false },
  { title: "American Psycho", author: "Mary Harron", year: 2000, description: "A psychological thriller about a wealthy investment banker.", genres: ["thriller", "horror", "psychological"], rating: 4.1, isBook: false },
  { title: "The Notorious Bettie Page", author: "Mary Harron", year: 2005, description: "A biographical drama about pin-up model Bettie Page.", genres: ["drama", "biography", "historical"], rating: 3.9, isBook: false },
  { title: "The Moth Diaries", author: "Mary Harron", year: 2011, description: "A horror film about a boarding school student.", genres: ["horror", "drama", "psychological"], rating: 3.7, isBook: false },
  { title: "Charlie Says", author: "Mary Harron", year: 2018, description: "A drama about the Manson Family women.", genres: ["drama", "crime", "biography"], rating: 3.6, isBook: false },
  { title: "The Piano", author: "Jane Campion", year: 1993, description: "A drama about a mute woman and her daughter in 19th century New Zealand.", genres: ["drama", "romance", "historical"], rating: 4.4, isBook: false },
  { title: "The Portrait of a Lady", author: "Jane Campion", year: 1996, description: "A drama adaptation of Henry James's novel.", genres: ["drama", "romance", "historical"], rating: 4.0, isBook: false },
  { title: "Holy Smoke!", author: "Jane Campion", year: 1999, description: "A drama about a cult deprogrammer and his patient.", genres: ["drama", "romance", "psychological"], rating: 3.8, isBook: false },
  { title: "In the Cut", author: "Jane Campion", year: 2003, description: "A thriller about a teacher investigating a murder.", genres: ["thriller", "drama", "mystery"], rating: 3.7, isBook: false },
  { title: "Bright Star", author: "Jane Campion", year: 2009, description: "A biographical drama about poet John Keats.", genres: ["drama", "romance", "biography"], rating: 4.1, isBook: false },
  { title: "The Power of the Dog", author: "Jane Campion", year: 2021, description: "A western drama about two brothers in 1920s Montana.", genres: ["western", "drama", "psychological"], rating: 4.3, isBook: false },
  { title: "The Water Diary", author: "Jane Campion", year: 2006, description: "A short film about climate change.", genres: ["short", "drama", "environmental"], rating: 3.8, isBook: false },
  { title: "The Party", author: "Sally Potter", year: 2017, description: "A comedy-drama about a political party gone wrong.", genres: ["comedy", "drama", "satire"], rating: 4.0, isBook: false },
  { title: "Orlando", author: "Sally Potter", year: 1992, description: "A fantasy drama about a nobleman who lives for centuries.", genres: ["fantasy", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "The Tango Lesson", author: "Sally Potter", year: 1997, description: "A drama about a filmmaker learning to tango.", genres: ["drama", "romance", "dance"], rating: 3.9, isBook: false },
  { title: "Yes", author: "Sally Potter", year: 2004, description: "A drama about a love affair between a scientist and a chef.", genres: ["drama", "romance", "poetry"], rating: 3.7, isBook: false },
  { title: "Rage", author: "Sally Potter", year: 2009, description: "A drama about a fashion show gone wrong.", genres: ["drama", "satire", "fashion"], rating: 3.6, isBook: false },
  { title: "Ginger & Rosa", author: "Sally Potter", year: 2012, description: "A drama about two teenage friends during the Cuban Missile Crisis.", genres: ["drama", "coming-of-age", "historical"], rating: 3.8, isBook: false },
  { title: "The Roads Not Taken", author: "Sally Potter", year: 2020, description: "A drama about a man with dementia and his daughter.", genres: ["drama", "family", "medical"], rating: 3.7, isBook: false },
  { title: "Lost in La Mancha", author: "Keith Fulton", year: 2002, description: "A documentary about Terry Gilliam's failed Don Quixote film.", genres: ["documentary", "film", "behind-the-scenes"], rating: 4.1, isBook: false },
  { title: "The Hours", author: "Stephen Daldry", year: 2002, description: "A drama about three women connected by Virginia Woolf's novel.", genres: ["drama", "literary", "feminism"], rating: 4.3, isBook: false },
  { title: "Billy Elliot", author: "Stephen Daldry", year: 2000, description: "A drama about a boy who wants to become a ballet dancer.", genres: ["drama", "dance", "coming-of-age"], rating: 4.2, isBook: false },
  { title: "The Reader", author: "Stephen Daldry", year: 2008, description: "A drama about a young man's affair with an older woman.", genres: ["drama", "romance", "historical"], rating: 4.1, isBook: false },
  { title: "Extremely Loud & Incredibly Close", author: "Stephen Daldry", year: 2011, description: "A drama about a boy searching for meaning after 9/11.", genres: ["drama", "family", "mystery"], rating: 3.9, isBook: false },
  { title: "Trash", author: "Stephen Daldry", year: 2014, description: "A drama about three boys finding a wallet in a Brazilian favela.", genres: ["drama", "adventure", "social"], rating: 3.8, isBook: false },
  { title: "The Crown", author: "Various", year: 2016, description: "A drama series about Queen Elizabeth II's reign.", genres: ["drama", "historical", "biography"], rating: 4.4, isBook: false },
  { title: "The Handmaid's Tale", author: "Various", year: 2017, description: "A dystopian drama about women in a totalitarian society.", genres: ["drama", "dystopian", "feminism"], rating: 4.5, isBook: false },
  { title: "Big Little Lies", author: "Various", year: 2017, description: "A drama about wealthy women in Monterey, California.", genres: ["drama", "mystery", "feminism"], rating: 4.3, isBook: false },
  { title: "Killing Eve", author: "Various", year: 2018, description: "A thriller about a security service agent and an assassin.", genres: ["thriller", "drama", "crime"], rating: 4.2, isBook: false },
  { title: "Fleabag", author: "Various", year: 2016, description: "A comedy-drama about a young woman navigating life in London.", genres: ["comedy", "drama", "feminism"], rating: 4.4, isBook: false },
  { title: "I May Destroy You", author: "Michaela Coel", year: 2020, description: "A drama about a writer dealing with sexual assault.", genres: ["drama", "feminism", "social"], rating: 4.3, isBook: false },
  { title: "Chewing Gum", author: "Michaela Coel", year: 2015, description: "A comedy about a young woman exploring her sexuality.", genres: ["comedy", "coming-of-age", "feminism"], rating: 4.1, isBook: false },
  { title: "Normal People", author: "Lenny Abrahamson", year: 2020, description: "A drama about the complex relationship between two teenagers.", genres: ["drama", "romance", "coming-of-age"], rating: 4.3, isBook: false },
  { title: "Conversations with Friends", author: "Lenny Abrahamson", year: 2022, description: "A drama about two college students and their relationships.", genres: ["drama", "romance", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "The Queen's Gambit", author: "Scott Frank", year: 2020, description: "A drama about an orphaned chess prodigy.", genres: ["drama", "sports", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Unorthodox", author: "Maria Schrader", year: 2020, description: "A drama about a woman leaving her ultra-Orthodox Jewish community.", genres: ["drama", "feminism", "religious"], rating: 4.2, isBook: false },
  { title: "The Undoing", author: "Susanne Bier", year: 2020, description: "A thriller about a therapist whose life unravels.", genres: ["thriller", "drama", "mystery"], rating: 4.1, isBook: false },
  { title: "The Night Manager", author: "Susanne Bier", year: 2016, description: "A thriller about a hotel manager infiltrating an arms dealer's organization.", genres: ["thriller", "drama", "espionage"], rating: 4.2, isBook: false },
  { title: "Bird Box", author: "Susanne Bier", year: 2018, description: "A horror thriller about a mother protecting her children from supernatural entities.", genres: ["horror", "thriller", "post-apocalyptic"], rating: 4.0, isBook: false },
  { title: "The Good Place", author: "Michael Schur", year: 2016, description: "A comedy about a woman who wakes up in the afterlife.", genres: ["comedy", "fantasy", "philosophy"], rating: 4.4, isBook: false },
  { title: "Parks and Recreation", author: "Various", year: 2009, description: "A comedy about government employees in a small town.", genres: ["comedy", "satire", "government"], rating: 4.3, isBook: false },
  { title: "30 Rock", author: "Tina Fey", year: 2006, description: "A comedy about the behind-the-scenes of a sketch comedy show.", genres: ["comedy", "satire", "television"], rating: 4.2, isBook: false },
  { title: "Unbreakable Kimmy Schmidt", author: "Tina Fey", year: 2015, description: "A comedy about a woman adjusting to life after being rescued from a cult.", genres: ["comedy", "satire", "feminism"], rating: 4.1, isBook: false },
  { title: "Girls", author: "Lena Dunham", year: 2012, description: "A comedy-drama about four young women in New York City.", genres: ["comedy", "drama", "feminism"], rating: 4.0, isBook: false },
  { title: "Camping", author: "Lena Dunham", year: 2018, description: "A comedy about a group of friends on a camping trip.", genres: ["comedy", "drama", "friendship"], rating: 3.8, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Gone Girl", author: "David Fincher", year: 2014, description: "A thriller about a man whose wife disappears.", genres: ["thriller", "drama", "mystery"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "A drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "biography"], rating: 4.2, isBook: false },
  { title: "Dallas Buyers Club", author: "Jean-Marc Vallée", year: 2013, description: "A biographical drama about a man with AIDS.", genres: ["drama", "biography", "medical"], rating: 4.3, isBook: false },
  { title: "The Young Victoria", author: "Jean-Marc Vallée", year: 2009, description: "A biographical drama about Queen Victoria's early reign.", genres: ["drama", "biography", "historical"], rating: 4.1, isBook: false },
  { title: "Café de Flore", author: "Jean-Marc Vallée", year: 2011, description: "A drama about love and destiny across time.", genres: ["drama", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "Demolition", author: "Jean-Marc Vallée", year: 2015, description: "A drama about a man's emotional breakdown after his wife's death.", genres: ["drama", "comedy", "grief"], rating: 3.9, isBook: false },
  { title: "Big Little Lies", author: "Jean-Marc Vallée", year: 2017, description: "A drama about wealthy women in Monterey, California.", genres: ["drama", "mystery", "feminism"], rating: 4.3, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "The Undoing", author: "Susanne Bier", year: 2020, description: "A thriller about a therapist whose life unravels.", genres: ["thriller", "drama", "mystery"], rating: 4.1, isBook: false },
  { title: "The Night Manager", author: "Susanne Bier", year: 2016, description: "A thriller about a hotel manager infiltrating an arms dealer's organization.", genres: ["thriller", "drama", "espionage"], rating: 4.2, isBook: false },
  { title: "Bird Box", author: "Susanne Bier", year: 2018, description: "A horror thriller about a mother protecting her children from supernatural entities.", genres: ["horror", "thriller", "post-apocalyptic"], rating: 4.0, isBook: false },
  { title: "The Good Place", author: "Michael Schur", year: 2016, description: "A comedy about a woman who wakes up in the afterlife.", genres: ["comedy", "fantasy", "philosophy"], rating: 4.4, isBook: false },
  { title: "Parks and Recreation", author: "Various", year: 2009, description: "A comedy about government employees in a small town.", genres: ["comedy", "satire", "government"], rating: 4.3, isBook: false },
  { title: "30 Rock", author: "Tina Fey", year: 2006, description: "A comedy about the behind-the-scenes of a sketch comedy show.", genres: ["comedy", "satire", "television"], rating: 4.2, isBook: false },
  { title: "Unbreakable Kimmy Schmidt", author: "Tina Fey", year: 2015, description: "A comedy about a woman adjusting to life after being rescued from a cult.", genres: ["comedy", "satire", "feminism"], rating: 4.1, isBook: false },
  { title: "Girls", author: "Lena Dunham", year: 2012, description: "A comedy-drama about four young women in New York City.", genres: ["comedy", "drama", "feminism"], rating: 4.0, isBook: false },
  { title: "Camping", author: "Lena Dunham", year: 2018, description: "A comedy about a group of friends on a camping trip.", genres: ["comedy", "drama", "friendship"], rating: 3.8, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Gone Girl", author: "David Fincher", year: 2014, description: "A thriller about a man whose wife disappears.", genres: ["thriller", "drama", "mystery"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "A drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "biography"], rating: 4.2, isBook: false },
  { title: "Dallas Buyers Club", author: "Jean-Marc Vallée", year: 2013, description: "A biographical drama about a man with AIDS.", genres: ["drama", "biography", "medical"], rating: 4.3, isBook: false },
  { title: "The Young Victoria", author: "Jean-Marc Vallée", year: 2009, description: "A biographical drama about Queen Victoria's early reign.", genres: ["drama", "biography", "historical"], rating: 4.1, isBook: false },
  { title: "Café de Flore", author: "Jean-Marc Vallée", year: 2011, description: "A drama about love and destiny across time.", genres: ["drama", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "Demolition", author: "Jean-Marc Vallée", year: 2015, description: "A drama about a man's emotional breakdown after his wife's death.", genres: ["drama", "comedy", "grief"], rating: 3.9, isBook: false },
  
  // Priority Level 1: Documentary Films
  { title: "Planet Earth", author: "Alastair Fothergill", year: 2006, description: "A groundbreaking nature documentary series about Earth's ecosystems.", genres: ["documentary", "nature", "environmental"], rating: 4.8, isBook: false },
  { title: "Blue Planet", author: "Alastair Fothergill", year: 2001, description: "A documentary series exploring the world's oceans and marine life.", genres: ["documentary", "nature", "ocean"], rating: 4.7, isBook: false },
  { title: "Cosmos: A Spacetime Odyssey", author: "Ann Druyan", year: 2014, description: "A documentary series exploring the universe and scientific discoveries.", genres: ["documentary", "science", "space"], rating: 4.6, isBook: false },
  { title: "The Last Dance", author: "Jason Hehir", year: 2020, description: "A documentary about Michael Jordan and the Chicago Bulls dynasty.", genres: ["documentary", "sports", "basketball"], rating: 4.5, isBook: false },
  { title: "Making a Murderer", author: "Laura Ricciardi", year: 2015, description: "A true crime documentary about Steven Avery's case.", genres: ["documentary", "true crime", "legal"], rating: 4.4, isBook: false },
  { title: "The Jinx", author: "Andrew Jarecki", year: 2015, description: "A documentary about real estate heir Robert Durst and his alleged crimes.", genres: ["documentary", "true crime", "mystery"], rating: 4.3, isBook: false },
  { title: "13th", author: "Ava DuVernay", year: 2016, description: "A documentary about racial inequality in the American criminal justice system.", genres: ["documentary", "social justice", "race"], rating: 4.5, isBook: false },
  { title: "Won't You Be My Neighbor?", author: "Morgan Neville", year: 2018, description: "A documentary about Fred Rogers and his impact on children's television.", genres: ["documentary", "biography", "television"], rating: 4.4, isBook: false },
  { title: "Free Solo", author: "Elizabeth Chai Vasarhelyi", year: 2018, description: "A documentary about Alex Honnold's free solo climb of El Capitan.", genres: ["documentary", "adventure", "sports"], rating: 4.6, isBook: false },
  { title: "The Act of Killing", author: "Joshua Oppenheimer", year: 2012, description: "A documentary about Indonesian death squad leaders reenacting their crimes.", genres: ["documentary", "history", "war"], rating: 4.3, isBook: false },
  { title: "Citizenfour", author: "Laura Poitras", year: 2014, description: "A documentary about Edward Snowden and government surveillance.", genres: ["documentary", "politics", "technology"], rating: 4.4, isBook: false },
  { title: "Amy", author: "Asif Kapadia", year: 2015, description: "A documentary about the life and death of singer Amy Winehouse.", genres: ["documentary", "biography", "music"], rating: 4.3, isBook: false },
  { title: "Searching for Sugar Man", author: "Malik Bendjelloul", year: 2012, description: "A documentary about the search for musician Rodriguez.", genres: ["documentary", "music", "mystery"], rating: 4.4, isBook: false },
  { title: "Man on Wire", author: "James Marsh", year: 2008, description: "A documentary about Philippe Petit's high-wire walk between the Twin Towers.", genres: ["documentary", "adventure", "art"], rating: 4.5, isBook: false },
  { title: "March of the Penguins", author: "Luc Jacquet", year: 2005, description: "A documentary about emperor penguins' annual journey.", genres: ["documentary", "nature", "family"], rating: 4.2, isBook: false },
  
  // Priority Level 1: Educational Films
  { title: "Inside Out", author: "Pete Docter", year: 2015, description: "An animated film about emotions and mental health for all ages.", genres: ["animation", "educational", "mental health"], rating: 4.4, isBook: false },
  { title: "The Theory of Everything", author: "James Marsh", year: 2014, description: "A biographical drama about physicist Stephen Hawking.", genres: ["drama", "biography", "science"], rating: 4.2, isBook: false },
  { title: "Hidden Figures", author: "Theodore Melfi", year: 2016, description: "A drama about African American women mathematicians at NASA.", genres: ["drama", "history", "science"], rating: 4.3, isBook: false },
  { title: "The Imitation Game", author: "Morten Tyldum", year: 2014, description: "A drama about Alan Turing and the breaking of the Enigma code.", genres: ["drama", "biography", "technology"], rating: 4.2, isBook: false },
  { title: "A Beautiful Mind", author: "Ron Howard", year: 2001, description: "A biographical drama about mathematician John Nash.", genres: ["drama", "biography", "mental health"], rating: 4.3, isBook: false },
  { title: "Good Will Hunting", author: "Gus Van Sant", year: 1997, description: "A drama about a mathematical genius working through personal issues.", genres: ["drama", "mental health", "education"], rating: 4.4, isBook: false },
  { title: "Dead Poets Society", author: "Peter Weir", year: 1989, description: "A drama about an English teacher inspiring his students through poetry.", genres: ["drama", "education", "poetry"], rating: 4.3, isBook: false },
  { title: "Stand and Deliver", author: "Ramón Menéndez", year: 1988, description: "A drama about a math teacher helping underprivileged students.", genres: ["drama", "education", "inspiration"], rating: 4.2, isBook: false },
  { title: "Freedom Writers", author: "Richard LaGravenese", year: 2007, description: "A drama about a teacher helping at-risk students through writing.", genres: ["drama", "education", "social justice"], rating: 4.1, isBook: false },
  { title: "The Ron Clark Story", author: "Randa Haines", year: 2006, description: "A drama about an innovative teacher working with challenging students.", genres: ["drama", "education", "inspiration"], rating: 4.0, isBook: false },
  
  // Priority Level 1: International Cinema
  { title: "Parasite", author: "Bong Joon-ho", year: 2019, description: "A South Korean thriller about class inequality.", genres: ["thriller", "drama", "social commentary"], rating: 4.7, isBook: false },
  { title: "Roma", author: "Alfonso Cuarón", year: 2018, description: "A Mexican drama about a domestic worker in 1970s Mexico City.", genres: ["drama", "family", "social commentary"], rating: 4.5, isBook: false },
  { title: "Crouching Tiger, Hidden Dragon", author: "Ang Lee", year: 2000, description: "A Chinese martial arts fantasy film.", genres: ["fantasy", "martial arts", "romance"], rating: 4.4, isBook: false },
  { title: "Amélie", author: "Jean-Pierre Jeunet", year: 2001, description: "A French romantic comedy about a whimsical waitress.", genres: ["comedy", "romance", "fantasy"], rating: 4.5, isBook: false },
  { title: "Life Is Beautiful", author: "Roberto Benigni", year: 1997, description: "An Italian comedy-drama about a father protecting his son during the Holocaust.", genres: ["comedy", "drama", "war"], rating: 4.6, isBook: false },
  { title: "Cinema Paradiso", author: "Giuseppe Tornatore", year: 1988, description: "An Italian drama about a filmmaker's childhood memories.", genres: ["drama", "romance", "nostalgia"], rating: 4.5, isBook: false },
  { title: "The Secret in Their Eyes", author: "Juan José Campanella", year: 2009, description: "An Argentine thriller about a retired legal counselor.", genres: ["thriller", "drama", "mystery"], rating: 4.4, isBook: false },
  { title: "A Separation", author: "Asghar Farhadi", year: 2011, description: "An Iranian drama about a couple's divorce and its consequences.", genres: ["drama", "family", "social commentary"], rating: 4.5, isBook: false },
  { title: "The Hunt", author: "Thomas Vinterberg", year: 2012, description: "A Danish drama about a teacher falsely accused of abuse.", genres: ["drama", "social commentary", "justice"], rating: 4.3, isBook: false },
  { title: "The Lives of Others", author: "Florian Henckel von Donnersmarck", year: 2006, description: "A German drama about surveillance in East Germany.", genres: ["drama", "historical", "political"], rating: 4.6, isBook: false },
  { title: "Let the Right One In", author: "Tomas Alfredson", year: 2008, description: "A Swedish horror film about a bullied boy and a vampire girl.", genres: ["horror", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "The White Ribbon", author: "Michael Haneke", year: 2009, description: "A German drama about mysterious events in a small village.", genres: ["drama", "mystery", "historical"], rating: 4.3, isBook: false },
  { title: "The Diving Bell and the Butterfly", author: "Julian Schnabel", year: 2007, description: "A French drama about a paralyzed man's inner life.", genres: ["drama", "biography", "medical"], rating: 4.4, isBook: false },
  { title: "The Motorcycle Diaries", author: "Walter Salles", year: 2004, description: "A biographical drama about Che Guevara's journey across South America.", genres: ["drama", "biography", "travel"], rating: 4.3, isBook: false },
  { title: "Y Tu Mamá También", author: "Alfonso Cuarón", year: 2001, description: "A Mexican drama about two teenagers on a road trip.", genres: ["drama", "coming-of-age", "road trip"], rating: 4.2, isBook: false },
  
  // Priority Level 1: Independent Films
  { title: "Moonlight", author: "Barry Jenkins", year: 2016, description: "An independent drama about a young African American man's coming-of-age.", genres: ["drama", "coming-of-age", "lgbtq"], rating: 4.5, isBook: false },
  { title: "Lady Bird", author: "Greta Gerwig", year: 2017, description: "An independent coming-of-age comedy-drama about a teenage girl.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.3, isBook: false },
  { title: "The Florida Project", author: "Sean Baker", year: 2017, description: "An independent drama about children living in a motel near Disney World.", genres: ["drama", "family", "social commentary"], rating: 4.2, isBook: false },
  { title: "Beasts of the Southern Wild", author: "Benh Zeitlin", year: 2012, description: "An independent fantasy drama about a young girl in Louisiana.", genres: ["fantasy", "drama", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "Fruitvale Station", author: "Ryan Coogler", year: 2013, description: "An independent drama about the last day of Oscar Grant's life.", genres: ["drama", "biography", "social justice"], rating: 4.2, isBook: false },
  { title: "Short Term 12", author: "Destin Daniel Cretton", year: 2013, description: "An independent drama about a supervisor at a foster care facility.", genres: ["drama", "social work", "family"], rating: 4.3, isBook: false },
  { title: "The Spectacular Now", author: "James Ponsoldt", year: 2013, description: "An independent coming-of-age drama about high school seniors.", genres: ["drama", "romance", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "The Way Way Back", author: "Nat Faxon", year: 2013, description: "An independent coming-of-age comedy-drama about a shy teenager.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "The Perks of Being a Wallflower", author: "Stephen Chbosky", year: 2012, description: "An independent drama about a shy freshman in high school.", genres: ["drama", "coming-of-age", "mental health"], rating: 4.2, isBook: false },
  { title: "Mud", author: "Jeff Nichols", year: 2012, description: "An independent drama about two boys helping a fugitive.", genres: ["drama", "adventure", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "Take Shelter", author: "Jeff Nichols", year: 2011, description: "An independent psychological thriller about a man's apocalyptic visions.", genres: ["thriller", "drama", "psychological"], rating: 4.0, isBook: false },
  { title: "Winter's Bone", author: "Debra Granik", year: 2010, description: "An independent drama about a girl searching for her missing father.", genres: ["drama", "mystery", "family"], rating: 4.2, isBook: false },
  { title: "Frozen River", author: "Courtney Hunt", year: 2008, description: "An independent drama about two women smuggling immigrants.", genres: ["drama", "crime", "social commentary"], rating: 4.1, isBook: false },
  { title: "The Station Agent", author: "Tom McCarthy", year: 2003, description: "An independent comedy-drama about a dwarf who inherits a train station.", genres: ["comedy", "drama", "friendship"], rating: 4.0, isBook: false },
  { title: "The Squid and the Whale", author: "Noah Baumbach", year: 2005, description: "An independent comedy-drama about a family's divorce.", genres: ["comedy", "drama", "family"], rating: 4.1, isBook: false },
  
  // Priority Level 1: Short Films
  { title: "Piper", author: "Alan Barillaro", year: 2016, description: "A Pixar short about a baby sandpiper learning to overcome fear.", genres: ["animation", "short", "family"], rating: 4.3, isBook: false },
  { title: "Bao", author: "Domee Shi", year: 2018, description: "A Pixar short about a Chinese-Canadian mother and her dumpling son.", genres: ["animation", "short", "family"], rating: 4.2, isBook: false },
  { title: "Kitbull", author: "Rosana Sullivan", year: 2019, description: "A Pixar short about an unlikely friendship between a cat and a pit bull.", genres: ["animation", "short", "friendship"], rating: 4.4, isBook: false },
  { title: "Float", author: "Bobby Rubio", year: 2019, description: "A Pixar short about a father and his son who can float.", genres: ["animation", "short", "family"], rating: 4.1, isBook: false },
  { title: "Loop", author: "Erica Milsom", year: 2020, description: "A Pixar short about two kids on a canoe trip.", genres: ["animation", "short", "friendship"], rating: 4.0, isBook: false },
  { title: "The Windshield Wiper", author: "Alberto Mielgo", year: 2021, description: "An animated short exploring the nature of love.", genres: ["animation", "short", "romance"], rating: 4.2, isBook: false },
  { title: "The Boy, the Mole, the Fox and the Horse", author: "Charlie Mackesy", year: 2022, description: "An animated short about friendship and kindness.", genres: ["animation", "short", "friendship"], rating: 4.3, isBook: false },
  { title: "Ice Merchants", author: "João Gonzalez", year: 2022, description: "An animated short about a father and son who sell ice.", genres: ["animation", "short", "family"], rating: 4.1, isBook: false },
  { title: "The Flying Sailor", author: "Wendy Tilby", year: 2022, description: "An animated short about a sailor's surreal experience.", genres: ["animation", "short", "surreal"], rating: 4.0, isBook: false },
  { title: "My Year of Dicks", author: "Sara Gunnarsdóttir", year: 2022, description: "An animated short about a teenage girl's dating experiences.", genres: ["animation", "short", "coming-of-age"], rating: 4.1, isBook: false },
  
  // Priority Level 2: Science Fiction Films
  { title: "Blade Runner", author: "Ridley Scott", year: 1982, description: "A neo-noir sci-fi film about a blade runner hunting replicants.", genres: ["sci-fi", "noir", "thriller"], rating: 4.6, isBook: false },
  { title: "Blade Runner 2049", author: "Denis Villeneuve", year: 2017, description: "A sequel to Blade Runner about a new blade runner's discovery.", genres: ["sci-fi", "noir", "thriller"], rating: 4.4, isBook: false },
  { title: "The Fifth Element", author: "Luc Besson", year: 1997, description: "A sci-fi action film about a cab driver saving the world.", genres: ["sci-fi", "action", "adventure"], rating: 4.2, isBook: false },
  { title: "Minority Report", author: "Steven Spielberg", year: 2002, description: "A sci-fi thriller about a police officer accused of a future crime.", genres: ["sci-fi", "thriller", "crime"], rating: 4.3, isBook: false },
  { title: "Total Recall", author: "Paul Verhoeven", year: 1990, description: "A sci-fi action film about a man with implanted memories.", genres: ["sci-fi", "action", "thriller"], rating: 4.1, isBook: false },
  { title: "RoboCop", author: "Paul Verhoeven", year: 1987, description: "A sci-fi action film about a cyborg police officer.", genres: ["sci-fi", "action", "crime"], rating: 4.2, isBook: false },
  { title: "The Terminator", author: "James Cameron", year: 1984, description: "A sci-fi action film about a cyborg assassin from the future.", genres: ["sci-fi", "action", "thriller"], rating: 4.4, isBook: false },
  { title: "Terminator 2: Judgment Day", author: "James Cameron", year: 1991, description: "A sci-fi action sequel about protecting a young boy from a new Terminator.", genres: ["sci-fi", "action", "thriller"], rating: 4.6, isBook: false },
  { title: "Aliens", author: "James Cameron", year: 1986, description: "A sci-fi horror sequel about a rescue mission to an alien-infested colony.", genres: ["sci-fi", "horror", "action"], rating: 4.5, isBook: false },
  { title: "Predator", author: "John McTiernan", year: 1987, description: "A sci-fi action film about a team hunted by an alien creature.", genres: ["sci-fi", "action", "horror"], rating: 4.3, isBook: false },
  { title: "The Thing", author: "John Carpenter", year: 1982, description: "A sci-fi horror film about an alien creature in Antarctica.", genres: ["sci-fi", "horror", "thriller"], rating: 4.4, isBook: false },
  { title: "They Live", author: "John Carpenter", year: 1988, description: "A sci-fi horror film about aliens controlling humanity through media.", genres: ["sci-fi", "horror", "social commentary"], rating: 4.1, isBook: false },
  { title: "The Fly", author: "David Cronenberg", year: 1986, description: "A sci-fi horror film about a scientist's transformation into a fly.", genres: ["sci-fi", "horror", "body horror"], rating: 4.3, isBook: false },
  { title: "Videodrome", author: "David Cronenberg", year: 1983, description: "A sci-fi horror film about a television executive's descent into madness.", genres: ["sci-fi", "horror", "psychological"], rating: 4.0, isBook: false },
  { title: "Scanners", author: "David Cronenberg", year: 1981, description: "A sci-fi horror film about people with telepathic abilities.", genres: ["sci-fi", "horror", "thriller"], rating: 4.1, isBook: false },
  
  // Priority Level 2: Horror Films
  { title: "The Shining", author: "Stanley Kubrick", year: 1980, description: "A psychological horror film about a writer's descent into madness.", genres: ["horror", "psychological", "thriller"], rating: 4.5, isBook: false },
  { title: "The Exorcist", author: "William Friedkin", year: 1973, description: "A horror film about the demonic possession of a young girl.", genres: ["horror", "supernatural", "religious"], rating: 4.4, isBook: false },
  { title: "Halloween", author: "John Carpenter", year: 1978, description: "A slasher film about Michael Myers stalking babysitters.", genres: ["horror", "slasher", "thriller"], rating: 4.3, isBook: false },
  { title: "A Nightmare on Elm Street", author: "Wes Craven", year: 1984, description: "A horror film about a killer who attacks teenagers in their dreams.", genres: ["horror", "supernatural", "slasher"], rating: 4.2, isBook: false },
  { title: "Friday the 13th", author: "Sean S. Cunningham", year: 1980, description: "A slasher film about a killer at a summer camp.", genres: ["horror", "slasher", "thriller"], rating: 4.0, isBook: false },
  { title: "The Texas Chain Saw Massacre", author: "Tobe Hooper", year: 1974, description: "A horror film about a family of cannibals in rural Texas.", genres: ["horror", "slasher", "thriller"], rating: 4.1, isBook: false },
  { title: "Carrie", author: "Brian De Palma", year: 1976, description: "A horror film about a bullied girl with telekinetic powers.", genres: ["horror", "supernatural", "coming-of-age"], rating: 4.2, isBook: false },
  { title: "The Omen", author: "Richard Donner", year: 1976, description: "A horror film about a child who may be the Antichrist.", genres: ["horror", "supernatural", "religious"], rating: 4.1, isBook: false },
  { title: "Rosemary's Baby", author: "Roman Polanski", year: 1968, description: "A psychological horror film about a pregnant woman's paranoia.", genres: ["horror", "psychological", "thriller"], rating: 4.3, isBook: false },
  { title: "The Wicker Man", author: "Robin Hardy", year: 1973, description: "A horror film about a police officer investigating a missing child on a pagan island.", genres: ["horror", "folk horror", "mystery"], rating: 4.2, isBook: false },
  { title: "Don't Look Now", author: "Nicolas Roeg", year: 1973, description: "A psychological horror film about a couple grieving their daughter's death.", genres: ["horror", "psychological", "thriller"], rating: 4.1, isBook: false },
  { title: "Suspiria", author: "Dario Argento", year: 1977, description: "A horror film about a dance academy run by witches.", genres: ["horror", "supernatural", "giallo"], rating: 4.2, isBook: false },
  { title: "The Evil Dead", author: "Sam Raimi", year: 1981, description: "A horror film about friends battling demonic forces in a cabin.", genres: ["horror", "supernatural", "comedy"], rating: 4.1, isBook: false },
  { title: "Evil Dead II", author: "Sam Raimi", year: 1987, description: "A horror comedy sequel about battling demons in a cabin.", genres: ["horror", "comedy", "supernatural"], rating: 4.2, isBook: false },
  { title: "Army of Darkness", author: "Sam Raimi", year: 1992, description: "A horror comedy about a man transported to medieval times.", genres: ["horror", "comedy", "fantasy"], rating: 4.0, isBook: false },
  { title: "Re-Animator", author: "Stuart Gordon", year: 1985, description: "A horror comedy about a medical student who can reanimate the dead.", genres: ["horror", "comedy", "sci-fi"], rating: 4.1, isBook: false },
  { title: "From Beyond", author: "Stuart Gordon", year: 1986, description: "A horror film about scientists experimenting with a device that affects reality.", genres: ["horror", "sci-fi", "body horror"], rating: 4.0, isBook: false },
  
  // Priority Level 2: Mystery Films
  { title: "Chinatown", author: "Roman Polanski", year: 1974, description: "A neo-noir mystery about a private detective investigating corruption.", genres: ["mystery", "noir", "crime"], rating: 4.6, isBook: false },
  { title: "The Maltese Falcon", author: "John Huston", year: 1941, description: "A classic noir mystery about a private detective and a priceless statue.", genres: ["mystery", "noir", "crime"], rating: 4.5, isBook: false },
  { title: "Double Indemnity", author: "Billy Wilder", year: 1944, description: "A classic noir about an insurance salesman involved in murder.", genres: ["mystery", "noir", "crime"], rating: 4.5, isBook: false },
  { title: "The Big Sleep", author: "Howard Hawks", year: 1946, description: "A classic noir mystery about a private detective investigating blackmail.", genres: ["mystery", "noir", "crime"], rating: 4.4, isBook: false },
  { title: "Laura", author: "Otto Preminger", year: 1944, description: "A classic noir mystery about a detective investigating a woman's murder.", genres: ["mystery", "noir", "romance"], rating: 4.3, isBook: false },
  { title: "The Third Man", author: "Carol Reed", year: 1949, description: "A classic noir mystery about an American investigating his friend's death in Vienna.", genres: ["mystery", "noir", "thriller"], rating: 4.5, isBook: false },
  { title: "Touch of Evil", author: "Orson Welles", year: 1958, description: "A classic noir about a Mexican detective investigating a murder on the border.", genres: ["mystery", "noir", "crime"], rating: 4.4, isBook: false },
  { title: "The Long Goodbye", author: "Robert Altman", year: 1973, description: "A neo-noir mystery about a private detective investigating his friend's murder.", genres: ["mystery", "noir", "crime"], rating: 4.2, isBook: false },
  { title: "The Big Lebowski", author: "Joel Coen", year: 1998, description: "A comedy mystery about a slacker caught up in a kidnapping case.", genres: ["mystery", "comedy", "crime"], rating: 4.3, isBook: false },
  { title: "Brick", author: "Rian Johnson", year: 2005, description: "A neo-noir mystery about a high school student investigating his ex-girlfriend's death.", genres: ["mystery", "noir", "teen"], rating: 4.1, isBook: false },
  { title: "Kiss Kiss Bang Bang", author: "Shane Black", year: 2005, description: "A neo-noir comedy mystery about an actor turned detective.", genres: ["mystery", "comedy", "crime"], rating: 4.2, isBook: false },
  { title: "The Nice Guys", author: "Shane Black", year: 2016, description: "A neo-noir comedy mystery about two detectives in 1970s Los Angeles.", genres: ["mystery", "comedy", "crime"], rating: 4.1, isBook: false },
  { title: "Gone Baby Gone", author: "Ben Affleck", year: 2007, description: "A mystery thriller about private detectives investigating a child's disappearance.", genres: ["mystery", "thriller", "crime"], rating: 4.2, isBook: false },
  { title: "Mystic River", author: "Clint Eastwood", year: 2003, description: "A mystery drama about three friends affected by a murder investigation.", genres: ["mystery", "drama", "crime"], rating: 4.3, isBook: false },
  { title: "Zodiac", author: "David Fincher", year: 2007, description: "A mystery thriller about the investigation of the Zodiac Killer.", genres: ["mystery", "thriller", "true crime"], rating: 4.4, isBook: false },
  { title: "Se7en", author: "David Fincher", year: 1995, description: "A mystery thriller about detectives hunting a serial killer.", genres: ["mystery", "thriller", "crime"], rating: 4.5, isBook: false },
  { title: "The Silence of the Lambs", author: "Jonathan Demme", year: 1991, description: "A mystery thriller about an FBI trainee hunting a serial killer.", genres: ["mystery", "thriller", "crime"], rating: 4.6, isBook: false },
  { title: "Red Dragon", author: "Brett Ratner", year: 2002, description: "A mystery thriller about an FBI agent hunting the Tooth Fairy killer.", genres: ["mystery", "thriller", "crime"], rating: 4.1, isBook: false },
  { title: "Hannibal", author: "Ridley Scott", year: 2001, description: "A mystery thriller about Hannibal Lecter's return to Italy.", genres: ["mystery", "thriller", "crime"], rating: 4.0, isBook: false },
  
  // Priority Level 2: Western Films
  { title: "The Good, the Bad and the Ugly", author: "Sergio Leone", year: 1966, description: "A spaghetti western about three gunslingers searching for buried gold.", genres: ["western", "adventure", "action"], rating: 4.7, isBook: false },
  { title: "Once Upon a Time in the West", author: "Sergio Leone", year: 1968, description: "A spaghetti western about a mysterious stranger protecting a widow.", genres: ["western", "drama", "revenge"], rating: 4.6, isBook: false },
  { title: "For a Few Dollars More", author: "Sergio Leone", year: 1965, description: "A spaghetti western about two bounty hunters tracking a gang.", genres: ["western", "action", "revenge"], rating: 4.4, isBook: false },
  { title: "A Fistful of Dollars", author: "Sergio Leone", year: 1964, description: "A spaghetti western about a stranger playing two rival families against each other.", genres: ["western", "action", "revenge"], rating: 4.3, isBook: false },
  { title: "High Noon", author: "Fred Zinnemann", year: 1952, description: "A classic western about a marshal facing a gang alone.", genres: ["western", "drama", "justice"], rating: 4.5, isBook: false },
  { title: "Shane", author: "George Stevens", year: 1953, description: "A classic western about a gunfighter protecting homesteaders.", genres: ["western", "drama", "family"], rating: 4.4, isBook: false },
  { title: "The Searchers", author: "John Ford", year: 1956, description: "A classic western about a Civil War veteran searching for his kidnapped niece.", genres: ["western", "drama", "adventure"], rating: 4.5, isBook: false },
  { title: "Stagecoach", author: "John Ford", year: 1939, description: "A classic western about passengers on a dangerous stagecoach journey.", genres: ["western", "drama", "adventure"], rating: 4.3, isBook: false },
  { title: "The Magnificent Seven", author: "John Sturges", year: 1960, description: "A western about seven gunfighters protecting a Mexican village.", genres: ["western", "action", "adventure"], rating: 4.2, isBook: false },
  { title: "Butch Cassidy and the Sundance Kid", author: "George Roy Hill", year: 1969, description: "A western about two outlaws on the run from the law.", genres: ["western", "adventure", "comedy"], rating: 4.4, isBook: false },
  { title: "The Wild Bunch", author: "Sam Peckinpah", year: 1969, description: "A western about aging outlaws planning one last robbery.", genres: ["western", "action", "drama"], rating: 4.3, isBook: false },
  { title: "Unforgiven", author: "Clint Eastwood", year: 1992, description: "A western about a retired gunslinger taking one last job.", genres: ["western", "drama", "revenge"], rating: 4.6, isBook: false },
  { title: "Dances with Wolves", author: "Kevin Costner", year: 1990, description: "A western about a Union soldier befriending Lakota Indians.", genres: ["western", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Tombstone", author: "George P. Cosmatos", year: 1993, description: "A western about the gunfight at the O.K. Corral.", genres: ["western", "action", "historical"], rating: 4.2, isBook: false },
  { title: "Open Range", author: "Kevin Costner", year: 2003, description: "A western about cattle drivers defending their way of life.", genres: ["western", "drama", "action"], rating: 4.1, isBook: false },
  { title: "3:10 to Yuma", author: "James Mangold", year: 2007, description: "A western about a rancher escorting a notorious outlaw to prison.", genres: ["western", "drama", "action"], rating: 4.2, isBook: false },
  { title: "True Grit", author: "Joel Coen", year: 2010, description: "A western about a young girl seeking revenge with the help of a marshal.", genres: ["western", "drama", "adventure"], rating: 4.3, isBook: false },
  { title: "Django Unchained", author: "Quentin Tarantino", year: 2012, description: "A western about a freed slave seeking revenge in the antebellum South.", genres: ["western", "action", "revenge"], rating: 4.4, isBook: false },
  { title: "The Hateful Eight", author: "Quentin Tarantino", year: 2015, description: "A western about eight strangers trapped in a cabin during a blizzard.", genres: ["western", "mystery", "thriller"], rating: 4.1, isBook: false },
  { title: "The Revenant", author: "Alejandro González Iñárritu", year: 2015, description: "A western about a frontiersman seeking revenge in the wilderness.", genres: ["western", "drama", "adventure"], rating: 4.4, isBook: false },
  
  // Priority Level 2: Sports Films
  { title: "Rocky", author: "John G. Avildsen", year: 1976, description: "A sports drama about an underdog boxer getting a shot at the title.", genres: ["sports", "drama", "inspiration"], rating: 4.5, isBook: false },
  { title: "Rocky II", author: "Sylvester Stallone", year: 1979, description: "A sports drama sequel about Rocky's rematch with Apollo Creed.", genres: ["sports", "drama", "revenge"], rating: 4.2, isBook: false },
  { title: "Rocky III", author: "Sylvester Stallone", year: 1982, description: "A sports drama about Rocky facing a new challenger.", genres: ["sports", "drama", "friendship"], rating: 4.1, isBook: false },
  { title: "Rocky IV", author: "Sylvester Stallone", year: 1985, description: "A sports drama about Rocky fighting a Soviet boxer during the Cold War.", genres: ["sports", "drama", "patriotism"], rating: 4.0, isBook: false },
  { title: "Raging Bull", author: "Martin Scorsese", year: 1980, description: "A biographical sports drama about boxer Jake LaMotta.", genres: ["sports", "drama", "biography"], rating: 4.6, isBook: false },
  { title: "Million Dollar Baby", author: "Clint Eastwood", year: 2004, description: "A sports drama about a female boxer and her trainer.", genres: ["sports", "drama", "family"], rating: 4.4, isBook: false },
  { title: "The Fighter", author: "David O. Russell", year: 2010, description: "A biographical sports drama about boxer Micky Ward.", genres: ["sports", "drama", "family"], rating: 4.3, isBook: false },
  { title: "Creed", author: "Ryan Coogler", year: 2015, description: "A sports drama about Apollo Creed's son becoming a boxer.", genres: ["sports", "drama", "family"], rating: 4.2, isBook: false },
  { title: "Creed II", author: "Steven Caple Jr.", year: 2018, description: "A sports drama about Adonis Creed facing Viktor Drago.", genres: ["sports", "drama", "revenge"], rating: 4.1, isBook: false },
  { title: "Creed III", author: "Michael B. Jordan", year: 2023, description: "A sports drama about Adonis Creed facing his childhood friend.", genres: ["sports", "drama", "friendship"], rating: 4.2, isBook: false },
  { title: "The Natural", author: "Barry Levinson", year: 1984, description: "A sports drama about a baseball player with a mysterious past.", genres: ["sports", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Field of Dreams", author: "Phil Alden Robinson", year: 1989, description: "A sports drama about a farmer building a baseball field.", genres: ["sports", "drama", "fantasy"], rating: 4.3, isBook: false },
  { title: "Bull Durham", author: "Ron Shelton", year: 1988, description: "A sports comedy about minor league baseball players.", genres: ["sports", "comedy", "romance"], rating: 4.1, isBook: false },
  { title: "A League of Their Own", author: "Penny Marshall", year: 1992, description: "A sports comedy about women's baseball during WWII.", genres: ["sports", "comedy", "historical"], rating: 4.2, isBook: false },
  { title: "Remember the Titans", author: "Boaz Yakin", year: 2000, description: "A sports drama about a high school football team during integration.", genres: ["sports", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Friday Night Lights", author: "Peter Berg", year: 2004, description: "A sports drama about a high school football team in Texas.", genres: ["sports", "drama", "family"], rating: 4.2, isBook: false },
  { title: "The Blind Side", author: "John Lee Hancock", year: 2009, description: "A biographical sports drama about football player Michael Oher.", genres: ["sports", "drama", "family"], rating: 4.1, isBook: false },
  { title: "Moneyball", author: "Bennett Miller", year: 2011, description: "A sports drama about using statistics in baseball management.", genres: ["sports", "drama", "business"], rating: 4.3, isBook: false },
  { title: "42", author: "Brian Helgeland", year: 2013, description: "A biographical sports drama about Jackie Robinson breaking the color barrier.", genres: ["sports", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Rush", author: "Ron Howard", year: 2013, description: "A biographical sports drama about Formula One racing rivals.", genres: ["sports", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Ford v Ferrari", author: "James Mangold", year: 2019, description: "A biographical sports drama about Ford's attempt to beat Ferrari at Le Mans.", genres: ["sports", "drama", "biography"], rating: 4.3, isBook: false },
  
  // Priority Level 3: Art House Films
  { title: "Mulholland Drive", author: "David Lynch", year: 2001, description: "A surreal mystery about an aspiring actress in Los Angeles.", genres: ["art house", "mystery", "surreal"], rating: 4.4, isBook: false },
  { title: "Eraserhead", author: "David Lynch", year: 1977, description: "A surreal horror film about a man's nightmarish experiences.", genres: ["art house", "horror", "surreal"], rating: 4.2, isBook: false },
  { title: "Blue Velvet", author: "David Lynch", year: 1986, description: "A neo-noir mystery about dark secrets in a small town.", genres: ["art house", "mystery", "noir"], rating: 4.3, isBook: false },
  { title: "Lost Highway", author: "David Lynch", year: 1997, description: "A surreal thriller about identity and reality.", genres: ["art house", "thriller", "surreal"], rating: 4.1, isBook: false },
  { title: "Inland Empire", author: "David Lynch", year: 2006, description: "A surreal drama about an actress's psychological journey.", genres: ["art house", "drama", "surreal"], rating: 4.0, isBook: false },
  { title: "Persona", author: "Ingmar Bergman", year: 1966, description: "A psychological drama about identity and human connection.", genres: ["art house", "drama", "psychological"], rating: 4.5, isBook: false },
  { title: "The Seventh Seal", author: "Ingmar Bergman", year: 1957, description: "A medieval drama about a knight playing chess with Death.", genres: ["art house", "drama", "philosophical"], rating: 4.4, isBook: false },
  { title: "Wild Strawberries", author: "Ingmar Bergman", year: 1957, description: "A drama about an elderly professor reflecting on his life.", genres: ["art house", "drama", "reflection"], rating: 4.3, isBook: false },
  { title: "Cries and Whispers", author: "Ingmar Bergman", year: 1972, description: "A drama about three sisters dealing with death and grief.", genres: ["art house", "drama", "family"], rating: 4.2, isBook: false },
  { title: "Fanny and Alexander", author: "Ingmar Bergman", year: 1982, description: "A family drama about two children's experiences after their father's death.", genres: ["art house", "drama", "family"], rating: 4.4, isBook: false },
  { title: "8½", author: "Federico Fellini", year: 1963, description: "A surreal drama about a filmmaker's creative crisis.", genres: ["art house", "drama", "surreal"], rating: 4.5, isBook: false },
  { title: "La Dolce Vita", author: "Federico Fellini", year: 1960, description: "A drama about a journalist's search for meaning in Rome.", genres: ["art house", "drama", "social commentary"], rating: 4.4, isBook: false },
  { title: "Nights of Cabiria", author: "Federico Fellini", year: 1957, description: "A drama about a prostitute's search for love and happiness.", genres: ["art house", "drama", "romance"], rating: 4.3, isBook: false },
  { title: "La Strada", author: "Federico Fellini", year: 1954, description: "A drama about a traveling performer and his assistant.", genres: ["art house", "drama", "romance"], rating: 4.2, isBook: false },
  { title: "The 400 Blows", author: "François Truffaut", year: 1959, description: "A coming-of-age drama about a troubled adolescent in Paris.", genres: ["art house", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Jules and Jim", author: "François Truffaut", year: 1962, description: "A romantic drama about a love triangle between friends.", genres: ["art house", "drama", "romance"], rating: 4.3, isBook: false },
  { title: "Breathless", author: "Jean-Luc Godard", year: 1960, description: "A crime drama about a criminal on the run in Paris.", genres: ["art house", "crime", "romance"], rating: 4.4, isBook: false },
  { title: "Contempt", author: "Jean-Luc Godard", year: 1963, description: "A drama about a screenwriter's failing marriage.", genres: ["art house", "drama", "romance"], rating: 4.2, isBook: false },
  { title: "Pierrot le Fou", author: "Jean-Luc Godard", year: 1965, description: "A crime drama about lovers on the run.", genres: ["art house", "crime", "romance"], rating: 4.1, isBook: false },
  { title: "Weekend", author: "Jean-Luc Godard", year: 1967, description: "A surreal drama about a couple's journey through chaos.", genres: ["art house", "drama", "surreal"], rating: 4.0, isBook: false },
  
  // Priority Level 3: Foreign Language Films
  { title: "Oldboy", author: "Park Chan-wook", year: 2003, description: "A South Korean thriller about a man seeking revenge after 15 years of imprisonment.", genres: ["foreign", "thriller", "revenge"], rating: 4.5, isBook: false },
  { title: "The Handmaiden", author: "Park Chan-wook", year: 2016, description: "A South Korean thriller about a con artist and a wealthy heiress.", genres: ["foreign", "thriller", "romance"], rating: 4.4, isBook: false },
  { title: "Memories of Murder", author: "Bong Joon-ho", year: 2003, description: "A South Korean crime drama about detectives hunting a serial killer.", genres: ["foreign", "crime", "drama"], rating: 4.3, isBook: false },
  { title: "The Host", author: "Bong Joon-ho", year: 2006, description: "A South Korean monster film about a family fighting a giant creature.", genres: ["foreign", "horror", "family"], rating: 4.2, isBook: false },
  { title: "Train to Busan", author: "Yeon Sang-ho", year: 2016, description: "A South Korean zombie film about passengers on a train during an outbreak.", genres: ["foreign", "horror", "action"], rating: 4.3, isBook: false },
  { title: "The Wailing", author: "Na Hong-jin", year: 2016, description: "A South Korean horror film about a policeman investigating mysterious deaths.", genres: ["foreign", "horror", "mystery"], rating: 4.2, isBook: false },
  { title: "Burning", author: "Lee Chang-dong", year: 2018, description: "A South Korean mystery about a delivery man and his mysterious neighbor.", genres: ["foreign", "mystery", "drama"], rating: 4.3, isBook: false },
  { title: "The Tale of the Princess Kaguya", author: "Isao Takahata", year: 2013, description: "A Japanese animated film about a princess from the moon.", genres: ["foreign", "animation", "fantasy"], rating: 4.4, isBook: false },
  { title: "Grave of the Fireflies", author: "Isao Takahata", year: 1988, description: "A Japanese animated drama about siblings during WWII.", genres: ["foreign", "animation", "drama"], rating: 4.5, isBook: false },
  { title: "Spirited Away", author: "Hayao Miyazaki", year: 2001, description: "A Japanese animated fantasy about a girl in a magical world.", genres: ["foreign", "animation", "fantasy"], rating: 4.6, isBook: false },
  { title: "My Neighbor Totoro", author: "Hayao Miyazaki", year: 1988, description: "A Japanese animated fantasy about sisters and forest spirits.", genres: ["foreign", "animation", "family"], rating: 4.5, isBook: false },
  { title: "Princess Mononoke", author: "Hayao Miyazaki", year: 1997, description: "A Japanese animated fantasy about humans and nature spirits.", genres: ["foreign", "animation", "fantasy"], rating: 4.4, isBook: false },
  { title: "Howl's Moving Castle", author: "Hayao Miyazaki", year: 2004, description: "A Japanese animated fantasy about a young woman and a wizard.", genres: ["foreign", "animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Castle in the Sky", author: "Hayao Miyazaki", year: 1986, description: "A Japanese animated adventure about a floating castle.", genres: ["foreign", "animation", "adventure"], rating: 4.2, isBook: false },
  { title: "Kiki's Delivery Service", author: "Hayao Miyazaki", year: 1989, description: "A Japanese animated fantasy about a young witch.", genres: ["foreign", "animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Nausicaä of the Valley of the Wind", author: "Hayao Miyazaki", year: 1984, description: "A Japanese animated sci-fi about a princess in a post-apocalyptic world.", genres: ["foreign", "animation", "sci-fi"], rating: 4.2, isBook: false },
  { title: "The Wind Rises", author: "Hayao Miyazaki", year: 2013, description: "A Japanese animated biographical drama about an aircraft designer.", genres: ["foreign", "animation", "biography"], rating: 4.1, isBook: false },
  { title: "Akira", author: "Katsuhiro Otomo", year: 1988, description: "A Japanese animated sci-fi about psychic powers in a cyberpunk world.", genres: ["foreign", "animation", "sci-fi"], rating: 4.4, isBook: false },
  { title: "Ghost in the Shell", author: "Mamoru Oshii", year: 1995, description: "A Japanese animated sci-fi about a cyborg police officer.", genres: ["foreign", "animation", "sci-fi"], rating: 4.3, isBook: false },
  { title: "Perfect Blue", author: "Satoshi Kon", year: 1997, description: "A Japanese animated thriller about a pop star's psychological breakdown.", genres: ["foreign", "animation", "thriller"], rating: 4.2, isBook: false },
  { title: "Paprika", author: "Satoshi Kon", year: 2006, description: "A Japanese animated sci-fi about a device that allows people to enter dreams.", genres: ["foreign", "animation", "sci-fi"], rating: 4.1, isBook: false },
  
  // Priority Level 3: Experimental Films
  { title: "Meshes of the Afternoon", author: "Maya Deren", year: 1943, description: "An experimental short film about a woman's dreamlike experiences.", genres: ["experimental", "short", "surreal"], rating: 4.2, isBook: false },
  { title: "Un Chien Andalou", author: "Luis Buñuel", year: 1929, description: "An experimental short film with surreal imagery.", genres: ["experimental", "short", "surreal"], rating: 4.1, isBook: false },
  { title: "L'Age d'Or", author: "Luis Buñuel", year: 1930, description: "An experimental film about love and social conventions.", genres: ["experimental", "drama", "surreal"], rating: 4.0, isBook: false },
  { title: "The Man with a Movie Camera", author: "Dziga Vertov", year: 1929, description: "An experimental documentary about Soviet urban life.", genres: ["experimental", "documentary", "silent"], rating: 4.3, isBook: false },
  { title: "Battleship Potemkin", author: "Sergei Eisenstein", year: 1925, description: "A revolutionary silent film about a mutiny on a Russian battleship.", genres: ["experimental", "drama", "historical"], rating: 4.4, isBook: false },
  { title: "Strike", author: "Sergei Eisenstein", year: 1925, description: "A silent film about a workers' strike in pre-revolutionary Russia.", genres: ["experimental", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Ivan the Terrible", author: "Sergei Eisenstein", year: 1944, description: "A historical drama about the Russian tsar Ivan the Terrible.", genres: ["experimental", "drama", "historical"], rating: 4.1, isBook: false },
  { title: "Metropolis", author: "Fritz Lang", year: 1927, description: "A silent sci-fi film about class conflict in a futuristic city.", genres: ["experimental", "sci-fi", "silent"], rating: 4.3, isBook: false },
  { title: "M", author: "Fritz Lang", year: 1931, description: "A crime thriller about a city hunting a child murderer.", genres: ["experimental", "crime", "thriller"], rating: 4.4, isBook: false },
  { title: "The Cabinet of Dr. Caligari", author: "Robert Wiene", year: 1920, description: "A silent horror film with expressionist visuals.", genres: ["experimental", "horror", "silent"], rating: 4.2, isBook: false },
  { title: "Nosferatu", author: "F.W. Murnau", year: 1922, description: "A silent horror film about a vampire in Germany.", genres: ["experimental", "horror", "silent"], rating: 4.3, isBook: false },
  { title: "Sunrise: A Song of Two Humans", author: "F.W. Murnau", year: 1927, description: "A silent romantic drama about a farmer and his wife.", genres: ["experimental", "drama", "romance"], rating: 4.4, isBook: false },
  { title: "The Passion of Joan of Arc", author: "Carl Theodor Dreyer", year: 1928, description: "A silent historical drama about Joan of Arc's trial.", genres: ["experimental", "drama", "historical"], rating: 4.5, isBook: false },
  { title: "Vampyr", author: "Carl Theodor Dreyer", year: 1932, description: "A horror film about a man encountering supernatural forces.", genres: ["experimental", "horror", "supernatural"], rating: 4.1, isBook: false },
  { title: "Ordet", author: "Carl Theodor Dreyer", year: 1955, description: "A drama about faith and miracles in a Danish family.", genres: ["experimental", "drama", "religious"], rating: 4.2, isBook: false },
  { title: "Gertrud", author: "Carl Theodor Dreyer", year: 1964, description: "A drama about a woman's search for true love.", genres: ["experimental", "drama", "romance"], rating: 4.0, isBook: false },
  
  // Priority Level 3: Educational Documentaries
  { title: "The Civil War", author: "Ken Burns", year: 1990, description: "A comprehensive documentary series about the American Civil War.", genres: ["documentary", "history", "educational"], rating: 4.7, isBook: false },
  { title: "Baseball", author: "Ken Burns", year: 1994, description: "A documentary series about the history of baseball in America.", genres: ["documentary", "sports", "history"], rating: 4.5, isBook: false },
  { title: "Jazz", author: "Ken Burns", year: 2001, description: "A documentary series about the history of jazz music.", genres: ["documentary", "music", "history"], rating: 4.4, isBook: false },
  { title: "The War", author: "Ken Burns", year: 2007, description: "A documentary series about World War II from an American perspective.", genres: ["documentary", "history", "war"], rating: 4.6, isBook: false },
  { title: "The National Parks", author: "Ken Burns", year: 2009, description: "A documentary series about America's national parks.", genres: ["documentary", "nature", "history"], rating: 4.3, isBook: false },
  { title: "The Vietnam War", author: "Ken Burns", year: 2017, description: "A comprehensive documentary series about the Vietnam War.", genres: ["documentary", "history", "war"], rating: 4.5, isBook: false },
  { title: "Country Music", author: "Ken Burns", year: 2019, description: "A documentary series about the history of country music.", genres: ["documentary", "music", "history"], rating: 4.2, isBook: false },
  { title: "The Roosevelts", author: "Ken Burns", year: 2014, description: "A documentary series about Theodore, Franklin, and Eleanor Roosevelt.", genres: ["documentary", "biography", "history"], rating: 4.4, isBook: false },
  { title: "The Dust Bowl", author: "Ken Burns", year: 2012, description: "A documentary about the environmental disaster of the 1930s.", genres: ["documentary", "history", "environmental"], rating: 4.3, isBook: false },
  { title: "Prohibition", author: "Ken Burns", year: 2011, description: "A documentary series about the Prohibition era in America.", genres: ["documentary", "history", "social"], rating: 4.2, isBook: false },
  { title: "The Central Park Five", author: "Ken Burns", year: 2012, description: "A documentary about five teenagers wrongly convicted of rape.", genres: ["documentary", "crime", "social justice"], rating: 4.3, isBook: false },
  { title: "Cancer: The Emperor of All Maladies", author: "Barak Goodman", year: 2015, description: "A documentary series about the history and treatment of cancer.", genres: ["documentary", "medical", "science"], rating: 4.4, isBook: false },
  { title: "The Gene", author: "Ken Burns", year: 2020, description: "A documentary series about the history of genetics and DNA.", genres: ["documentary", "science", "medical"], rating: 4.2, isBook: false },
  { title: "The Address", author: "Ken Burns", year: 2014, description: "A documentary about students memorizing the Gettysburg Address.", genres: ["documentary", "education", "history"], rating: 4.1, isBook: false },
  { title: "Defying the Nazis", author: "Ken Burns", year: 2016, description: "A documentary about Americans who helped rescue Jews during WWII.", genres: ["documentary", "history", "war"], rating: 4.3, isBook: false },
  { title: "The Mayo Clinic", author: "Ken Burns", year: 2018, description: "A documentary about the history of the Mayo Clinic.", genres: ["documentary", "medical", "history"], rating: 4.2, isBook: false },
  { title: "Hemingway", author: "Ken Burns", year: 2021, description: "A documentary series about the life and work of Ernest Hemingway.", genres: ["documentary", "biography", "literature"], rating: 4.3, isBook: false },
  { title: "Benjamin Franklin", author: "Ken Burns", year: 2022, description: "A documentary about the life and legacy of Benjamin Franklin.", genres: ["documentary", "biography", "history"], rating: 4.2, isBook: false },
  { title: "The U.S. and the Holocaust", author: "Ken Burns", year: 2022, description: "A documentary about America's response to the Holocaust.", genres: ["documentary", "history", "war"], rating: 4.4, isBook: false },
  { title: "The American Buffalo", author: "Ken Burns", year: 2023, description: "A documentary about the history and near-extinction of the American bison.", genres: ["documentary", "nature", "history"], rating: 4.1, isBook: false },
  
  // Priority Level 3: Anime Films
  { title: "Akira", author: "Katsuhiro Otomo", year: 1988, description: "A Japanese animated sci-fi about psychic powers in a cyberpunk world.", genres: ["anime", "sci-fi", "cyberpunk"], rating: 4.4, isBook: false },
  { title: "Ghost in the Shell", author: "Mamoru Oshii", year: 1995, description: "A Japanese animated sci-fi about a cyborg police officer.", genres: ["anime", "sci-fi", "cyberpunk"], rating: 4.3, isBook: false },
  { title: "Perfect Blue", author: "Satoshi Kon", year: 1997, description: "A Japanese animated thriller about a pop star's psychological breakdown.", genres: ["anime", "thriller", "psychological"], rating: 4.2, isBook: false },
  { title: "Paprika", author: "Satoshi Kon", year: 2006, description: "A Japanese animated sci-fi about a device that allows people to enter dreams.", genres: ["anime", "sci-fi", "surreal"], rating: 4.1, isBook: false },
  { title: "Tokyo Godfathers", author: "Satoshi Kon", year: 2003, description: "A Japanese animated comedy-drama about three homeless people finding a baby.", genres: ["anime", "comedy", "drama"], rating: 4.0, isBook: false },
  { title: "Millennium Actress", author: "Satoshi Kon", year: 2001, description: "A Japanese animated drama about an actress's life and career.", genres: ["anime", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Your Name", author: "Makoto Shinkai", year: 2016, description: "A Japanese animated romance about two teenagers who swap bodies.", genres: ["anime", "romance", "fantasy"], rating: 4.5, isBook: false },
  { title: "Weathering with You", author: "Makoto Shinkai", year: 2019, description: "A Japanese animated romance about a boy and a girl who can control the weather.", genres: ["anime", "romance", "fantasy"], rating: 4.3, isBook: false },
  { title: "5 Centimeters Per Second", author: "Makoto Shinkai", year: 2007, description: "A Japanese animated romance about distance and relationships.", genres: ["anime", "romance", "drama"], rating: 4.2, isBook: false },
  { title: "The Garden of Words", author: "Makoto Shinkai", year: 2013, description: "A Japanese animated romance about a student and a woman in a garden.", genres: ["anime", "romance", "drama"], rating: 4.1, isBook: false },
  { title: "A Silent Voice", author: "Naoko Yamada", year: 2016, description: "A Japanese animated drama about bullying and redemption.", genres: ["anime", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Liz and the Blue Bird", author: "Naoko Yamada", year: 2018, description: "A Japanese animated drama about two high school musicians.", genres: ["anime", "drama", "music"], rating: 4.0, isBook: false },
  { title: "Wolf Children", author: "Mamoru Hosoda", year: 2012, description: "A Japanese animated drama about a mother raising werewolf children.", genres: ["anime", "drama", "fantasy"], rating: 4.3, isBook: false },
  { title: "The Boy and the Beast", author: "Mamoru Hosoda", year: 2015, description: "A Japanese animated fantasy about a boy training with a beast warrior.", genres: ["anime", "fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "Mirai", author: "Mamoru Hosoda", year: 2018, description: "A Japanese animated fantasy about a boy meeting his future sister.", genres: ["anime", "fantasy", "family"], rating: 4.0, isBook: false },
  { title: "Belle", author: "Mamoru Hosoda", year: 2021, description: "A Japanese animated sci-fi about a girl in a virtual world.", genres: ["anime", "sci-fi", "romance"], rating: 4.2, isBook: false },
  { title: "Redline", author: "Takeshi Koike", year: 2009, description: "A Japanese animated sci-fi about a high-stakes racing competition.", genres: ["anime", "sci-fi", "action"], rating: 4.1, isBook: false },
  { title: "Tekkonkinkreet", author: "Michael Arias", year: 2006, description: "A Japanese animated crime drama about two street kids.", genres: ["anime", "crime", "drama"], rating: 4.0, isBook: false },
  { title: "Mind Game", author: "Masaaki Yuasa", year: 2004, description: "A Japanese animated surreal comedy about a man's second chance at life.", genres: ["anime", "comedy", "surreal"], rating: 4.1, isBook: false },
  { title: "The Night is Short, Walk on Girl", author: "Masaaki Yuasa", year: 2017, description: "A Japanese animated comedy about a night of adventures in Kyoto.", genres: ["anime", "comedy", "romance"], rating: 4.2, isBook: false },
  { title: "Lu Over the Wall", author: "Masaaki Yuasa", year: 2017, description: "A Japanese animated fantasy about a boy and a mermaid.", genres: ["anime", "fantasy", "music"], rating: 4.0, isBook: false },
  { title: "Ride Your Wave", author: "Masaaki Yuasa", year: 2019, description: "A Japanese animated romance about a surfer and her boyfriend's ghost.", genres: ["anime", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "In This Corner of the World", author: "Sunao Katabuchi", year: 2016, description: "A Japanese animated drama about a woman during WWII.", genres: ["anime", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Maquia: When the Promised Flower Blooms", author: "Mari Okada", year: 2018, description: "A Japanese animated fantasy about an immortal girl raising a human child.", genres: ["anime", "fantasy", "drama"], rating: 4.1, isBook: false },
  { title: "Fireworks", author: "Nobuyuki Takeuchi", year: 2017, description: "A Japanese animated romance about a boy who can rewind time.", genres: ["anime", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "The Anthem of the Heart", author: "Tatsuyuki Nagai", year: 2015, description: "A Japanese animated drama about a girl who can't speak due to trauma.", genres: ["anime", "drama", "music"], rating: 4.1, isBook: false },
  { title: "Colorful", author: "Keiichi Hara", year: 2010, description: "A Japanese animated drama about a soul getting a second chance at life.", genres: ["anime", "drama", "fantasy"], rating: 4.0, isBook: false },
  { title: "Summer Wars", author: "Mamoru Hosoda", year: 2009, description: "A Japanese animated sci-fi about a virtual world crisis.", genres: ["anime", "sci-fi", "family"], rating: 4.2, isBook: false },
  { title: "The Girl Who Leapt Through Time", author: "Mamoru Hosoda", year: 2006, description: "A Japanese animated sci-fi about a girl who can time travel.", genres: ["anime", "sci-fi", "romance"], rating: 4.3, isBook: false }
];

// Local fallback data for backward compatibility (keeping the old structure)
const LOCAL_BOOK_DATA = {
  adventure: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("adventure")).slice(0, 10),
  fantasy: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("fantasy")).slice(0, 10),
  mystery: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("mystery")).slice(0, 10)
};

export default function SuggestionsScreen() {
  const { 
    books, 
    movies, 
    addBook, 
    addMovie, 
    generateComprehensiveExport, 
    importItems, 
    forceUpdate 
  } = useDataStore();
  
  const { settings } = useAppSettings();
  const { interests } = useUserInterests();
  const { getPreloadedMovies, getPreloadedBooks } = usePreloadedData();
  
  // Define isDark constant to fix the ReferenceError
  const isDark = false;
  
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('confidence');

  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalIsBook, setModalIsBook] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<Set<string>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Map<string, Suggestion>>(new Map());
  const [granularRatings, setGranularRatings] = useState<Map<string, GranularRating>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info'
  });
  const [successAnimation, setSuccessAnimation] = useState<Set<string>>(new Set());
  const [immediateFeedback, setImmediateFeedback] = useState<Set<string>>(new Set());

  // Real-time processing state
  const [sessionData, setSessionData] = useState<{
    startTime: Date;
    interactions: Array<{
      type: 'view' | 'add' | 'dismiss' | 'search' | 'filter';
      itemId?: string;
      timestamp: Date;
      metadata?: any;
    }>;
    currentContext: {
      activeFilter: FilterOption;
  
      sortBy: SortOption;
      timeOfDay: string;
      sessionDuration: number;
    };
  }>({
    startTime: new Date(),
    interactions: [],
    currentContext: {
      activeFilter: 'all',
      
      sortBy: 'confidence',
      timeOfDay: (() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 17) return 'afternoon';
        if (hour >= 17 && hour < 21) return 'evening';
        return 'night';
      })(),
      sessionDuration: 0
    }
  });

  const [realTimeSuggestions, setRealTimeSuggestions] = useState<Suggestion[]>([]);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [isRealTimeProcessing, setIsRealTimeProcessing] = useState(false);
  const [userBehaviorMetrics, setUserBehaviorMetrics] = useState<{
    viewTime: Map<string, number>;
    interactionPatterns: Map<string, number>;
    preferenceChanges: Map<string, number>;
  }>({
    viewTime: new Map(),
    interactionPatterns: new Map(),
    preferenceChanges: new Map()
  });

  // Force re-render when data store updates
  const [localForceUpdate, setLocalForceUpdate] = useState(0);

  // Handle saving items from the Add/Edit modal
  const handleSaveItem = (formData: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Determine if it's a book or movie based on the format
    const isBook = formData.format === 'text' || formData.format === 'audio';
    
    if (isBook) {
      const newBook: any = {
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && { dateAdded: currentDate, percentage: 0 }),
        ...(formData.category === 'fails' && { dateAbandoned: currentDate }),
      };
      addBook(newBook);
    } else {
      const newMovie: any = {
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && { dateAdded: currentDate, percentage: 0 }),
        ...(formData.category === 'fails' && { dateAbandoned: currentDate }),
      };
      addMovie(newMovie);
    }
    setShowAddModal(false);
  };

  // Load dismissed suggestions and feedback from storage on component mount
  useEffect(() => {
    const loadFeedbackData = async () => {
      try {
        // Load dismissed suggestions
        const stored = await AsyncStorage.getItem('dismissedSuggestions');
        if (stored) {
          const dismissedData = JSON.parse(stored);
          // Handle both old format (array of strings) and new format (object with full data)
          if (Array.isArray(dismissedData)) {
            // Old format - convert to new format
            const newMap = new Map();
            dismissedData.forEach(id => {
              newMap.set(id, { id } as Suggestion);
            });
            setDismissedSuggestions(newMap);
          } else {
            // New format - object with full suggestion data
            const newMap = new Map();
            Object.entries(dismissedData).forEach(([id, suggestion]) => {
              newMap.set(id, suggestion as Suggestion);
            });
            setDismissedSuggestions(newMap);
          }
        }

        // Load granular ratings
        const storedRatings = await AsyncStorage.getItem('granularRatings');
        if (storedRatings) {
          try {
            const ratingsData = JSON.parse(storedRatings);
            const newMap = new Map();
            Object.entries(ratingsData).forEach(([id, rating]) => {
              if (rating && typeof rating === 'string' && ['loved', 'liked', 'meh', 'disliked'].includes(rating)) {
                newMap.set(id, rating as GranularRating);
              } else {
                console.warn('⚠️ Skipping invalid rating:', rating);
              }
            });
            setGranularRatings(newMap);
          } catch (error) {
            console.error('Error parsing granular ratings:', error);
            setGranularRatings(new Map());
          }
        }
      } catch (error) {
        console.error('Error loading feedback data:', error);
      }
    };

    loadFeedbackData();
  }, []);

  // Clear addedItems when user has empty lists (app restart scenario)
  useEffect(() => {
    const totalBooks = (books?.completed?.length || 0) + 
                      (books?.inProgress?.length || 0) + 
                      (books?.planned?.length || 0) + 
                      (books?.fails?.length || 0) + 
                      (books?.allTime?.length || 0);
    
    const totalMovies = (movies?.completed?.length || 0) + 
                       (movies?.inProgress?.length || 0) + 
                       (movies?.planned?.length || 0) + 
                       (movies?.fails?.length || 0) + 
                       (movies?.allTime?.length || 0);
    
    // If user has no items but addedItems has entries, clear addedItems
    if (totalBooks === 0 && totalMovies === 0 && addedItems.size > 0) {
      console.log('🔄 Clearing addedItems due to empty user lists (app restart)');
      setAddedItems(new Set());
    }
  }, [books, movies, addedItems.size]);

  // Save dismissed suggestions to storage whenever they change
  useEffect(() => {
    const saveDismissedSuggestions = async () => {
      try {
        const dismissedObject = Object.fromEntries(dismissedSuggestions);
        await AsyncStorage.setItem('dismissedSuggestions', JSON.stringify(dismissedObject));
      } catch (error) {
        console.error('Error saving dismissed suggestions:', error);
      }
    };

    if (dismissedSuggestions.size > 0) {
      saveDismissedSuggestions();
    }
  }, [dismissedSuggestions]);

  // Save granular ratings to storage whenever they change
  useEffect(() => {
    const saveGranularRatings = async () => {
      try {
        const ratingsObject = Object.fromEntries(granularRatings);
        await AsyncStorage.setItem('granularRatings', JSON.stringify(ratingsObject));
      } catch (error) {
        console.error('Error saving granular ratings:', error);
      }
    };

    if (granularRatings.size > 0) {
      saveGranularRatings();
    }
  }, [granularRatings]);
  
  useEffect(() => {
    console.log('📊 Suggestions - Force update triggered:', forceUpdate);
    setLocalForceUpdate(prev => prev + 1);
  }, [forceUpdate, books.planned.length, movies.planned.length]);

  // Debug: Track state changes with enhanced logging
  useEffect(() => {
    console.log('📊 Suggestions screen - Books state updated:', {
      completed: books.completed.length,
      inProgress: books.inProgress.length,
      planned: books.planned.length,
      fails: books.fails.length,
      allTime: books.allTime.length,
    });
    
    if (books.planned.length > 0) {
      console.log('📊 Planned books in suggestions screen:', books.planned.map(book => book.title));
    }
  }, [books]);

  useEffect(() => {
    console.log('📊 Suggestions screen - Movies state updated:', {
      completed: movies.completed.length,
      inProgress: movies.inProgress.length,
      planned: movies.planned.length,
      fails: movies.fails.length,
      allTime: movies.allTime.length,
    });
    
    if (movies.planned.length > 0) {
      console.log('📊 Planned movies in suggestions screen:', movies.planned.map(movie => movie.title));
    }
  }, [movies]);

  // Track filter changes for real-time processing
  useEffect(() => {
    if (activeFilter !== 'all') {
      trackUserInteraction('filter', undefined, { filter: activeFilter });
    }
  }, [activeFilter]);

  // Track search changes for real-time processing


  // Track sort changes for real-time processing
  useEffect(() => {
    if (sortBy !== 'confidence') {
      trackUserInteraction('filter', undefined, { sort: sortBy });
    }
  }, [sortBy]);

  // Refresh suggestions function
  const handleRefresh = () => {
    console.log('🔄 Refreshing suggestions...');
    setIsRefreshing(true);
    
    // Simulate refresh delay for better UX
    setTimeout(() => {
      setLastRefreshTime(new Date());
      setLocalForceUpdate(prev => prev + 1);
      setIsRefreshing(false);
      
      console.log('✅ Suggestions refreshed successfully');
    }, 1500);
  };

  // Removed hard-coded getSimilarWorks - now using API exclusively

  // Removed hard-coded genreBooks array - now using API exclusively

  // Removed hard-coded getAwardWinningBooks - now using API exclusively

  const estimatePages = (title: string): number => {
    const basePages = 250;
    const titleLength = title.length;
    return Math.round(basePages + (titleLength * 5) + Math.random() * 100);
  };

  const estimateLength = (title: string): 'short' | 'medium' | 'long' => {
    const pages = estimatePages(title);
    if (pages < 200) return 'short';
    if (pages < 400) return 'medium';
    return 'long';
  };

  // Helper functions for enhanced analysis
  const getSeason = (month: number): string => {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  };

  const getReadingPace = (daysToComplete: number): string => {
    if (daysToComplete <= 3) return 'fast';
    if (daysToComplete <= 14) return 'moderate';
    if (daysToComplete <= 60) return 'slow';
    return 'very-slow';
  };

  const getCurrentSeason = (): string => {
    return getSeason(new Date().getMonth());
  };

  // Real-time processing functions
  const trackUserInteraction = (type: 'view' | 'add' | 'dismiss' | 'search' | 'filter', itemId?: string, metadata?: any) => {
    const interaction = {
      type,
      itemId,
      timestamp: new Date(),
      metadata
    };
    
    setSessionData(prev => ({
      ...prev,
      interactions: [...prev.interactions, interaction],
      currentContext: {
        ...prev.currentContext,
        activeFilter,

        sortBy,
        timeOfDay: (() => {
          const hour = new Date().getHours();
          if (hour >= 5 && hour < 12) return 'morning';
          if (hour >= 12 && hour < 17) return 'afternoon';
          if (hour >= 17 && hour < 21) return 'evening';
          return 'night';
        })(),
        sessionDuration: Date.now() - prev.startTime.getTime()
      }
    }));

    // Update behavior metrics
    setUserBehaviorMetrics(prev => {
      const newPatterns = new Map(prev.interactionPatterns);
      const patternKey = `${type}-${itemId || 'general'}`;
      newPatterns.set(patternKey, (newPatterns.get(patternKey) || 0) + 1);
      
      return {
        ...prev,
        interactionPatterns: newPatterns
      };
    });

    console.log(`🔄 Real-time interaction tracked: ${type}${itemId ? ` for ${itemId}` : ''}`);
  };

  const generateRealTimeSuggestions = async (baseSuggestions: Suggestion[]): Promise<Suggestion[]> => {
    setIsRealTimeProcessing(true);
    
    try {
      // Analyze session context for real-time adjustments
      const sessionContext = sessionData.currentContext;
      const recentInteractions = sessionData.interactions.slice(-5); // Last 5 interactions
      
      let adjustedSuggestions = [...baseSuggestions];
      
      // 1. Session-based filtering based on recent interactions
      const recentGenres = new Set<string>();
      const recentAuthors = new Set<string>();
      
      recentInteractions.forEach(interaction => {
        if (interaction.type === 'add' && interaction.itemId) {
          const addedItem = baseSuggestions.find(s => s.id === interaction.itemId);
          if (addedItem) {
            addedItem.genres?.forEach(genre => recentGenres.add(genre));
            recentAuthors.add(addedItem.author);
          }
        }
      });
      
      // 2. Time-of-day adjustments
      const timeOfDayPreferences: { [key: string]: string[] } = {
        morning: ['uplifting', 'motivational', 'educational'],
        afternoon: ['engaging', 'entertaining', 'medium'],
        evening: ['relaxing', 'entertaining', 'short'],
        night: ['thrilling', 'mysterious', 'long']
      };
      
      const currentTimePreferences = timeOfDayPreferences[sessionContext.timeOfDay] || [];
      
      // 3. Session duration adjustments
      const sessionDuration = sessionContext.sessionDuration;
      const isLongSession = sessionDuration > 300000; // 5 minutes
      
      // 4. Apply real-time adjustments
      adjustedSuggestions = adjustedSuggestions.map(suggestion => {
        let confidenceBoost = 0;
        
        // Boost confidence for items matching recent interactions
        if (suggestion.genres?.some(genre => recentGenres.has(genre))) {
          confidenceBoost += 15;
        }
        if (recentAuthors.has(suggestion.author)) {
          confidenceBoost += 10;
        }
        
        // Time-of-day boost
        if (suggestion.description && currentTimePreferences.some(pref => 
          suggestion.description!.toLowerCase().includes(pref)
        )) {
          confidenceBoost += 8;
        }
        
        // Session duration boost (prefer shorter content in long sessions)
        if (isLongSession && suggestion.estimatedLength === 'short') {
          confidenceBoost += 5;
        }
        
        // Recent interaction boost
        const recentInteractionCount = recentInteractions.filter(i => 
          i.type === 'view' && i.itemId === suggestion.id
        ).length;
        confidenceBoost += recentInteractionCount * 3;
        
        return {
          ...suggestion,
          confidence: Math.min(100, suggestion.confidence + confidenceBoost),
          reason: `${suggestion.reason}${confidenceBoost > 0 ? ` (Real-time boost: +${confidenceBoost})` : ''}`
        };
      });
      
      // 5. Sort by adjusted confidence
      adjustedSuggestions.sort((a, b) => b.confidence - a.confidence);
      
      console.log(`⚡ Real-time suggestions generated: ${adjustedSuggestions.length} items with session context`);
      return adjustedSuggestions;
      
    } catch (error) {
      console.error('❌ Error generating real-time suggestions:', error);
      return baseSuggestions;
    } finally {
      setIsRealTimeProcessing(false);
    }
  };

  const updateSessionContext = () => {
    setSessionData(prev => ({
      ...prev,
      currentContext: {
        ...prev.currentContext,
        activeFilter,

        sortBy,
        timeOfDay: (() => {
          const hour = new Date().getHours();
          if (hour >= 5 && hour < 12) return 'morning';
          if (hour >= 12 && hour < 17) return 'afternoon';
          if (hour >= 17 && hour < 21) return 'evening';
          return 'night';
        })(),
        sessionDuration: Date.now() - prev.startTime.getTime()
      }
    }));
  };

  // Synchronous version of real-time adjustments for useMemo
  const applyRealTimeAdjustments = (baseSuggestions: Suggestion[]): Suggestion[] => {
    try {
      // Safety check for baseSuggestions
      if (!Array.isArray(baseSuggestions)) {
        console.warn('⚠️ baseSuggestions is not an array:', baseSuggestions);
        return [];
      }
      
      // Filter out invalid suggestions that might cause errors
      const validSuggestions = baseSuggestions.filter(suggestion => 
        suggestion && 
        typeof suggestion === 'object' && 
        suggestion.description !== undefined &&
        typeof suggestion.description === 'string'
      );
      
      if (validSuggestions.length !== baseSuggestions.length) {
        console.warn(`⚠️ Filtered out ${baseSuggestions.length - validSuggestions.length} invalid suggestions`);
      }
      
      // Use only valid suggestions
      baseSuggestions = validSuggestions;
      // Analyze session context for real-time adjustments
      const sessionContext = sessionData.currentContext;
      const recentInteractions = sessionData.interactions.slice(-5); // Last 5 interactions
      
      let adjustedSuggestions = [...baseSuggestions];
      
      // 1. Session-based filtering based on recent interactions
      const recentGenres = new Set<string>();
      const recentAuthors = new Set<string>();
      
      recentInteractions.forEach(interaction => {
        if (interaction.type === 'add' && interaction.itemId) {
          const addedItem = baseSuggestions.find(s => s.id === interaction.itemId);
          if (addedItem) {
            addedItem.genres?.forEach(genre => recentGenres.add(genre));
            recentAuthors.add(addedItem.author);
          }
        }
      });
      
      // 2. Time-of-day adjustments
      const timeOfDayPreferences: { [key: string]: string[] } = {
        morning: ['uplifting', 'motivational', 'educational'],
        afternoon: ['engaging', 'entertaining', 'medium'],
        evening: ['relaxing', 'entertaining', 'short'],
        night: ['thrilling', 'mysterious', 'long']
      };
      
      const currentTimePreferences = timeOfDayPreferences[sessionContext.timeOfDay] || [];
      
      // 3. Session duration adjustments
      const sessionDuration = sessionContext.sessionDuration;
      const isLongSession = sessionDuration > 300000; // 5 minutes
      
      // 4. Apply real-time adjustments
      adjustedSuggestions = adjustedSuggestions.map(suggestion => {
        let confidenceBoost = 0;
        
        // Boost confidence for items matching recent interactions
        if (suggestion.genres?.some(genre => recentGenres.has(genre))) {
          confidenceBoost += 15;
        }
        if (recentAuthors.has(suggestion.author)) {
          confidenceBoost += 10;
        }
        
        // Time-of-day boost
        if (suggestion.description && currentTimePreferences.some(pref => 
          suggestion.description!.toLowerCase().includes(pref)
        )) {
          confidenceBoost += 8;
        }
        
        // Session duration boost (prefer shorter content in long sessions)
        if (isLongSession && suggestion.estimatedLength === 'short') {
          confidenceBoost += 5;
        }
        
        // Recent interaction boost
        const recentInteractionCount = recentInteractions.filter(i => 
          i.type === 'view' && i.itemId === suggestion.id
        ).length;
        confidenceBoost += recentInteractionCount * 3;
        
        return {
          ...suggestion,
          confidence: Math.min(100, suggestion.confidence + confidenceBoost),
          reason: `${suggestion.reason}${confidenceBoost > 0 ? ` (Real-time boost: +${confidenceBoost})` : ''}`
        };
      });
      
      // 5. Sort by adjusted confidence
      adjustedSuggestions.sort((a, b) => b.confidence - a.confidence);
      
      console.log(`⚡ Real-time adjustments applied: ${adjustedSuggestions.length} items with session context`);
      return adjustedSuggestions;
      
    } catch (error) {
      console.error('❌ Error applying real-time adjustments:', error);
      return baseSuggestions;
    }
  };

  const inferGenres = (title: string, author: string): string[] => {
    const lowerTitle = title.toLowerCase();
    const lowerAuthor = author.toLowerCase();
    
    const genres: string[] = [];
    
    // Mystery & Thriller
    if (lowerTitle.includes('murder') || lowerTitle.includes('death') || lowerTitle.includes('killer') || 
        lowerTitle.includes('detective') || lowerTitle.includes('crime') || lowerTitle.includes('mystery')) {
      genres.push('Mystery', 'Thriller');
    }
    
    // Romance
    if (lowerTitle.includes('love') || lowerTitle.includes('heart') || lowerTitle.includes('romance') || 
        lowerTitle.includes('wedding') || lowerTitle.includes('dating')) {
      genres.push('Romance');
    }
    
    // Science Fiction
    if (lowerTitle.includes('space') || lowerTitle.includes('robot') || lowerTitle.includes('alien') || 
        lowerTitle.includes('future') || lowerTitle.includes('dystopia') || lowerTitle.includes('cyber') ||
        lowerAuthor.includes('asimov') || lowerAuthor.includes('clarke') || lowerAuthor.includes('bradbury')) {
      genres.push('Science Fiction');
    }
    
    // Fantasy
    if (lowerTitle.includes('magic') || lowerTitle.includes('wizard') || lowerTitle.includes('dragon') || 
        lowerTitle.includes('kingdom') || lowerTitle.includes('quest') || lowerTitle.includes('sword') ||
        lowerAuthor.includes('tolkien') || lowerAuthor.includes('martin') || lowerAuthor.includes('rothfuss')) {
      genres.push('Fantasy');
    }
    
    // Adventure
    if (lowerTitle.includes('adventure') || lowerTitle.includes('journey') || lowerTitle.includes('expedition') || 
        lowerTitle.includes('treasure') || lowerTitle.includes('island') || lowerTitle.includes('explorer') ||
        lowerTitle.includes('pirate') || lowerTitle.includes('sailor') || lowerTitle.includes('travel') ||
        lowerAuthor.includes('verne') || lowerAuthor.includes('stevenson') || lowerAuthor.includes('haggard') ||
        lowerAuthor.includes('london') || lowerAuthor.includes('dumas')) {
      genres.push('Adventure');
    }
    
    // Historical Fiction
    if (lowerTitle.includes('war') || lowerTitle.includes('castle') || lowerTitle.includes('king') || 
        lowerTitle.includes('queen') || lowerTitle.includes('medieval') || lowerTitle.includes('ancient')) {
      genres.push('Historical Fiction');
    }
    
    // Contemporary Fiction
    if (lowerTitle.includes('family') || lowerTitle.includes('friendship') || lowerTitle.includes('life') || 
        lowerTitle.includes('modern') || lowerTitle.includes('city') || lowerTitle.includes('relationship')) {
      genres.push('Contemporary Fiction');
    }
    
    // Horror
    if (lowerTitle.includes('horror') || lowerTitle.includes('ghost') || lowerTitle.includes('haunted') || 
        lowerTitle.includes('monster') || lowerTitle.includes('vampire') || lowerTitle.includes('zombie') ||
        lowerAuthor.includes('king') || lowerAuthor.includes('koontz')) {
      genres.push('Horror');
    }
    
    // Literary Fiction
    if (lowerAuthor.includes('roth') || lowerAuthor.includes('franzen') || lowerAuthor.includes('eugenides') ||
        lowerAuthor.includes('foer') || lowerAuthor.includes('wallace')) {
      genres.push('Literary Fiction');
    }
    
    // Non-Fiction
    if (lowerTitle.includes('history') || lowerTitle.includes('biography') || lowerTitle.includes('memoir') || 
        lowerTitle.includes('science') || lowerTitle.includes('philosophy') || lowerTitle.includes('economics')) {
      genres.push('Non-Fiction');
    }
    
    // Young Adult
    if (lowerTitle.includes('teen') || lowerTitle.includes('school') || lowerTitle.includes('coming of age') ||
        lowerAuthor.includes('green') || lowerAuthor.includes('meyer') || lowerAuthor.includes('collins')) {
      genres.push('Young Adult');
    }
    
    return genres.length > 0 ? genres : ['Fiction'];
  };

  const isPastYearContent = (suggestion: Suggestion): boolean => {
    // Year filtering has been disabled - all content is allowed
    return false;
  };

  const isItemAlreadyAdded = (suggestion: Suggestion): boolean => {
    // Validate suggestion
    if (!suggestion || !suggestion.title || !suggestion.author) {
      console.warn('⚠️ Invalid suggestion in isItemAlreadyAdded:', suggestion);
      return false;
    }
    
    // Get all user items from all categories with safety checks
    const allUserItems = [
      ...(books?.completed || []),
      ...(books?.inProgress || []),
      ...(books?.planned || []),
      ...(books?.fails || []),
      ...(books?.allTime || []),
      ...(movies?.completed || []),
      ...(movies?.inProgress || []),
      ...(movies?.planned || []),
      ...(movies?.fails || []),
      ...(movies?.allTime || []),
    ].filter(item => item && item.title && item.author); // Filter out invalid items

    // Check if suggestion matches any existing item
    const isDuplicate = allUserItems.some(item => {
      if (!item || !item.title || !item.author) return false;
      
      // Enhanced normalization function
      const normalizeString = (str: string) => {
        return str
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '') // Remove punctuation
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/^(the|a|an)\s+/i, '') // Remove articles from beginning
          .replace(/\s+(the|a|an)$/i, '') // Remove articles from end
          .replace(/\s+(vol|volume|part|chapter|book|series)\s*\d*/gi, '') // Remove volume/part indicators
          .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
          .replace(/\s*\[[^\]]*\]/g, ''); // Remove bracketed content
      };
      
      const suggestionTitle = normalizeString(suggestion.title);
      const suggestionAuthor = normalizeString(suggestion.author);
      const itemTitle = normalizeString(item.title);
      const itemAuthor = normalizeString(item.author);
      
      // 1. Exact match after normalization
      const exactMatch = suggestionTitle === itemTitle && suggestionAuthor === itemAuthor;
      
      // 2. Author name variations (e.g., "J.K. Rowling" vs "Joanne Rowling")
      const authorVariations = [
        suggestionAuthor,
        suggestionAuthor.replace(/\s+/g, ''), // Remove spaces
        suggestionAuthor.replace(/\./g, ''), // Remove periods
        suggestionAuthor.split(' ').reverse().join(' '), // Reverse name order
      ];
      
      const authorMatch = authorVariations.some(authorVar => {
        const itemAuthorVariations = [
          itemAuthor,
          itemAuthor.replace(/\s+/g, ''),
          itemAuthor.replace(/\./g, ''),
          itemAuthor.split(' ').reverse().join(' '),
        ];
        return itemAuthorVariations.some(itemAuthorVar => 
          authorVar === itemAuthorVar || 
          authorVar.includes(itemAuthorVar) || 
          itemAuthorVar.includes(authorVar)
        );
      });
      
      // 3. Title similarity with author match
      const titleSimilarity = suggestionTitle.includes(itemTitle) || 
                             itemTitle.includes(suggestionTitle) ||
                             suggestionTitle.split(' ').slice(0, 3).join(' ') === itemTitle.split(' ').slice(0, 3).join(' '); // First 3 words match
      
      const partialMatch = titleSimilarity && authorMatch && 
        (suggestionTitle.length > 8 && itemTitle.length > 8); // Only for substantial titles
      
      // 4. Check for common abbreviations and variations
      const commonVariations = [
        { from: 'doctor', to: 'dr' },
        { from: 'professor', to: 'prof' },
        { from: 'mister', to: 'mr' },
        { from: 'misses', to: 'mrs' },
        { from: 'miss', to: 'ms' },
      ];
      
      const normalizedSuggestionAuthor = commonVariations.reduce((str, variation) => 
        str.replace(new RegExp(variation.from, 'gi'), variation.to), suggestionAuthor);
      const normalizedItemAuthor = commonVariations.reduce((str, variation) => 
        str.replace(new RegExp(variation.from, 'gi'), variation.to), itemAuthor);
      
      const abbreviationMatch = normalizedSuggestionAuthor === normalizedItemAuthor && 
                               suggestionTitle === itemTitle;
      
      const isMatch = exactMatch || partialMatch || abbreviationMatch;
      
      if (isMatch) {
        console.log(`🚫 Filtering out duplicate: "${suggestion.title}" by ${suggestion.author} matches "${item.title}" by ${item.author}`);
      }
      
      return isMatch;
    });

    return isDuplicate;
  };

  // Diversity scoring to ensure varied suggestions
  const calculateDiversityScore = (suggestion: Suggestion, existingSuggestions: Suggestion[]): number => {
    let diversityScore = 1.0;
    
    // Check for author diversity
    const authorCount = existingSuggestions.filter(s => s.author === suggestion.author).length;
    if (authorCount > 0) {
      diversityScore -= (authorCount * 0.2); // Penalize repeated authors
    }
    
    // Check for genre diversity
    const genreCount = existingSuggestions.filter(s => 
      s.genres && suggestion.genres && 
      s.genres.some(g => suggestion.genres!.includes(g))
    ).length;
    if (genreCount > 2) {
      diversityScore -= (genreCount * 0.1); // Penalize too many similar genres
    }
    
    // Check for year diversity
    const yearCount = existingSuggestions.filter(s => 
      Math.abs(s.year - suggestion.year) < 5
    ).length;
    if (yearCount > 3) {
      diversityScore -= (yearCount * 0.05); // Penalize too many books from same era
    }
    
    // Bonus for award-winning books
    if (suggestion.awards && suggestion.awards.length > 0) {
      diversityScore += 0.3;
    }
    
    // Bonus for different moods
    const moodKeywords = ['uplifting', 'dark', 'funny', 'emotional', 'thrilling', 'intellectual', 'romantic', 'mysterious'];
    const existingMoods = existingSuggestions.flatMap(s => 
      moodKeywords.filter(mood => 
        (s.description && typeof s.description === 'string' && s.description.toLowerCase().includes(mood)) || 
        (s.reason && typeof s.reason === 'string' && s.reason.toLowerCase().includes(mood))
      )
    );
    const suggestionMoods = moodKeywords.filter(mood => 
      (suggestion.description && typeof suggestion.description === 'string' && suggestion.description.toLowerCase().includes(mood)) || 
      (suggestion.reason && typeof suggestion.reason === 'string' && suggestion.reason.toLowerCase().includes(mood))
    );
    
    const uniqueMoods = suggestionMoods.filter(mood => !existingMoods.includes(mood));
    diversityScore += (uniqueMoods.length * 0.1);
    
    return Math.max(0.1, diversityScore); // Ensure minimum diversity score
  };

  // Generate intelligent suggestions based on user's data
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isRefreshingForLowCount, setIsRefreshingForLowCount] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [spinValue] = useState(new Animated.Value(0));
  
  // Predictive preloading state
  const [predictiveCache, setPredictiveCache] = useState<Map<string, any[]>>(new Map());
  const [isPredictiveLoading, setIsPredictiveLoading] = useState(false);
  const [userBehaviorPatterns, setUserBehaviorPatterns] = useState<{
    preferredGenres: string[];
    searchHistory: string[];
    interactionTimes: number[];
    activeHours: number[];
    lastInteractionTime: number;
  }>({
    preferredGenres: [],
    searchHistory: [],
    interactionTimes: [],
    activeHours: [],
    lastInteractionTime: Date.now()
  });

  // Async function to generate suggestions
  const generateSuggestions = async (isLowCountRefresh: boolean = false) => {
    console.log('🔍 ===== GENERATE SUGGESTIONS CALLED =====');
    console.log('🔍 isLowCountRefresh:', isLowCountRefresh);

    console.log('🔍 isSearching:', isSearching);
    
    // Add rate limiting to prevent excessive calls
    const now = Date.now();
    const lastCall = apiCache.get('last-suggestion-generation')?.timestamp || 0;
    if (now - lastCall < 2000 && !isLowCountRefresh) { // 2 second minimum between calls
      console.log('⏳ Rate limiting suggestion generation...');
      return;
    }
    
    apiCache.set('last-suggestion-generation', { data: [], timestamp: now });
    setIsLoadingSuggestions(true);
    const allSuggestions: Suggestion[] = [];
    



    
    // Get user's completed items for analysis
    const completedBooks = books.completed;
    const completedMovies = movies.completed;
    const allTimeItems = [...books.allTime, ...movies.allTime];
    
    // Analyze user preferences
    const favoriteAuthors = new Map<string, number>();
    const favoriteGenres = new Map<string, number>();
    const preferredFormats = new Map<string, number>();
    const moodPatterns = new Map<string, number>();
    
    // Seasonal and temporal analysis
    const seasonalPreferences = new Map<string, number>();
    const readingPace = new Map<string, number>();
    const timeOfDayPreferences = new Map<string, number>();
    
    // Analyze completed items
    [...completedBooks, ...completedMovies].forEach(item => {
      // Author/Director preferences
      favoriteAuthors.set(
        item.author, 
        (favoriteAuthors.get(item.author) || 0) + (item.rating || 3)
      );

      // Format preferences
      if (item.format) {
        preferredFormats.set(
          item.format,
          (preferredFormats.get(item.format) || 0) + 1
        );
      }

      // Genre analysis
      const itemGenres = inferGenres(item.title, item.author);
      itemGenres.forEach(genre => {
        favoriteGenres.set(
          genre,
          (favoriteGenres.get(genre) || 0) + (item.rating || 3)
        );
      });

      // Enhanced mood analysis from notes
      if (item.notes) {
        const notes = item.notes.toLowerCase();
        
        // Emotional moods
        if (notes.includes('inspiring') || notes.includes('uplifting') || notes.includes('motivational') || notes.includes('empowering')) {
          moodPatterns.set('uplifting', (moodPatterns.get('uplifting') || 0) + 1);
        }
        if (notes.includes('dark') || notes.includes('intense') || notes.includes('gritty') || notes.includes('disturbing')) {
          moodPatterns.set('dark', (moodPatterns.get('dark') || 0) + 1);
        }
        if (notes.includes('funny') || notes.includes('comedy') || notes.includes('humorous') || notes.includes('witty')) {
          moodPatterns.set('funny', (moodPatterns.get('funny') || 0) + 1);
        }
        if (notes.includes('sad') || notes.includes('melancholy') || notes.includes('emotional') || notes.includes('heartbreaking')) {
          moodPatterns.set('emotional', (moodPatterns.get('emotional') || 0) + 1);
        }
        if (notes.includes('thrilling') || notes.includes('exciting') || notes.includes('action') || notes.includes('adventure')) {
          moodPatterns.set('thrilling', (moodPatterns.get('thrilling') || 0) + 1);
        }
        if (notes.includes('thought-provoking') || notes.includes('philosophical') || notes.includes('deep') || notes.includes('complex')) {
          moodPatterns.set('intellectual', (moodPatterns.get('intellectual') || 0) + 1);
        }
        if (notes.includes('romantic') || notes.includes('sweet') || notes.includes('love story') || notes.includes('heartwarming')) {
          moodPatterns.set('romantic', (moodPatterns.get('romantic') || 0) + 1);
        }
        if (notes.includes('mysterious') || notes.includes('suspenseful') || notes.includes('twist') || notes.includes('surprising')) {
          moodPatterns.set('mysterious', (moodPatterns.get('mysterious') || 0) + 1);
        }
        
        // Seasonal and temporal analysis
        if (item.completedDate) {
          const completionDate = new Date(item.completedDate);
          const month = completionDate.getMonth();
          const season = getSeason(month);
          
          // Track seasonal genre preferences
          const itemGenres = inferGenres(item.title, item.author);
          itemGenres.forEach(genre => {
            const seasonalKey = `${season}-${genre}`;
            seasonalPreferences.set(
              seasonalKey,
              (seasonalPreferences.get(seasonalKey) || 0) + (item.rating || 3)
            );
          });
          
          // Track reading pace (if we have dateStarted)
          if (item.dateStarted) {
            const startDate = new Date(item.dateStarted);
            const daysToComplete = Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysToComplete > 0 && daysToComplete < 365) { // Reasonable range
              const paceCategory = getReadingPace(daysToComplete);
              readingPace.set(paceCategory, (readingPace.get(paceCategory) || 0) + 1);
            }
          }
        }
      }
    });

    // Similar author suggestions now handled by API-based genre suggestions

    // Generate genre-based suggestions
    let topGenres = Array.from(favoriteGenres.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    // Use user interests if available and no reading history
    if (interests && interests.favoriteGenres.length > 0 && topGenres.length === 0) {
      console.log('🎯 Using user interests for initial recommendations');
      topGenres = interests.favoriteGenres.map(genre => [genre, 8]); // Default high score for user interests
    }

    // Ensure Adventure is always included for variety
    const genresToFetch = new Set([...topGenres.map(([genre]) => genre)]);
    if (!genresToFetch.has('Adventure')) {
      genresToFetch.add('Adventure');
      console.log('🏔️ Adding Adventure as default genre for variety');
    }

    // Use API for genre suggestions instead of hard-coded data
    for (const genre of genresToFetch) {
      const score = favoriteGenres.get(genre) || 5; // Default score for Adventure
      try {
        const genreSuggestions = await getEnhancedGenreSuggestions(genre, isLowCountRefresh);
        genreSuggestions.slice(0, 3).forEach((book, index) => {
          allSuggestions.push({
            id: `genre-${genre}-${index}`,
            title: book.title,
            author: book.author,
            year: book.year,
            isBook: true, // Genre suggestions are primarily books
            reason: `Because you enjoy ${genre} books`,
            confidence: Math.min(90, 65 + (score / 5) * 10),
            category: 'genre' as const,
            format: book.format,
            rating: book.rating,
            description: book.description,
            estimatedPages: estimatePages(book.title),
            estimatedLength: estimateLength(book.title),
            genres: [genre],
            source: book.source || 'api',
          });
        });
      } catch (error) {
        console.warn(`Failed to fetch ${genre} suggestions from API:`, error);
      }
    }

    // Generate seasonal suggestions based on current season
    const currentSeason = getCurrentSeason();
    const seasonalGenreKeys = Array.from(seasonalPreferences.keys())
      .filter(key => key.startsWith(currentSeason))
      .sort((a, b) => (seasonalPreferences.get(b) || 0) - (seasonalPreferences.get(a) || 0))
      .slice(0, 2);

    // Ensure Adventure is included in seasonal suggestions for variety
    if (!seasonalGenreKeys.some(key => key.includes('Adventure'))) {
      seasonalGenreKeys.push(`${currentSeason}-Adventure`);
      console.log('🏔️ Adding Adventure to seasonal suggestions');
    }

    // Use API for seasonal suggestions
    for (const seasonalKey of seasonalGenreKeys) {
      const genre = seasonalKey.split('-')[1];
      const score = seasonalPreferences.get(seasonalKey) || 0;
      
      if (score > 5) { // Only suggest if user has strong seasonal preference
        try {
          const genreSuggestions = await getEnhancedGenreSuggestions(genre, isLowCountRefresh);
          genreSuggestions.slice(0, 1).forEach((book, index) => {
            allSuggestions.push({
              id: `seasonal-${currentSeason}-${genre}-${index}`,
              title: book.title,
              author: book.author,
              year: book.year,
              isBook: true,
              reason: `Perfect ${currentSeason} reading - you enjoy ${genre} books this season`,
              confidence: Math.min(85, 60 + (score / 5) * 10),
              category: 'seasonal',
              format: book.format,
              rating: book.rating,
              description: book.description,
              estimatedPages: estimatePages(book.title),
              estimatedLength: estimateLength(book.title),
              genres: [genre],
              source: book.source || 'api',
            });
          });
        } catch (error) {
          console.warn(`Failed to fetch seasonal ${genre} suggestions from API:`, error);
        }
      }
    }

    // Generate award-winning book suggestions using API
    let topMoods = Array.from(moodPatterns.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2);

    // Use user mood preferences if available and no mood patterns
    if (interests && interests.moodPreferences.length > 0 && topMoods.length === 0) {
      console.log('🎭 Using user mood preferences for recommendations');
      topMoods = interests.moodPreferences.map(mood => [mood, 8]); // Default high score for user preferences
    }

    // Use API for award-winning books (literary fiction)
    try {
      const literaryBooks = await getEnhancedGenreSuggestions('literary', isLowCountRefresh);
      literaryBooks.slice(0, 3).forEach((book, index) => {
        const bookGenres = inferGenres(book.title, book.author);
        const hasMoodMatch = topMoods.some(([mood]) => 
          (book.description && typeof book.description === 'string' && book.description.toLowerCase().includes(mood)) ||
          bookGenres.some(genre => 
            ['Literary Fiction', 'Contemporary Fiction'].includes(genre)
          )
        );

        if (hasMoodMatch || bookGenres.some(genre => favoriteGenres.has(genre))) {
          allSuggestions.push({
            id: `award-${index}`,
            title: book.title,
            author: book.author,
            year: book.year,
            isBook: true,
            reason: `Award-winning literary fiction - matches your reading preferences`,
            confidence: 85,
            category: 'award',
            format: book.format,
            rating: book.rating,
            description: book.description,
            estimatedPages: estimatePages(book.title),
            estimatedLength: estimateLength(book.title),
            genres: bookGenres,
            awards: ['Literary Fiction'],
            source: book.source || 'api',
          });
        }
      });
    } catch (error) {
      console.warn('Failed to fetch award-winning suggestions from API:', error);
    }

    // Generate trending suggestions using API
    const trendingItems: any[] = [];

    // Fetch trending books from API
    const trendingGenres = ['fantasy', 'contemporary', 'mystery', 'adventure'];
    for (const genre of trendingGenres) {
      try {
        const genreBooks = await getEnhancedGenreSuggestions(genre, isLowCountRefresh);
        trendingItems.push(...genreBooks.slice(0, 2)); // 2 books per genre
      } catch (error) {
        console.warn(`Failed to fetch trending ${genre} books from API:`, error);
      }
    }

    // Use preloaded data first, then fetch if needed
    try {
      const preloadedMovies = getPreloadedMovies();
      const preloadedBooks = getPreloadedBooks();
      
      if (preloadedMovies && preloadedMovies.length > 0) {
        console.log('🎬 Using preloaded movies for trending');
        trendingItems.push(...preloadedMovies.slice(0, 5));
      } else {
        // Fetch trending movies from TMDB based on user preferences
        if (interests && interests.mediaTypes.length > 0) {
          try {
            if (interests.mediaTypes.includes('movies')) {
              const popularMovies = await fetchMoviesFromHardCodedData('action', 5);
              trendingItems.push(...popularMovies);
              console.log('🎬 Added movies to trending based on user preferences');
            }
          } catch (error) {
            console.warn('Failed to fetch trending movies from TMDB:', error);
          }
        } else {
          // Default behavior if no preferences set
          try {
            const popularMovies = await fetchMoviesFromHardCodedData('action', 5);
            trendingItems.push(...popularMovies);
          } catch (error) {
            console.warn('Failed to fetch trending movies from hard-coded data:', error);
          }
        }
      }
      
      if (preloadedBooks && preloadedBooks.length > 0) {
        console.log('📚 Using preloaded books for trending');
        trendingItems.push(...preloadedBooks.slice(0, 5));
      }
    } catch (error) {
      console.error('❌ Error using preloaded data:', error);
      // Fallback to normal fetching if preloaded data fails
    }

    trendingItems.forEach((item, index) => {
      allSuggestions.push({
        id: `trending-${index}`,
        title: item.title,
        author: item.author,
        year: item.year,
        isBook: item.isBook,
        reason: "Currently trending and highly rated",
        confidence: 70,
        category: 'trending',
        format: item.format,
        rating: item.rating,
        description: item.description,
        genres: item.genres || [],
        source: item.source || 'local',
        estimatedPages: item.isBook ? estimatePages(item.title) : undefined,
        estimatedLength: estimateLength(item.title),
      });
    });

    // Generate genre-based suggestions using API - limit to avoid API overload
    const genreSuggestions: any[] = [];
    
    // Only fetch from a few key genres to avoid API overload
    const priorityGenres = ['adventure', 'fantasy', 'mystery'];
    
    // Process priority genres first with fallback system
    for (const genre of priorityGenres) {
      const apiBooks = await fetchBooksWithFallbacks(genre, 10);
      if (apiBooks && apiBooks.length > 0) {
        genreSuggestions.push(...apiBooks);
      }
    }

    genreSuggestions.forEach((work, index) => {
      allSuggestions.push({
        id: `genre-${index}`,
        title: work.title,
        author: work.author,
        year: work.year,
        isBook: work.isBook,
        reason: `Popular in ${work.genre} - a genre you might enjoy`,
        confidence: 75,
        category: 'genre',
        format: work.format,
        rating: work.rating || 4,
        description: work.description,
        genres: [work.genre],
        source: work.source || 'local',
        estimatedPages: work.isBook ? estimatePages(work.title) : undefined,
        estimatedLength: estimateLength(work.title),
      });
    });

    // Add predictive suggestions from cache
    const predictions = predictNextUserNeeds();
    console.log('🔮 Adding predictive suggestions for:', predictions);
    
    predictions.forEach(genre => {
      const predictiveSuggestions = getPredictiveSuggestions(genre);
      if (predictiveSuggestions.length > 0) {
        allSuggestions.push(...predictiveSuggestions.slice(0, 5)); // Limit to 5 per genre
        console.log(`✅ Added ${predictiveSuggestions.length} predictive suggestions for ${genre}`);
      }
    });

    // Filter out items that are already in user's lists
    // Temporarily disable aggressive filtering to debug infinite loop
    // Generate semantic similarity suggestions for regular recommendations
    if (allSuggestions.length > 0) {
      console.log('🧠 Generating semantic similarity suggestions for regular recommendations...');
      
      // Use the highest confidence suggestion as reference
      const referenceItem = allSuggestions.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      const semanticSuggestions = generateSemanticSuggestions(referenceItem, allSuggestions);
      
      // Add semantic suggestions to the results (filtering out already added items and past year content)
      const filteredSemanticSuggestions = semanticSuggestions.slice(0, 2).filter(suggestion => 
        !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
      );
      allSuggestions.push(...filteredSemanticSuggestions);
      console.log(`🧠 Added ${filteredSemanticSuggestions.length} semantic similarity suggestions (filtered from ${semanticSuggestions.slice(0, 2).length})`);
    }
    
    // Filter out items that are already in user's lists and past year content
    const filteredSuggestions = allSuggestions.filter(suggestion => 
      !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
    );
    
    console.log(`📊 Suggestions generated: ${allSuggestions.length} total, ${filteredSuggestions.length} after filtering duplicates`);
    
    setSuggestions(filteredSuggestions);
    setIsLoadingSuggestions(false);
    setIsRefreshingForLowCount(false); // Reset the flag
  };

  // Call generateSuggestions when books or movies change
  useEffect(() => {
    // Add debouncing to prevent excessive calls
    const timeoutId = setTimeout(() => {
      generateSuggestions();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [books, movies]);

  // Manage semantic cache periodically
  useEffect(() => {
    const cacheInterval = setInterval(() => {
      manageSemanticCache();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(cacheInterval);
  }, []);

  // Spinning animation for loading indicator
  useEffect(() => {
    if (isLoadingSuggestions) {
      const spinAnimation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spinAnimation.start();
      
      return () => spinAnimation.stop();
    }
  }, [isLoadingSuggestions, spinValue]);

  // Separate effect for auto-refresh when suggestions are low
  useEffect(() => {
    if (suggestions.length > 0 && !isRefreshingForLowCount) {
      const filteredSuggestions = suggestions.filter(suggestion => !granularRatings.has(suggestion.id) || granularRatings.get(suggestion.id) !== 'disliked');
      
      // Only trigger refresh if we have very few suggestions after filtering
      if (filteredSuggestions.length < 3) {
        console.log(`📡 Low suggestion count (${filteredSuggestions.length}) - triggering refresh`);
        setIsRefreshingForLowCount(true);
        setTimeout(() => {
          generateSuggestions(true);
        }, 2000); // Increased delay to prevent rapid calls
      }
    }
      }, [suggestions, granularRatings, isRefreshingForLowCount]);

  // Removed automatic search trigger to prevent infinite loops
  // Search will only be triggered manually via onSubmitEditing

  // Filter and sort suggestions
  const filteredAndSortedSuggestions = useMemo(() => {
    console.log('🔍 Starting filtering with', suggestions.length, 'suggestions');

    console.log('🔍 isSearching:', isSearching);
    console.log('🔍 Suggestions categories:', suggestions.map(s => ({ title: s.title || 'Unknown', category: s.category || 'unknown' })));
    
    // Safety check - ensure suggestions is an array
    if (!Array.isArray(suggestions)) {
      console.warn('⚠️ Suggestions is not an array:', suggestions);
      return [];
    }
    
    let filtered = suggestions;

    // Filter out thumbs down suggestions
            filtered = filtered.filter(suggestion => suggestion && suggestion.id && (!granularRatings.has(suggestion.id) || granularRatings.get(suggestion.id) !== 'disliked'));
    
    // Remove duplicates based on title and author
    const seenItems = new Set<string>();
    filtered = filtered.filter(suggestion => {
      if (!suggestion || !suggestion.title || !suggestion.author) {
        console.warn('⚠️ Invalid suggestion found:', suggestion);
        return false;
      }
      
      const key = `${suggestion.title.toLowerCase().trim()}-${suggestion.author.toLowerCase().trim()}`;
      if (seenItems.has(key)) {
        return false; // Remove duplicate silently to reduce log noise
      }
      seenItems.add(key);
      return true;
    });
    
    // Removed auto-refresh logic from useMemo to prevent infinite loops
    
    // Boost confidence for thumbs up suggestions
    filtered = filtered.map(suggestion => {
      if (!suggestion || typeof suggestion !== 'object') {
        console.warn('⚠️ Invalid suggestion in map operation:', suggestion);
        return null;
      }
      
      // Ensure suggestion has required properties
      if (!suggestion.title || !suggestion.author || typeof suggestion.title !== 'string' || typeof suggestion.author !== 'string') {
        console.warn('⚠️ Suggestion missing required properties:', { title: suggestion.title, author: suggestion.author });
        return null;
      }
      
      let confidenceBoost = 0;
      
      if (granularRatings.size > 0) {
        const lovedGenres = Array.from(granularRatings.entries())
          .filter(([_, rating]) => rating === 'loved')
          .flatMap(([id, _]) => {
            const suggestion = suggestions.find(s => s.id === id);
            return suggestion?.genres || [];
          })
          .filter(genre => genre && typeof genre === 'string' && genre.trim().length > 0);
        
        const lovedAuthors = Array.from(granularRatings.entries())
          .filter(([_, rating]) => rating === 'loved')
          .map(([id, _]) => {
            const suggestion = suggestions.find(s => s.id === id);
            return suggestion?.author || '';
          })
          .filter(author => author && typeof author === 'string' && author.trim().length > 0);
        
        // Debug logging to see what we're working with
        if (lovedGenres.length > 0 || lovedAuthors.length > 0) {
          console.log(`🔍 Processing loved content data for ${suggestion.title}:`, {
            lovedGenres: lovedGenres,
            lovedAuthors: lovedAuthors,
            suggestionGenres: suggestion.genres,
            suggestionAuthor: suggestion.author
          });
        }
        
        // Boost confidence for same genres (loved content gets higher weight)
        if (suggestion.genres && Array.isArray(suggestion.genres) && suggestion.genres.some(genre => 
          genre && typeof genre === 'string' && lovedGenres.some(lovedGenre => 
            lovedGenre && typeof lovedGenre === 'string' && 
            (lovedGenre.toLowerCase().includes(genre.toLowerCase()) || 
             genre.toLowerCase().includes(lovedGenre.toLowerCase()))
          )
        )) {
          confidenceBoost += 25; // Higher boost for loved content
          console.log(`❤️ Boosting confidence for ${suggestion.title} due to loved genre match`);
        }
        
        // Boost confidence for same authors (loved content gets higher weight)
        if (suggestion.author && typeof suggestion.author === 'string' && lovedAuthors.some(author => 
          author && typeof author === 'string' && 
          (suggestion.author.toLowerCase().includes(author.toLowerCase()) || 
           author.toLowerCase().includes(suggestion.author.toLowerCase()))
        )) {
          confidenceBoost += 30; // Higher boost for loved content
          console.log(`❤️ Boosting confidence for ${suggestion.title} due to loved author match`);
        }
      }
      
      return {
        ...suggestion,
        confidence: Math.min(95, suggestion.confidence + confidenceBoost)
      };
    }).filter((suggestion): suggestion is Suggestion => suggestion !== null); // Remove any null values



    // Apply type and genre filters
    if (activeFilter === 'books') {
      filtered = filtered.filter(s => s.isBook);
    } else if (activeFilter === 'movies') {
      console.log('🎬 Movies filter applied - checking suggestions with isBook property');
      const movieSuggestions = filtered.filter(s => !s.isBook);
      console.log(`🎯 Found ${movieSuggestions.length} movie suggestions:`, movieSuggestions.map(s => s.title));
      filtered = movieSuggestions;

    } else if (activeFilter === 'short' || activeFilter === 'medium' || activeFilter === 'long') {
      filtered = filtered.filter(s => s.estimatedLength === activeFilter);
    } else if (activeFilter === 'semantic') {
      // Show only semantic similarity suggestions
      filtered = filtered.filter(s => s.category === 'semantic');
      
      // If no semantic suggestions, generate some based on current suggestions
      if (filtered.length === 0 && suggestions.length > 0) {
        console.log('🧠 No semantic suggestions found, generating new ones...');
        const referenceItem = suggestions[0];
        const semanticSuggestions = generateSemanticSuggestions(referenceItem, suggestions);
        // Filter out already added items and past year content from semantic suggestions
        filtered = semanticSuggestions.filter(suggestion => 
          !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
        );
      }
    }

    // Apply diversity scoring to ensure varied suggestions
    const scoredSuggestions = filtered.map(suggestion => ({
      ...suggestion,
      diversityScore: calculateDiversityScore(suggestion, filtered.filter(s => s.id !== suggestion.id))
    }));

    // Sort suggestions with diversity consideration
    scoredSuggestions.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          // Combine confidence with diversity score
          const aScore = (a.confidence * 0.7) + (a.diversityScore * 30);
          const bScore = (b.confidence * 0.7) + (b.diversityScore * 30);
          return bScore - aScore;
        case 'length':
          const aPages = a.estimatedPages || 0;
          const bPages = b.estimatedPages || 0;
          return aPages - bPages;
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'year':
          return b.year - a.year;
        default:
          // Default combines confidence with diversity
          const aDefaultScore = (a.confidence * 0.7) + (a.diversityScore * 30);
          const bDefaultScore = (b.confidence * 0.7) + (b.diversityScore * 30);
          return bDefaultScore - aDefaultScore;
      }
    });

    // Remove diversity score from final output
    const sortedSuggestions = scoredSuggestions.map(({ diversityScore, ...suggestion }) => suggestion);

    // Apply real-time processing to suggestions (synchronous version)
    const processedSuggestions = applyRealTimeAdjustments(sortedSuggestions);
    
    // Update real-time suggestions state
    setRealTimeSuggestions(processedSuggestions);
    
    // Removed auto-refresh logic from useMemo to prevent infinite loops
    
    console.log('🔍 Final filtered and sorted suggestions:', processedSuggestions.length);
    console.log('🔍 Final suggestions:', processedSuggestions.map(s => ({ title: s.title, category: s.category })));

    return processedSuggestions;
      }, [suggestions, activeFilter, sortBy, dismissedSuggestions, granularRatings]);

  // Completely rewritten handleAddToList with proper state management and NO rating pre-population
  const handleAddToList = async (suggestion: Suggestion) => {
    console.log('🎯 Starting handleAddToList for:', suggestion.title);
    
    // Track real-time interaction
    trackUserInteraction('add', suggestion.id, { title: suggestion.title, author: suggestion.author });
    
    // Prevent duplicate additions
    if (addedItems.has(suggestion.id) || isProcessing.has(suggestion.id)) {
      console.log('⚠️ Item already added or processing:', suggestion.id);
      setAlertConfig({
        title: 'Already Added',
        message: `"${suggestion.title}" is already in your list or being processed.`,
        type: 'warning'
      });
      setShowAlert(true);
      return;
    }

    // Mark as processing immediately
    setIsProcessing(prev => new Set(prev).add(suggestion.id));

    try {
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Determine format prioritizing user preferences over suggestion formats
      const determineFormat = () => {
        if (suggestion.isBook) {
          // For books, prioritize user's default format over suggestion format
          // Only use suggestion format if it's specific (not generic "text")
          if (suggestion.format && suggestion.format !== 'text') {
            return suggestion.format;
          }
          return settings.defaultBookFormat;
        } else {
          // For movies, prioritize user's default format over suggestion format
          // Only use suggestion format if it's specific (not generic "streaming")
          if (suggestion.format && suggestion.format !== 'streaming') {
            return suggestion.format;
          }
          return settings.defaultMovieFormat;
        }
      };

      const usedFormat = determineFormat();
      
      // Create the base item with all required fields and proper defaults
      // IMPORTANT: Do NOT pre-populate rating - always set to 0 for planned items
      const baseItem = {
        title: suggestion.title,
        author: suggestion.author,
        publicationYear: suggestion.year, // FIXED: Use suggestion.year instead of suggestion.publicationYear
        category: 'planned' as const,
        notes: `Suggested: ${suggestion.reason}`,
        rating: 0, // FIXED: Always 0 for suggestions, no pre-population
        format: usedFormat,
        percentage: 0, // Always 0 for planned items
        source: suggestion.isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        dateAdded: currentDate,
        isAllTime: false,
      };

      console.log('📝 Created base item:', baseItem);
      console.log('⚙️ Using default settings:', {
        bookFormat: settings.defaultBookFormat,
        movieFormat: settings.defaultMovieFormat,
        bookSource: settings.defaultBookSource,
        movieSource: settings.defaultMovieSource
      });
      console.log('🎯 Format decision:', {
        suggestionFormat: suggestion.format,
        usedFormat: usedFormat,
        isBook: suggestion.isBook,
        defaultFormat: suggestion.isBook ? settings.defaultBookFormat : settings.defaultMovieFormat
      });

      // Add to the appropriate list with proper error handling
      if (suggestion.isBook) {
        console.log('📚 Adding book:', baseItem);
        addBook({
          ...baseItem,
          format: usedFormat as "text" | "audio" | "ebook" | undefined
        });
        console.log('📚 Book addition completed');
        
      } else {
        console.log('🎬 Adding movie:', baseItem);
        addMovie({
          ...baseItem,
          format: usedFormat as "streaming" | "theater" | "bluray" | "dvd" | undefined
        });
        console.log('🎬 Movie addition completed');
      }

      // Mark as added in local state
      setAddedItems(prev => {
        const newSet = new Set(prev);
        newSet.add(suggestion.id);
        console.log('✅ Marked as added in local state:', suggestion.id);
        return newSet;
      });

      // Force immediate re-render
      setLocalForceUpdate(prev => prev + 1);

      // Clear immediate feedback and show success animation
      setImmediateFeedback(prev => {
        const newSet = new Set(prev);
        newSet.delete(suggestion.id);
        return newSet;
      });
      
      console.log('🎉 Showing success animation for:', suggestion.id);
      setSuccessAnimation(prev => {
        const newSet = new Set(prev).add(suggestion.id);
        console.log('🎉 Success animation state updated:', Array.from(newSet));
        return newSet;
      });
      
      // Hide success animation after 1000ms (increased for visibility)
      setTimeout(() => {
        console.log('🎉 Hiding success animation for:', suggestion.id);
        setSuccessAnimation(prev => {
          const newSet = new Set(prev);
          newSet.delete(suggestion.id);
          console.log('🎉 Success animation state after hiding:', Array.from(newSet));
          return newSet;
        });
      }, 1000);

      console.log('✅ Successfully completed handleAddToList');

    } catch (error) {
      console.error('❌ Error in handleAddToList:', error);
      
      // Detailed error reporting
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setAlertConfig({
        title: 'Addition Failed',
        message: `Failed to add "${suggestion.title}" to your list.\n\nError: ${errorMessage}\n\nPlease try again or restart the app.`,
        type: 'error'
      });
      setShowAlert(true);
    } finally {
      // Remove from processing set
      setIsProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(suggestion.id);
        return newSet;
      });
    }
  };

  const handleGranularRating = (suggestion: Suggestion, rating: GranularRating) => {
    const currentRating = granularRatings.get(suggestion.id);
    
    if (currentRating === rating) {
      // If same rating is clicked again, remove it (toggle off)
      console.log(`🔄 Removing ${rating} rating for suggestion:`, suggestion.title);
      setGranularRatings(prev => {
        const newMap = new Map(prev);
        newMap.delete(suggestion.id);
        return newMap;
      });
    } else {
      // Set new rating
      console.log(`${RATING_CONFIG[rating!].icon} ${rating} rating for suggestion:`, suggestion.title);
      
      setGranularRatings(prev => new Map(prev).set(suggestion.id, rating));
      
      // Update behavior patterns for predictive preloading
              updateUserBehaviorPatterns('thumbs_up', {
        rating: rating,
        weight: RATING_CONFIG[rating!].weight,
        genres: suggestion.genres || [],
        title: suggestion.title,
        author: suggestion.author
      });
      
      // Generate semantic similarity suggestions for loved content
      if (rating === 'loved') {
        console.log('🧠 Generating semantic suggestions based on loved rating...');
        const semanticSuggestions = generateSemanticSuggestions(suggestion, suggestions);
        
        if (semanticSuggestions.length > 0) {
          // Add semantic suggestions to the current suggestions (filtering out already added items)
          setSuggestions(prev => {
            const newSuggestions = [...prev];
            semanticSuggestions.slice(0, 2).forEach(semanticSuggestion => {
              // Check if this semantic suggestion is already in the list, already added to user's lists, or is past year content
              const exists = newSuggestions.some(s => s.id === semanticSuggestion.id);
              const alreadyAdded = isItemAlreadyAdded(semanticSuggestion);
              const isPastYear = isPastYearContent(semanticSuggestion);
              if (!exists && !alreadyAdded && !isPastYear) {
                newSuggestions.push(semanticSuggestion);
              }
            });
            return newSuggestions;
          });
          
          console.log(`🧠 Added ${semanticSuggestions.slice(0, 2).length} semantic suggestions based on loved rating`);
        }
      }
      
      // No popup - just silently record the feedback
    }
  };



  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return '#10B981';
    if (confidence >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const toggleDescriptionExpansion = (suggestionId: string) => {
    setExpandedDescriptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(suggestionId)) {
        newSet.delete(suggestionId);
      } else {
        newSet.add(suggestionId);
      }
      return newSet;
    });
  };

  const renderSuggestionCard = ({ item: suggestion }: { item: Suggestion }) => {
    const isAdded = addedItems.has(suggestion.id);
    const isProcessingItem = isProcessing.has(suggestion.id);
    const isShowingSuccess = successAnimation.has(suggestion.id);
    const isShowingImmediateFeedback = immediateFeedback.has(suggestion.id);
    
    // Debug logging for animation state
    console.log('🎨 Rendering button for:', suggestion.title, 'ID:', suggestion.id);
    console.log('🎨 Button states:', { isAdded, isProcessingItem, isShowingSuccess, isShowingImmediateFeedback });
    
    if (isShowingSuccess || isShowingImmediateFeedback) {
      console.log('🎉 ANIMATION ACTIVE for:', suggestion.title);
    }
    
    return (
      <View style={styles.suggestionCard}>
        <View style={styles.suggestionHeader}>
          <View style={styles.suggestionType}>
            {suggestion.isBook ? (
              <BookOpen size={16} color="#F59E0B" />
            ) : (
              <Film size={16} color="#3B82F6" />
            )}
            <Text style={styles.typeText}>
              {suggestion.isBook ? 'Book' : 'Movie'}
            </Text>
          </View>
          <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(suggestion.confidence) }]}>
            <Text style={styles.confidenceText}>{suggestion.confidence}%</Text>
          </View>
        </View>

        <Text style={styles.suggestionTitle} numberOfLines={2}>
          {suggestion.title}
        </Text>
        <Text style={styles.suggestionAuthor}>
          by {suggestion.author}
        </Text>

        <Text style={styles.suggestionReason} numberOfLines={2}>
          {suggestion.reason}
        </Text>
        
        {/* Description */}
        {suggestion.description && (
          <TouchableOpacity
            onPress={() => toggleDescriptionExpansion(suggestion.id)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Toggle description expansion"
            accessibilityHint="Tap to show full description"
          >
            <Text 
              style={styles.suggestionDescription} 
              numberOfLines={expandedDescriptions.has(suggestion.id) ? undefined : 3}
            >
              {suggestion.description}
            </Text>
            {suggestion.description.length > 150 && (
              <Text style={styles.expandText}>
                {expandedDescriptions.has(suggestion.id) ? 'Show less' : 'Show more'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Semantic Similarity Indicator */}
        {suggestion.category === 'semantic' && (
          <View style={styles.semanticTag}>
            <Lightbulb size={12} color="#F59E0B" />
            <Text style={styles.semanticTagText}>
              Semantically Similar
            </Text>
          </View>
        )}




        <View style={styles.suggestionMeta}>
          <Text style={styles.metaText}>
            {suggestion.year}
          </Text>
          {suggestion.estimatedPages && (
            <Text style={styles.metaText}>
              ~{suggestion.estimatedPages} pages
            </Text>
          )}
          {suggestion.estimatedLength && (
            <Text style={styles.metaText}>
              {suggestion.estimatedLength} read
            </Text>
          )}
          {suggestion.rating && (
            <View style={styles.ratingContainer}>
              <Star size={12} color="#F59E0B" fill="#F59E0B" />
              <Text style={styles.ratingText}>{suggestion.rating}/5</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.addButton, 
              { backgroundColor: suggestion.isBook ? '#F59E0B' : '#3B82F6' },
              (isShowingSuccess || isShowingImmediateFeedback) && styles.successButton,
              (!isShowingSuccess && !isShowingImmediateFeedback && (isAdded || isProcessingItem)) && styles.addedButton
            ]}
            onPress={() => {
              // Show immediate visual feedback
              setImmediateFeedback(prev => new Set(prev).add(suggestion.id));
              // Start the add process
              handleAddToList(suggestion);
            }}
            disabled={isAdded || isProcessingItem || isShowingSuccess || isShowingImmediateFeedback}
            accessibilityRole="button"
            accessibilityLabel={isAdded ? `${suggestion.title} added to list` : `Add ${suggestion.title} to list`}
            accessibilityHint={isAdded ? 'This item has been added to your planned list' : 'Tap to add this item to your planned list'}
          >
            {(isShowingSuccess || isShowingImmediateFeedback) ? (
              <Check size={16} color="#FFFFFF" />
            ) : (
              <Plus size={16} color="#FFFFFF" />
            )}
            <Text style={styles.addButtonText}>
              {(isShowingSuccess || isShowingImmediateFeedback)
                ? 'Added!'
                : isProcessingItem 
                  ? 'Adding...' 
                  : isAdded 
                    ? `Added to ${suggestion.isBook ? 'Books' : 'Movies'}` 
                    : `Add to ${suggestion.isBook ? 'Books' : 'Movies'}`
              }
            </Text>
          </TouchableOpacity>
          
          <View style={styles.feedbackButtons}>
            {(['loved', 'liked', 'meh', 'disliked'] as const).map((rating) => {
              const currentRating = granularRatings.get(suggestion.id);
              const isActive = currentRating === rating;
              const config = RATING_CONFIG[rating];
              
              return (
                <TouchableOpacity
                  key={rating}
                  style={[
                    styles.feedbackButton,
                    {
                      borderColor: config.color,
                      backgroundColor: isActive ? config.color : '#FFFFFF',
                    }
                  ]}
                  onPress={() => handleGranularRating(suggestion, rating)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isActive ? 'Remove' : 'Rate'} ${rating} for ${suggestion.title}`}
                  accessibilityHint={`Tap to ${isActive ? 'remove' : 'rate'} this suggestion as ${rating}`}
                >
                  <Text style={{
                    fontSize: 16,
                    color: isActive ? '#FFFFFF' : config.color,
                  }}>
                    {config.icon}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const filterOptions = [
    { key: 'all', label: 'All', icon: Sparkles },
    { key: 'books', label: 'Books', icon: BookOpen },
    { key: 'movies', label: 'Movies', icon: Film },
    { key: 'short', label: 'Short', icon: Clock },
    { key: 'medium', label: 'Medium', icon: TrendingUp },
    { key: 'long', label: 'Long', icon: Heart },
    { key: 'semantic', label: 'Similar', icon: Lightbulb },
  ];

  const sortOptions = [
    { key: 'confidence', label: 'Confidence' },
    { key: 'length', label: 'Length' },
    { key: 'rating', label: 'Rating' },
    { key: 'year', label: 'Year' },
  ];

  const handleExport = async () => {
    try {
      const exportText = generateComprehensiveExport();
      
      // Platform-aware export handling
      if (Platform.OS === 'web') {
        // For web, create a downloadable file
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
        // For mobile, use Share API
        if (Share.share) {
          await Share.share({
            message: exportText,
            title: 'My Complete Reading & Watching List',
          });
        } else {
          // Fallback for platforms where Share is not available
          Alert.alert(
            'Export Complete', 
            'Your data has been prepared for export. Please copy the text from the console.',
            [
              { text: 'OK', onPress: () => console.log('Export data:', exportText) }
            ]
          );
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
      
      // Enhanced error handling with platform-specific messages
      const errorMessage = Platform.OS === 'web' 
        ? 'Failed to download export file. Please try again.'
        : 'Failed to export data. Please try again.';
        
      Alert.alert('Export Error', errorMessage);
    }
  };

  // External API integration for large book catalogs
  const fetchBooksFromAPI = async (genre: string, limit: number = 20): Promise<any[]> => {
    try {
      // Example: Google Books API
      const query = encodeURIComponent(`${genre} fiction`);
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=${limit}&orderBy=relevance&key=YOUR_API_KEY`
      );
      
      if (!response.ok) {
        console.warn('API request failed, returning empty array');
        return [];
      }
      
      const data = await response.json();
      return data.items?.map((item: any) => ({
        title: item.volumeInfo.title,
        author: item.volumeInfo.authors?.[0] || 'Unknown Author',
        year: item.volumeInfo.publishedDate?.split('-')[0] || 2000,
        format: "text",
        rating: 4,
        description: item.volumeInfo.description || 'No description available',
        genres: [genre],
        isBook: true,
        source: 'api'
      })) || [];
      
    } catch (error) {
      console.error('Error fetching from API:', error);
      return [];
    }
  };



  // NYT Bestsellers API integration
  const fetchNYTBestsellers = async (category: string = 'combined-fiction'): Promise<any[]> => {
    try {
      const response = await fetch(
        `https://api.nytimes.com/svc/books/v3/lists/current/${category}.json?api-key=YOUR_NYT_API_KEY`
      );
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return data.results?.books?.map((book: any) => ({
        title: book.title,
        author: book.author,
        year: new Date().getFullYear(),
        format: "text",
        rating: 4,
        description: book.description || 'New York Times Bestseller',
        genres: ['Bestseller'],
        isBook: true,
        source: 'nyt',
        weeksOnList: book.weeks_on_list
      })) || [];
      
    } catch (error) {
      console.error('Error fetching NYT bestsellers:', error);
      return [];
    }
  };



  // Cache for API results to avoid repeated calls
  const apiCache = new Map<string, { data: any[], timestamp: number }>();
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  // Semantic similarity cache
  const semanticCache: SemanticCache = {
    embeddings: new Map(),
    similarityMatrix: new Map(),
    lastUpdated: Date.now(),
    cacheSize: 0,
    maxCacheSize: SEMANTIC_CONFIG.MAX_CACHE_SIZE
  };

  // TMDB API configuration
  const TMDB_API_KEY = '8c247ea0b4b56ed2ff7d41c9a833aa77'; // Free public key for demo
  const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

  // Enhanced genre suggestions with Google Books API integration
  const getEnhancedGenreSuggestions = async (genre: string, isLowCountRefresh: boolean = false): Promise<any[]> => {
    try {
      const limit = isLowCountRefresh ? 30 : 20; // Fetch more content for low count refresh
      console.log(`🌐 Fetching ${genre} books from Google Books API (limit: ${limit})...`);
              const apiBooks = await fetchBooksFromHardCodedData(genre, limit);
      
      if (apiBooks.length > 0) {
        console.log(`✅ Found ${apiBooks.length} ${genre} books from Google Books API`);
        return apiBooks;
      }
    } catch (error) {
      console.warn(`⚠️ Google Books API failed for ${genre}, using local fallback:`, error);
    }
    
    // Fallback to local data
    console.log(`📚 Using local fallback data for ${genre}`);
    return await fetchBooksFromLocalFallback(genre, isLowCountRefresh ? 30 : 20);
  };

  // TMDB API functions
  const fetchMoviesFromTMDB = async (category: 'popular' | 'top_rated' | 'now_playing', limit: number = 10): Promise<any[]> => {
    const cacheKey = `tmdb-movies-${category}-${limit}`;
    const now = Date.now();
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`🎬 Using cached TMDB movies data for ${category}`);
      return cached.data;
    }

    try {
      console.log(`🌐 Fetching ${limit} ${category} movies from TMDB...`);
      
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/${category}?api_key=${TMDB_API_KEY}&language=en-US&page=1`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        console.warn(`No movies found for category: ${category}`);
        return [];
      }

      const movies = data.results
        .filter((movie: any) => movie.title && movie.release_date)
        .map((movie: any) => ({
          title: movie.title,
          author: movie.director || 'Various Directors',
          year: new Date(movie.release_date).getFullYear(),
          format: "streaming",
          rating: Math.round(movie.vote_average / 2), // Convert 10-point scale to 5-point
          description: movie.overview || `A ${movie.genre_ids?.length ? 'popular' : ''} movie released in ${new Date(movie.release_date).getFullYear()}.`,
          genres: ['Movie'],
          isBook: false,
          source: 'tmdb',
          tmdbId: movie.id,
          posterPath: movie.poster_path
        }))
        .slice(0, limit);

      // Cache the results
      apiCache.set(cacheKey, { data: movies, timestamp: now });
      
      console.log(`✅ Fetched ${movies.length} ${category} movies from TMDB`);
      return movies;
      
    } catch (error) {
      console.error(`❌ Error fetching from TMDB for ${category}:`, error);
      return [];
    }
  };



  // OpenLibrary API function removed - using Google Books API + local fallback instead
  /*
  const fetchBooksFromOpenLibrary = async (genre: string, limit: number = 20): Promise<any[]> => {
    // Rate limiting: ensure we don't exceed 1 request per 3 seconds to avoid API overload
    const now = Date.now();
    const lastRequestTime = apiCache.get('last-openlibrary-request')?.timestamp || 0;
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < 3000) {
      console.log(`⏱️ Rate limiting: waiting ${3000 - timeSinceLastRequest}ms before next OpenLibrary request`);
      await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastRequest));
    }
    const cacheKey = `openlibrary-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached OpenLibrary data for ${genre}`);
      return cached.data;
    }

    try {
      console.log(`🌐 Fetching ${limit} ${genre} books from OpenLibrary...`);
      
      // Map genre names to better search terms
      const searchTerms = {
        'fantasy': 'fantasy fiction',
        'scifi': 'science fiction',
        'mystery': 'mystery fiction',
        'adventure': 'adventure fiction',
        'literary': 'literary fiction',
        'contemporary': 'contemporary fiction',
        'romance': 'romance fiction',
        'horror': 'horror fiction',
        'historical': 'historical fiction',
        'young adult': 'young adult fiction'
      };

      let searchTerm = searchTerms[genre as keyof typeof searchTerms] || `${genre} fiction`;
      
      // Special handling for adventure to include outdoor adventure non-fiction
      if (genre === 'adventure') {
        console.log('🏔️ Adventure genre detected - will search for both fiction and outdoor adventure non-fiction');
        // We'll handle this with multiple searches below
      }
      
      let allBooks: any[] = [];
      
      if (genre === 'adventure') {
        // For adventure, search multiple categories to get outdoor adventure books
        const adventureSearches = [
          'adventure fiction',
          'outdoor adventure',
          'mountain climbing',
          'wilderness survival',
          'expedition',
          'exploration'
        ];
        
        console.log('🏔️ Searching multiple adventure categories:', adventureSearches);
        
        // Search each category and combine results
        for (const searchTerm of adventureSearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / adventureSearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          } else if (response.status === 500) {
            console.warn(`⚠️ OpenLibrary API server error (500) for "${searchTerm}" - skipping`);
          } else {
            console.warn(`⚠️ OpenLibrary API error ${response.status} for "${searchTerm}" - skipping`);
          }
          
          // Rate limiting between requests
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'literary') {
        // For literary fiction, search multiple categories
        const literarySearches = [
          'literary fiction',
          'modern literature',
          'contemporary literature',
          'award winning fiction',
          'booker prize',
          'pulitzer prize fiction',
          'national book award'
        ];
        
        console.log('📖 Searching multiple literary categories:', literarySearches);
        
        for (const searchTerm of literarySearches) {
          const query = encodeURIComponent(searchTerm);
                      const response = await fetch(
              `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / literarySearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
            );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'contemporary') {
        // For contemporary fiction, search multiple categories
        const contemporarySearches = [
          'contemporary fiction',
          'modern fiction',
          '21st century fiction',
          'current fiction',
          'recent fiction',
          'modern novels'
        ];
        
        console.log('📚 Searching multiple contemporary categories:', contemporarySearches);
        
        for (const searchTerm of contemporarySearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / contemporarySearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'award') {
        // For award-winning books, search multiple award categories
        const awardSearches = [
          'pulitzer prize',
          'booker prize',
          'national book award',
          'nobel prize literature',
          'man booker prize',
          'pen faulkner award',
          'national book critics circle'
        ];
        
        console.log('🏆 Searching multiple award categories:', awardSearches);
        
        for (const searchTerm of awardSearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / awardSearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        // For other genres, use single search
        const query = encodeURIComponent(searchTerm);
        const response = await fetch(
          `https://openlibrary.org/search.json?q=${query}&limit=${limit}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
        );
        
        if (!response.ok) {
          if (response.status === 500) {
            console.warn(`⚠️ OpenLibrary API server error (500) for ${genre} - skipping this genre`);
            return [];
          }
          throw new Error(`OpenLibrary API error: ${response.status}`);
        }
        
        const data = await response.json();
        allBooks = data.docs || [];
      }
      
      if (!allBooks || allBooks.length === 0) {
        console.warn(`No books found for genre: ${genre}`);
        return [];
      }

      const books = allBooks
        .filter((doc: any) => doc.title && doc.author_name && doc.first_publish_year)
        .map((doc: any) => {
          // Use user's preferred format if available, otherwise default to "text"
          let format = "text";
          if (interests && interests.preferredFormats.length > 0) {
            if (interests.preferredFormats.includes('ebook')) {
              format = "ebook";
            } else if (interests.preferredFormats.includes('audiobook')) {
              format = "audiobook";
            } else if (interests.preferredFormats.includes('text')) {
              format = "text";
            }
          }

          // Enhanced genre detection for different book types
          let detectedGenres = [genre];
          if (genre === 'adventure') {
            // Analyze subjects to determine if it's outdoor adventure
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            const author = doc.author_name[0]?.toLowerCase() || '';
            
            // Check for outdoor adventure indicators
            const outdoorKeywords = [
              'mountain', 'climbing', 'expedition', 'wilderness', 'survival',
              'exploration', 'outdoor', 'adventure', 'hiking', 'mountaineering',
              'everest', 'k2', 'alpine', 'rock climbing', 'ice climbing'
            ];
            
            const hasOutdoorContent = outdoorKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasOutdoorContent) {
              detectedGenres = ['Adventure', 'Outdoor Adventure', 'Non-Fiction'];
            }
          } else if (genre === 'literary') {
            // Enhanced detection for literary fiction
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            
            const literaryKeywords = [
              'literary fiction', 'modern literature', 'contemporary literature',
              'booker prize', 'pulitzer prize', 'national book award'
            ];
            
            const hasLiteraryContent = literaryKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasLiteraryContent) {
              detectedGenres = ['Literary Fiction', 'Modern Literature'];
            }
          } else if (genre === 'contemporary') {
            // Enhanced detection for contemporary fiction
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            const year = doc.first_publish_year || 2000;
            
            const contemporaryKeywords = [
              'contemporary fiction', 'modern fiction', '21st century',
              'current fiction', 'recent fiction', 'modern novels'
            ];
            
            const hasContemporaryContent = contemporaryKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            ) || year >= 2000;
            
            if (hasContemporaryContent) {
              detectedGenres = ['Contemporary Fiction', 'Modern Fiction'];
            }
          } else if (genre === 'award') {
            // Enhanced detection for award-winning books
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            
            const awardKeywords = [
              'pulitzer prize', 'booker prize', 'national book award',
              'nobel prize', 'man booker', 'pen faulkner', 'critics circle'
            ];
            
            const hasAwardContent = awardKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasAwardContent) {
              detectedGenres = ['Award-Winning', 'Literary Fiction'];
            }
          }

          // Extract the first sentence from the array, preferring English
          const firstSentence = Array.isArray(doc.first_sentence) 
            ? doc.first_sentence.find((sentence: any) => 
                typeof sentence === 'string' && 
                /^[a-zA-Z]/.test(sentence) && 
                sentence.length > 20 &&
                // Additional English filtering - avoid common non-English patterns
                !sentence.includes('à') && 
                !sentence.includes('é') && 
                !sentence.includes('ç') &&
                !sentence.includes('ñ') &&
                !sentence.includes('ü') &&
                !sentence.includes('ö') &&
                !sentence.includes('ä')
              ) || doc.first_sentence.find((sentence: any) => 
                typeof sentence === 'string' && 
                /^[a-zA-Z]/.test(sentence) && 
                sentence.length > 20
              ) || doc.first_sentence[0] || ''
            : doc.first_sentence || '';
          
          // Generate a meaningful description from available data
          let finalDescription = `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`;
          
          if (doc.description) {
            // If API has a description, use it
            finalDescription = doc.description;
          } else if (firstSentence && firstSentence.length > 30) {
            // If we have a substantial first sentence, create a better description
            const subjects = doc.subject || [];
            const author = doc.author_name[0] || 'Unknown Author';
            const year = doc.first_publish_year || '';
            
            // Extract key subjects for a better description
            const keySubjects = subjects
              .filter((subject: string) => 
                typeof subject === 'string' && 
                subject.length > 3 && 
                !subject.includes('Fiction') &&
                !subject.includes('Reading Level') &&
                !subject.includes('Study') &&
                !subject.includes('Texts')
              )
              .slice(0, 3);
            
            if (keySubjects.length > 0) {
              finalDescription = `A ${keySubjects.join(', ').toLowerCase()} novel by ${author}${year ? ` (${year})` : ''}. ${firstSentence}`;
            } else {
              finalDescription = `A ${detectedGenres.join(', ')} novel by ${author}${year ? ` (${year})` : ''}. ${firstSentence}`;
            }
          }
                      console.log('📚 Book data for', doc.title, ':', {
              has_api_description: !!doc.description,
              api_description_length: doc.description?.length || 0,
              has_first_sentence: !!firstSentence,
              first_sentence_length: firstSentence?.length || 0,
              pages: doc.number_of_pages_median,
              rating: doc.ratings_average,
              rating_count: doc.ratings_count,
              language: doc.language,
              publisher: doc.publisher
            });
          
                     // Perform NLP analysis on the book content
           const analysisText = doc.description || firstSentence || `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`;
           const nlpAnalysis = performNLPContentAnalysis(
             analysisText,
             doc.title,
             doc.author_name[0] || 'Unknown Author',
             doc.subject || []
           );
           
           return {
             title: doc.title,
             author: doc.author_name[0] || 'Unknown Author',
             year: doc.first_publish_year || 2000,
             format,
             rating: 4,
             description: doc.description || firstSentence || `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`,
             genres: detectedGenres,
             isBook: true,
             source: 'openlibrary',
             coverId: doc.cover_i,
             openLibraryKey: doc.key,
             nlpAnalysis: nlpAnalysis
           };
        })
        .slice(0, limit);

      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: now });
      
      // Track this request for rate limiting
      apiCache.set('last-openlibrary-request', { data: [], timestamp: now });
      
      console.log(`✅ Fetched ${books.length} ${genre} books from OpenLibrary`);
      if (genre === 'adventure') {
        console.log('🏔️ Adventure books returned:', books.map((b: any) => ({ title: b.title, author: b.author, genres: b.genres })));
      }
      return books;
      
    } catch (error) {
      console.error(`❌ Error fetching from OpenLibrary for ${genre}:`, error);
      
      // Try to use cached data even if expired
      const cached = apiCache.get(cacheKey);
      if (cached && cached.data.length > 0) {
        console.log(`📚 Using expired cached data for ${genre} due to API error`);
        return cached.data;
      }
      
      // Simple error handling without complex retry logic
      console.log(`⚠️ Skipping retry for ${genre} to avoid complexity`);
      return [];
    }
  };
  */

  // NLP Content Analysis Functions
  const performNLPContentAnalysis = (text: string, title: string, author: string, subjects: string[] = []): NLPContentAnalysis => {
    const analysis: NLPContentAnalysis = {
      sentiment: analyzeSentiment(text, title, subjects),
      topics: extractTopics(text, title, subjects),
      complexity: analyzeComplexity(text),
      style: analyzeStyle(text, title),
      content: analyzeContent(text, title, subjects)
    };
    
    console.log('🧠 NLP Analysis for', title, ':', analysis);
    return analysis;
  };

  const analyzeSentiment = (text: string, title: string, subjects: string[]): NLPContentAnalysis['sentiment'] => {
    // Simple sentiment analysis based on keyword patterns
    const positiveWords = ['love', 'joy', 'happy', 'beautiful', 'amazing', 'wonderful', 'exciting', 'inspiring', 'hope', 'success', 'victory', 'triumph', 'adventure', 'discovery'];
    const negativeWords = ['death', 'sad', 'angry', 'fear', 'horror', 'tragedy', 'loss', 'pain', 'suffering', 'betrayal', 'war', 'violence', 'darkness', 'despair'];
    const emotionalWords = ['passion', 'rage', 'terror', 'ecstasy', 'melancholy', 'euphoria', 'dread', 'wonder'];
    
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    let positiveScore = 0;
    let negativeScore = 0;
    let emotionalIntensity = 0;
    
    positiveWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      positiveScore += matches * 0.1;
    });
    
    negativeWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      negativeScore += matches * 0.1;
    });
    
    emotionalWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      emotionalIntensity += matches * 0.2;
    });
    
    const sentimentScore = Math.max(-1, Math.min(1, positiveScore - negativeScore));
    const magnitude = Math.min(1, (positiveScore + negativeScore + emotionalIntensity) / 10);
    
    const emotions: string[] = [];
    if (positiveScore > negativeScore) emotions.push('joy');
    if (negativeScore > positiveScore) emotions.push('sadness');
    if (emotionalIntensity > 0.5) emotions.push('surprise');
    if (allText.includes('fear') || allText.includes('horror')) emotions.push('fear');
    if (allText.includes('anger') || allText.includes('rage')) emotions.push('anger');
    
    return {
      score: sentimentScore,
      magnitude: magnitude,
      emotions: emotions
    };
  };

  const extractTopics = (text: string, title: string, subjects: string[]): NLPContentAnalysis['topics'] => {
    // Topic extraction based on keywords and subject analysis
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    const topicKeywords = {
      adventure: ['adventure', 'exploration', 'journey', 'quest', 'expedition', 'climbing', 'mountaineering', 'survival'],
      romance: ['love', 'romance', 'relationship', 'marriage', 'dating', 'passion', 'affair'],
      mystery: ['mystery', 'detective', 'crime', 'investigation', 'clue', 'suspense', 'thriller'],
      fantasy: ['fantasy', 'magic', 'wizard', 'dragon', 'kingdom', 'quest', 'mythical'],
      scifi: ['science fiction', 'space', 'technology', 'future', 'robot', 'alien', 'dystopia'],
      historical: ['history', 'historical', 'war', 'battle', 'ancient', 'medieval', 'victorian'],
      psychological: ['psychology', 'mental', 'mind', 'consciousness', 'therapy', 'trauma', 'memory'],
      philosophical: ['philosophy', 'meaning', 'existence', 'morality', 'ethics', 'truth', 'reality'],
      social: ['society', 'social', 'class', 'inequality', 'politics', 'culture', 'community'],
      nature: ['nature', 'environment', 'wildlife', 'conservation', 'outdoors', 'landscape', 'ecology']
    };
    
    const primary: string[] = [];
    const secondary: string[] = [];
    const themes: string[] = [];
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (allText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 2) {
        primary.push(topic);
      } else if (score > 0) {
        secondary.push(topic);
      }
    });
    
    // Extract themes from subjects and text
    const themeKeywords = ['coming of age', 'redemption', 'betrayal', 'sacrifice', 'identity', 'freedom', 'justice', 'revenge', 'forgiveness', 'transformation'];
    themeKeywords.forEach(theme => {
      if (allText.includes(theme)) {
        themes.push(theme);
      }
    });
    
    return { primary, secondary, themes };
  };

  const analyzeComplexity = (text: string): NLPContentAnalysis['complexity'] => {
    // Flesch-Kincaid readability analysis
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = countSyllables(text);
    
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = syllables / Math.max(words.length, 1);
    
    // Simplified Flesch-Kincaid score (0-100, higher = more complex)
    const readabilityScore = Math.min(100, Math.max(0, 
      206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord)
    ));
    
    let vocabularyLevel = 'intermediate';
    if (readabilityScore > 70) vocabularyLevel = 'elementary';
    else if (readabilityScore < 30) vocabularyLevel = 'advanced';
    
    const sentenceComplexity = Math.min(1, avgSentenceLength / 25); // Normalize to 0-1
    
    return {
      readabilityScore,
      vocabularyLevel,
      sentenceComplexity
    };
  };

  const countSyllables = (text: string): number => {
    // Simplified syllable counting
    const words = text.toLowerCase().split(/\s+/);
    let count = 0;
    
    words.forEach(word => {
      // Remove common suffixes that don't add syllables
      word = word.replace(/[.,!?;:]/g, '');
      if (word.length <= 3) {
        count += 1;
      } else {
        // Count vowel groups
        const vowelGroups = word.match(/[aeiouy]+/g) || [];
        count += Math.max(1, vowelGroups.length);
      }
    });
    
    return count;
  };

  const analyzeStyle = (text: string, title: string): NLPContentAnalysis['style'] => {
    const allText = `${text} ${title}`.toLowerCase();
    
    // Tone analysis
    let tone = 'conversational';
    if (allText.includes('research') || allText.includes('study') || allText.includes('analysis')) {
      tone = 'academic';
    } else if (allText.includes('formal') || allText.includes('official') || allText.includes('document')) {
      tone = 'formal';
    } else if (allText.includes('casual') || allText.includes('informal') || allText.includes('chat')) {
      tone = 'casual';
    }
    
    // Pacing analysis
    let pacing = 'moderate';
    const shortSentences = text.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length < 10).length;
    const totalSentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const shortSentenceRatio = shortSentences / Math.max(totalSentences, 1);
    
    if (shortSentenceRatio > 0.7) pacing = 'fast';
    else if (shortSentenceRatio < 0.3) pacing = 'slow';
    
    // Narrative structure analysis
    let narrativeStructure = 'linear';
    if (allText.includes('flashback') || allText.includes('memory') || allText.includes('past')) {
      narrativeStructure = 'non-linear';
    } else if (allText.includes('episode') || allText.includes('chapter') || allText.includes('story')) {
      narrativeStructure = 'episodic';
    }
    
    return { tone, pacing, narrativeStructure };
  };

  const analyzeContent = (text: string, title: string, subjects: string[]): NLPContentAnalysis['content'] => {
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    // Genre indicators
    const genreIndicators: string[] = [];
    const genrePatterns = {
      'young adult': ['teen', 'adolescent', 'coming of age', 'high school', 'college'],
      'children': ['child', 'kid', 'elementary', 'picture book', 'middle grade'],
      'adult': ['adult', 'mature', 'explicit', 'graphic', 'violence'],
      'academic': ['research', 'study', 'analysis', 'thesis', 'dissertation'],
      'commercial': ['bestseller', 'popular', 'mainstream', 'blockbuster']
    };
    
    Object.entries(genrePatterns).forEach(([genre, keywords]) => {
      if (keywords.some(keyword => allText.includes(keyword))) {
        genreIndicators.push(genre);
      }
    });
    
    // Target audience
    let targetAudience = 'general';
    if (allText.includes('teen') || allText.includes('young adult')) targetAudience = 'young adult';
    else if (allText.includes('child') || allText.includes('kid')) targetAudience = 'children';
    else if (allText.includes('adult') || allText.includes('mature')) targetAudience = 'adult';
    else if (allText.includes('academic') || allText.includes('research')) targetAudience = 'academic';
    
    // Content warnings
    const contentWarnings: string[] = [];
    const warningPatterns = {
      'violence': ['violence', 'blood', 'gore', 'war', 'battle', 'murder'],
      'sexual content': ['sex', 'sexual', 'romance', 'intimate', 'explicit'],
      'language': ['profanity', 'swearing', 'cursing', 'explicit language'],
      'drugs': ['drugs', 'alcohol', 'substance', 'addiction'],
      'trauma': ['trauma', 'abuse', 'mental health', 'depression', 'anxiety']
    };
    
    Object.entries(warningPatterns).forEach(([warning, keywords]) => {
      if (keywords.some(keyword => allText.includes(keyword))) {
        contentWarnings.push(warning);
      }
    });
    
    return { genreIndicators, targetAudience, contentWarnings };
  };

  // Enhanced confidence calculation using NLP analysis
  const calculateNLPConfidence = (suggestion: Suggestion, userPreferences: any): number => {
    if (!suggestion.nlpAnalysis) return suggestion.confidence;
    
    let confidence = suggestion.confidence;
    
    // Boost confidence based on sentiment alignment
    if (userPreferences.moods) {
      const userMoods = Array.from(userPreferences.moods.keys()).map(key => String(key));
      const contentEmotions = suggestion.nlpAnalysis.sentiment.emotions;
      
      if (userMoods.some(mood => contentEmotions.includes(mood))) {
        confidence += 10;
      }
    }
    
    // Boost confidence based on topic alignment
    if (userPreferences.genres) {
      const userGenres = Array.from(userPreferences.genres.keys()).map(key => String(key));
      const contentTopics = [...suggestion.nlpAnalysis.topics.primary, ...suggestion.nlpAnalysis.topics.secondary];
      
      if (userGenres.some(genre => contentTopics.includes(genre))) {
        confidence += 15;
      }
    }
    
    // Adjust confidence based on complexity preference
    if (userPreferences.readingPace) {
      const userPaceKeys = Array.from(userPreferences.readingPace.keys());
      const userPace = userPaceKeys.length > 0 ? String(userPaceKeys[0]) : 'moderate';
      const contentComplexity = suggestion.nlpAnalysis.complexity.readabilityScore;
      
      if (userPace === 'fast' && contentComplexity < 50) confidence += 5;
      else if (userPace === 'slow' && contentComplexity > 70) confidence += 5;
    }
    
    return Math.min(100, confidence);
  };



  // Local fallback function - no API calls, instant results
  const fetchBooksFromLocalFallback = async (genre: string, limit: number = 20): Promise<any[]> => {
    const cacheKey = `local-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached local data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`🏠 Using local fallback data for ${genre}...`);
      
      const localBooks = LOCAL_BOOK_DATA[genre as keyof typeof LOCAL_BOOK_DATA] || [];
      const books = localBooks.slice(0, limit).map((book, index) => ({
        id: `local-${genre}-${index}`,
        title: book.title,
        author: book.author,
        year: book.year,
        format: "text",
        rating: 4,
        description: book.description,
        genres: book.genres,
        isBook: true,
        source: 'local',
        reason: `Local recommendation for ${genre}`,
        confidence: 70,
        category: 'genre',
        estimatedPages: 300,
        estimatedLength: 'medium'
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: Date.now() });
      
      console.log(`✅ Retrieved ${books.length} ${genre} books from local fallback`);
      return books;
      
    } catch (error) {
      console.error(`❌ Error with local fallback for ${genre}:`, error);
      return [];
    }
  };

  // Enhanced book fetching with multiple fallback options
  const fetchBooksWithFallbacks = async (genre: string, limit: number = 20): Promise<any[]> => {
    console.log(`🔄 Fetching books for ${genre} with fallback options...`);
    
    // Try Google Books first (most reliable)
          let books = await fetchBooksFromHardCodedData(genre, limit);
    
    // If hard-coded data returns few results, try broader genre matching
    if (books.length < 5 && API_CONFIG.USE_LOCAL_FALLBACK) {
      console.log(`📚 Hard-coded data returned only ${books.length} results, trying broader genre matching...`);
      const localBooks = await fetchBooksFromLocalFallback(genre, limit);
      
      // Combine results, prioritizing Google Books
      const combinedBooks = [...books, ...localBooks];
      const uniqueBooks = combinedBooks.filter((book, index, self) => 
        index === self.findIndex(b => b.title === book.title && b.author === book.author)
      );
      
      books = uniqueBooks.slice(0, limit);
    }
    
    // If still no results, use local fallback only
    if (books.length === 0 && API_CONFIG.USE_LOCAL_FALLBACK) {
      console.log(`📚 No API results, using local fallback only...`);
      books = await fetchBooksFromLocalFallback(genre, limit);
    }
    
    return books;
  };

  // Semantic Similarity Functions
  const generateSemanticEmbedding = (item: Suggestion): number[] => {
    try {
      // Create a simple but effective embedding based on text features
      const text = `${item.title} ${item.author} ${item.description} ${item.genres.join(' ')}`.toLowerCase();
      
      // Simple hash-based embedding (for mobile performance)
      const embedding = new Array(SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS).fill(0);
      
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const position = charCode % SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS;
        embedding[position] += charCode / 1000;
      }
      
      // Normalize the embedding
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= magnitude;
        }
      }
      
      return embedding;
    } catch (error) {
      console.error('Error generating semantic embedding:', error);
      return new Array(SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS).fill(0);
    }
  };

  const calculateCosineSimilarity = (embedding1: number[], embedding2: number[]): number => {
    try {
      if (embedding1.length !== embedding2.length) {
        return 0;
      }
      
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      
      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        magnitude1 += embedding1[i] * embedding1[i];
        magnitude2 += embedding2[i] * embedding2[i];
      }
      
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      
      if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
      }
      
      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      console.error('Error calculating cosine similarity:', error);
      return 0;
    }
  };

  const findSemanticSimilarItems = (targetItem: Suggestion, allItems: Suggestion[], limit: number = 5): SimilarityResult[] => {
    try {
      const results: SimilarityResult[] = [];
      
      // Generate or get embedding for target item
      let targetEmbedding = semanticCache.embeddings.get(targetItem.id)?.vector;
      if (!targetEmbedding) {
        targetEmbedding = generateSemanticEmbedding(targetItem);
        semanticCache.embeddings.set(targetItem.id, {
          id: targetItem.id,
          vector: targetEmbedding,
          metadata: {
            title: targetItem.title,
            author: targetItem.author,
            genres: targetItem.genres,
            description: targetItem.description,
            topics: targetItem.nlpAnalysis?.topics.primary || [],
            timestamp: Date.now()
          }
        });
      }
      
      // Calculate similarities with other items
      for (const item of allItems) {
        if (item.id === targetItem.id) continue;
        
        // Check cache first
        const cacheKey = `${targetItem.id}-${item.id}`;
        const cachedSimilarity = semanticCache.similarityMatrix.get(targetItem.id)?.get(item.id);
        
        let similarity = 0;
        if (cachedSimilarity !== undefined) {
          similarity = cachedSimilarity;
        } else {
          // Generate embedding for comparison item
          let itemEmbedding = semanticCache.embeddings.get(item.id)?.vector;
          if (!itemEmbedding) {
            itemEmbedding = generateSemanticEmbedding(item);
            semanticCache.embeddings.set(item.id, {
              id: item.id,
              vector: itemEmbedding,
              metadata: {
                title: item.title,
                author: item.author,
                genres: item.genres,
                description: item.description,
                topics: item.nlpAnalysis?.topics.primary || [],
                timestamp: Date.now()
              }
            });
          }
          
          similarity = calculateCosineSimilarity(targetEmbedding, itemEmbedding);
          
          // Cache the similarity
          if (!semanticCache.similarityMatrix.has(targetItem.id)) {
            semanticCache.similarityMatrix.set(targetItem.id, new Map());
          }
          semanticCache.similarityMatrix.get(targetItem.id)!.set(item.id, similarity);
        }
        
        if (similarity >= SEMANTIC_CONFIG.SIMILARITY_THRESHOLD) {
          results.push({
            itemId: item.id,
            similarity,
            reason: `Semantically similar to "${targetItem.title}"`,
            confidence: similarity * 100
          });
        }
      }
      
      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error finding semantic similar items:', error);
      return [];
    }
  };

  const manageSemanticCache = () => {
    try {
      const now = Date.now();
      const expiryTime = SEMANTIC_CONFIG.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      
      // Remove expired embeddings
      for (const [id, embedding] of semanticCache.embeddings) {
        if (now - embedding.metadata.timestamp > expiryTime) {
          semanticCache.embeddings.delete(id);
          semanticCache.similarityMatrix.delete(id);
        }
      }
      
      // Limit cache size
      if (semanticCache.embeddings.size > semanticCache.maxCacheSize) {
        const entries = Array.from(semanticCache.embeddings.entries());
        entries.sort((a, b) => a[1].metadata.timestamp - b[1].metadata.timestamp);
        
        const toRemove = entries.slice(0, entries.length - semanticCache.maxCacheSize);
        for (const [id] of toRemove) {
          semanticCache.embeddings.delete(id);
          semanticCache.similarityMatrix.delete(id);
        }
      }
      
      semanticCache.cacheSize = semanticCache.embeddings.size;
      semanticCache.lastUpdated = now;
      
      console.log(`🧠 Semantic cache managed: ${semanticCache.cacheSize} embeddings, ${semanticCache.similarityMatrix.size} similarity pairs`);
    } catch (error) {
      console.error('Error managing semantic cache:', error);
    }
  };

  const generateSemanticSuggestions = (targetItem: Suggestion, allItems: Suggestion[]): Suggestion[] => {
    try {
      const similarResults = findSemanticSimilarItems(targetItem, allItems, 10);
      
      const semanticSuggestions: Suggestion[] = [];
      
      for (const result of similarResults) {
        const similarItem = allItems.find(item => item.id === result.itemId);
        if (!similarItem) continue;
        
        const semanticSuggestion: Suggestion = {
          ...similarItem,
          id: `semantic-${result.itemId}`,
          reason: result.reason,
          confidence: result.confidence,
          category: 'semantic',
          semanticTags: ['similar', 'recommended']
        };
        
        if (!isItemAlreadyAdded(semanticSuggestion) && !isPastYearContent(semanticSuggestion)) {
          semanticSuggestions.push(semanticSuggestion);
        }
      }
      
      return semanticSuggestions;
      
    } catch (error) {
      console.error('Error generating semantic suggestions:', error);
      return [];
    }
  };

  // Predictive Preloading Functions
  const updateUserBehaviorPatterns = (action: 'search' | 'thumbs_up' | 'thumbs_down' | 'add' | 'view', data?: any) => {
    const now = Date.now();
    const currentHour = new Date().getHours();
    
    setUserBehaviorPatterns(prev => {
      const newPatterns = { ...prev };
      
      // Update interaction times
      newPatterns.interactionTimes.push(now);
      newPatterns.interactionTimes = newPatterns.interactionTimes.slice(-50); // Keep last 50 interactions
      
      // Update active hours
      newPatterns.activeHours.push(currentHour);
      newPatterns.activeHours = newPatterns.activeHours.slice(-100); // Keep last 100 hours
      
      // Update search history
      if (action === 'search' && data?.query) {
        newPatterns.searchHistory.push(data.query);
        newPatterns.searchHistory = newPatterns.searchHistory.slice(-20); // Keep last 20 searches
      }
      
      // Update preferred genres based on thumbs up
      if (action === 'thumbs_up' && data?.genres) {
        data.genres.forEach((genre: string) => {
          if (!newPatterns.preferredGenres.includes(genre)) {
            newPatterns.preferredGenres.push(genre);
          }
        });
        newPatterns.preferredGenres = newPatterns.preferredGenres.slice(-10); // Keep top 10 genres
      }
      
      newPatterns.lastInteractionTime = now;
      return newPatterns;
    });
  };

  const predictNextUserNeeds = () => {
    const patterns = userBehaviorPatterns;
    const predictions: string[] = [];
    
    // Predict based on search history
    if (patterns.searchHistory.length > 0) {
      const recentSearches = patterns.searchHistory.slice(-3);
      recentSearches.forEach(search => {
        // Extract potential genres from search terms
        const searchLower = search.toLowerCase();
        if (searchLower.includes('adventure')) predictions.push('adventure');
        if (searchLower.includes('fantasy')) predictions.push('fantasy');
        if (searchLower.includes('mystery')) predictions.push('mystery');
        if (searchLower.includes('sci-fi') || searchLower.includes('science fiction')) predictions.push('scifi');
        if (searchLower.includes('romance')) predictions.push('romance');
        if (searchLower.includes('thriller')) predictions.push('thriller');
      });
    }
    
    // Predict based on preferred genres
    predictions.push(...patterns.preferredGenres);
    
    // Predict based on time of day
    const currentHour = new Date().getHours();
    if (currentHour >= 6 && currentHour <= 12) {
      // Morning - suggest lighter reads
      predictions.push('contemporary', 'young adult');
    } else if (currentHour >= 18 && currentHour <= 22) {
      // Evening - suggest engaging reads
      predictions.push('thriller', 'mystery');
    }
    
    // Remove duplicates and return unique predictions
    return [...new Set(predictions)].slice(0, 5);
  };

  const preloadPredictedContent = async () => {
    if (isPredictiveLoading) return;
    
    setIsPredictiveLoading(true);
    console.log('🚀 Starting predictive preloading...');
    
    try {
      const predictions = predictNextUserNeeds();
      console.log('🔮 Predicted user needs:', predictions);
      
      // Track that we're preloading
      apiCache.set('last-predictive-preload', { data: [], timestamp: Date.now() });
      
      const preloadPromises = predictions.map(async (genre) => {
        // Check if we already have this in cache
        if (predictiveCache.has(genre)) {
          console.log(`📚 ${genre} already in predictive cache`);
          return;
        }
        
        console.log(`📚 Preloading ${genre} content...`);
        const books = await fetchBooksWithFallbacks(genre, 15);
        
        if (books.length > 0) {
          setPredictiveCache(prev => new Map(prev).set(genre, books));
          console.log(`✅ Preloaded ${books.length} ${genre} books`);
        }
      });
      
      await Promise.allSettled(preloadPromises);
      console.log('✅ Predictive preloading completed');
      
    } catch (error) {
      console.error('❌ Error during predictive preloading:', error);
    } finally {
      setIsPredictiveLoading(false);
    }
  };

  const getPredictiveSuggestions = (genre: string): Suggestion[] => {
    const cachedBooks = predictiveCache.get(genre);
    if (!cachedBooks) return [];
    
    return cachedBooks.map((book, index) => ({
      id: `predictive-${genre}-${index}`,
      title: book.title,
      author: book.author,
      year: book.year,
      isBook: book.isBook,
      reason: `Predicted ${genre} recommendation based on your preferences`,
      confidence: 85, // Higher confidence for predicted content
      category: 'predictive',
      format: book.format,
      rating: book.rating || 4,
      description: book.description,
      genres: [book.genre || genre],
      source: book.source || 'predictive',
      estimatedPages: book.isBook ? estimatePages(book.title) : undefined,
      estimatedLength: estimateLength(book.title),
    }));
  };

  // Trigger predictive preloading based on user behavior
  useEffect(() => {
    const shouldPreload = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - userBehaviorPatterns.lastInteractionTime;
      
      // Only preload if user has been inactive for 2 minutes AND we haven't preloaded recently
      const lastPreloadTime = apiCache.get('last-predictive-preload')?.timestamp || 0;
      const timeSinceLastPreload = now - lastPreloadTime;
      
      return timeSinceLastInteraction > 120000 && // 2 minutes of inactivity
             timeSinceLastPreload > 300000 && // 5 minutes between preloads
             !isPredictiveLoading;
    };
    
    const preloadInterval = setInterval(() => {
      if (shouldPreload()) {
        preloadPredictedContent();
      }
    }, 60000); // Check every minute instead of every 10 seconds
    
    return () => clearInterval(preloadInterval);
  }, [userBehaviorPatterns.lastInteractionTime, isPredictiveLoading]);

  // Update behavior patterns when user interacts
  useEffect(() => {
    if (suggestions.length > 0) {
      updateUserBehaviorPatterns('view', { count: suggestions.length });
    }
  }, [suggestions]);

  // Hard-coded data function - zero API calls, instant results
  const fetchBooksFromHardCodedData = async (genre: string, limit: number = 20): Promise<any[]> => {
    const cacheKey = `hardcoded-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached hard-coded data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`📚 Fetching ${limit} ${genre} books from hard-coded dataset...`);
      
      // Filter books by genre from comprehensive dataset
      let filteredBooks = COMPREHENSIVE_BOOK_DATA.filter(book => 
        book.genres.some(g => g.toLowerCase().includes(genre.toLowerCase()))
      );
      
      // If no exact matches, try broader genre matching
      if (filteredBooks.length === 0) {
        const genreMappings: { [key: string]: string[] } = {
          'fantasy': ['fantasy', 'epic', 'magic'],
          'scifi': ['science fiction', 'sci-fi'],
          'mystery': ['mystery', 'thriller', 'crime'],
          'adventure': ['adventure', 'exploration'],
          'literary': ['literary', 'classic'],
          'contemporary': ['contemporary', 'modern'],
          'romance': ['romance', 'love'],
          'horror': ['horror', 'thriller'],
          'historical': ['historical', 'history'],
          'young adult': ['young adult', 'ya']
        };
        
        const targetGenres = genreMappings[genre] || [genre];
        filteredBooks = COMPREHENSIVE_BOOK_DATA.filter(book => 
          book.genres.some(g => targetGenres.some(tg => g.toLowerCase().includes(tg.toLowerCase())))
        );
      }
      
      // Shuffle and limit results
      const shuffled = filteredBooks.sort(() => Math.random() - 0.5);
      const limitedBooks = shuffled.slice(0, limit);
      
      // Transform to match expected format
      const books = limitedBooks.map(book => ({
        title: book.title,
        author: book.author,
        year: book.year,
        format: "text",
        rating: book.rating || 4.0,
        description: book.description,
        genres: book.genres,
        isBook: true,
        source: 'hardcoded',
        coverId: null,
        isbn: null,
        pageCount: null,
        language: 'en',
        awards: book.awards || []
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: Date.now() });
      
      console.log(`✅ Fetched ${books.length} ${genre} books from hard-coded dataset`);
      return books;
      
    } catch (error) {
      console.error(`❌ Error fetching from hard-coded data for ${genre}:`, error);
      return [];
    }
  };

  // Hard-coded movie function - zero API calls, instant results
  const fetchMoviesFromHardCodedData = async (genre: string, limit: number = 20): Promise<any[]> => {
    const cacheKey = `hardcoded-movies-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`🎬 Using cached hard-coded movie data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`🎬 Fetching ${limit} ${genre} movies from hard-coded dataset...`);
      
      // Filter movies by genre from comprehensive dataset
      let filteredMovies = COMPREHENSIVE_MOVIE_DATA.filter(movie => 
        movie.genres.some(g => g.toLowerCase().includes(genre.toLowerCase()))
      );
      
      // If no exact matches, try broader genre matching
      if (filteredMovies.length === 0) {
        const genreMappings: { [key: string]: string[] } = {
          'action': ['action', 'adventure'],
          'comedy': ['comedy', 'humor'],
          'drama': ['drama', 'serious'],
          'thriller': ['thriller', 'suspense'],
          'sci-fi': ['sci-fi', 'science fiction'],
          'horror': ['horror', 'scary'],
          'romance': ['romance', 'love'],
          'documentary': ['documentary', 'non-fiction']
        };
        
        const targetGenres = genreMappings[genre] || [genre];
        filteredMovies = COMPREHENSIVE_MOVIE_DATA.filter(movie => 
          movie.genres.some(g => targetGenres.some(tg => g.toLowerCase().includes(tg.toLowerCase())))
        );
      }
      
      // Shuffle and limit results
      const shuffled = filteredMovies.sort(() => Math.random() - 0.5);
      const limitedMovies = shuffled.slice(0, limit);
      
      // Transform to match expected format
      const movies = limitedMovies.map(movie => ({
        title: movie.title,
        author: movie.author,
        year: movie.year,
        format: "streaming",
        rating: movie.rating || 4.0,
        description: movie.description,
        genres: movie.genres,
        isBook: false,
        source: 'hardcoded',
        posterPath: null,
        tmdbId: null,
        runtime: null,
        language: 'en'
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: movies, timestamp: Date.now() });
      
      console.log(`✅ Fetched ${movies.length} ${genre} movies from hard-coded dataset`);
      return movies;
      
    } catch (error) {
      console.error(`❌ Error fetching from hard-coded movie data for ${genre}:`, error);
      return [];
    }
  };

  // Search function using hard-coded data only
  const searchHardCodedData = async (query: string, type: 'books' | 'movies' | 'both' = 'both'): Promise<any[]> => {
    const cacheKey = `search-hardcoded-${query}-${type}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`🔍 Using cached search results for "${query}"`);
      return cached.data;
    }
    
    try {
      console.log(`🔍 Searching hard-coded data for "${query}"...`);
      
      const searchTerm = query.toLowerCase();
      let results: any[] = [];
      
      // Search books if requested
      if (type === 'books' || type === 'both') {
        const bookResults = COMPREHENSIVE_BOOK_DATA.filter(book => 
          book.title.toLowerCase().includes(searchTerm) ||
          book.author.toLowerCase().includes(searchTerm) ||
          book.description.toLowerCase().includes(searchTerm) ||
          book.genres.some(g => g.toLowerCase().includes(searchTerm))
        ).map(book => ({
          ...book,
          isBook: true,
          source: 'hardcoded'
        }));
        results.push(...bookResults);
      }
      
      // Search movies if requested
      if (type === 'movies' || type === 'both') {
        const movieResults = COMPREHENSIVE_MOVIE_DATA.filter(movie => 
          movie.title.toLowerCase().includes(searchTerm) ||
          movie.author.toLowerCase().includes(searchTerm) ||
          movie.description.toLowerCase().includes(searchTerm) ||
          movie.genres.some(g => g.toLowerCase().includes(searchTerm))
        ).map(movie => ({
          ...movie,
          isBook: false,
          source: 'hardcoded'
        }));
        results.push(...movieResults);
      }
      
      // Shuffle and limit results
      const shuffled = results.sort(() => Math.random() - 0.5);
      const limitedResults = shuffled.slice(0, 30);
      
      // Cache the results
      apiCache.set(cacheKey, { data: limitedResults, timestamp: Date.now() });
      
      console.log(`✅ Found ${limitedResults.length} results for "${query}" in hard-coded data`);
      return limitedResults;
      
    } catch (error) {
      console.error(`❌ Error searching hard-coded data for "${query}":`, error);
      return [];
    }
  };

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <Header
        title="Suggestions"
        onAddPress={() => {
          Alert.alert(
            'Add Item',
            'What would you like to add?',
            [
              {
                text: 'Cancel',
                style: 'cancel'
              },
              {
                text: 'Book',
                onPress: () => {
                  setModalIsBook(true);
                  setShowAddModal(true);
                }
              },
              {
                text: 'Movie',
                onPress: () => {
                  setModalIsBook(false);
                  setShowAddModal(true);
                }
              }
            ]
          );
        }}
        onExportPress={handleExport}
        onImportPress={() => importItems([], [])}
        primaryColor="#8B5CF6"
        secondaryColor="#7C3AED"
        isDark={false}
        backgroundColor="#F3F4F6"
      />

      {/* Search functionality now handled by the search input below */}

      {/* Last Refresh Indicator */}
      <View style={styles.refreshIndicator}>
        <Text style={styles.refreshIndicatorText}>
          Last updated: {lastRefreshTime.toLocaleTimeString()}
        </Text>
      </View>

      {/* Predictive Preloading Indicator */}
      {isPredictiveLoading && (
        <View style={styles.predictiveIndicator}>
          <Animated.View style={[styles.predictiveSpinner, { transform: [{ rotate: spinValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg']
          })}] }]}>
            <RefreshCw size={12} color="#8B5CF6" />
          </Animated.View>
          <Text style={styles.predictiveText}>
            🔮 Learning your preferences...
          </Text>
        </View>
      )}

      {/* Semantic Similarity Indicator */}
      {activeFilter === 'semantic' && (
        <View style={styles.semanticIndicator}>
          <Lightbulb size={12} color="#8B5CF6" />
          <Text style={styles.semanticText}>
            🧠 Showing semantically similar content
          </Text>
        </View>
      )}





      {/* Filters and Sort */}
      <View style={styles.controlsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <View style={styles.filtersContainer}>
            {filterOptions.map((option) => {
              const IconComponent = option.icon;
              const isActive = activeFilter === option.key;
              
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.filterChip,
                    isDark && styles.darkFilterChip,
                    isActive && [styles.activeFilterChip, { backgroundColor: '#8B5CF6' }]
                  ]}
                  onPress={() => setActiveFilter(option.key as FilterOption)}
                >
                  <IconComponent 
                    size={14} 
                    color={isActive ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#6B7280')} 
                  />
                  <Text style={[
                    styles.filterText,
                    isDark && styles.darkFilterText,
                    isActive && styles.activeFilterText
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.sortButton, isRefreshing && styles.refreshingButton]}
          onPress={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw 
            size={16} 
            color={isRefreshing ? "#9CA3AF" : "#6B7280"} 
            style={isRefreshing ? { transform: [{ rotate: '360deg' }] } : undefined}
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {/* Sort Options */}
      {showFilters && (
        <View style={styles.sortContainer}>
          <Text style={styles.sortTitle}>Sort by:</Text>
          <View style={styles.sortOptions}>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortOption,
                  sortBy === option.key && styles.activeSortOption
                ]}
                onPress={() => {
                  setSortBy(option.key as SortOption);
                  setShowFilters(false);
                }}
              >
                <Text style={[
                  styles.sortOptionText,
                  sortBy === option.key && styles.activeSortOptionText
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Suggestions List */}
      <FlatList
        data={filteredAndSortedSuggestions}
        keyExtractor={(item) => item.id}
        renderItem={renderSuggestionCard}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === 'web' && styles.webListContent
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => {
          // Show loading indicator while suggestions are being generated or searching
          if (isLoadingSuggestions || isSearching) {
            const spin = spinValue.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            });

            return (
              <View style={styles.loadingState}>
                <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]}>
                  <RefreshCw size={48} color="#3B82F6" />
                </Animated.View>
                <Text style={styles.loadingText}>
                  {isSearching ? 'Searching...' : 'Loading recommendations...'}
                </Text>
                <Text style={styles.loadingSubtext}>
                  {isSearching 
                    ? `Loading suggestions...`
                    : 'Analyzing your preferences and finding great books and movies'
                  }
                </Text>
              </View>
            );
          }

          // Show empty state when no suggestions are found after loading
          const totalSuggestions = suggestions.length;
          const filteredSuggestions = filteredAndSortedSuggestions.length;
          const dismissedCount = dismissedSuggestions.size;
          const duplicatesFiltered = totalSuggestions - filteredSuggestions;
          
          return (
            <View style={styles.emptyState}>
              <Lightbulb size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No suggestions found</Text>
              <Text style={styles.emptySubtext}>
                        {false ? (
          `Try adjusting your search`
                ) : totalSuggestions === 0 ? (
                  'Complete more books and movies to get personalized suggestions'
                ) : (
                  `All ${totalSuggestions} suggestions are either already in your lists or dismissed`
                )}
              </Text>
              {(duplicatesFiltered > 0 || dismissedCount > 0) && (
                <View style={styles.emptyStateDetails}>
                  {duplicatesFiltered > 0 && (
                    <Text style={styles.emptyStateDetail}>
                      • {duplicatesFiltered} already in your lists
                    </Text>
                  )}
                  {dismissedCount > 0 && (
                    <Text style={styles.emptyStateDetail}>
                      • {dismissedCount} dismissed
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Custom Alert */}
      <CustomAlert
        visible={showAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={() => setShowAlert(false)}
        onCancel={() => setShowAlert(false)}
        showCancel={false}
        confirmText="OK"
      />

      {/* Loading State */}
      {isLoadingSuggestions && suggestions.length === 0 && (
        <View style={styles.loadingContainer}>
          <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spinValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg']
          })}] }]} />
          <Text style={styles.loadingText}>Loading recommendations...</Text>
        </View>
      )}

      {/* Add/Edit Modal */}
      <AddEditModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveItem}
        editingItem={undefined}
        isBook={modalIsBook}
        primaryColor="#8B5CF6"
        isDark={false}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  webContainer: {
    minHeight: '100%',
    height: '100%',
    maxHeight: '100%',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  filtersScroll: {
    flex: 1,
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkFilterChip: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  activeFilterChip: {
    borderColor: '#8B5CF6',
  },
  filterText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkFilterText: {
    color: '#9CA3AF',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  sortButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
    marginBottom: 12,
  },
  sortOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  activeSortOption: {
    backgroundColor: '#8B5CF6',
  },
  sortOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  activeSortOptionText: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 20,
  },
  webListContent: {
    paddingBottom: 40,
    minHeight: '100%',
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  suggestionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 8,
  },
  suggestionReason: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  suggestionDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    lineHeight: 20,
    marginBottom: 4,
  },
  expandText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#8B5CF6',
    marginBottom: 12,
    textAlign: 'center',
  },
  suggestionMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addedButton: {
    backgroundColor: '#8B5CF6',
    opacity: 0.7,
  },
  successButton: {
    backgroundColor: '#8B5CF6', // Purple for consistency
    transform: [{ scale: 1.2 }], // Larger scale
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  addButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  feedbackButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  feedbackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbsUpButton: {
    borderColor: '#8B5CF6',
    backgroundColor: '#FFFFFF',
  },
  thumbsDownButton: {
    borderColor: '#6B7280',
    backgroundColor: '#FFFFFF',
  },
  activeThumbsUp: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  activeThumbsDown: {
    backgroundColor: '#6B7280',
    borderColor: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyStateDetails: {
    marginTop: 12,
    alignItems: 'center',
  },
  emptyStateDetail: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 4,
  },
  refreshingButton: {
    opacity: 0.5,
  },
  refreshIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  refreshIndicatorText: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#3B82F6',
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  predictiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
  },
  predictiveSpinner: {
    marginRight: 8,
  },
  predictiveText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#8B5CF6',
  },
  semanticIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  semanticText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginLeft: 8,
  },
  semanticTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  semanticTagText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginLeft: 4,
  },
  yearFilterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: '#E0F2FE',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0288D1',
  },
  yearFilterText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#01579B',
  },
});