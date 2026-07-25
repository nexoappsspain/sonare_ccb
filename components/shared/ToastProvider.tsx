"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => string;
  success: (message: string) => string;
  error: (message: string) => string;
  info: (message: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4_000;

const TYPE_STYLES: Record<ToastType, { border: string; iconClass: string }> = {
  success: { border: "border-l-green-500", iconClass: "text-green-500" },
  error: { border: "border-l-red-500", iconClass: "text-red-500" },
  info: { border: "border-l-accent", iconClass: "text-accent" },
};

const TYPE_LABELS: Record<ToastType, string> = {
  success: "Sucesso",
  error: "Erro",
  info: "Informação",
};

function ToastIcon({ type }: { type: ToastType }) {
  const className = cn("h-5 w-5 shrink-0", TYPE_STYLES[type].iconClass);
  if (type === "success") return <CheckCircle2 className={className} aria-hidden="true" />;
  if (type === "error") return <AlertCircle className={className} aria-hidden="true" />;
  return <Info className={className} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info"): string => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, type, message }]);
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const success = useCallback((message: string) => showToast(message, "success"), [showToast]);
  const error = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const info = useCallback((message: string) => showToast(message, "info"), [showToast]);

  const value = useMemo<ToastContextValue>(
    () => ({ toasts, showToast, success, error, info, dismiss }),
    [toasts, showToast, success, error, info, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-lg border border-border border-l-4 bg-panel p-3 shadow-lg",
              TYPE_STYLES[toast.type].border,
            )}
          >
            <ToastIcon type={toast.type} />
            <p className="flex-1 text-sm text-neutral-100">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label={`Fechar notificação: ${TYPE_LABELS[toast.type]}`}
              className="shrink-0 rounded-md p-1 text-neutral-400 transition-colors hover:bg-panelHover hover:text-neutral-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
