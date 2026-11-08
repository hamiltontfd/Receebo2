import { useEffect, useRef, useState } from "react";
import { Clock, Info, RotateCcw, Scale, Shield } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { appText } from "@/lib/appCopy";
import {
  deriveConsumerRights,
  isProvisionalLegalEstimate,
  merchantSuggestsOnline,
  showDeliveryDateField,
  unknownChannelRetailerNote,
  usRightsCopy,
} from "@/lib/consumerRights";
import { formatLocaleDate, useAppLocale } from "@/lib/locale";
import { hasNoConsumerDates } from "@/lib/purchaseType";
import { useAccountRegion } from "@/lib/region";

/** Fields the scan review, the receipt page and the search sheet all pass through. */
export type RightsReceipt = {
  purchaseDate?: string | null;
  deliveryDate?: string | null;
  category?: string | null;
  currency?: string | null;
  purchaseCountry?: string | null;
  isOnlinePurchase?: boolean | null;
  merchant?: string | null;
  warranty?: string | null;
  purchaseType?: string | null;
  returnDays?: number | null;
  notableItems?: ReadonlyArray<{ name?: string | null }> | null;
  products?: ReadonlyArray<{ name?: string | null }> | null;
};

function countryHeading(label: string | null, locale: string): string {
  if (locale !== "en" && label === "Brazil") return "Brasil";
  return label ?? "";
}

/**
 * Legal paragraphs sit in one control: hover and keyboard focus open it,
 * a tap toggles it, and Escape or a press outside closes it. The overlay
 * stays inside the viewport and scrolls when the text is long.
 */
