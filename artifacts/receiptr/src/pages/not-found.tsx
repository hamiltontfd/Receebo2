import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";

export default function NotFound() {
  useAppLocale();
  useEffect(() => {
    document.title = "Page not found — Receebo";
    document.querySelector('meta[name="robots"]')?.setAttribute("content", "noindex, follow");
  }, []);
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">{appText("404 Page Not Found")}</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            This page may have moved, or the address may be incorrect.
          </p>
          <Link href="/" className="mt-5 inline-block font-semibold underline">Back to Receebo</Link>
        </CardContent>
      </Card>
    </div>
  );
}
