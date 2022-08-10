/**
 * COPYRIGHT 2022 Phil Bladen www.philbladen.co.uk
 */

import styles from "../styles/overlay.module.scss";

import moment from "moment";

import Chart, { Point } from "../components/chart";

import * as Manifold from "common/manifold-defs";
import { getCanvasFont, getTextWidth } from "../utils/utils";
import { FullBet } from "common/transaction";

import io from "socket.io-client";
import { Col } from "web/components/layout/col";
import { useEffect } from "react";
import Head from "next/head";
import { Row } from "web/components/layout/row";
import clsx from "clsx";
import * as Packet from "common/packet-ids";

const APIBase = "https://dev.manifold.markets/api/v0/";

class BetElement {
    bet: FullBet;
    element: HTMLDivElement;
}

class Application {
    readonly transactionTemplate: HTMLElement;
    readonly chart: Chart;

    betElements: BetElement[] = [];

    currentProbability_percent = 0;
    animatedProbability_percent: number = this.currentProbability_percent;

    currentMarket: Manifold.LiteMarket = null;

    constructor() {
        this.transactionTemplate = document.getElementById("transaction-template");
        this.transactionTemplate.removeAttribute("id");
        this.transactionTemplate.parentElement.removeChild(this.transactionTemplate);

        this.chart = new Chart(document.getElementById("chart") as HTMLCanvasElement);

        moment.relativeTimeThreshold("s", 60);
        moment.updateLocale("en", {
            relativeTime: {
                future: "in %s",
                past: "%s",
                s: "%ds",
                ss: "%ss",
                m: "1m",
                mm: "%dm",
                h: "1h",
                hh: "%dh",
                d: "1d",
                dd: "%dd",
                M: "1m",
                MM: "%dM",
                y: "1y",
                yy: "%dY",
            },
        });

        //!!! This all needs to move to another polling system for the market probability:
        const animationFrame = () => {
            this.animatedProbability_percent += (this.currentProbability_percent - this.animatedProbability_percent) * 0.1;
            document.getElementById("chance").innerHTML = this.animatedProbability_percent.toFixed(0);

            window.requestAnimationFrame(animationFrame);
        };
        window.requestAnimationFrame(animationFrame);

        // Update bet times:
        setInterval(() => this.updateBetTimes(), 1000);

        // let lastAddedTimestamp = 0;
        const socket = io();
        socket.on("bets", (bets: FullBet[]) => {
            // console.log(bet);
            // bets.reverse();
            if (bets.length > 3) {
                bets.splice(0, bets.length - 3);
            }
            for (const bet of bets) {
                // if (bet.createdTime <= lastAddedTimestamp) {
                //     continue;
                // }
                this.addBet(bet);
                // lastAddedTimestamp = bet.createdTime;
            }

            console.log(bets);
        });
        socket.on(Packet.SELECT_MARKET_ID, (marketID: string) => {
            this.loadMarketByID(marketID);
            console.log("Selecting market by ID: " + marketID);
        });
        socket.on(Packet.CLEAR, () => {
            this.resetUI();

            this.chart.data = [];
            for (const bet of this.betElements) {
                bet.element.parentElement.removeChild(bet.element);
            }
            this.betElements = [];
        });
    }

    resetUI() {
        document.getElementById("question").innerHTML = "";
        document.getElementById("spinner").style.display = "";
        this.chart.canvasElement.style.display = "none";
        document
            .getElementById("chance")
            .parentElement.querySelectorAll("div")
            .forEach((r) => {
                if (r.id !== "spinner") r.classList.add("invisible");
            });
    }

    updateBetTimes() {
        try {
            this.betElements.forEach((t) => {
                t.element.querySelector(".time").innerHTML = moment(t.bet.createdTime).fromNow();
            });
        } catch (e) {
            // Empty
        }
    }

    loadMarketByID(id: string) {
        fetch(`${APIBase}market/${id}/lite`)
            .then((r) => r.json() as Promise<Manifold.LiteMarket>)
            .then((market) => {
                this.currentMarket = market;
                this.currentMarket["slug"] = this.currentMarket.url.substring(this.currentMarket.url.lastIndexOf("/") + 1, this.currentMarket.url.length); //!!!

                this.chart.canvasElement.style.display = "";

                document.getElementById("question").innerHTML = this.currentMarket.question;
                this.currentProbability_percent = this.currentMarket.probability * 100;
                this.animatedProbability_percent = this.currentProbability_percent;
                console.log(market);

                document.getElementById("spinner").style.display = "none";
                document
                    .getElementById("chance")
                    .parentElement.querySelectorAll("div")
                    .forEach((r) => r.classList.remove("invisible"));

                this.loadBettingHistory();

                this.chart.resize();
            })
            .catch((e) => {
                console.error(e);
            });
    }

    loadBettingHistory() {
        fetch(`${APIBase}bets?market=${this.currentMarket["slug"]}&limit=1000`)
            .then((r) => r.json() as Promise<Manifold.Bet[]>)
            .then((r) => {
                const data: Point[] = [];
                r.reverse(); // Data is returned in newest-first fashion and must be pushed in oldest-first
                for (const t of r) {
                    data.push(new Point(t.createdTime, t.probBefore));
                    data.push(new Point(t.createdTime, t.probAfter));
                }
                this.chart.data = data;
            })
            .catch((r) => {
                console.error(r);
            });
    }

