"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export function UserCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
}: {
  options: string[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  placeholder?: string;
}) {
  return (
    <Combobox items={options} value={value} onValueChange={onValueChange}>
      <ComboboxInput placeholder={placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>No items found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
