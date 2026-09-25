import { db, transaction } from "../lib/db";
import { hashPassword } from "../lib/password";
import { randomBytes } from "node:crypto";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const name = process.env.SEED_ADMIN_NAME?.trim() || "Administrador";
    const hashed = await hashPassword(password);
    await db.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (email) DO NOTHING`, [email, name, hashed],
    );
    console.log(`Administrador preparado: ${email}. Si ya existía, su contraseña no se modificó.`);
  } else {
    const [admin] = await db.query("SELECT id FROM users WHERE role='admin' AND active=true LIMIT 1");
    if (!process.argv.includes("--demo") || !admin) {
      throw new Error("Defina SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 12 caracteres) para crear el primer administrador.");
    }
  }
  if (process.argv.includes("--demo")) {
    const existing = await db.query("SELECT id FROM clients WHERE name = 'Cliente de demostración' AND deleted_at IS NULL");
    if (!existing.length) {
      const [client] = await db.query<{ id: string }>("INSERT INTO clients (name) VALUES ('Cliente de demostración') RETURNING id");
      await db.query("INSERT INTO client_sites (client_id, name, address) VALUES ($1, 'Faena de demostración', 'Calama')", [client.id]);
    }
    await db.query("INSERT INTO assets (code, label, kind, reading_unit) VALUES ('DEMO-01', 'Camión de demostración', 'camion', 'km') ON CONFLICT (code) DO NOTHING");
    await db.query("INSERT INTO assets (code, label, kind) VALUES ('DEMO-R01', 'Rampa de demostración', 'rampa') ON CONFLICT (code) DO NOTHING");
    const demoEmail = "conductor.demo@rerchar.invalid";
    const [driver] = await db.query("SELECT id FROM users WHERE email=$1", [demoEmail]);
    if (!driver) {
      const demoPassword = randomBytes(18).toString("base64url");
      await db.query("INSERT INTO users (email,name,password_hash,role) VALUES ($1,'Conductor de demostración',$2,'conductor')", [demoEmail, await hashPassword(demoPassword)]);
      console.log(`Acceso del conductor de demostración: ${demoEmail} / ${demoPassword} (guarde esta clave si probará ese perfil).`);
    }
    await db.query("INSERT INTO warehouses (code,name) VALUES ('DEMO-BOD-01','Bodega principal de demostración'),('DEMO-BOD-02','Bodega secundaria de demostración') ON CONFLICT (code) DO NOTHING");
    await db.query("INSERT INTO stock_items (code,name,unit,minimum_qty) VALUES ('DEMO-REP-01','Repuesto de demostración','un',5) ON CONFLICT (code) DO NOTHING");
    const [demoWarehouse] = await db.query<{ id: string }>("SELECT id FROM warehouses WHERE code='DEMO-BOD-01'");
    const [demoItem] = await db.query<{ id: string }>("SELECT id FROM stock_items WHERE code='DEMO-REP-01'");
    await transaction(async (tx) => {
      const [demoBalance] = await tx.query("SELECT item_id FROM stock_balances WHERE item_id=$1 AND warehouse_id=$2", [demoItem.id,demoWarehouse.id]);
      if (!demoBalance) {
        const [admin] = await tx.query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active=true ORDER BY created_at LIMIT 1");
        await tx.query("INSERT INTO stock_balances (item_id,warehouse_id,quantity) VALUES ($1,$2,12)", [demoItem.id,demoWarehouse.id]);
        await tx.query("INSERT INTO inventory_movements (item_id,warehouse_id,kind,qty_delta,note,created_by) VALUES ($1,$2,'ajuste_entrada',12,'Stock inicial ficticio de demostración',$3)", [demoItem.id,demoWarehouse.id,admin.id]);
      }
      const [admin] = await tx.query<{ id: string }>("SELECT id FROM users WHERE role='admin' AND active=true ORDER BY created_at LIMIT 1");
      const [truck] = await tx.query<{ id: string }>("SELECT id FROM assets WHERE code='DEMO-01'");
      const [existingPlan] = await tx.query("SELECT id FROM maintenance_plans WHERE asset_id=$1 AND title='Control preventivo de demostración'", [truck.id]);
      if (!existingPlan) {
        await tx.query(`INSERT INTO maintenance_plans (asset_id,title,frequency_kind,interval_days,next_due_date,created_by)
          VALUES ($1,'Control preventivo de demostración','fecha',30,current_date + 7,$2)`, [truck.id,admin.id]);
      }
      const [container] = await tx.query<{ id: string }>(`INSERT INTO containers
        (code,kind,capacity_m3,location_name,created_by) VALUES
        ('DEMO-T01','tolva',12,'Patio de demostración',$1)
        ON CONFLICT (code) DO NOTHING RETURNING id`, [admin.id]);
      if (container) {
        await tx.query(`INSERT INTO container_movements
          (container_id,kind,next_status,next_location,note,actor_id)
          VALUES ($1,'alta','patio','Patio de demostración','Alta ficticia para recorrido del piloto',$2)`, [container.id,admin.id]);
        await tx.query(`INSERT INTO audit_events (actor_id,action,entity_type,entity_id,next_value)
          VALUES ($1,'create','container',$2,$3)`, [admin.id,container.id,JSON.stringify({ code: "DEMO-T01", status: "patio", demo: true })]);
      }
    });
    console.log("Datos de demostración preparados: cliente, faena, flota, conductor, bodegas, repuesto, plan preventivo y tolva. No corresponden a registros reales de RERCHAR.");
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
