import { useEffect } from 'react';

/**
 * Toast — Plano 19_5-04
 *
 * Componente controlado: o pai gerencia o estado, passa `message` e `onClose`.
 * Auto-fecha após `autoCloseMs` (default 5s). Clique no toast também fecha.
 *
 * `WebkitAppRegion: 'no-drag'` é obrigatório porque o container raiz do App
 * é marcado como `drag` (frameless window) — sem isso, o clique não
 * registra.
 */

export type ToastVariant = 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
  autoCloseMs?: number;
  /** Phase 44 (VHARD-01, D-04): botão de ação opcional (ex: "Abrir System Settings") */
  action?: ToastAction;
}

const VARIANT_BG: Record<ToastVariant, string> = {
  error: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',
};

export function Toast({
  message,
  variant = 'error',
  onClose,
  autoCloseMs = 5000,
  action,
}: ToastProps) {
  useEffect(() => {
    if (autoCloseMs <= 0) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [onClose, autoCloseMs, message]);

  return (
    <div
      role="alert"
      className={`toast toast-${variant}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        borderRadius: 8,
        cursor: 'pointer',
        background: VARIANT_BG[variant],
        color: 'white',
        zIndex: 9999,
        maxWidth: 400,
        fontSize: 14,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
    >
      {message}
      {action && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // evita fechar o toast ao clicar no botão
            action.onClick();
          }}
          style={{
            marginLeft: 8,
            background: 'transparent',
            border: 'none',
            color: 'white',
            textDecoration: 'underline',
            fontSize: 14,
            cursor: 'pointer',
            padding: 0,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
