"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OrderSelect } from "./OrderSelect";

type Order = "Reply" | "Create";

export default function OrderSelectClient({ value }: { value: Order }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <OrderSelect
      value={value}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("order", next);

        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      }}
    />
  );
}
