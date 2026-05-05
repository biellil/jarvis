/**
 * Barrel export for components/ui — Phase 48 design system primitives.
 *
 * Consumers should prefer:
 *   import { Button, Field, Slider } from '@/components/ui';
 *
 * over reaching into individual files. Tree-shaking keeps unused primitives
 * out of the renderer bundle.
 */

export { Button, buttonVariants } from './button';
export type { ButtonProps } from './button';

export { Input } from './input';
export type { InputProps } from './input';

export { Label } from './label';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './select';

export { Slider } from './slider';

export { Switch } from './switch';

export { Field } from './field';
export type { FieldProps } from './field';

export { HotkeyRecorder } from './hotkey-recorder';
export type { HotkeyRecorderProps } from './hotkey-recorder';

export { Progress } from './progress';
export type { ProgressProps } from './progress';
