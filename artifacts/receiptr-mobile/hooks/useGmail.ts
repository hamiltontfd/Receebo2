import { useAuth } from '@clerk/clerk-expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface GmailStatus {
  connected: boolean;
  gmailEmail: string | null;
  lastSyncedAt: string | null;
  pendingCount: number;
}

export interface PendingImport {
  id: number;
  gmailMessageId: string;
  originalFileName: string;
  merchant: string | null;
  total: number | null;
  currency: string | null;
  purchaseDate: string | null;
  category: string | null;
  summary: string | null;
  createdAt: string;
}

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ''}`;

function useAuthFetch() {
  const { getToken } = useAuth();

  return async (path: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getToken();
    const response = await fetch(`${BASE_URL}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response;
  };
}

export function useGmailStatus() {
  const { isSignedIn } = useAuth();
  const authFetch = useAuthFetch();

  return useQuery<GmailStatus>({
    queryKey: ['gmail-status'],
    queryFn: async () => {
      const res = await authFetch('/gmail/status');
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function usePendingImports() {
  const { isSignedIn } = useAuth();
  const authFetch = useAuthFetch();

  return useQuery<PendingImport[]>({
    queryKey: ['pending-imports'],
    queryFn: async () => {
      const res = await authFetch('/gmail/pending');
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 10_000,
  });
}

export function useApproveImport() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authFetch(`/gmail/pending/${id}/approve`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-imports'] });
      void qc.invalidateQueries({ queryKey: ['gmail-status'] });
      void qc.invalidateQueries({ queryKey: ['/api/receipts'] });
    },
  });
}

export function useDismissImport() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await authFetch(`/gmail/pending/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-imports'] });
      void qc.invalidateQueries({ queryKey: ['gmail-status'] });
    },
  });
}

export function useDisconnectGmail() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await authFetch('/gmail/disconnect', { method: 'DELETE' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-status'] });
      void qc.invalidateQueries({ queryKey: ['pending-imports'] });
    },
  });
}

export function useSyncGmail() {
  const authFetch = useAuthFetch();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await authFetch('/gmail/sync', { method: 'POST' });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gmail-status'] });
      void qc.invalidateQueries({ queryKey: ['pending-imports'] });
    },
  });
}

export function useGmailConnectUrl() {
  const authFetch = useAuthFetch();

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const res = await authFetch('/gmail/connect-url');
      const data: { url: string } = await res.json();
      return data.url;
    },
  });
}
