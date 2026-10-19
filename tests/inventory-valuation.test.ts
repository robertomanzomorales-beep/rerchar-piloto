import assert from "node:assert/strict";
import test from "node:test";
import type { StockBalance, StockItem } from "../lib/supply";
import { stockMoney, stockQuantity, stockUnitMoney, summarizeInventoryValuation } from "../lib/inventory-valuation";

test("valoriza existencias sin duplicar reservas y marca artículos sin costo", () => {
  const item = (id: string, category: string | null, unit_cost_clp: string | null) => ({
    id, code: id, name: id, unit: "un", minimum_qty: "0", maximum_qty: null, category, unit_cost_clp,
  }) satisfies StockItem;
  const balance = (item_id: string, quantity: string, reserved: string) => ({
    item_id, quantity, reserved,
  }) as StockBalance;
  const summary = summarizeInventoryValuation(
    [item("guantes", "EPP", "25.50"), item("casco", "EPP", null), item("tornillo", null, "0.00"), item("sin-saldo", "EPP", null)],
    [balance("guantes", "4.000", "2.000"), balance("guantes", "1.500", "0.500"),
      balance("casco", "3.000", "0.000"), balance("tornillo", "1.000", "0.000")],
  );
  assert.equal(stockMoney(summary.total.physical), "$140,25");
  assert.equal(stockMoney(summary.total.reserved), "$63,75");
  assert.equal(stockMoney(summary.total.available), "$76,50");
  assert.equal(summary.total.unpriced, 1, "el artículo sin saldo no impide un total completo");
  assert.equal(summary.groups.find(group => group.name === "EPP")?.unpriced, 1);
  assert.equal(summary.groups.find(group => group.name === "Sin familia")?.priced, 1, "un costo cero es un costo registrado");
  assert.equal(stockQuantity(summary.articles[0].available), "3");
  assert.equal(stockUnitMoney("25.50"), "$25,50");
});
