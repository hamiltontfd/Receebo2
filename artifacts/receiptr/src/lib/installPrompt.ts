/**
 * Compact "install Receebo" bar: show rules, the 30-day dismissal and the
 * per-browser steps. Rendered only inside the signed-in app (ProtectedShell),
 * never on the landing or marketing capture harness.
 */
import type { AppLocale } from "./locale";

export const INSTALL_DISMISS_KEY = "receebo:installBarDismissedAt";
export const INSTALL_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export interface InstallBarInputs {
  signedIn: boolean;
  receiptCount: number;
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
  /** A native prompt is available, or this is a phone/tablet with manual steps. */
  canInstall: boolean;
}

export function isRecentlyDismissed(dismissedAt: number | null, now: number) {
  return dismissedAt !== null && now >= dismissedAt && now - dismissedAt < INSTALL_DISMISS_MS;
}

export function shouldShowInstallBar(input: InstallBarInputs) {
  return input.signedIn && input.receiptCount > 0 && !input.standalone && input.canInstall &&
    !isRecentlyDismissed(input.dismissedAt, input.now);
}

export function readDismissedAt(storage: Pick<Storage, "getItem"> | null = safeStorage()): number | null {
  try {
    const value = Number(storage?.getItem(INSTALL_DISMISS_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveDismissedAt(now = Date.now(), storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try { storage?.setItem(INSTALL_DISMISS_KEY, String(now)); } catch { /* storage unavailable */ }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export type InstallPlatform = "ios-safari" | "ios-other" | "other";

export function isMobileDevice(ua = navigator.userAgent) {
  return /Android|iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function installPlatform(ua = navigator.userAgent): InstallPlatform {
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return "other";
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram/.test(ua) || !/Safari/.test(ua) ? "ios-other" : "ios-safari";
}

type Copy = {
  bar: string; install: string; dismiss: string; title: string; close: string;
  steps: Record<InstallPlatform, string[]>;
};

export const INSTALL_COPY: Record<AppLocale, Copy> = {
  en: {
    bar: "Install Receebo on your phone",
    install: "Install",
    dismiss: "Dismiss",
    title: "Install Receebo",
    close: "Close",
    steps: {
      "ios-safari": ["Tap the Share icon {share} in Safari’s toolbar.", "Choose Add to Home Screen.", "Tap Add."],
      "ios-other": ["Open this page in Safari (installing works from Safari).", "Tap the Share icon {share}, then Add to Home Screen.", "Tap Add."],
      other: ["Open your browser menu (⋮).", "Choose Install app or Add to Home screen.", "Confirm."],
    },
  },
  "pt-BR": {
    bar: "Instale o Receebo no seu celular",
    install: "Instalar",
    dismiss: "Dispensar",
    title: "Instalar o Receebo",
    close: "Fechar",
    steps: {
      "ios-safari": ["Toque no ícone Compartilhar {share} na barra do Safari.", "Escolha Adicionar à Tela de Início.", "Toque em Adicionar."],
      "ios-other": ["Abra esta página no Safari (a instalação funciona pelo Safari).", "Toque em Compartilhar {share} e depois em Adicionar à Tela de Início.", "Toque em Adicionar."],
      other: ["Abra o menu do navegador (⋮).", "Escolha Instalar app ou Adicionar à tela inicial.", "Confirme."],
    },
  },
  "pt-PT": {
    bar: "Instale o Receebo no seu telemóvel",
    install: "Instalar",
    dismiss: "Dispensar",
    title: "Instalar o Receebo",
    close: "Fechar",
    steps: {
      "ios-safari": ["Toque no ícone Partilhar {share} na barra do Safari.", "Escolha Adicionar ao ecrã principal.", "Toque em Adicionar."],
      "ios-other": ["Abra esta página no Safari (a instalação funciona a partir do Safari).", "Toque em Partilhar {share} e depois em Adicionar ao ecrã principal.", "Toque em Adicionar."],
      other: ["Abra o menu do navegador (⋮).", "Escolha Instalar aplicação ou Adicionar ao ecrã principal.", "Confirme."],
    },
  },
};
