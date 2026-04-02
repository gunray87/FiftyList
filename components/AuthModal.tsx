import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Mail, Lock, User } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  isDark?: boolean;
}

export default function AuthModal({
  visible,
  onClose,
  initialMode = 'signin',
  isDark = false,
}: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, fullName);
      } else {
        await signIn(email, password);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, isDark && styles.darkContainer]}
      >
        {/* Header */}
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.title, isDark && styles.darkText]}>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Full Name (signup only) */}
          {mode === 'signup' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkLabel]}>Full Name</Text>
              <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
                <User size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                <TextInput
                  style={[styles.input, isDark && styles.darkInput]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Email</Text>
            <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
              <Mail size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              <TextInput
                style={[styles.input, isDark && styles.darkInput]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Password</Text>
            <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
              <Lock size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              <TextInput
                style={[styles.input, isDark && styles.darkInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Mode */}
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, isDark && styles.darkSecondaryText]}>
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={styles.toggleLink}>
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#FFF' 
  },
  darkContainer: { 
    backgroundColor: '#111827' 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkHeader: { 
    borderBottomColor: '#374151' 
  },
  title: { 
    fontSize: 20, 
    fontFamily: 'Inter-SemiBold', 
    color: '#111827' 
  },
  darkText: { 
    color: '#FFF' 
  },
  content: { 
    flex: 1, 
    padding: 20 
  },
  inputGroup: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 14, 
    fontFamily: 'Inter-Medium', 
    color: '#374151', 
    marginBottom: 8 
  },
  darkLabel: { 
    color: '#D1D5DB' 
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  darkInputWrapper: { 
    borderColor: '#4B5563', 
    backgroundColor: '#1F2937' 
  },
  input: { 
    flex: 1, 
    fontSize: 16, 
    fontFamily: 'Inter-Regular', 
    color: '#111827' 
  },
  darkInput: { 
    color: '#FFF' 
  },
  submitButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },
  submitButtonText: { 
    fontSize: 16, 
    fontFamily: 'Inter-SemiBold', 
    color: '#FFF' 
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  toggleText: { 
    fontSize: 14, 
    fontFamily: 'Inter-Regular', 
    color: '#6B7280' 
  },
  darkSecondaryText: { 
    color: '#9CA3AF' 
  },
  toggleLink: { 
    fontSize: 14, 
    fontFamily: 'Inter-SemiBold', 
    color: '#8B5CF6' 
  },
});





