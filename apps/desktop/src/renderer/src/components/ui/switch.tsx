import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';

/**
 * Switch primitive — Phase 53 Plan 03 (STTS-02).
 *
 * Mirrors the shape of `Slider` (Phase 48): forwardRef, displayName, cn() merge.
 * Tokens (`bg-primary`, `bg-input`, `bg-background`, `ring-ring`) follow shadcn
 * conventions; for projects using @theme tokens, these resolve via Tailwind
 * v4 custom property indirection.
 *
 * Test note (Phase 52-03 STATE.md): query via `getByRole('switch')` WITHOUT
 * a name filter — happy-dom does not propagate aria-label from the Root to
 * the accessible name predictably. Use `fireEvent.click` (Radix dispatches
 * via pointer events, NOT native change).
 */
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
      'border-2 border-transparent transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-accent data-[state=unchecked]:bg-surface',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-fg shadow-lg ring-0 transition-transform',
        'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
