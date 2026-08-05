import React from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useGetReceipt } from '@workspace/api-client-react';
import { useAuth } from '@clerk/clerk-expo';
import { Image } from 'expo-image';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ''}`;

function objectUrl(objectPath: string): string {
  // objectPath is like "/objects/uploads/uuid"
  // API endpoint: /api/storage/objects/{path} where path = "uploads/uuid"
  const stripped = objectPath.replace(/^\/objects\//, '');
  return `${BASE_URL}/api/storage/objects/${stripped}`;
}

function formatAmount(total: number | null | undefined, currency: string | null | undefined): string {
  if (total == null) return '';
  const sym = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  return `${sym}${total.toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function Badge({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.badge, { backgroundColor: colors.muted, borderRadius: colors.radius / 2 }]}>
      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>{title}</Text>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function ReceiptDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const numericId = Number(id);
  const { data: receipt, isLoading, isError } = useGetReceipt(numericId);

  const [token, setToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    void getToken().then((t) => setToken(t ?? null));
  }, [getToken]);

  const bottomPad = isWeb ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  if (isError || !receipt) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          Receipt not found
        </Text>
      </View>
    );
  }

  const r = receipt as {
    id: number;
    objectPath: string;
    originalFileName: string;
    contentType: string;
    status: string;
    isDraft?: boolean;
    merchant?: string | null;
    purchaseDate?: string | null;
    total?: number | null;
    currency?: string | null;
    category?: string | null;
    warranty?: string | null;
    summary?: string | null;
    transactionNumber?: string | null;
    purchaseCountry?: string | null;
    isOnlinePurchase?: boolean | null;
    products?: Array<{ name: string; quantity?: number | null; price?: number | null }>;
    notableItems?: Array<{ name: string; price?: number | null; category?: string | null; reason: string }>;
    createdAt: string;
  };

  const isImage = r.contentType?.startsWith('image/');
  const imgUrl = objectUrl(r.objectPath);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingBottom: bottomPad + 24 }]}
    >
      {/* Receipt image */}
      {isImage && token ? (
        <View style={[styles.imageWrapper, { borderRadius: colors.radius, borderColor: colors.border }]}>
          <Image
            source={{ uri: imgUrl, headers: { Authorization: `Bearer ${token}` } }}
            style={styles.receiptImage}
            contentFit="contain"
            transition={200}
          />
        </View>
      ) : (
        <View
          style={[
            styles.imagePlaceholder,
            { backgroundColor: colors.muted, borderRadius: colors.radius },
          ]}
        >
          <Feather name="file-text" size={40} color={colors.mutedForeground} />
          <Text style={[styles.imagePlaceholderText, { color: colors.mutedForeground }]}>
            {r.originalFileName}
          </Text>
        </View>
      )}

      {/* Status + category */}
      <View style={styles.tags}>
        <Badge label={r.status} />
        {r.category ? <Badge label={r.category} /> : null}
        {r.isOnlinePurchase ? <Badge label="Online" /> : null}
      </View>

      {/* Main merchant + amount */}
      <View style={styles.hero}>
        <Text style={[styles.heroMerchant, { color: colors.foreground }]}>
          {r.merchant ?? r.originalFileName}
        </Text>
        {r.total != null && (
          <Text style={[styles.heroAmount, { color: colors.foreground }]}>
            {formatAmount(r.total, r.currency)}
          </Text>
        )}
      </View>

      {/* Summary */}
      {r.summary ? (
        <Text style={[styles.summary, { color: colors.mutedForeground }]}>
          {r.summary}
        </Text>
      ) : null}

      {/* Details */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
        {r.purchaseDate ? <DetailRow label="Date" value={formatDate(r.purchaseDate)} /> : null}
        {r.currency ? <DetailRow label="Currency" value={r.currency} /> : null}
        {r.purchaseCountry ? <DetailRow label="Country" value={r.purchaseCountry} /> : null}
        {r.transactionNumber ? <DetailRow label="Transaction #" value={r.transactionNumber} /> : null}
        <DetailRow label="Added" value={formatDate(r.createdAt)} />
      </View>

      {/* Warranty */}
      {r.warranty ? (
        <View style={[styles.warrantyCard, { backgroundColor: colors.muted, borderRadius: colors.radius }]}>
          <View style={styles.warrantyHeader}>
            <Feather name="shield" size={14} color={colors.foreground} />
            <Text style={[styles.warrantyTitle, { color: colors.foreground }]}>Warranty & Returns</Text>
          </View>
          <Text style={[styles.warrantyText, { color: colors.mutedForeground }]}>
            {r.warranty}
          </Text>
        </View>
      ) : null}

      {/* Products */}
      {r.products && r.products.length > 0 ? (
        <>
          <SectionHeader title="ITEMS" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
            {r.products.map((p, i) => (
              <View
                key={i}
                style={[
                  styles.productRow,
                  i < r.products!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>
                  {p.quantity != null && p.quantity !== 1 ? `${p.quantity}× ` : ''}{p.name}
                </Text>
                {p.price != null ? (
                  <Text style={[styles.productPrice, { color: colors.mutedForeground }]}>
                    {formatAmount(p.price, r.currency)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </>
      ) : null}

      {/* Notable items */}
      {r.notableItems && r.notableItems.length > 0 ? (
        <>
          <SectionHeader title="NOTABLE ITEMS" />
          {r.notableItems.map((item, i) => (
            <View
              key={i}
              style={[styles.notableCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}
            >
              <View style={styles.notableHeader}>
                <Text style={[styles.notableName, { color: colors.foreground }]}>{item.name}</Text>
                {item.price != null && (
                  <Text style={[styles.notablePrice, { color: colors.foreground }]}>
                    {formatAmount(item.price, r.currency)}
                  </Text>
                )}
              </View>
              <Text style={[styles.notableReason, { color: colors.mutedForeground }]}>
                {item.reason}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  container: {
    padding: 16,
    gap: 12,
  },
  imageWrapper: {
    borderWidth: 1,
    overflow: 'hidden',
    aspectRatio: 3 / 4,
    maxHeight: 320,
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imagePlaceholderText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  hero: {
    gap: 4,
    marginTop: 4,
  },
  heroMerchant: {
    fontSize: 24,
    fontWeight: '700' as const,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.3,
  },
  heroAmount: {
    fontSize: 20,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  summary: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
    maxWidth: '60%',
    textAlign: 'right',
  },
  warrantyCard: {
    padding: 14,
    gap: 8,
  },
  warrantyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warrantyTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
  },
  warrantyText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  productRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingRight: 12,
  },
  productPrice: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    fontWeight: '500' as const,
  },
  notableCard: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  notableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notableName: {
    fontSize: 14,
    fontWeight: '600' as const,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  notablePrice: {
    fontSize: 13,
    fontWeight: '500' as const,
    fontFamily: 'Inter_500Medium',
  },
  notableReason: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
  },
});
