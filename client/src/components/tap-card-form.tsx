import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CreditCard } from "lucide-react";

type TapPaymentConfig = {
  configured: boolean;
  embeddedCardEnabled: boolean;
  hostedRedirectEnabled: boolean;
  publicKey: string | null;
  merchantId: string | null;
  sdkScriptUrl: string;
  saveCardEnabled: boolean;
  supportedBrands: string[];
  locale: "en" | "ar";
  customer: {
    tapCustomerId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    phone: {
      countryCode: string;
      number: string;
    } | null;
  };
};

type TapTokenResponse = {
  id: string;
  card?: {
    brand?: string;
    last_four?: string;
  };
};

type SubmitPayload = {
  tapTokenId?: string;
  saveCardForFuture?: boolean;
};

type TapCardFormProps = {
  amount: number;
  currency: string;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (payload: SubmitPayload) => void;
  testId?: string;
};

type TapCardRenderInstance = {
  unmount?: () => void;
};

type TapCardSdkGlobal = {
  renderTapCard: (containerId: string, config: Record<string, unknown>) => TapCardRenderInstance;
  tokenize: () => void;
  Theme: Record<string, string>;
  Currencies: Record<string, string>;
  Direction: Record<string, string>;
  Edges: Record<string, string>;
  Locale: Record<string, string>;
};

declare global {
  interface Window {
    CardSDK?: TapCardSdkGlobal;
    __tapCardSdkPromise__?: Promise<void>;
  }
}

function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

async function loadTapCardSdk(scriptUrl: string) {
  if (typeof window === "undefined") {
    throw new Error("Tap card SDK is only available in the browser.");
  }

  if (window.CardSDK) {
    return;
  }

  if (window.__tapCardSdkPromise__) {
    return window.__tapCardSdkPromise__;
  }

  window.__tapCardSdkPromise__ = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptUrl}"]`);
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Tap card SDK.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Tap card SDK."));
    document.head.appendChild(script);
  });

  return window.__tapCardSdkPromise__;
}

function getTapErrorMessage(error: unknown): string {
  if (!error) {
    return "The payment form could not be initialized.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const candidate = error as { message?: string; error?: string; errors?: Array<{ description?: string }> };
    return (
      candidate.message ||
      candidate.error ||
      candidate.errors?.[0]?.description ||
      "The payment form could not be initialized."
    );
  }

  return "The payment form could not be initialized.";
}

