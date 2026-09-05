import { sql } from "kysely";

export async function up(db) {
  await db.schema
    .alterTable("provider_credentials")
    .dropConstraint("provider_credentials_type_ck")
    .execute();
  await db.schema
    .alterTable("provider_credentials")
    .addCheckConstraint(
      "provider_credentials_type_ck",
      sql`credential_type in ('music_u', 'steam_web_api')`
    )
    .execute();
  await db.schema
    .alterTable("provider_data_catalogs")
    .dropConstraint("provider_data_catalogs_provider_ck")
    .execute();
  await db.schema
    .alterTable("provider_data_catalogs")
    .addCheckConstraint("provider_data_catalogs_provider_ck", sql`provider in ('netease', 'steam')`)
    .execute();
}

export async function down(db) {
  const credential = await db
    .selectFrom("provider_credentials")
    .select("id")
    .where("credential_type", "=", "steam_web_api")
    .executeTakeFirst();
  const catalog = await db
    .selectFrom("provider_data_catalogs")
    .select("provider_connection_id")
    .where("provider", "=", "steam")
    .executeTakeFirst();
  if (credential || catalog)
    throw new Error(
      "Steam data exists; export or explicitly remove it before rolling back the Steam migration."
    );
  await db.schema
    .alterTable("provider_data_catalogs")
    .dropConstraint("provider_data_catalogs_provider_ck")
    .execute();
  await db.schema
    .alterTable("provider_data_catalogs")
    .addCheckConstraint("provider_data_catalogs_provider_ck", sql`provider = 'netease'`)
    .execute();
  await db.schema
    .alterTable("provider_credentials")
    .dropConstraint("provider_credentials_type_ck")
    .execute();
  await db.schema
    .alterTable("provider_credentials")
    .addCheckConstraint("provider_credentials_type_ck", sql`credential_type = 'music_u'`)
    .execute();
}
