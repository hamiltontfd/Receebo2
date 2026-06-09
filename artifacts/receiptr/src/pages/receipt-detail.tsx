import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  ArrowLeft, Calendar, DollarSign, FileText, Tag, Store, 
  Loader2, Trash2, Edit2, Check, X, FileImage, AlertTriangle
} from "lucide-react";

import { 
  useGetReceipt, 
  useUpdateReceipt, 
  useDeleteReceipt,
  getGetReceiptQueryKey,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const editFormSchema = z.object({
  merchant: z.string().optional(),
  purchaseDate: z.string().optional(),
  total: z.coerce.number().optional(),
  currency: z.string().optional(),
  category: z.string().optional(),
});

type EditFormValues = z.infer<typeof editFormSchema>;

export default function ReceiptDetail() {
  const [match, params] = useRoute("/receipts/:id");
  const receiptId = match ? parseInt(params.id) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);

  const { data: receipt, isLoading, isError } = useGetReceipt(receiptId, {
    query: {
      enabled: receiptId > 0,
      queryKey: getGetReceiptQueryKey(receiptId),
      refetchInterval: (query) => {
        // Poll every 2 seconds if still processing
        return query.state.data?.status === "processing" ? 2000 : false;
      }
    }
  });

  const updateReceipt = useUpdateReceipt();
  const deleteReceipt = useDeleteReceipt();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      merchant: receipt?.merchant || "",
      purchaseDate: receipt?.purchaseDate || "",
      total: receipt?.total || undefined,
      currency: receipt?.currency || "USD",
      category: receipt?.category || "",
    },
  });

  // Update form defaults when receipt data loads
  useEffect(() => {
    if (receipt && !isEditing) {
      form.reset({
        merchant: receipt.merchant || "",
        purchaseDate: receipt.purchaseDate || "",
        total: receipt.total || undefined,
        currency: receipt.currency || "USD",
        category: receipt.category || "",
      });
    }
  }, [receipt, isEditing, form]);

  const onSubmit = async (data: EditFormValues) => {
    try {
      await updateReceipt.mutateAsync({
        id: receiptId,
        data: {
          merchant: data.merchant,
          purchaseDate: data.purchaseDate,
          total: data.total,
          currency: data.currency,
          category: data.category,
        }
      });
      
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetReceiptQueryKey(receiptId) });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      
      toast({
        title: "Receipt updated",
        description: "Your changes have been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update receipt.",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReceipt.mutateAsync({ id: receiptId });
      toast({
        title: "Receipt deleted",
        description: "The receipt has been removed from your library.",
      });
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      setLocation("/library");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete receipt.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-32" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Skeleton className="h-[600px] rounded-xl" />
            <div className="space-y-6">
              <Skeleton className="h-[300px] rounded-xl" />
              <Skeleton className="h-[200px] rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !receipt) {
    return (
      <div className="min-h-dvh bg-background p-6 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Receipt not found</h2>
        <p className="text-muted-foreground mb-6">The receipt you're looking for doesn't exist or you don't have access to it.</p>
        <Button onClick={() => setLocation("/library")}>
          Return to Library
        </Button>
      </div>
    );
  }

  const fileUrl = `${import.meta.env.BASE_URL}api/storage${receipt.objectPath}`;
  const isPdf = receipt.contentType === "application/pdf";
  
  const isProcessing = receipt.status === "processing";
  const hasFailed = receipt.status === "failed";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="h-16 border-b px-6 flex items-center justify-between bg-card shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/library">
            <Button variant="ghost" size="icon" className="w-8 h-8 -ml-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-lg truncate max-w-[200px] sm:max-w-md">
              {receipt.merchant || receipt.originalFileName}
            </h1>
            {isProcessing && (
              <Badge variant="secondary" className="bg-secondary/50 font-medium">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processing
              </Badge>
            )}
            {hasFailed && (
              <Badge variant="destructive" className="font-medium">
                Extraction Failed
              </Badge>
            )}
            {receipt.status === 'completed' && (
              <Badge variant="outline" className="border-primary/20 text-primary bg-primary/5 font-medium">
                <Check className="w-3 h-3 mr-1" /> Processed
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!isProcessing && !isEditing && (
            <Button variant="outline" size="sm" onClick={() => {
              form.reset({
                merchant: receipt.merchant || "",
                purchaseDate: receipt.purchaseDate || "",
                total: receipt.total || undefined,
                currency: receipt.currency || "USD",
                category: receipt.category || "",
              });
              setIsEditing(true);
            }}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20">
                <Trash2 className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The receipt and all extracted data will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
          
          {/* File Viewer */}
          <div className="flex flex-col gap-4">
            <Card className="flex-1 min-h-[600px] overflow-hidden flex flex-col border-muted-foreground/20 shadow-sm">
              <div className="bg-muted/30 border-b p-3 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  {isPdf ? <FileText className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
                  {receipt.originalFileName}
                </span>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
                  Open Original
                </a>
              </div>
              <div className="flex-1 bg-muted/10 relative">
                {isPdf ? (
                  <iframe 
                    src={`${fileUrl}#toolbar=0`} 
                    className="absolute inset-0 w-full h-full border-0" 
                    title={receipt.originalFileName}
                  />
                ) : (
                  <div className="absolute inset-0 p-4 flex items-center justify-center overflow-auto">
                    <img 
                      src={fileUrl} 
                      alt={receipt.originalFileName} 
                      className="max-w-full max-h-full object-contain rounded shadow-sm border"
                    />
                  </div>
                )}
              </div>
            </Card>
            
            {/* OCR Text Accordion could go here if we wanted to show raw text */}
            {receipt.ocrText && (
              <Card className="border-muted-foreground/20 shadow-sm">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-medium">Raw Text (OCR)</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <ScrollArea className="h-40 w-full rounded border bg-muted/30 p-4">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                      {receipt.ocrText}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Data Panel */}
          <div className="flex flex-col gap-6">
            
            {/* Details Card */}
            <Card className="border-muted-foreground/20 shadow-sm flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Receipt Details</CardTitle>
                {isProcessing && (
                  <CardDescription className="flex items-center gap-2 text-primary mt-2">
                    <Loader2 className="w-3 h-3 animate-spin" /> AI is extracting details...
                  </CardDescription>
                )}
                {hasFailed && (
                  <CardDescription className="text-destructive mt-2">
                    Automatic extraction failed. You can enter details manually.
                  </CardDescription>
                )}
              </CardHeader>
              
              <CardContent className="flex-1">
                {isEditing ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="merchant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Merchant</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g. Apple Store" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="purchaseDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="category"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Category</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="e.g. Electronics" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="total"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Total</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input type="number" step="0.01" className="pl-9" {...field} value={field.value ?? ""} />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Currency</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="USD" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <div className="flex items-center gap-2 pt-4">
                        <Button type="submit" className="flex-1" disabled={updateReceipt.isPending}>
                          {updateReceipt.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Save Changes
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={updateReceipt.isPending}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Store className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-muted-foreground">Merchant</p>
                        <p className="text-lg font-semibold truncate">
                          {receipt.merchant || <span className="text-muted-foreground italic text-sm">Unknown</span>}
                        </p>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="grid grid-cols-2 gap-6">
                      <div className="flex items-start gap-3">
                        <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Date</p>
                          <p className="font-medium">
                            {receipt.purchaseDate 
                              ? format(new Date(receipt.purchaseDate), 'MMMM d, yyyy') 
                              : <span className="text-muted-foreground italic text-sm">Unknown</span>}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-start gap-3">
                        <Tag className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Category</p>
                          <p className="font-medium capitalize">
                            {receipt.category || <span className="text-muted-foreground italic text-sm">None</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="bg-secondary/30 p-4 rounded-lg flex items-center justify-between">
                      <span className="font-medium text-muted-foreground">Total</span>
                      <span className="text-2xl font-bold font-mono">
                        {receipt.total != null 
                          ? `${receipt.currency === 'USD' ? '$' : receipt.currency || ''}${receipt.total.toFixed(2)}` 
                          : '--'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Summary */}
            {receipt.summary && (
              <Card className="bg-primary/5 border-primary/10 shadow-sm">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                    AI Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm leading-relaxed">
                  {receipt.summary}
                </CardContent>
              </Card>
            )}

            {/* Line Items */}
            {receipt.products && receipt.products.length > 0 && (
              <Card className="border-muted-foreground/20 shadow-sm">
                <CardHeader className="py-4 border-b bg-muted/10">
                  <CardTitle className="text-sm font-medium">Line Items</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y">
                    {receipt.products.map((product, i) => (
                      <li key={i} className="p-4 flex items-start justify-between gap-4 text-sm">
                        <div className="flex-1">
                          <p className="font-medium">{product.name}</p>
                          {product.quantity && product.quantity > 1 && (
                            <p className="text-muted-foreground mt-0.5">Qty: {product.quantity}</p>
                          )}
                        </div>
                        {product.price != null && (
                          <div className="font-mono font-medium shrink-0">
                            ${product.price.toFixed(2)}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}