export function TapCardForm({
  amount,
  currency,
  submitLabel,
  pending = false,
  onSubmit,
  testId,
}: TapCardFormProps) {
  const { data: tapConfig, isLoading: isLoadingConfig } = useQuery<TapPaymentConfig>({
    queryKey: ["/api/client/payments/tap/config"],
    queryFn: async () => {
      const response = await fetch("/api/client/payments/tap/config", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load Tap payment configuration.");
      }
      return readJson<TapPaymentConfig>(response);
    },
    staleTime: Infinity,
  });

  const rawId = useId();
  const containerId = `tap-card-${rawId.replace(/:/g, "")}`;
  const renderInstanceRef = useRef<TapCardRenderInstance | null>(null);
  const tokenizePromiseRef = useRef<{
    resolve: (payload: TapTokenResponse) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [tokenizing, setTokenizing] = useState(false);
  const [saveCardForFuture, setSaveCardForFuture] = useState(false);

  useEffect(() => {
    const embeddedEnabled = Boolean(tapConfig?.embeddedCardEnabled && tapConfig.publicKey);
    if (!embeddedEnabled || !tapConfig) {
      return;
    }
    const config = tapConfig as TapPaymentConfig;

    let cancelled = false;

    async function mountCard() {
      try {
        setSdkError(null);
        setSdkReady(false);

        await loadTapCardSdk(config.sdkScriptUrl);
        if (cancelled) {
          return;
        }

        const sdk = window.CardSDK;
        if (!sdk?.renderTapCard) {
          throw new Error("Tap card SDK is not available.");
        }

        renderInstanceRef.current?.unmount?.();

        const locale = config.locale === "ar" ? sdk.Locale.AR : sdk.Locale.EN;
        const theme = document.documentElement.classList.contains("dark")
          ? sdk.Theme.DARK
          : sdk.Theme.LIGHT;
        const direction = config.locale === "ar" ? sdk.Direction.RTL : sdk.Direction.LTR;
        const normalizedCurrency = sdk.Currencies[currency.toUpperCase()] || currency.toUpperCase();

        renderInstanceRef.current = sdk.renderTapCard(containerId, {
          publicKey: config.publicKey,
          ...(config.merchantId ? { merchant: { id: config.merchantId } } : {}),
          transaction: {
            amount,
            currency: normalizedCurrency,
          },
          customer: {
            ...(config.customer.tapCustomerId ? { id: config.customer.tapCustomerId } : {}),
            name: [
              {
                lang: locale,
                first: config.customer.firstName,
                last: config.customer.lastName,
                middle: "",
              },
            ],
            nameOnCard: `${config.customer.firstName} ${config.customer.lastName}`.trim(),
            editable: true,
            contact: {
              email: config.customer.email,
              ...(config.customer.phone
                ? {
                    phone: {
                      countryCode: config.customer.phone.countryCode,
                      number: config.customer.phone.number,
                    },
                  }
                : {}),
            },
          },
          acceptance: {
            supportedBrands: config.supportedBrands,
            supportedCards: "ALL",
          },
          fields: {
            cardHolder: true,
          },
          addons: {
            displayPaymentBrands: true,
            loader: true,
            saveCard: config.saveCardEnabled,
          },
          interface: {
            locale,
            theme,
            edges: sdk.Edges.CURVED,
            direction,
          },
          onReady: () => {
            if (!cancelled) {
              setSdkReady(true);
            }
          },
          onValidInput: () => {
            if (!cancelled) {
              setSdkError(null);
            }
          },
          onInvalidInput: () => undefined,
          onError: (error: unknown) => {
            const message = getTapErrorMessage(error);
            if (!cancelled) {
              setSdkError(message);
            }

            if (tokenizePromiseRef.current) {
              tokenizePromiseRef.current.reject(new Error(message));
              tokenizePromiseRef.current = null;
            }

            setTokenizing(false);
          },
          onSuccess: (token: TapTokenResponse) => {
            if (tokenizePromiseRef.current) {
              tokenizePromiseRef.current.resolve(token);
              tokenizePromiseRef.current = null;
            }

            setTokenizing(false);
          },
          onChangeSaveCardLater: (selected: boolean) => {
            if (!cancelled) {
              setSaveCardForFuture(Boolean(selected));
            }
          },
        });
      } catch (error) {
        if (!cancelled) {
          setSdkError(getTapErrorMessage(error));
        }
      }
    }

    mountCard();

    return () => {
      cancelled = true;
      renderInstanceRef.current?.unmount?.();
      renderInstanceRef.current = null;
    };
  }, [amount, containerId, currency, tapConfig]);

  const handleSubmit = async () => {
    if (pending) {
      return;
    }

    const embeddedEnabled = Boolean(tapConfig?.embeddedCardEnabled && tapConfig.publicKey);
    const hostedFallbackMode = !embeddedEnabled || Boolean(sdkError && !sdkReady);
    if (hostedFallbackMode) {
      onSubmit({});
      return;
    }

    if (!sdkReady || !window.CardSDK?.tokenize) {
      setSdkError("The payment form is still loading. Please wait a moment and try again.");
      return;
    }

    setTokenizing(true);
    setSdkError(null);

    try {
      const token = await new Promise<TapTokenResponse>((resolve, reject) => {
        tokenizePromiseRef.current = { resolve, reject };
        window.CardSDK?.tokenize();
      });

      onSubmit({
        tapTokenId: token.id,
        saveCardForFuture,
      });
    } catch (error) {
      setSdkError(getTapErrorMessage(error));
      setTokenizing(false);
    }
  };

  const showEmbeddedForm = Boolean(tapConfig?.embeddedCardEnabled && tapConfig.publicKey);
  const hostedFallbackMode = !showEmbeddedForm || Boolean(sdkError && !sdkReady);

  return (
    <Card className="border">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4" />
          Card Payment
        </div>

        {isLoadingConfig ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading payment form...
          </div>
        ) : showEmbeddedForm && !hostedFallbackMode ? (
          <>
            <div className="rounded-lg border bg-background p-3">
              <div id={containerId} data-testid={testId ? `${testId}-sdk` : undefined} />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Secure card processing with Tap
            </div>
          </>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            The secure card form is unavailable right now. We will continue with Tap's hosted card checkout.
          </div>
        )}

        {sdkError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sdkError}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={pending || tokenizing || (!hostedFallbackMode && !sdkReady)}
          className="w-full"
          data-testid={testId}
        >
          {pending || tokenizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
