import { useState, useCallback, useMemo } from 'react';

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export interface UseFormOptions<T> {
  initialValues: T;
  validate?: (values: T) => FormErrors<T>;
  onSubmit?: (values: T) => Promise<void> | void;
}

export interface UseFormReturn<T> {
  // Form state
  values: T;
  errors: FormErrors<T>;
  touched: Partial<Record<keyof T, boolean>>;

  // Status
  isSubmitting: boolean;
  isDirty: boolean;

  // Actions
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (values: Partial<T>) => void;
  setError: (field: keyof T, message: string) => void;
  clearErrors: () => void;
  reset: (newValues?: T) => void;
  touch: (field: keyof T) => void;
  submit: () => Promise<boolean>;
  handleSubmit: (e: React.FormEvent) => void;
}

/**
 * 通用表单处理 Hook
 *
 * 提供表单状态管理、验证、提交等功能的统一封装
 *
 * @example
 * ```tsx
 * const form = useForm({
 *   initialValues: { name: '', email: '' },
 *   validate: (values) => {
 *     const errors: FormErrors<typeof values> = {};
 *     if (!values.name) errors.name = '请输入姓名';
 *     if (!values.email) errors.email = '请输入邮箱';
 *     return errors;
 *   },
 *   onSubmit: async (values) => {
 *     await api.save(values);
 *   },
 * });
 * ```
 */
export function useForm<T extends Record<string, any>>(
  options: UseFormOptions<T>
): UseFormReturn<T> {
  const { initialValues, validate, onSubmit } = options;

  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<FormErrors<T>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(initialValues);
  }, [values, initialValues]);

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is modified
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const setValuesPartial = useCallback((newValues: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...newValues }));
    // Clear errors for updated fields
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(newValues).forEach((key) => {
        delete next[key as keyof T];
      });
      return next;
    });
  }, []);

  const setError = useCallback((field: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const reset = useCallback((newValues?: T) => {
    setValues(newValues ?? initialValues);
    setErrors({});
    setTouched({});
  }, [initialValues]);

  const touch = useCallback((field: keyof T) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const runValidation = useCallback((): boolean => {
    if (!validate) return true;
    const validationErrors = validate(values);
    setErrors(validationErrors);
    return Object.keys(validationErrors).length === 0;
  }, [validate, values]);

  const submit = useCallback(async (): Promise<boolean> => {
    if (!runValidation()) {
      // Touch all fields to show errors
      const allTouched = Object.keys(values).reduce((acc, key) => {
        acc[key as keyof T] = true;
        return acc;
      }, {} as Record<keyof T, boolean>);
      setTouched(allTouched);
      return false;
    }

    if (!onSubmit) return true;

    setIsSubmitting(true);
    try {
      await onSubmit(values);
      return true;
    } catch (error) {
      // Handle submission error
      if (error instanceof Error) {
        // Could set a general form error here if needed
        console.error('Form submission error:', error.message);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [runValidation, onSubmit, values]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submit();
    },
    [submit]
  );

  return {
    values,
    errors,
    touched,
    isSubmitting,
    isDirty,
    setValue,
    setValues: setValuesPartial,
    setError,
    clearErrors,
    reset,
    touch,
    submit,
    handleSubmit,
  };
}
