import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from './label';
import { cn } from '@/lib/cn';

/**
 * Field composition wrapper — UI-SPEC §"6. Field"
 *
 * Provides automatic ARIA wiring (htmlFor, id, aria-describedby, aria-invalid)
 * across Label / Control / Helper / Error subcomponents via React context.
 *
 * Usage:
 *   <Field error>
 *     <Field.Label>VAD Silence Threshold</Field.Label>
 *     <Field.Control><Input /></Field.Control>
 *     <Field.Helper>Lower = more responsive…</Field.Helper>
 *     <Field.Error>API key cannot be empty</Field.Error>
 *   </Field>
 *
 * Error text takes precedence over Helper (Helper returns null when error active).
 */

interface FieldContextValue {
  id: string;
  helperId: string;
  errorId: string;
  hasError: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue {
  const ctx = React.useContext(FieldContext);
  if (!ctx) {
    throw new Error('Field subcomponents must be used inside <Field>');
  }
  return ctx;
}

export interface FieldProps {
  children: React.ReactNode;
  error?: boolean;
  className?: string;
  id?: string;
}

function FieldRoot({ children, error, className, id: idProp }: FieldProps) {
  const generatedId = React.useId();
  const id = idProp ?? generatedId;
  const value = React.useMemo<FieldContextValue>(
    () => ({
      id,
      helperId: `${id}-helper`,
      errorId: `${id}-error`,
      hasError: !!error,
    }),
    [id, error],
  );

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('flex flex-col gap-sm', className)}>{children}</div>
    </FieldContext.Provider>
  );
}

interface FieldLabelProps extends React.ComponentPropsWithoutRef<typeof Label> {}

function FieldLabel({ className, children, ...props }: FieldLabelProps) {
  const ctx = useField();
  return (
    <Label htmlFor={ctx.id} className={className} {...props}>
      {children}
    </Label>
  );
}

interface FieldControlProps {
  children: React.ReactElement;
}

function FieldControl({ children }: FieldControlProps) {
  const ctx = useField();
  const child = React.Children.only(children) as React.ReactElement<
    Record<string, unknown>
  >;

  // Auto-wire id, aria-describedby, aria-invalid. Consumer is responsible for
  // rendering Helper/Error siblings — the ids are referenced unconditionally
  // since hasError flips between helperId/errorId, matching whichever element
  // is rendered.
  const injected: Record<string, unknown> = {
    id: ctx.id,
    'aria-describedby': ctx.hasError ? ctx.errorId : ctx.helperId,
    'aria-invalid': ctx.hasError ? true : undefined,
  };

  return React.cloneElement(child, injected);
}

interface FieldHelperProps {
  children: React.ReactNode;
  className?: string;
}

function FieldHelper({ children, className }: FieldHelperProps) {
  const ctx = useField();
  // UI-SPEC §"6. Field": Error text takes precedence over Helper.
  if (ctx.hasError) return null;
  return (
    <p id={ctx.helperId} className={cn('text-xs text-fg-subtle', className)}>
      {children}
    </p>
  );
}

interface FieldErrorProps {
  children: React.ReactNode;
  className?: string;
}

function FieldError({ children, className }: FieldErrorProps) {
  const ctx = useField();
  if (!ctx.hasError) return null;
  return (
    <p
      id={ctx.errorId}
      role="alert"
      className={cn(
        'text-xs text-destructive flex items-center gap-xs',
        className,
      )}
    >
      <AlertCircle className="size-3" aria-hidden />
      {children}
    </p>
  );
}

type FieldComponent = typeof FieldRoot & {
  Label: typeof FieldLabel;
  Control: typeof FieldControl;
  Helper: typeof FieldHelper;
  Error: typeof FieldError;
};

const Field = FieldRoot as FieldComponent;
Field.Label = FieldLabel;
Field.Control = FieldControl;
Field.Helper = FieldHelper;
Field.Error = FieldError;

export { Field };
