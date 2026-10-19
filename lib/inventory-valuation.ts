import type { InventorySpendRow, StockBalance, StockItem } from "./supply";

// Stock uses three decimals and estimated unit costs use two. Keep the product
// exact until display: one unit here represents 0.00001 Chilean pesos.
function fixed(value: string, places: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > places)
    throw new Error("Cantidad o costo de inventario inválido.");
  return BigInt(whole) * BigInt(10) ** BigInt(places) + BigInt(fraction.padEnd(places, "0"));
}

export function stockMoney(value: bigint): string {
  const cents = (value + BigInt(500)) / BigInt(1000);
  const pesos = cents / BigInt(100);
  const remainder = cents % BigInt(100);
  return `$${pesos.toLocaleString("es-CL")}${remainder ? `,${remainder.toString().padStart(2, "0")}` : ""}`;
}

export function stockUnitMoney(cost: string): string {
  return stockMoney(fixed(cost, 2) * BigInt(1000));
}

export function stockMoneyFromDecimal(value: string): string {
  return stockMoney(fixed(value, 5));
}

export function stockQuantity(value: bigint): string {
  const whole = value / BigInt(1000);
  const fraction = value % BigInt(1000);
  return `${whole.toLocaleString("es-CL")}${fraction ? `,${fraction.toString().padStart(3, "0").replace(/0+$/, "")}` : ""}`;
}

export function stockQuantityFromDecimal(value: string): string {
  return stockQuantity(fixed(value, 3));
}

export function summarizeInventorySpend(rows: InventorySpendRow[]) {
  const families = new Map<string,{name:string;amount:bigint;movements:number;unpriced:number;articles:Set<string>}>();
  let amount = BigInt(0), movements = 0, unpriced = 0;
  for (const row of rows) {
    const value = fixed(row.amount_clp, 5);
    const count = Number(row.movement_count), missing = Number(row.unpriced_count);
    const family = families.get(row.family) ?? {
      name:row.family,amount:BigInt(0),movements:0,unpriced:0,articles:new Set<string>(),
    };
    family.amount += value;
    family.movements += count;
    family.unpriced += missing;
    family.articles.add(row.item_id);
    families.set(row.family,family);
    amount += value;
    movements += count;
    unpriced += missing;
  }
  return {amount,movements,unpriced,families:[...families.values()].sort((a,b)=>a.name.localeCompare(b.name,"es"))};
}

type Values = { physical: bigint; reserved: bigint; available: bigint };
type Category = Values & { name: string; priced: number; unpriced: number };

export function summarizeInventoryValuation(items: StockItem[], balances: StockBalance[]) {
  const byItem = new Map<string, { physical: bigint; reserved: bigint }>();
  for (const balance of balances) {
    const current = byItem.get(balance.item_id) ?? { physical: BigInt(0), reserved: BigInt(0) };
    current.physical += fixed(balance.quantity, 3);
    current.reserved += fixed(balance.reserved, 3);
    byItem.set(balance.item_id, current);
  }

  const total: Category = { name: "Todas", physical: BigInt(0), reserved: BigInt(0), available: BigInt(0), priced: 0, unpriced: 0 };
  const groups = new Map<string, Category>();
  const articles = items.map(item => {
    const { physical, reserved } = byItem.get(item.id) ?? { physical: BigInt(0), reserved: BigInt(0) };
    const available = physical - reserved;
    const category = item.category?.trim() || "Sin familia";
    const cost = item.unit_cost_clp == null ? null : fixed(item.unit_cost_clp, 2);
    const value = cost == null ? null : {
      physical: physical * cost,
      reserved: reserved * cost,
      available: available * cost,
    };
    const group = groups.get(category) ?? { name: category, physical: BigInt(0), reserved: BigInt(0), available: BigInt(0), priced: 0, unpriced: 0 };
    if (physical > BigInt(0)) {
      if (value) {
        for (const target of [group, total]) {
          target.priced++;
          target.physical += value.physical;
          target.reserved += value.reserved;
          target.available += value.available;
        }
      } else {
        group.unpriced++;
        total.unpriced++;
      }
    }
    groups.set(category, group);
    return { item, category, physical, reserved, available, value };
  });
  return { total, groups: [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es")), articles };
}
