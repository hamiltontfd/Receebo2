import { appText } from "@/lib/appCopy";
import { useAppLocale } from "@/lib/locale";

export function CloseLabel() {
  useAppLocale();
  return <span className="sr-only">{appText("Close")}</span>;
}
