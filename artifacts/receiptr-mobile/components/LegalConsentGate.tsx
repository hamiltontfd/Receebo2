import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface AcceptanceStatus {
  accepted: boolean;
  termsVersion: string;
  privacyVersion: string;
}

const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
const apiBase = `https://${domain}/api`;
const webBase = `https://${domain}/receiptr`;

export function LegalConsentGate({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<AcceptanceStatus | null>(null);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getToken();
    return fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, [getToken]);

  const loadStatus = useCallback(async () => {
    setError(null);
    try {
      const response = await request('/legal/acceptance');
      if (!response.ok) throw new Error('Could not load legal status');
      setStatus((await response.json()) as AcceptanceStatus);
    } catch {
      setError("We couldn't verify your legal acceptance. Please try again.");
    }
  }, [request]);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadStatus();
    if (isLoaded && !isSignedIn) {
      setStatus(null);
      setConfirmedAge(false);
    }
  }, [isLoaded, isSignedIn, loadStatus]);

  const accept = async () => {
    if (!status || !confirmedAge) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await request('/legal/acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          termsVersion: status.termsVersion,
          privacyVersion: status.privacyVersion,
          confirmedAge: true,
        }),
      });
      if (!response.ok) throw new Error('Acceptance failed');
      setStatus({ ...status, accepted: true });
    } catch {
      setError("We couldn't save your acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded || !isSignedIn || status?.accepted) return <>{children}</>;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.foreground }]}>
        <Feather name="shield" size={22} color={colors.background} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>Before you continue</Text>
      <Text style={[styles.body, { color: colors.mutedForeground }]}>
        Please review Receebo’s legal terms. Inbox access and notifications remain optional
        and can be controlled separately in Settings.
      </Text>

      {!status && !error ? (
        <ActivityIndicator style={styles.loader} color={colors.foreground} />
      ) : null}

      {status ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmedAge }}
            onPress={() => setConfirmedAge((value) => !value)}
            style={[styles.consent, { borderColor: colors.border }]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: colors.foreground,
                  backgroundColor: confirmedAge ? colors.foreground : colors.background,
                },
              ]}
            >
              {confirmedAge ? (
                <Feather name="check" size={14} color={colors.background} />
              ) : null}
            </View>
            <Text style={[styles.consentText, { color: colors.foreground }]}>
              I confirm that I am at least 18 years old and agree to the legal documents below.
            </Text>
          </Pressable>

          <View style={styles.links}>
            <Pressable onPress={() => void Linking.openURL(`${webBase}/terms`)}>
              <Text style={[styles.link, { color: colors.foreground }]}>Terms of Service</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openURL(`${webBase}/privacy`)}>
              <Text style={[styles.link, { color: colors.foreground }]}>Privacy Policy</Text>
            </Pressable>
          </View>

          <Pressable
            disabled={!confirmedAge || submitting}
            onPress={() => void accept()}
            style={[
              styles.button,
              {
                backgroundColor: colors.foreground,
                opacity: !confirmedAge || submitting ? 0.45 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.buttonText, { color: colors.background }]}>
                Agree and continue
              </Text>
            )}
          </Pressable>
        </>
      ) : null}

      {error ? (
        <View style={[styles.error, { borderColor: colors.destructive }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          <Pressable onPress={() => void loadStatus()}>
            <Text style={[styles.retry, { color: colors.foreground }]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    marginBottom: 10,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
  },
  loader: { marginTop: 32 },
  consent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 28,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  links: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 16,
  },
  link: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  button: {
    alignItems: 'center',
    borderRadius: 24,
    paddingVertical: 14,
    marginTop: 24,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  error: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 24,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
  },
  retry: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    marginTop: 10,
    textDecorationLine: 'underline',
  },
});