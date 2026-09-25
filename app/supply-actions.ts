"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireActor } from "@/lib/auth";
import {
  SupplyError, addPurchaseLine, adjustStock, approvePurchase, cancelPurchase, closeReservation,
  createPurchase, createStockItem, createWarehouse, orderPurchase, receivePurchase, reserveStock, transferStock,
} from "@/lib/supply";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const purchasePath = (id: string) => `/compras/${encodeURIComponent(id)}`;
function message(error: unknown) {
  if (error instanceof SupplyError) return error.message;
  if (error instanceof ZodError) return "Revise los campos y las cantidades indicadas.";
  if (typeof error === "object" && error && "code" in error && error.code === "23505") return "El código o artículo ya está registrado.";
  console.error("Error en abastecimiento", error);
  return "No se pudo registrar el cambio. Intente nuevamente.";
}
async function run(path: string, operation: () => Promise<unknown>): Promise<never> {
  try { await operation(); }
  catch (error) { redirect(`${path}?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/", "layout");
  redirect(`${path}?ok=1`);
}

export async function createWarehouseAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => createWarehouse(actor,{ code: value(form,"code"), name: value(form,"name") }));
}
export async function createItemAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => createStockItem(actor,{ code: value(form,"code"), name: value(form,"name"), unit: value(form,"unit"), minimum_qty: value(form,"minimum_qty") }));
}
export async function createPurchaseAction(form: FormData) {
  const actor = await requireActor();
  let id: string;
  try {
    id = await createPurchase(actor,{
      submission_key: value(form,"submission_key"), title: value(form,"title"), category: value(form,"category"),
      priority: value(form,"priority"), item_id: value(form,"item_id"), quantity: value(form,"quantity"), notes: value(form,"notes"),
    });
  } catch (error) { redirect(`/compras?error=${encodeURIComponent(message(error))}`); }
  revalidatePath("/", "layout");
  redirect(`${purchasePath(id)}?ok=1`);
}
export async function addPurchaseLineAction(form: FormData) {
  const actor = await requireActor(); const path = purchasePath(value(form,"request_id"));
  await run(path, () => addPurchaseLine(actor,value(form,"request_id"),{ item_id: value(form,"item_id"), quantity: value(form,"quantity") }));
}
export async function approvePurchaseAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"request_id");
  await run(purchasePath(id), () => approvePurchase(actor,id));
}
export async function cancelPurchaseAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"request_id");
  await run(purchasePath(id), () => cancelPurchase(actor,id,value(form,"reason")));
}
export async function orderPurchaseAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"request_id");
  await run(purchasePath(id), () => orderPurchase(actor,id,{ supplier: value(form,"supplier"), order_reference: value(form,"order_reference"), expected_date: value(form,"expected_date") }));
}
export async function receivePurchaseAction(form: FormData) {
  const actor = await requireActor(); const id = value(form,"request_id");
  await run(purchasePath(id), () => receivePurchase(actor,id,{
    submission_key: value(form,"submission_key"), line_id: value(form,"line_id"), warehouse_id: value(form,"warehouse_id"),
    quantity: value(form,"quantity"), guide_number: value(form,"guide_number"), invoice_number: value(form,"invoice_number"), payment_status: value(form,"payment_status"),
  }));
}
export async function adjustStockAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => adjustStock(actor,{ item_id: value(form,"item_id"), warehouse_id: value(form,"warehouse_id"),
    direction: value(form,"direction"), quantity: value(form,"quantity"), reason: value(form,"reason") }));
}
export async function transferStockAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => transferStock(actor,{ item_id: value(form,"item_id"), from_id: value(form,"from_id"),
    to_id: value(form,"to_id"), quantity: value(form,"quantity"), reason: value(form,"reason") }));
}
export async function reserveStockAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => reserveStock(actor,{ item_id: value(form,"item_id"), warehouse_id: value(form,"warehouse_id"),
    quantity: value(form,"quantity"), reason: value(form,"reason") }));
}
export async function closeReservationAction(form: FormData) {
  const actor = await requireActor();
  await run("/inventario", () => closeReservation(actor,value(form,"reservation_id"),value(form,"action") as "liberar" | "consumir"));
}
