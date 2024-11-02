import { MigrationInterface, QueryRunner } from "typeorm";

export class TeamSeeding1730503640302 implements MigrationInterface {
    name = "TeamSeeding1730503640302";

    public async up (queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`team\` ADD \`seed\` double`);
    }

    public async down (queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`team\` DROP COLUMN \`seed\``);
    }

}
