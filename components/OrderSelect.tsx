"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Order = "Reply" | "Create";

export function OrderSelect({
  value,
  onValueChange,
}: {
  value: Order;
  onValueChange: (value: Order) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as Order)}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Order" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Reply">Reply</SelectItem>
        <SelectItem value="Create">Create</SelectItem>
      </SelectContent>
    </Select>
  );
}
