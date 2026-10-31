import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";
export default function OfflineStartup() {
  useAppLocale();
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{appText("Receebo is offline")}</h1>
        <p>{appText("Connect to the internet to sign in and use Receebo. Receipts, receipt images, uploads, edits, and AI processing are not available offline.")}</p>
        <p className="text-sm text-muted-foreground">{appText("Nothing is queued or saved offline. Once connected, reload to continue.")}</p>
        <button className="min-h-11 rounded-lg bg-primary text-primary-foreground px-5"
          onClick={() => window.location.reload()}>{appText("Try again")}</button>
      </div>
    </main>
  );
}
