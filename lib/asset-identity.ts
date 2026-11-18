import type {Db} from "./db";

export const normalizedPlate=(plate:string)=>plate.toUpperCase().replace(/[^A-Z0-9]/g,"");
export async function existingPlate(tx:Db,plate:string,excludeId:string|null=null){
  const normalized=normalizedPlate(plate);
  if(!normalized)return null;
  const [asset]=await tx.query<{id:string;code:string}>(`SELECT id,code FROM assets WHERE deleted_at IS NULL
    AND ($2::uuid IS NULL OR id<>$2::uuid)
    AND regexp_replace(upper(plate),'[^A-Z0-9]','','g')=$1 ORDER BY code LIMIT 1`,[normalized,excludeId]);
  return asset??null;
}
