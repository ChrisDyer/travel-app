'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { apiUrl } from '@/lib/api';
import { useReadOnly } from '@/lib/read-only';

export function GmailActions({ connected }: { connected: boolean }) {
  const readOnly = useReadOnly();
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(apiUrl('/api/gmail/token'), { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast('Gmail disconnected');
      router.refresh();
    } catch {
      toast('Could not disconnect Gmail.', 'error');
    } finally {
      setDisconnecting(false);
    }
  }

  if (readOnly) return null;
  if (!connected) {
    return (
      <a href={apiUrl('/api/gmail/auth?returnTo=/settings')}>
        <Button>
          <Mail className="h-4 w-4" aria-hidden="true" />
          Connect Gmail
        </Button>
      </a>
    );
  }

  return (
    <Button variant="outline" onClick={disconnect} disabled={disconnecting}>
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {disconnecting ? 'Disconnecting...' : 'Disconnect'}
    </Button>
  );
}
