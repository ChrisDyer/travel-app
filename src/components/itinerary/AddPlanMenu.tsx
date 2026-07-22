'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { BookingKind } from './booking-selection';
import type { EventCategory } from '@/types/travel';
import { Plus, Plane, BedDouble, CarFront, SquareParking, TrainFront, CalendarPlus, Footprints } from 'lucide-react';
import { useReadOnly } from '@/lib/read-only';

interface AddPlanMenuProps {
  onAdd: (kind: BookingKind, defaultCategory?: EventCategory) => void;
}

const items: { kind: BookingKind; label: string; icon: React.ElementType; defaultCategory?: EventCategory }[] = [
  { kind: 'flight', label: 'Flight', icon: Plane },
  { kind: 'hotel', label: 'Hotel', icon: BedDouble },
  { kind: 'rentalCar', label: 'Rental Car', icon: CarFront },
  { kind: 'parking', label: 'Parking', icon: SquareParking },
  { kind: 'transit', label: 'Transit', icon: TrainFront },
  { kind: 'event', label: 'Activity', icon: CalendarPlus, defaultCategory: 'activity' },
  { kind: 'event', label: 'Hike', icon: Footprints, defaultCategory: 'hike' },
];

export function AddPlanMenu({ onAdd }: AddPlanMenuProps) {
  const readOnly = useReadOnly();
  if (readOnly) return null;

  return (
    <div className="max-lg:fixed max-lg:bottom-5 max-lg:right-5 max-lg:z-30 lg:static no-print">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button className="max-lg:rounded-full max-lg:shadow-lg max-lg:h-13 max-lg:px-4">
              <Plus className="h-4 w-4 mr-1" />
              Add a plan
            </Button>
          }
        />
        <DropdownMenuContent>
          {items.map(({ kind, label, icon: Icon, defaultCategory }) => (
            <DropdownMenuItem key={`${kind}-${label}`} onClick={() => onAdd(kind, defaultCategory)}>
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
