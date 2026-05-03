import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Input primitive — UI-SPEC §"2. Input"
 *
 * Variants: default | error
 * Sizes:    sm (32px) | md (36px, default)
 *
 * Error variant pairs with aria-invalid="true" — the destructive ring is
 * gated on aria-[invalid=true] so the error styling is driven from a11y
 * state, not a visual flag (matches Field wrapper contract in Plan 03).
 */
const inputVariants = cva(
  'flex w-full rounded-md bg-surface border border-border text-fg placeholder:text-fg-subtle text-sm px-md py-sm transition-colors duration-base ease-standard outline-none hover:bg-surface-hover hover:border-border-hover focus-visible:bg-surface-hover focus-visible:border-accent-ring focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-0 disabled:bg-surface/50 disabled:border-white/5 disabled:text-fg-disabled disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: '',
        error:
          'aria-[invalid=true]:border-destructive focus-visible:aria-[invalid=true]:ring-destructive/30 focus-visible:aria-[invalid=true]:border-destructive',
      },
      size: {
        sm: 'h-8',
        md: 'h-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
