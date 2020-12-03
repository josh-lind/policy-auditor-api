import fs = require("fs");
import path = require("path");
import wiki, { Options } from "wikijs";
import { getEntitiesAndConcepts } from "../lib/discovery-service";

const ArticleNameFile: string = path.join("src", "data", "article-names.txt");
const SummaryFile: string = path.join("src", "data", "article-summaries.json");
const wikipedia = wiki({
    headers: {
        "User-Agent":
            "presidential-policy-auditor (https://pulpdrew.com; pulpdrew@gmail.com) wiki.js",
    },
} as Options);

/**
 * Read article-names.txt into a map from term -> [title, url]
 */
function readArticleNames(): Map<string, [string, string]> {
    const lines = fs
        .readFileSync(ArticleNameFile)
        .toString()
        .split("\n")
        .map((line) => line.trim().split("|"));

    const map = new Map<string, [string, string]>();
    for (const line of lines) {
        map.set(line[1], [line[0], line[2]]);
    }

    return map;
}

/**
 * Write the given mapping from term -> [title, url] to article-names.txt
 */
function writeArticleNames(articleTitles: Map<string, [string, string]>) {
    const entries = [...articleTitles.entries()];
    const lines = entries
        .map(([term, [articleTitle, url]]) => `${articleTitle}|${term}|${url}`)
        .sort();

    fs.writeFileSync(ArticleNameFile, lines.join("\n"));
}

/**
 * Read the map of article title -> summary in article-summaries.json
 */
function readSummaries(): Map<string, string> {
    const summaryObj: { [key: string]: string } = JSON.parse(
        fs.readFileSync(SummaryFile).toString()
    );

    const map = new Map<string, string>();
    for (const url in summaryObj) {
        map.set(url, summaryObj[url]);
    }

    return map;
}

/**
 * Save the article title -> article summary map in article-summaries.json
 */
function writeSummaries(summaries: Map<string, string>) {
    const summaryObj: { [key: string]: string } = {};
    for (const entry of summaries.entries()) {
        summaryObj[entry[0]] = entry[1];
    }

    fs.writeFileSync(SummaryFile, JSON.stringify(summaryObj));
}

/**
 * Search wikipedia for an article with the given title.
 *
 * Returns null if no result was found or a tuple [url, title, summary] of the Article.
 */
async function findArticle(title: string): Promise<[string, string] | null> {
    try {
        const page = await wikipedia.find(title);
        if (!page) return null;

        // Get the title from the last segment of the URL
        const urlParts = decodeURIComponent(page.url().toString()).split("/");
        const newTitle = urlParts[urlParts.length - 1]
            .replace(/_/g, " ")
            .trim();

        return [page.url().toString(), newTitle];
    } catch (err) {
        console.log(
            `ERROR: Caught error when fetching page "${title}": ${JSON.stringify(
                err
            )}`
        );
        return null;
    }
}

/** Get the summary of the article with the given title */
async function getArticleSummary(title: string): Promise<string> {
    try {
        return await (await wikipedia.find(title)).summary();
    } catch (err) {
        return "";
    }
}

/**
 * Read and return the set of ignored terms
 */
function readIgnoredList(): Set<string> {
    const ignoredTermsList = fs
        .readFileSync(path.join("src", "data", "ignored-terms.txt"), "utf8")
        .toString();
    return new Set(ignoredTermsList.split("\n").map((s) => s.trim()));
}

/**
 * Download and save the summaries for all of the terms
 */
async function downloadSummaries() {
    const mapping = await readArticleNames();
    const summaries = await readSummaries();

    for (const [_, [title]] of mapping.entries()) {
        if (!summaries.has(title)) {
            summaries.set(title, await getArticleSummary(title));
            console.log("INFO: Got summary for " + title);
        }
    }

    writeSummaries(summaries);
}

/**
 * Update the term -> article title information in article-names.txt
 */
async function populateTerms() {
    const mapping = readArticleNames();
    const terms = await getEntitiesAndConcepts();
    const ignoredTerms = readIgnoredList();

    // Find terms that have not been mapped yet. Attempt to map them
    for (const term of terms) {
        if (!mapping.has(term) && !ignoredTerms.has(term)) {
            const result = await findArticle(term);

            if (result) {
                const [url, title] = result;
                mapping.set(term, [term, url]);
                console.log(
                    `INFO: Mapped new term "${term}" -> ${title} (${url})`
                );
            } else {
                console.log(`WARN: Could not find article for "${term}."`);
            }
        }
    }

    // Remove terms that have been ignored
    for (const term of ignoredTerms) {
        if (mapping.has(term)) {
            mapping.delete(term);
            console.log("INFO: Removed ignored term " + term);
        }
    }

    writeArticleNames(mapping);
}

populateTerms().then(() =>
    downloadSummaries().then(() => console.log("INFO: Finished"))
);
