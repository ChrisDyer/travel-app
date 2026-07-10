'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { BookingKind } from './booking-selection';
import { Plus, Plane, BedDouble, CarFront, SquareParking, TrainFront, CalendarPlus } from 'lucide-react';

interface AddPlanMenuProps {
  onAdd: (kind: BookingKind) => void;
}

const items: { kind: BookingKind; label: string; icon: React.ElementType }[] = [
  { kind: 'flight', label: 'Flight', icon: Plane },
  { kind: 'hotel', label: 'Hotel', icon: BedDouble },
  { kind: 'rentalCar', label: 'Rental Car', icon: CarFront },
  { kind: 'parking', label: 'Parking', icon: SquareParking },
  { kind: 'transit', label: 'Transit', icon: TrainFront },
  { kind: 'event', label: 'Activity', icon: CalendarPlus },
];

export function AddPlanMenu({ onAdd }: AddPlanMenuProps) {
  return (
    <div className="no-print">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Add a plan
            </Button>
          }
        />
        <DropdownMenuContent>
          {items.map(({ kind, label, icon: Icon }) => (
            <DropdownMenuItem key={kind} onClick={() => onAdd(kind)}>
              <Icon className="h-4 w-4" />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
