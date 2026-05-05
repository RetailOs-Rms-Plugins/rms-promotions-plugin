import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260505090932 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "threshold_rule" ("id" text not null, "min_cart_subtotal" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "threshold_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_threshold_rule_deleted_at" ON "threshold_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "threshold_rule" cascade;`);
  }

}
