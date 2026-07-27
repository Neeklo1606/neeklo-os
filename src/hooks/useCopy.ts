import { useCallback } from 'react';
import { toast } from 'sonner';

export function useCopy() {
  return useCallback(async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label ? `Скопировано: ${label}` : 'Скопировано в буфер обмена');
    } catch {
      toast.error('Не удалось скопировать');
    }
  }, []);
}