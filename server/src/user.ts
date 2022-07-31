import * as ManifoldAPI from "common/manifold-defs";
import * as Manifold from "./manifold-api";

export default class User2 {
    twitchLogin: string;
    manifoldUsername: string;
    APIKey: string;

    public async getBalance(): Promise<number> {
        return (await Manifold.getUserByManifoldUsername(this.manifoldUsername)).balance;
    }

    public async getStakeInMarket_shares(marketSlug: string): Promise<{ shares: number; outcome: "YES" | "NO" }> {
        return Manifold.getUsersStakeInMarket_shares(marketSlug, this.manifoldUsername);
    }

    public async allIn(twitchUsername: string, yes: boolean) {
        this.placeBet(twitchUsername, Math.floor(await this.getBalance()), yes);
    }

    async sellAllShares(marketID: string, marketSlug: string): Promise<void> {
        const stake = await this.getStakeInMarket_shares(marketSlug);
        if (Math.abs(stake.shares) < 1) return;
        Manifold.sellShares(marketID, this.APIKey, stake.outcome);
    }

    public async createBinaryMarket(question: string, description: string, initialProb_percent: number): Promise<ManifoldAPI.LiteMarket> {
        return Manifold.createBinaryMarket(this.APIKey, question, description, initialProb_percent);
    }

    public async resolveBinaryMarket(marketID: string, outcome: ManifoldAPI.ResolutionOutcome) {
        return Manifold.resolveBinaryMarket(marketID, this.APIKey, outcome);
    }

    public async placeBet(marketID: string, amount: number, yes: boolean) {
        return Manifold.placeBet(marketID, this.APIKey, amount, yes ? "YES" : "NO");
    }
}