import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';

/**
 * Slider primitive — UI-SPEC §"4. Slider"
 *
 * Replaces the legacy `slider-vad-threshold` CSS (Phase 40) with a Radix-based
 * implementation. The cyan glow shadows on the thumb are PRESERVED from the
 * legacy VAD slider visual contract — UI-SPEC §4 documents this as the only
 * permitted hardcoded rgba in this file.
 *
 * Hit target: under coarse-pointer media (touch), the thumb gets a 44px
 * invisible hit zone via the `[@media(pointer:coarse)]:before:` arbitrary
 * variant, satisfying the WCAG touch-target minimum.
 */
const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-surface">
      <SliderPrimitive.Range className="absolute h-full bg-accent rounded-full" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        'relative block h-5 w-5 rounded-full bg-accent border-2 border-white/20',
        'shadow-[0_0_8px_rgba(6,182,212,0.4)] transition-shadow duration-base outline-none cursor-pointer',
        'hover:shadow-[0_0_12px_rgba(6,182,212,0.6)]',
        'focus-visible:ring-2 focus-visible:ring-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'active:scale-105 active:shadow-[0_0_16px_rgba(6,182,212,0.7)]',
        'disabled:bg-surface-hover disabled:shadow-none',
        // Coarse-pointer 44px hit target (UI-SPEC §4 hit-target rule)
        '[@media(pointer:coarse)]:before:content-[""] [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:inset-[-12px]',
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
