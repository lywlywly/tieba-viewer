"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { UserCombobox } from "./UserCombobox";

export default function UserComboboxClient({
  options,
  value,
}: {
  options: string[];
  value: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <UserCombobox
      options={options}
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());

        if (next) {
          params.set("name", next);
        } else {
          params.delete("name");
        }

        router.replace(`${pathname}?${params.toString()}`);
      }}
      placeholder="Select a forum"
    />
  );
}
