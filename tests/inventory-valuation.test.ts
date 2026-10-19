import assert from "node:assert/strict";
import test from "node:test";
import type { InventorySpendRow, StockBalance, StockItem } from "../lib/supply";
import { stockMoney, stockMoneyFromDecimal, stockQuantity, stockQuantityFromDecimal, stockUnitMoney, summarizeInventorySpend, summarizeInventoryValuation } from "../lib/inventory-valuation";

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

test("resume gasto histórico exacto y señala meses incompletos", () => {
  const row = (item_id:string,family:string,quantity:string,amount_clp:string,unpriced_count:string) => ({
    item_id,family,quantity,amount_clp,unpriced_count,code:item_id,name:item_id,unit:"un",movement_count:"1",
  }) satisfies InventorySpendRow;
  const summary=summarizeInventorySpend([
    row("guantes","EPP","1.500","38.25000","0"),
    row("casco","EPP","2.000","0.00000","1"),
    row("neumatico","Repuestos","1.000","100.00500","0"),
  ]);
  assert.equal(stockMoney(summary.amount),"$138,26");
  assert.equal(summary.movements,3);
  assert.equal(summary.unpriced,1);
  assert.equal(summary.families.find(group=>group.name==="EPP")?.articles.size,2);
  assert.equal(stockMoneyFromDecimal("38.25000"),"$38,25");
  assert.equal(stockQuantityFromDecimal("1.500"),"1,5");
});
