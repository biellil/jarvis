import * as React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Progress primitive — UI-SPEC §"8. Progress"
 *
 * Variants:
 * - linear (default): track + indicator bar; sm (4px) | md (6px)
 * - circular: 16×16 SVG ring; size prop ignored
 *
 * States:
 * - determinate (value 0..100): fills indicator to value%
 * - indeterminate (value undefined): shimmer/spin under motion-safe;
 *   reduced-motion fallback shows a static partial fill
 * - status='success': indicator stays full, swaps to bg-success + check icon
 * - status='error':   indicator uses bg-destructive + X icon
 *
 * Animation depends on @keyframes progress-shimmer declared in globals.css
 * (added by Plan 01 Task 2 step E).
 */

export interface ProgressProps {
  variant?: 'linear' | 'circular';
  value?: number;
  status?: 'progress' | 'success' | 'error';
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const CIRC_RADIUS = 6;
const CIRC_CIRCUMFERENCE = 2 * Math.PI * CIRC_RADIUS;

function clampPct(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function LinearProgress({
  value,
  status = 'progress',
  size = 'sm',
  label,
  className,
}: Omit<ProgressProps, 'variant'>) {
  const isIndeterminate = value === undefined;
  const pct = isIndeterminate ? 0 : clampPct(value);
  const trackHeight = size === 'md' ? 'h-1.5' : 'h-1';

  const ariaProps: Record<string, unknown> = isIndeterminate
    ? { 'aria-busy': true, role: 'progressbar' }
    : {
        role: 'progressbar',
        'aria-valuenow': pct,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      };
  if (label) ariaProps['aria-label'] = label;

  return (
    <div className={cn('flex items-center gap-sm', className)}>
      <div
        {...ariaProps}
        className={cn(
          trackHeight,
          'w-full bg-surface rounded-full overflow-hidden',
        )}
      >
        {isIndeterminate ? (
          <div
            className={cn(
              'h-full w-1/3 rounded-full bg-accent',
              'motion-safe:animate-[progress-shimmer_1.5s_ease-in-out_infinite]',
              'motion-reduce:w-[30%] motion-reduce:animate-none',
            )}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-full transition-[width,background-color] duration-base ease-standard',
              status === 'success' && 'bg-success transition-colors duration-[400ms]',
              status === 'error' && 'bg-destructive',
              status === 'progress' && 'bg-accent',
            )}
            style={{ width: `${status === 'success' ? 100 : pct}%` }}
          />
        )}
      </div>
      {status === 'success' && (
        <Check className="size-3 text-success shrink-0" aria-hidden />
      )}
      {status === 'error' && (
        <X className="size-3 text-destructive shrink-0" aria-hidden />
      )}
    </div>
  );
}

function CircularProgress({
  value,
  status = 'progress',
  label,
  className,
}: Omit<ProgressProps, 'variant' | 'size'>) {
  const isIndeterminate = value === undefined;
  const pct = isIndeterminate ? 0 : clampPct(value);
  const dashoffset = CIRC_CIRCUMFERENCE * (1 - pct / 100);

  const ariaProps: Record<string, unknown> = isIndeterminate
    ? { 'aria-busy': true, role: 'progressbar' }
    : {
        role: 'progressbar',
        'aria-valuenow': pct,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      };
  if (label) ariaProps['aria-label'] = label;

  if (status === 'success') {
    return (
      <span
        {...ariaProps}
        className={cn(
          'inline-flex size-4 items-center justify-center rounded-full bg-success',
          className,
        )}
      >
        <Check className="size-2 text-bg" aria-hidden />
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span
        {...ariaProps}
        className={cn('inline-flex size-4 items-center justify-center', className)}
      >
        <X className="size-3 text-destructive" aria-hidden />
      </span>
    );
  }

  return (
    <svg
      {...ariaProps}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      className={cn(
        'inline-block',
        isIndeterminate &&
          'motion-safe:animate-spin motion-reduce:animate-none',
        className,
      )}
    >
      <circle
        cx="8"
        cy="8"
        r={CIRC_RADIUS}
        strokeWidth="2"
        fill="none"
        className="stroke-surface"
      />
      <circle
        cx="8"
        cy="8"
        r={CIRC_RADIUS}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        className={cn(
          'stroke-accent',
          isIndeterminate &&
            'motion-reduce:[stroke-dashoffset:9px]',
        )}
        style={
          isIndeterminate
            ? {
                strokeDasharray: `${CIRC_CIRCUMFERENCE * 0.75} ${CIRC_CIRCUMFERENCE}`,
                transform: 'rotate(-90deg)',
                transformOrigin: 'center',
              }
            : {
                strokeDasharray: CIRC_CIRCUMFERENCE,
                strokeDashoffset: dashoffset,
                transform: 'rotate(-90deg)',
                transformOrigin: 'center',
                transition:
                  'stroke-dashoffset var(--duration-base) var(--ease-standard)',
              }
        }
      />
    </svg>
  );
}

export function Progress({
  variant = 'linear',
  value,
  status = 'progress',
  size = 'sm',
  label,
  className,
}: ProgressProps) {
  if (variant === 'circular') {
    return (
      <CircularProgress
        value={value}
        status={status}
        label={label}
        className={className}
      />
    );
  }
  return (
    <LinearProgress
      value={value}
      status={status}
      size={size}
      label={label}
      className={className}
    />
  );
}
