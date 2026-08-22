'use client';

import type * as React from 'react';
import { createContext, useContext, useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Form field.
 *
 * Wiring `id`, `aria-describedby` and `aria-invalid` by hand is where
 * accessibility quietly rots, so the field owns all three. A control inside a
 * `FormField` reads them from context and cannot get them wrong.
 */
interface FieldContext {
  readonly controlId: string;
  readonly descriptionId: string;
  readonly errorId: string;
  readonly invalid: boolean;
}

const FormFieldContext = createContext<FieldContext | null>(null);

export function useFormField(): FieldContext {
  const context = useContext(FormFieldContext);
  if (context === null) {
    throw new Error('useFormField must be used inside a <FormField>');
  }
  return context;
}

/**
 * Spread onto the control: `<Input {...useFieldControlProps()} />`.
 *
 * Returned as props rather than applied by cloning children, so a caller can
 * see exactly what is being set and override it.
 */
export function useFieldControlProps(): {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': boolean | undefined;
} {
  const { controlId, descriptionId, errorId, invalid } = useFormField();
  const describedBy = [descriptionId, invalid ? errorId : null].filter(Boolean).join(' ');
  return {
    id: controlId,
    'aria-describedby': describedBy === '' ? undefined : describedBy,
    'aria-invalid': invalid ? true : undefined,
  };
}

interface FormFieldProps extends React.ComponentProps<'div'> {
  invalid?: boolean | undefined;
}

export function FormField({ invalid = false, className, children, ...props }: FormFieldProps) {
  const base = useId();
  return (
    <FormFieldContext.Provider
      value={{
        controlId: `${base}-control`,
        descriptionId: `${base}-description`,
        errorId: `${base}-error`,
        invalid,
      }}
    >
      <div
        data-slot="form-field"
        data-invalid={invalid || undefined}
        className={cn('flex flex-col gap-1.5', className)}
        {...props}
      >
        {children}
      </div>
    </FormFieldContext.Provider>
  );
}

export function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { controlId } = useFormField();
  return <Label htmlFor={controlId} className={className} {...props} />;
}

export function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { descriptionId } = useFormField();
  return (
    <p id={descriptionId} className={cn('text-xs text-muted-foreground', className)} {...props} />
  );
}

/** Renders nothing when the field is valid, so layout does not jump. */
export function FormMessage({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { errorId, invalid } = useFormField();
  if (!invalid || children === undefined) return null;
  return (
    <p id={errorId} role="alert" className={cn('text-xs text-destructive', className)} {...props}>
      {children}
    </p>
  );
}

interface FormSectionProps extends React.ComponentProps<'fieldset'> {
  title: string;
  description?: string | undefined;
}

/** A titled group of fields — "Entry conditions", "Alert delivery". */
export function FormSection({
  title,
  description,
  className,
  children,
  ...props
}: FormSectionProps) {
  return (
    <fieldset className={cn('flex flex-col gap-3 border-0 p-0', className)} {...props}>
      <div>
        <legend className="text-sm font-semibold tracking-tight">{title}</legend>
        {description !== undefined && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </fieldset>
  );
}
