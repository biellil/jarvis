import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

/**
 * Button primitive — UI-SPEC §"1. Button"
 *
 * Variants: primary | secondary | ghost | destructive
 * Sizes:    sm (28px) | md (36px, default) | lg (44px)
 *
 * All colors flow from Tailwind v4 @theme tokens declared in globals.css.
 * Focus-visible ring uses the accent-ring token, never the bare accent color.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-sm rounded-md transition-colors duration-base ease-standard outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-fg shadow-xs hover:bg-cyan-400 active:bg-cyan-600 disabled:bg-accent/40 disabled:text-fg/60 disabled:cursor-not-allowed',
        secondary:
          'bg-surface text-fg-muted border border-border hover:bg-surface-hover hover:border-border-hover hover:text-fg active:border-white/20 disabled:bg-surface/50 disabled:text-fg-disabled disabled:border-white/5 disabled:cursor-not-allowed',
        ghost:
          'bg-transparent text-fg-muted hover:bg-white/5 hover:text-fg active:bg-white/10 disabled:text-fg-disabled disabled:cursor-not-allowed',
        destructive:
          'bg-destructive text-fg hover:bg-rose-400 disabled:bg-destructive/40 disabled:text-fg/60 disabled:cursor-not-allowed',
      },
      size: {
        sm: 'h-7 px-md text-sm font-medium',
        md: 'h-9 px-base text-sm font-medium',
        lg: 'h-11 px-lg text-sm font-medium',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
