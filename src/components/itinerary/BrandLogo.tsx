'use client';

import { useState } from 'react';
import { getLogoPathFromAny } from '@/lib/logos';
import { apiUrl } from '@/lib/api';

interface BrandLogoProps {
  name?: string | null;
  fallbackNames?: (string | null | undefined)[];
  fallback: string;
  heightClass?: string;
}

export function BrandLogo({ name, fallbackNames = [], fallback, heightClass = 'h-5' }: BrandLogoProps) {
  const [failed, setFailed] = useState(false);
  const logo = !failed ? getLogoPathFromAny(name, ...fallbackNames) : null;
  if (logo) {
    return (
      <img
        src={apiUrl(logo)}
        alt={name ?? fallback}
        className={`${heightClass} w-auto max-w-[72px] object-contain shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="text-sm shrink-0">{fallback}</span>;
}
