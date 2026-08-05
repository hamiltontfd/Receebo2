import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useOAuth, useSignIn } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const onGooglePress = async () => {
    setLoading(true);
    try {
      const { createdSessionId, setActive: activate } = await startOAuthFlow();
      if (createdSessionId && activate) {
        await activate({ session: createdSessionId });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign in failed';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const onEmailPress = async () => {
    if (!isLoaded || !email || !password) return;
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete' && setActive) {
        await setActive({ session: result.createdSessionId });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign in failed';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const isWeb = Platform.OS === 'web';
  const topPadding = isWeb ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header spacing */}
      <View style={{ height: topPadding + 32 }} />

      {/* Logo / wordmark */}
      <View style={styles.brand}>
        <View style={[styles.logoMark, { backgroundColor: colors.foreground, borderRadius: colors.radius }]}>
          <Feather name="file-text" size={24} color={colors.background} />
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>Receebo</Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Your receipts, wherever you are.
        </Text>
      </View>

      <View style={styles.actions}>
        {/* Google sign-in */}
        <Pressable
          style={({ pressed }) => [
            styles.googleBtn,
            {
              backgroundColor: pressed ? colors.secondary : colors.background,
              borderColor: colors.border,
              borderRadius: colors.radius,
              opacity: loading ? 0.6 : 1,
            },
          ]}
          onPress={onGooglePress}
          disabled={loading}
        >
          {loading && !showEmail ? (
            <ActivityIndicator size="small" color={colors.foreground} />
          ) : (
            <>
              <GoogleIcon />
              <Text style={[styles.googleBtnText, { color: colors.foreground }]}>
                Continue with Google
              </Text>
            </>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Email sign-in toggle */}
        {!showEmail ? (
          <Pressable
            style={({ pressed }) => [
              styles.emailToggle,
              {
                borderColor: colors.border,
                borderRadius: colors.radius,
                backgroundColor: pressed ? colors.secondary : 'transparent',
              },
            ]}
            onPress={() => setShowEmail(true)}
          >
            <Text style={[styles.emailToggleText, { color: colors.foreground }]}>
              Sign in with email
            </Text>
          </Pressable>
        ) : (
          <View style={styles.emailForm}>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  color: colors.foreground,
                },
              ]}
              placeholder="Email address"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.secondary,
                  borderColor: colors.border,
                  borderRadius: colors.radius,
                  color: colors.foreground,
                },
              ]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                {
                  backgroundColor: pressed ? '#333' : colors.foreground,
                  borderRadius: colors.radius,
                  opacity: loading ? 0.6 : 1,
                },
              ]}
              onPress={onEmailPress}
              disabled={loading || !email || !password}
            >
              {loading && showEmail ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
                  Sign in
                </Text>
              )}
            </Pressable>
            <Pressable onPress={() => setShowEmail(false)}>
              <Text style={[styles.backLink, { color: colors.mutedForeground }]}>
                ← Back
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={{ height: isWeb ? 34 : insets.bottom + 16 }} />
    </View>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIcon}>
      <Text style={{ fontSize: 16, fontWeight: 'bold' as const }}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  brand: {
    alignItems: 'center',
    gap: 12,
  },
  logoMark: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    fontFamily: 'Inter_700Bold',
  },
  tagline: {
    fontSize: 15,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  actions: {
    gap: 12,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 1,
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  googleIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  emailToggle: {
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
  },
  emailToggleText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  emailForm: {
    gap: 10,
  },
  input: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    borderWidth: 1,
  },
  submitBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  backLink: {
    textAlign: 'center',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
});
