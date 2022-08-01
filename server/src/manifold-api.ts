import * as ManifoldAPI from "common/manifold-defs";
import fetch, { Response } from "node-fetch";
import { ForbiddenException, InsufficientBalanceException } from "./exceptions";

const APIBase = "https://dev.manifold.markets/api/v0/";

async function post(url: string, APIKey: string, requestData: unknown): Promise<Response> {
    const r = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${APIKey}`,
        },
        ...(requestData
            ? {
                  body: JSON.stringify(requestData),
              }
            : []),
    });
    if (r.status !== 200) {
        const error = <{ message: string }>await r.json();
        const errorMessage = error.message;
        if (errorMessage === "Insufficient balance.") throw new InsufficientBalanceException();
        if (errorMessage === "Balance must be at least 100.") throw new InsufficientBalanceException();
        if (r.status === 403) throw new ForbiddenException();
        throw new Error(errorMessage);
    }
    return r;
}

export async function getUserByID(userID: string): Promise<ManifoldAPI.LiteUser> {
    return <Promise<ManifoldAPI.LiteUser>> (await fetch(`${APIBase}user/by-id/${userID}`)).json();
}

export async function getUserByManifoldUsername(manifoldUsername: string): Promise<ManifoldAPI.LiteUser> {
    return <Promise<ManifoldAPI.LiteUser>> (await fetch(`${APIBase}user/${manifoldUsername}`)).json();
}

/*
* WARNING: This is generally a messy function as it uses a market's slug and user's username instead of the relevant IDs
*/
export async function getUsersStakeInMarket_shares(marketSlug: string, manifoldUsername: string): Promise<{ shares: number; outcome: "YES" | "NO" }> {
    return fetch(`${APIBase}bets?market=${marketSlug}&username=${manifoldUsername}`)
        .then((r) => <Promise<ManifoldAPI.Bet[]>>r.json())
        .then((bets) => {
            let total = 0;
            for (const bet of bets) {
                if (bet.outcome == "YES") total += bet.shares;
                else total -= bet.shares;
            }
            return { shares: Math.abs(total), outcome: total > 0 ? "YES" : "NO" };
        });
}

export async function sellShares(marketID: string, APIKey: string, outcome: "YES" | "NO" | number): Promise<Response> {
    return post(`${APIBase}market/${marketID}/sell`, APIKey, { outcome: outcome });
}

export async function createBinaryMarket(APIKey: string, question: string, description: string, initialProb_percent: number): Promise<ManifoldAPI.LiteMarket> {
    const outcomeType: "BINARY" | "FREE_RESPONSE" | "NUMERIC" = "BINARY";
    const descriptionObject = {
        type: "doc",
        content: [
            ...(description
                ? [
                      {
                          type: "paragraph",
                          content: [
                              {
                                  type: "text",
                                  text: question,
                              },
                          ],
                      },
                  ]
                : []),
        ],
    };
    const requestData = {
        outcomeType: outcomeType,
        question: question,
        description: descriptionObject,
        closeTime: Date.now() + 1e12, // Arbitrarily long time in the future
        initialProb: initialProb_percent,
    };
    return <Promise<ManifoldAPI.LiteMarket>> (await post(`${APIBase}market`, APIKey, requestData)).json();
}

export async function resolveBinaryMarket(marketID: string, APIKey: string, outcome: ManifoldAPI.ResolutionOutcome): Promise<Response> {
    return post(`${APIBase}market/${marketID}/resolve`, APIKey, { outcome: outcome });
}

export async function placeBet(marketID: string, APIKey: string, amount: number, outcome: "YES" | "NO"): Promise<Response> {
    const requestData = {
        amount: amount,
        contractId: marketID,
        outcome: outcome,
    };
    return post(`${APIBase}bet`, APIKey, requestData);
}

export async function verifyAPIKey(APIKey: string): Promise<boolean> {
    try {
        await post(`${APIBase}bet`, APIKey, null);
    } catch (e) {
        if (e instanceof ForbiddenException) return false;
    }
    return true;
}

export async function getLatestMarketBets(marketSlug: string, numBetsToLoad?: number): Promise<ManifoldAPI.Bet[]> {
    return <Promise<ManifoldAPI.Bet[]>> (await fetch(`${APIBase}bets?market=${marketSlug}${numBetsToLoad?`&limit=${numBetsToLoad}`:""}`)).json();
}

export async function getMarketBySlug(marketSlug: string): Promise<ManifoldAPI.LiteMarket> {
    return <Promise<ManifoldAPI.LiteMarket>> (await fetch(`${APIBase}slug/${marketSlug}`)).json();
}