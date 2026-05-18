import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260518111622 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" add column if not exists "include_groups_combinator" text not null default 'or', add column if not exists "exclude_groups_combinator" text not null default 'or';`);

    this.addSql(`alter table if exists "promotion_ext_rule_group" add column if not exists "rules_combinator" text not null default 'and';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "promotion_ext_config" drop column if exists "include_groups_combinator", drop column if exists "exclude_groups_combinator";`);

    this.addSql(`alter table if exists "promotion_ext_rule_group" drop column if exists "rules_combinator";`);
  }

}
