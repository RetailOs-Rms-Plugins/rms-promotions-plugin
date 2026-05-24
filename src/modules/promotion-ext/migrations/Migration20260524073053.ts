import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260524073053 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "cart_ext_adjustment" ("id" text not null, "description" text null, "promotion_id" text null, "code" text null, "amount" numeric not null, "provider_id" text null, "metadata" jsonb null, "item_id" text null, "is_tax_inclusive" boolean not null default false, "cart_id" text not null, "source" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "cart_ext_adjustment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_cart_ext_adjustment_deleted_at" ON "cart_ext_adjustment" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "cart_ext_adjustment" cascade;`);
  }

}
