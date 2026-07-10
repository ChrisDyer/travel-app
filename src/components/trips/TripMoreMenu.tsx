'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trip } from '@/types/travel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { MoreHorizontal, Printer, CalendarPlus, Copy, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/toast';

interface TripMoreMenuProps {
  trip: Trip;
}

export function TripMoreMenu({ trip }: TripMoreMenuProps) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const copy = await res.json() as Trip;
      toast('Trip duplicated');
      router.push(`/trips/${copy.id}`);
    } catch {
      toast('Could not duplicate the trip. Please try again.', 'error');
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast('Trip deleted');
      router.push('/trips');
    } catch {
      toast('Could not delete the trip. Please try again.', 'error');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="no-print">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="More options" />}
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLinkItem href={`/trips/${trip.id}/print`} target="_blank" closeOnClick>
            <Printer className="h-4 w-4" />
            Print / PDF
          </DropdownMenuLinkItem>
          <DropdownMenuLinkItem href={`/api/trips/${trip.id}/export`} closeOnClick>
            <CalendarPlus className="h-4 w-4" />
            Export to calendar
          </DropdownMenuLinkItem>
          <DropdownMenuItem onClick={handleDuplicate} disabled={duplicating}>
            <Copy className="h-4 w-4" />
            Duplicate trip
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />
            Delete trip
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={(open) => { if (!deleting) setConfirmDelete(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this trip?</DialogTitle>
            <DialogDescription>This permanently deletes all its days, events, and bookings.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
