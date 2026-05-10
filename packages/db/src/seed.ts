/**
 * Seed file — inserts 3 sample parcels in Lagos, Nigeria (WGS84).
 * Run: npm run db:seed (from packages/db)
 */
import { config } from "dotenv";
config({ path: "../../.env" });

import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });

async function seed() {
  console.log("🌱 Seeding database...");

  await sql`
    INSERT INTO parcels (parcel_number, geometry, area_sqm, perimeter_m, status)
    VALUES
      (
        'LG/LI/001/2024',
        ST_Multi(ST_GeomFromText(
          'POLYGON((3.3792 6.4550, 3.3800 6.4550, 3.3800 6.4558, 3.3792 6.4558, 3.3792 6.4550))',
          4326
        )),
        6200.00, 320.00, 'active'
      ),
      (
        'LG/VI/002/2024',
        ST_Multi(ST_GeomFromText(
          'POLYGON((3.4210 6.4280, 3.4225 6.4280, 3.4225 6.4292, 3.4210 6.4292, 3.4210 6.4280))',
          4326
        )),
        8500.00, 410.00, 'active'
      ),
      (
        'LG/IK/003/2024',
        ST_Multi(ST_GeomFromText(
          'POLYGON((3.3520 6.5900, 3.3535 6.5900, 3.3535 6.5912, 3.3520 6.5912, 3.3520 6.5900))',
          4326
        )),
        4800.00, 280.00, 'disputed'
      )
    ON CONFLICT (parcel_number) DO NOTHING;
  `;

  const parcels = await sql`
    SELECT id, parcel_number FROM parcels
    WHERE parcel_number IN ('LG/LI/001/2024', 'LG/VI/002/2024', 'LG/IK/003/2024')
  `;

  const parcelMap = Object.fromEntries(
    parcels.map((p: any) => [p.parcel_number, p.id])
  );

  await sql`
    INSERT INTO land_titles (parcel_id, title_number, owner_name, owner_id, title_type, issue_date, registered_by)
    VALUES
      (
        ${parcelMap["LG/LI/001/2024"]}, 'CT/LG/001/2024', 'Adebayo Okonkwo',
        'NIN-12345678901', 'freehold', '2024-03-15', 'Lagos State Land Registry'
      ),
      (
        ${parcelMap["LG/VI/002/2024"]}, 'CT/LG/002/2024', 'Sunrise Properties Ltd',
        'RC-987654', 'leasehold', '2024-01-10', 'Lagos State Land Registry'
      )
    ON CONFLICT (title_number) DO NOTHING;
  `;

  await sql`
    INSERT INTO zoning (parcel_id, zone_code, zone_label, floor_area_ratio, max_height_m, effective_date)
    VALUES
      (${parcelMap["LG/LI/001/2024"]}, 'R1', 'Residential Low Density', 0.50, 9.00, '2020-01-01'),
      (${parcelMap["LG/VI/002/2024"]}, 'C1', 'Commercial', 2.00, 30.00, '2020-01-01'),
      (${parcelMap["LG/IK/003/2024"]}, 'R2', 'Residential High Density', 1.50, 21.00, '2020-01-01')
    ON CONFLICT DO NOTHING;
  `;

  await sql`
    INSERT INTO disputes (parcel_id, dispute_type, claimant, respondent, filed_date, status, notes)
    VALUES (
      ${parcelMap["LG/IK/003/2024"]}, 'boundary', 'Emmanuel Nwosu',
      'Lagos State Government', '2023-11-20', 'open',
      'Claimant disputes eastern boundary following road expansion project'
    )
    ON CONFLICT DO NOTHING;
  `;

  console.log("✅ Seed complete — 3 parcels, 2 titles, 3 zoning records, 1 dispute inserted.");
  await sql.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
