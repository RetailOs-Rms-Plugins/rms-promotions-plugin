import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613120001 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" add column if not exists "metadata" jsonb null;`);

    this.addSql(`alter table if exists "promotion_ext_rule_group" add column if not exists "metadata" jsonb null;`);

    this.addSql(`alter table if exists "promotion_ext_rule" add column if not exists "metadata" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" drop column if exists "metadata";`);

    this.addSql(`alter table if exists "promotion_ext_rule_group" drop column if exists "metadata";`);

    this.addSql(`alter table if exists "promotion_ext_rule" drop column if exists "metadata";`);
  }

}