    addBet(bet: FullBet) {
        // const maxNameLength = 20; //!!! hack
        let name = bet.username; //!!!
        // if (name.length > maxNameLength) {
        //     name = name.substring(0, maxNameLength - 3);
        //     name += "...";
        // }

        const betAmountMagnitude = Math.abs(Math.ceil(bet.amount));

        let positiveBet = false;
        if ((bet.amount > 0 && bet.outcome == "YES") || (bet.amount < 0 && bet.outcome == "NO")) {
            positiveBet = true;
        }

        const t = this.transactionTemplate.cloneNode(true) as HTMLDivElement;
        document.getElementById("transactions").prepend(t);
        //
        const nameDiv = t.querySelector(".name") as HTMLElement;
        const divFont = getCanvasFont(nameDiv);
        let isTruncated = false;
        while (getTextWidth(name + (isTruncated ? "..." : ""), divFont) > 400) {
            name = name.substring(0, name.length - 1);
            isTruncated = true;
        }
        nameDiv.innerHTML = name + (isTruncated ? "..." : "");
        //
        t.querySelector(".amount").innerHTML = betAmountMagnitude.toFixed(0);
        t.querySelector(".boughtSold").innerHTML = (bet.amount < 0 ? "sold " : "") + (positiveBet ? "YES" : "NO");
        (t.querySelector(".color") as HTMLElement).style.color = positiveBet ? "#92ff83" : "#ff3d3d";

        const response = document.createElement("p");
        // response.classList.add(bet.outcome == "YES" ? "yes" : "no");
        t.appendChild(response);

        // t.innerHTML = bet.displayText; //!!! REMOVE

        const betElement = new BetElement();
        betElement.element = t;
        betElement.bet = bet;

        this.betElements.push(betElement);
        t.offsetLeft;
        setTimeout(() => {
            t.classList.add("!h-[1.2em]");
        }, 1);

        if (this.betElements.length > 3) {
            const transactionToRemove = this.betElements.shift().element;
            transactionToRemove.classList.remove("!h-[1.2em]");
            setTimeout(() => {
                transactionToRemove.parentElement.removeChild(transactionToRemove);
            }, 500);
        }

        if (this.currentMarket) {
            this.currentMarket.probability = bet.probAfter;
            this.currentProbability_percent = this.currentMarket.probability * 100;
            this.chart.data.push(new Point(bet.createdTime, bet.probBefore));
            this.chart.data.push(new Point(bet.createdTime, bet.probAfter));
        }

        this.updateBetTimes();
    }
}

export default () => {
    useEffect(() => {
        new Application();
    }, []);
    return (
        <>
            <Head>
                <title>Overlay</title>
                <meta name="viewport" />
                {/* <meta name="viewport" content="initial-scale=1.0, width=device-width" /> */}
                <style>{`
                    body,:root {
                        background-color: transparent !important;
                    }
                `}</style>
            </Head>
            <Col className={clsx("absolute text-white bg-[#212121] leading-[normal] inset-0", styles.border)} style={{ fontSize: "calc(min(70px, 4.5vw))" }}>
                <Row className="items-center justify-center p-[0.25em] pt-[0.1em]">
                    <div id="question" className="pr-[0.5em] grow shrink text-center"></div>
                    <Col className="items-center justify-center justify-self-end">
                        <div id="chance" className="after:content-['%'] text-[1.5em] text-[#A5FF6E] invisible"></div>
                        <div className="-mt-[0.3em] text-[0.7em] text-[#A5FF6E] invisible">chance</div>
                        <div id="spinner" className={clsx("absolute", styles.spinner)}></div>
                    </Col>
                </Row>
                <Col className="relative grow shrink items-stretch min-h-0">
                    <canvas id="chart" className="absolute" style={{ aspectRatio: "unset" }}></canvas>
                </Col>
                <Row className="justify-end items-center p-[0.2em]">
                    <Col id="transactions" className="grow shrink h-full items-start justify-end">
                        <div id="transaction-template" className={styles.bet}>
                            <div className="name font-bold"></div>
                            &nbsp;
                            <div className="color">
                                <p className="boughtSold"></p> M$<p className="amount">1000</p>
                            </div>
                        </div>
                    </Col>
                    <Col className="text-center">
                        <div
                            style={{
                                backgroundImage: "url(logo-white.svg)",
                                backgroundSize: "contain",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                                aspectRatio: "1",
                                display: "block",
                                height: "1.5em",
                            }}
                        ></div>
                        <div className="text-[0.4em] whitespace-nowrap" style={{ fontFamily: "Major Mono Display, monospace" }}>
                            manifold
                            <br />
                            markets
                        </div>
                        <div className="text-center text-[0.7em]" style={{ fontWeight: "bold" }}>
                            !signup
                        </div>
                    </Col>
                </Row>
            </Col>
        </>
    );
};