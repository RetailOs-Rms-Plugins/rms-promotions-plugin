import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260524141739 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" add column if not exists "promotion_mode" text not null default 'standard', add column if not exists "mode_config" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" drop column if exists "promotion_mode", drop column if exists "mode_config";`);
  }

}
