import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260511132506 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "promotion_ext_promotion_config" ("id" text not null, "promotion_id" text not null, "auto_apply" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "promotion_ext_promotion_config_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promotion_ext_promotion_config_deleted_at" ON "promotion_ext_promotion_config" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "promotion_ext_rule_group" ("id" text not null, "type" text not null, "promotion_config_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "promotion_ext_rule_group_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promotion_ext_rule_group_promotion_config_id" ON "promotion_ext_rule_group" ("promotion_config_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promotion_ext_rule_group_deleted_at" ON "promotion_ext_rule_group" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "promotion_ext_rule" ("id" text not null, "rule_type" text not null, "config" jsonb not null, "rule_group_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "promotion_ext_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promotion_ext_rule_rule_group_id" ON "promotion_ext_rule" ("rule_group_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_promotion_ext_rule_deleted_at" ON "promotion_ext_rule" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "promotion_ext_rule_group" add constraint "promotion_ext_rule_group_promotion_config_id_foreign" foreign key ("promotion_config_id") references "promotion_ext_promotion_config" ("id") on update cascade;`);

    this.addSql(`alter table if exists "promotion_ext_rule" add constraint "promotion_ext_rule_rule_group_id_foreign" foreign key ("rule_group_id") references "promotion_ext_rule_group" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_rule_group" drop constraint if exists "promotion_ext_rule_group_promotion_config_id_foreign";`);

    this.addSql(`alter table if exists "promotion_ext_rule" drop constraint if exists "promotion_ext_rule_rule_group_id_foreign";`);

    this.addSql(`drop table if exists "promotion_ext_promotion_config" cascade;`);

    this.addSql(`drop table if exists "promotion_ext_rule_group" cascade;`);

    this.addSql(`drop table if exists "promotion_ext_rule" cascade;`);
  }

}
