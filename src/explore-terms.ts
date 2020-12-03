import { ExploreTerm } from "pizza-bot-shared";
import { getEntitiesAndConcepts } from "./lib/discovery-service";
import fs = require("fs");
import path = require("path");

class ExploreTermHandler {
    /** A list of terms to ignore */
    private ignoredTerms = new Set<string>();

    /** A map from entity/concept -> [Title, Wikipedia URL] */
    private articleTitles = new Map<string, [string, string]>();

    /** A map from article title -> article summary */
    private summaries = new Map<string, string>();

    constructor() {
        this.populateIgnoredList();
        this.populateArticleNames();
        this.populateSummaries();
        this.checkTerms();
    }

    /** Indicates whether the given term should be ignored */
    shouldIgnoreTerm(term: string): boolean {
        return this.ignoredTerms.has(term);
    }

    /** Gets the ExploreTerm for the given term string, or null if the term should be ignored */
    getExploreTerm(term: string): ExploreTerm {
        if (this.articleTitles.has(term)) {
            const [articleTitle, articleLink] = this.articleTitles.get(term);
            const articleSummary = this.summaries.get(articleTitle) || "";

            return {
                articleTitle,
                articleLink,
                originalTerm: term,
                articleSummary,
            };
        } else {
            return {
                articleTitle: "",
                articleLink: "",
                originalTerm: term,
                articleSummary: "",
            };
        }
    }

    /** Loads the list of ignored terms from data/ignored-terms.txt */
    private populateIgnoredList() {
        const ignoredTermsList = fs
            .readFileSync(path.join("src", "data", "ignored-terms.txt"), "utf8")
            .toString();
        this.ignoredTerms = new Set(
            ignoredTermsList.split("\n").map((s) => s.trim())
        );
    }

    /** Loads the map of terms -> article names from the data at the top of this file */
    private populateArticleNames() {
        const lines = fs
            .readFileSync(path.join("src", "data", "article-names.txt"), "utf8")
            .toString()
            .split("\n")
            .map((line) => line.trim().split("|"));

        const articleTitles = new Map<string, [string, string]>();
        for (const line of lines) {
            articleTitles.set(line[1], [line[0], line[2]]);
        }

        this.articleTitles = articleTitles;
    }

    private populateSummaries() {
        const file = path.join("src", "data", "article-summaries.json");
        const summaryObj: { [key: string]: string } = JSON.parse(
            fs.readFileSync(file).toString()
        );

        const map = new Map<string, string>();
        for (const url in summaryObj) {
            map.set(url, summaryObj[url]);
        }

        this.summaries = map;
    }

    /** Checks the ignored and mapped terms against the list of terms from discovery, finds unhandled terms */
    private async checkTerms(): Promise<void> {
        const terms = await getEntitiesAndConcepts();

        for (const term of terms) {
            if (!this.hasTerm(term)) {
                console.log(
                    `WARN: Missing term -> article mapping for "${term}"`
                );
            }

            if (this.hasTerm(term) && !this.shouldIgnoreTerm(term)) {
                const [title] = this.articleTitles.get(term);
                if (!this.summaries.get(title)) {
                    console.log(
                        `WARN: Missing article summary for "${title}"`
                    );
                }
            }            
        }

        // TODO check summaries
        

        console.log("INFO: Finished checking terms.");
    }

    /** Indicates whether the given term is known (ignored or mapped to an article title) */
    private hasTerm(term: string): boolean {
        return this.ignoredTerms.has(term) || this.articleTitles.has(term);
    }
}

// Singleton.. I think?
const handler = new ExploreTermHandler();
export const Explorer = handler;
