import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType } from "./custom-fetch";
import { getGetReceiptQueryKey } from "./generated/api";
import type { ReceiptAttachment } from "./generated/api.schemas";

export type { ReceiptAttachment };

export interface CreateAttachmentInput {
  objectPath: string;
  originalFileName: string;
  contentType: string;
}

export const createAttachment = async (
  receiptId: number,
  data: CreateAttachmentInput,
  options?: RequestInit,
): Promise<ReceiptAttachment> => {
  return customFetch<ReceiptAttachment>(`/api/receipts/${receiptId}/attachments`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    body: JSON.stringify(data),
  });
};

export const deleteAttachment = async (
  receiptId: number,
  attachmentId: number,
  options?: RequestInit,
): Promise<void> => {
  return customFetch<void>(`/api/receipts/${receiptId}/attachments/${attachmentId}`, {
    ...options,
    method: "DELETE",
  });
};

type UseCreateAttachmentOptions = UseMutationOptions<
  ReceiptAttachment,
  ErrorType<unknown>,
  { receiptId: number; data: CreateAttachmentInput }
>;

export function useCreateAttachment(
  options?: UseCreateAttachmentOptions,
): UseMutationResult<
  ReceiptAttachment,
  ErrorType<unknown>,
  { receiptId: number; data: CreateAttachmentInput }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, data }) => createAttachment(receiptId, data),
    onSuccess: (_, { receiptId }) => {
      void queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
    },
    ...options,
  });
}

type UseDeleteAttachmentOptions = UseMutationOptions<
  void,
  ErrorType<unknown>,
  { receiptId: number; attachmentId: number }
>;

export function useDeleteAttachment(
  options?: UseDeleteAttachmentOptions,
): UseMutationResult<void, ErrorType<unknown>, { receiptId: number; attachmentId: number }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ receiptId, attachmentId }) => deleteAttachment(receiptId, attachmentId),
    onSuccess: (_, { receiptId }) => {
      void queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
    },
    ...options,
  });
}
