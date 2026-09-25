import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  if (password.length < 12 || password.length > 128) throw new Error("La contraseña debe tener entre 12 y 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hash || !/^[0-9a-f]{128}$/.test(hash)) return false;
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}