function WarrantyInfo({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const pointerKind = useRef("");
  const suppressFocusOpen = useRef(false);
  const cancelClose = () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  const closeFromEscape = () => {
    // Closing returns focus to this button. That focus is not a new request to open.
    suppressFocusOpen.current = true;
    cancelClose();
    setOpen(false);
    window.setTimeout(() => {
      suppressFocusOpen.current = false;
    }, 0);
  };
  useEffect(() => cancelClose, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture on window runs before the sheet's document listener, so Escape
      // dismisses this overlay and leaves the purchase detail open.
      event.preventDefault();
      event.stopPropagation();
      closeFromEscape();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="button-rights-info"
          aria-label={appText("About this warranty")}
          className="shrink-0 rounded-full p-0.5 opacity-80 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onPointerDown={(event) => {
            pointerKind.current = event.pointerType;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") scheduleClose();
          }}
          onFocus={() => {
            if (suppressFocusOpen.current) return;
            // A tap focuses before it clicks. Leave that click to toggle.
            if (pointerKind.current === "touch" || pointerKind.current === "pen") return;
            setOpen(true);
          }}
          onClick={(event) => {
            const pointer = event.nativeEvent instanceof PointerEvent
              ? event.nativeEvent.pointerType
              : pointerKind.current;
            // Touch toggles. A mouse or keyboard click only stays open if hover
            // or focus already opened it; otherwise the click itself opens it.
            if (pointer !== "touch" && pointer !== "pen" && open) event.preventDefault();
          }}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        data-testid="text-rights-info"
        align="end"
        side="top"
        collisionPadding={12}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          closeFromEscape();
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto p-3 text-left text-xs font-normal leading-5 text-popover-foreground"
      >
        <ul className="space-y-2">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One rights panel for the moment of capture and for later consultation.
 * Channel, delivery and warranty facts come only from the receipt fields.
 */
export function ConsumerRightsPanel({
  receipt,
  onChooseChannel,
}: {
  receipt: RightsReceipt;
  /** Confirm or correct online / in store. Null clears the choice. */
  onChooseChannel?: (online: boolean | null) => void;
}) {
  const locale = useAppLocale();
  const { region, ready } = useAccountRegion();
  if (!ready) return null;

  const noDates = hasNoConsumerDates(receipt.purchaseType);
  const rights = deriveConsumerRights({
    purchaseDate: receipt.purchaseDate,
    deliveryDate: receipt.deliveryDate,
    category: receipt.category,
    currency: receipt.currency,
    purchaseCountry: receipt.purchaseCountry,
    isOnlinePurchase: receipt.isOnlinePurchase,
    merchant: receipt.merchant,
    warrantyText: receipt.warranty,
    purchaseType: receipt.purchaseType,
    locale,
    region,
    returnDays: receipt.returnDays,
    itemNames: [...(receipt.notableItems ?? []), ...(receipt.products ?? [])].map((item) => item.name),
  });
  const askChannel = receipt.isOnlinePurchase == null && !noDates && !!receipt.purchaseDate;
  if (!rights.hasAny && !askChannel) return null;

  const amazon = merchantSuggestsOnline(receipt.merchant);
  const showDelivery = showDeliveryDateField(receipt.isOnlinePurchase, receipt.merchant);
  const isUs = region === "US";
  const suppressedUnknownNote = amazon && askChannel ? unknownChannelRetailerNote(locale, receipt.merchant) : null;
  const notes = suppressedUnknownNote ? rights.notes.filter((note) => note !== suppressedUnknownNote) : rights.notes;
  const provisional = !!rights.returnWindow && isProvisionalLegalEstimate(rights.returnWindow);
  const tucked = [...(noDates ? [] : notes), rights.disclaimer].filter(
    (line, index, all): line is string => !!line && all.indexOf(line) === index,
  );
  const infoAnchor = tucked.length === 0 ? null
    : rights.manufacturerWarranty ? "manufacturer"
    : rights.warranty ? "legal"
    : rights.returnWindow ? "return"
    : "heading";
  const urgencyClass = {
    green: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    red: "bg-red-50 border-red-200 text-red-700",
    expired: "bg-muted border-border text-muted-foreground",
  } as const;

  return (
    <div data-testid="panel-consumer-rights">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Scale className="w-3.5 h-3.5" />
        {isUs
          ? usRightsCopy(locale).panelTitle
          : <>{appText("Consumer Rights")}{rights.countryLabel ? ` · ${countryHeading(rights.countryLabel, locale)}` : ""}</>}
        {infoAnchor === "heading" && <WarrantyInfo lines={tucked} />}
      </div>
      {!receipt.purchaseCountry && rights.hasAny && (
        <p className="mb-2 text-xs text-muted-foreground">
          {appText("Purchase country is unknown. This guidance may use the receipt currency or merchant as an estimate, not a confirmed country.")}
        </p>
      )}
      <div className="space-y-2">
        {askChannel && (
          <div className="rounded-xl border border-border px-4 py-3 space-y-2" data-testid={amazon ? "text-amazon-suggest" : "text-channel-ask"}>
            <p className="text-sm leading-snug">
              {amazon
                ? appText("We suggest this Amazon purchase was online. You can correct it.")
                : appText("Was this bought online or in store? The return window depends on your answer.")}
            </p>
            {onChooseChannel && (
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="button-channel-online"
                  onClick={() => onChooseChannel(receipt.isOnlinePurchase === true ? null : true)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border bg-background border-border"
                >
                  {appText("🌐 Online")}
                </button>
                <button
                  type="button"
                  data-testid="button-channel-store"
                  onClick={() => onChooseChannel(receipt.isOnlinePurchase === false ? null : false)}
                  className="flex-1 py-1.5 rounded-full text-sm font-medium border bg-background border-border"
                >
                  {appText("🏪 In-store")}
                </button>
              </div>
            )}
          </div>
        )}

        {showDelivery && !noDates && receipt.purchaseDate && !receipt.deliveryDate && (
          <p className="px-1 text-xs text-muted-foreground" data-testid="text-delivery-missing">
            {appText("Delivery not informed")}
          </p>
        )}

        {rights.returnWindow && (
          <div
            data-testid={provisional ? "card-return-provisional" : "card-return-window"}
            className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${urgencyClass[rights.returnWindow.urgency]}`}
          >
            <RotateCcw className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-tight">
                  {provisional
                    ? appText("Estimated return date: {0}", [rights.returnWindow.formattedDeadline])
                    : rights.returnWindow.isExpired
                      ? appText("Return window expired")
                      : appText("Return by {0}", [rights.returnWindow.formattedDeadline])}
                </p>
                {infoAnchor === "return" && <WarrantyInfo lines={tucked} />}
              </div>
              <p className="text-xs mt-0.5 opacity-80">
                {provisional
                  ? appText("Provisional estimate from the purchase date. Not a confirmed legal deadline. Add the delivery date to start the legal period.")
                  : <>
                      {rights.returnWindow.isExpired
                        ? appText("Expired {0} day(s) ago", [Math.abs(rights.returnWindow.daysLeft)])
                        : rights.returnWindow.daysLeft === 0
                          ? appText("Last day to return")
                          : appText("{0} day(s) left", [rights.returnWindow.daysLeft])}
                      {" · "}{rights.returnWindow.source}
                      {rights.returnWindow.startsFrom === "delivery" ? appText(" · from delivery") : ""}
                    </>}
              </p>
            </div>
          </div>
        )}

        {rights.warranty && (
          <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${rights.warranty.isExpired ? "bg-muted border-border text-muted-foreground" : "bg-violet-50 border-violet-200 text-violet-700"}`}>
            <Clock className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-tight" data-testid="text-legal-warranty">
                  {rights.warranty.isExpired
                    ? appText("{0} (expired)", [rights.warranty.label])
                    : rights.warranty.label}
                </p>
                {infoAnchor === "legal" && <WarrantyInfo lines={tucked} />}
              </div>
              <p className="text-xs mt-0.5 opacity-80">
                {rights.warranty.kind === "complaint_deadline"
                  ? rights.warranty.isExpired
                    ? appText("Apparent defects: deadline passed {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])
                    : appText("Apparent defects: report by {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])
                  : rights.warranty.isExpired
                    ? appText("Expired {0}", [rights.warranty.formattedExpiry])
                    : appText("Valid until {0} · {1}", [rights.warranty.formattedExpiry, rights.warranty.citation])}
              </p>
            </div>
          </div>
        )}

        {rights.manufacturerWarranty && (
          <div
            data-testid="card-manufacturer-warranty"
            className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${rights.manufacturerWarranty.isExpired ? "bg-muted border-border text-muted-foreground" : "bg-sky-50 border-sky-200 text-sky-700"}`}
          >
            <Shield className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-tight">{rights.manufacturerWarranty.label}</p>
                {infoAnchor === "manufacturer" && <WarrantyInfo lines={tucked} />}
              </div>
              <p className="text-xs mt-0.5 opacity-80">
                {rights.manufacturerWarranty.isExpired
                  ? appText("Expired {0}", [rights.manufacturerWarranty.formattedExpiry])
                  : appText("Until {0} · from the receipt", [rights.manufacturerWarranty.formattedExpiry])}
              </p>
            </div>
          </div>
        )}

        {rights.warranty && !rights.manufacturerWarranty && (
          <div data-testid="card-manufacturer-unconfirmed" className="rounded-xl border border-border px-4 py-3">
            <p className="text-sm font-semibold leading-tight">{appText("Manufacturer warranty not confirmed on the receipt")}</p>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {appText("No length is shown until the receipt states one. It is not added to the legal period.")}
            </p>
          </div>
        )}

        {noDates && notes.length > 0 && (
          <ul className="space-y-1 px-1 text-xs leading-5 text-muted-foreground" data-testid="list-rights-notes">
            {notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
