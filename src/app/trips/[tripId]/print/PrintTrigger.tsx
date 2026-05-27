'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function PrintTrigger() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('print') === 'true') {
      window.print();
    }
  }, [searchParams]);

  return null;
}
