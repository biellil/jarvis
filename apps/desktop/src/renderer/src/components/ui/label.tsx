import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/cn';

/**
 * Label primitive — UI-SPEC §"5. Label"
 *
 * Wraps Radix's Label.Root so clicking the label transfers focus to the
 * associated control. Disabled-state styling is forwarded via the
 * `peer-disabled:` variant so consumers can pair `<input class="peer">`
 * with `<Label>` for automatic state propagation.
 */
const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium text-fg-muted peer-disabled:cursor-not-allowed peer-disabled:text-fg-disabled',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
