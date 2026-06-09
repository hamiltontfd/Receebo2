import { useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { format } from "date-fns";
import { Search, Plus, FileText, ArrowRight, Loader2, Filter, LogOut, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ObjectUploader } from "@workspace/object-storage-web";
import { useToast } from "@/hooks/use-toast";

import { 
  useListReceipts, 
  useGetReceiptStats, 
  useGetRecentReceipts, 
  useCreateReceipt,
  getListReceiptsQueryKey,
  getGetReceiptStatsQueryKey,
  getGetRecentReceiptsQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Library() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  
  // Debounce search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    // Simple debounce implementation
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(e.target.value);
    }, 500);
    return () => clearTimeout(timeoutId);
  };

  const { data: stats, isLoading: statsLoading } = useGetReceiptStats();
  const { data: receipts, isLoading: receiptsLoading } = useListReceipts({ q: debouncedQuery || undefined });
  const { data: recent, isLoading: recentLoading } = useGetRecentReceipts({ limit: 5 });
  
  const createReceipt = useCreateReceipt();

  const handleUploadComplete = useCallback((result: any) => {
    if (result.successful && result.successful.length > 0) {
      toast({
        title: "Upload complete",
        description: `Processing ${result.successful.length} file(s)...`,
      });
      
      // Invalidate queries to show the new processing receipts
      queryClient.invalidateQueries({ queryKey: getListReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentReceiptsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetReceiptStatsQueryKey() });
    }
  }, [queryClient, toast]);

  return (
    <div className="min-h-dvh bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r bg-sidebar flex-shrink-0 flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono">
            R
          </div>
          <span className="font-bold tracking-tight">Receiptr</span>
        </div>
        
        <div className="p-4 flex-1">
          <ObjectUploader
            onGetUploadParameters={async (file) => {
              const res = await fetch(`${import.meta.env.BASE_URL}api/storage/uploads/request-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: file.name,
                  size: file.size,
                  contentType: file.type || "application/octet-stream",
                }),
              });
              
              if (!res.ok) throw new Error("Failed to get upload URL");
              
              const data = await res.json();
              
              // We need to create the receipt record here so we can have the objectPath
              // Wait, the hook is asynchronous, but we need to return the URL right away.
              // Actually, the server handles it, we upload, then we create the record.
              // But Uppy doesn't let us easily hook into the post-upload for individual files to call our backend,
              // unless we do it in onComplete.
              
              // Let's store the objectPath somewhere to use in onComplete
              file.meta.objectPath = data.objectPath;
              
              return {
                method: "PUT",
                url: data.uploadURL,
                headers: { "Content-Type": file.type || "application/octet-stream" },
              };
            }}
            onComplete={async (result) => {
              if (result.successful) {
                for (const file of result.successful) {
                  await createReceipt.mutateAsync({
                    data: {
                      objectPath: file.meta.objectPath as string,
                      originalFileName: file.name,
                      contentType: file.type || "application/octet-stream"
                    }
                  });
                }
                handleUploadComplete(result);
              }
            }}
            buttonClassName="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-4 py-2 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Receipt
          </ObjectUploader>
          
          <nav className="mt-8 space-y-1">
            <Link href="/library" className="flex items-center gap-3 px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium">
              <FileText className="w-4 h-4" />
              All Receipts
            </Link>
          </nav>
        </div>
        
        <div className="p-4 border-t mt-auto">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9 border">
              <AvatarImage src={user?.imageUrl} />
              <AvatarFallback>{user?.firstName?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-col flex flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{user?.fullName || user?.primaryEmailAddress?.emailAddress}</span>
            </div>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground" onClick={() => signOut({ redirectUrl: "/" })}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 border-b px-6 flex items-center justify-between bg-card shrink-0 gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search merchants, items, or totals..." 
              className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background"
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statsLoading ? (
                Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              ) : stats ? (
                <>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono">
                        ${stats.totalSpend?.toFixed(2) || "0.00"}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold font-mono">
                        ${stats.thisMonthSpend?.toFixed(2) || "0.00"}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Receipts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.totalReceipts || 0}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Top Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-semibold truncate capitalize">
                        {stats.topCategory || "None"}
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>
            
            {/* Receipts List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold tracking-tight">
                  {debouncedQuery ? "Search Results" : "All Receipts"}
                </h2>
              </div>
              
              {receiptsLoading ? (
                <div className="space-y-3">
                  {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
                </div>
              ) : receipts && receipts.length > 0 ? (
                <div className="space-y-3">
                  {receipts.map(receipt => (
                    <Link key={receipt.id} href={`/receipts/${receipt.id}`}>
                      <div className="group flex items-center justify-between p-4 bg-card border rounded-lg hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            receipt.status === 'processing' ? 'bg-secondary text-secondary-foreground' :
                            receipt.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                            'bg-primary/10 text-primary'
                          }`}>
                            {receipt.status === 'processing' ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : receipt.status === 'failed' ? (
                              <FileText className="w-5 h-5" />
                            ) : (
                              <FileText className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold truncate">
                              {receipt.merchant || receipt.originalFileName}
                            </span>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {receipt.purchaseDate ? (
                                <span>{format(new Date(receipt.purchaseDate), 'MMM d, yyyy')}</span>
                              ) : (
                                <span>{format(new Date(receipt.createdAt), 'MMM d, yyyy')}</span>
                              )}
                              {receipt.category && (
                                <>
                                  <span>•</span>
                                  <span className="capitalize">{receipt.category}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0">
                          {receipt.total != null && (
                            <span className="font-mono font-medium text-lg">
                              ${receipt.total.toFixed(2)}
                            </span>
                          )}
                          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 group-hover:translate-x-0" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-20 bg-card rounded-xl border border-dashed">
                  <div className="w-16 h-16 bg-secondary text-muted-foreground rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium">No receipts found</h3>
                  <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                    {debouncedQuery 
                      ? "Try a different search term or clear the search to see all." 
                      : "Upload your first receipt to get started organizing."}
                  </p>
                </div>
              )}
            </div>
            
          </div>
        </div>
      </main>
    </div>
  );
}