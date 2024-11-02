import { BaseEntity, Column, CreateDateColumn, Entity, JoinTable, ManyToMany, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { User } from "../user";
import { Tournament } from "./tournament";
import { TeamInvite } from "./teamInvite";
import { Matchup } from "./matchup";
import { MatchupScore, MatchupScoreView, computeScoreViews, scoreSortType } from "../../Interfaces/matchup";
import { Team as TeamInterface, TeamMember } from "../../Interfaces/team";
import { BaseTournament } from "../../Interfaces/tournament";
import { MatchupSet } from "./matchupSet";
import { ModeDivisionType } from "../../Interfaces/modes";
import { UserStatistics } from "../userStatistics";

@Entity()
export class Team extends BaseEntity {

    @PrimaryGeneratedColumn()
        ID!: number;

    @CreateDateColumn()
        createdAt!: Date;

    @Column()
        name!: string;

    @Column()
        abbreviation!: string;

    @Column({ type: "int", default: 0 })
        timezoneOffset!: number;

    @ManyToOne(() => User, user => user.teamsManaged, {
        nullable: false,
    })
        captain!: User;

    @ManyToMany(() => User, user => user.teams)
    @JoinTable()
        members!: User[];

    @OneToMany(() => TeamInvite, invite => invite.team)
        invites?: TeamInvite[] | null;

    @ManyToMany(() => Tournament, tournament => tournament.teams)
        tournaments!: Tournament[];

    @Column({ type: "varchar", nullable: true })
        avatarURL?: string | null;

    @Column("double")
        BWS!: number;

    @Column("double")
        rank!: number;

    @Column("double")
        pp!: number;

    @Column("double")
        seed!: number;    

    @OneToMany(() => Matchup, matchup => matchup.team1)
        matchupsAsTeam1!: Matchup[];

    @OneToMany(() => Matchup, matchup => matchup.team2)
        matchupsAsTeam2!: Matchup[];

    @OneToMany(() => MatchupSet, set => set.first)
        setsFirst!: Matchup[];

    @OneToMany(() => MatchupSet, set => set.winner)
        setWins!: Matchup[];

    @OneToMany(() => Matchup, matchup => matchup.winner)
        wins!: Matchup[];

    @ManyToMany(() => Matchup, matchup => matchup.teams)
        matchupGroup!: Matchup[];

    public async calculateStats (modeID: ModeDivisionType = 1) {
        if (modeID === ModeDivisionType.storyboard)
            return false;

        try {
            const userStatistics = await Promise.all(this.members.map(member => member.refreshStatistics(modeID)));

            const BWS = userStatistics.reduce((acc, cur) => acc + cur!.BWS, 0);
            const pp = userStatistics.reduce((acc, cur) => acc + cur!.pp, 0);
            const rank = userStatistics.reduce((acc, cur) => acc + cur!.rank, 0);

            this.BWS = BWS / (this.members.length || 1);
            this.pp = pp / (this.members.length || 1);
            this.rank = rank / (this.members.length || 1);

            return true;
        } catch (e) {
            this.pp = 0;
            this.rank = 0;
            this.BWS = 0;
            console.warn("Error in calculating team stats:\n", e);
            return false;
        }
    }

    public async teamInterface (queryQualifier = false, queryTournaments = false, queryMemberRanks = false): Promise<TeamInterface> {
        const qualifier = queryQualifier ? await Matchup
            .createQueryBuilder("matchup")
            .innerJoin("matchup.teams", "team")
            .innerJoin("matchup.stage", "stage")
            .where("team.ID = :teamID", { teamID: this.ID })
            .andWhere("stage.stageType = '0'")
            .getOne() : null;
        const tournaments: BaseTournament[] = this.tournaments?.map(t => ({
            ID: t.ID,
            name: t.name,
        })) || queryTournaments ? (await Tournament
                .createQueryBuilder("tournament")
                .innerJoin("tournament.teams", "team")
                .where("team.ID = :teamID", { teamID: this.ID })
                .select(["tournament.ID", "tournament.name"])
                .getMany()).map(t => ({
                ID: t.ID,
                name: t.name,
            })) : [];
        return {
            ID: this.ID,
            name: this.name,
            abbreviation: this.abbreviation,
            timezoneOffset: this.timezoneOffset,
            avatarURL: this.avatarURL ?? undefined,
            captain: {
                ID: this.captain.ID,
                username: this.captain.osu.username,
                osuID: this.captain.osu.userID,
                country: this.captain.country,
                rank: this.captain.userStatistics?.find(s => s.modeDivision.ID === 1)?.rank ?? queryMemberRanks ? (await UserStatistics
                    .createQueryBuilder("userStatistics")
                    .where("userStatistics.userID = :userID", { userID: this.captain.ID })
                    .andWhere("userStatistics.modeDivisionID = 1")
                    .select("userStatistics.rank")
                    .getOne())?.rank ?? 0 : 0,
                isCaptain: true,
            },
            members: await Promise.all(this.members.map<Promise<TeamMember>>(async member => {
                return {
                    ID: member.ID,
                    username: member.osu.username,
                    osuID: member.osu.userID,
                    country: member.country,
                    rank: member.userStatistics?.find(s => s.modeDivision.ID === 1)?.rank ?? queryMemberRanks ? (await UserStatistics
                        .createQueryBuilder("userStatistics")
                        .where("userStatistics.userID = :userID", { userID: member.ID })
                        .andWhere("userStatistics.modeDivisionID = 1")
                        .select("userStatistics.rank")
                        .getOne())?.rank ?? 0 : 0,
                    isCaptain: member.ID === this.captain.ID,
                };
            })),
            pp: this.pp,
            BWS: this.BWS,
            rank: this.rank,
            seed: this.seed,
            tournaments,
            qualifier: qualifier ? {
                ID: qualifier.ID,
                matchID: qualifier.matchID,
                date: qualifier.date,
                mp: qualifier.mp,
            } : undefined,
        };
    }

    public calculateSeed (scores: MatchupScore[], tournament: Tournament) {
        const syncView = "teams";
        const currentFilter: scoreSortType = "zScore";
        const mapSort = -1;
        const sortDir = "desc"; 

        const scoreViews: MatchupScoreView[] = computeScoreViews(
            score => ({ id: score.teamID, name: score.teamName, avatar: `https://a.ppy.sh/${score.teamID}` }),
            scores,
            syncView,
            currentFilter,
            mapSort,
            sortDir,
            tournament?.matchupSize ?? 4
        );

        console.log(scoreViews);

        for (const view of scoreViews) {
            if (view.ID == this.ID)
                this.seed = view.sortPlacement;
        }
    }
}
