import express = require("express");

import path = require("path");
import fs = require("fs");

import DiscoveryV1 = require("ibm-watson/discovery/v1");
import { environment } from "./environment";

import { QueryResult, cleanExcerpt, FeedbackBody } from "pizza-bot-shared";
import { getKExcerpts } from "pizza-bot-shared";
import { addTrainingExample, queryDiscovery } from "./lib/discovery-service";
import { displayNames } from "./display-names";
import { Explorer } from "./explore-terms";

const router = express.Router();

// The length of excerpts that should be returned as a part of each QueryResult, in characters
const EXCERPT_LENGTH = 500;

// Ex: http://localhost:3000/api
router.get("/", (req, res) => {
    res.send("Welcome to the Pizza Bot API");
});

const exploreTermHandler = Explorer;

// Ex: http://localhost:3000/api/query?subject=biden&q=Joe%20Biden
router.get("/query", async (req, res) => {
    const subject = req.query["subject"] as string | "";
    const q = req.query["q"] as string | "";

    let response: DiscoveryV1.QueryResponse;
    try {
        response = (await queryDiscovery(q, subject)).result;
        const results = response.results || [];
        const passages = response.passages || [];

        const formattedResults = results.map((result) =>
            formatQueryResult(q, subject, result, passages)
        );

        // Combine results for the same document that appear multiple times
        const combinedResults = new Map<string, QueryResult>();
        for (const result of formattedResults) {
            if (!combinedResults.has(result.filename)) {
                combinedResults.set(result.filename, result);
            } else {
                const duplicate = combinedResults.get(result.filename)!;
                const combined: QueryResult = {
                    ...duplicate,
                    categories: Array.from(
                        new Set([...duplicate.categories, ...result.categories])
                    ),
                    excerpts: Array.from(
                        new Set([...duplicate.excerpts, ...result.excerpts])
                    ),
                    confidence: Math.max(
                        duplicate.confidence,
                        result.confidence
                    ),
                    score: Math.max(duplicate.score, result.score),
                };
                combinedResults.set(result.filename, combined);
            }
        }

        // Sort and filter the results by confidence
        const finalResults = Array.from(combinedResults.values())
            .filter((result) => result.confidence >= 0.05)
            .sort((a, b) => b.confidence - a.confidence);

        res.send(JSON.stringify(finalResults));
    } catch (err) {
        res.status(err.code || 404).send(err.message || err);
        return;
    }
});

/**
 * Format a raw query result as a pizza-bot QueryResult object.
 *
 * @param rawResult a single, raw result object from within a
 *  DiscoveryV1.Response.result.results list
 */
const formatQueryResult = function (
    query: string,
    subject: string,
    raw: DiscoveryV1.QueryResult,
    passages: DiscoveryV1.QueryPassages[]
): QueryResult {
    const documentText = raw?.text || "";

    // Get the top 2 scoring passages provided by discovery
    const relevantPassages = passages
        .filter((p) => p.document_id === raw.id)
        .sort((a, b) => (b.passage_score || 0) - (a.passage_score || 0))
        .slice(0, 2)
        .map((p) => extendExcerpt(p.passage_text || "", documentText));

    // Use custom excerpt generator to add 2 additional excerpts
    const excerpts = extractExcerpts(query, documentText)
        .concat(relevantPassages)
        .filter((e) => isGoodExcerpt(e));

    const filename = raw?.extracted_metadata?.filename || "";

    // Split the category into its parts and format each part
    const categories = new Set<string>();
    for (const category of raw?.enriched_text?.categories || []) {
        const categoryParts: string[] =
            category?.label?.substr(1).split("/") || [];
        for (const part of categoryParts) {
            categories.add(uppercaseWords(part));
        }
    }

    // Get wikipedia info for all for all of the entities and concepts
    const terms = [
        ...(raw?.enriched_text?.entities || []),
        ...(raw?.enriched_text?.concepts || []),
    ]
        .map((e: { text: string }) => e.text || "") // Extract the text from each of the entities and concepts
        .filter((e: string) => !!e) // Filter out empty strings
        .filter((term: string) => !exploreTermHandler.shouldIgnoreTerm(term)) // ignore unimportant entities and concepts
        .map((term: string) => exploreTermHandler.getExploreTerm(term)); // Get the wikipedia article data for the term

    // Eliminate duplicate entities and concepts
    const uniqueTerms = [];
    const set = new Set<string>();
    for (const term of terms) {
        if (!set.has(term.articleTitle)) {
            uniqueTerms.push(term);
            set.add(term.articleTitle);
        }
    }

    return {
        displayName: getDocumentDisplayName(filename),
        documentId: raw?.id || "",
        filename,
        text: documentText,
        excerpts,
        categories: Array.from(categories),
        confidence: raw?.result_metadata?.confidence || 0,
        score: raw?.result_metadata?.score || 0,
        documentUrl: getDocumentUrl(filename, subject),
        terms: uniqueTerms,
    };
};

/**
 * Capitalize each word in the given string and return the result
 * @param s the string to be formatted
 */
function uppercaseWords(s: string): string {
    return s.replace(/^\w| \w/g, (match) => match.toUpperCase());
}

/**
 * Returns the PASSAGE_LENGTH character long window centered on the given excerpt in the given document
 *
 * @param excerpt the original, short excerpt
 * @param document the document from which the excerpt is taken
 */
function extendExcerpt(excerpt: string, document: string): string {
    if (!excerpt || !document.includes(excerpt)) return "";

    const index = document.indexOf(excerpt);
    const delta = Math.ceil((EXCERPT_LENGTH - excerpt.length) / 2);

    return document.substring(
        Math.max(index - delta, 0),
        Math.min(index + excerpt.length + delta, document.length)
    );
}

/**
 * Indicates if the given excerpt is of good enough quality to return to the API caller.
 *
 * Excerpts are bad if they:
 * - Are empty,
 * - Contain several `GLYPH<...>` substrings
 *
 * @param excerpt the excerpt to evaluate
 */
function isGoodExcerpt(excerpt: string): boolean {
    if (!excerpt) return false;
    if (cleanExcerpt(excerpt).length < excerpt.length - 100) return false;

    return true;
}

/**
 * Extract text excerpts from a document that are relevant to the given query.
 *
 * @param query the query that produced this result
 * @param text the full input text from which excerpts should be extracted.
 */
function extractExcerpts(query: string, text: string): string[] {
    if (!text) return [];

    return getKExcerpts(query, text, 2, EXCERPT_LENGTH);
}

// https://localhost:3000/api/doc/biden_plan.pdf
router.get("/doc/:subject/:filename", (req, res) => {
    const subject = req.params["subject"];
    const filename = req.params["filename"];

    res.sendFile(
        path.join(__dirname, "..", "assets", "documents", subject, filename)
    );
});

/**
 * Construct a URL that links to the document with the given name
 *
 * @param filename the name of the document that this URL will point to
 */
function getDocumentUrl(filename: string, subject: string): string {
    const exists = fs.existsSync(
        path.join(__dirname, "..", "assets", "documents", subject, filename)
    );
    console.log(`getDocumentUrl exists(${exists}) - ${filename} - ${subject}`)
    if (exists) {
        return `http://${environment.baseUrl}:${process.env.PORT || environment.port}/api/doc/${subject}/${filename}`;
    } else {
        return "";
    }
}

/**
 * Returns a nice display name for the given filename. If no display name is found,
 * simply return the filename without the extension.
 *
 * @param filename the file to get the name for
 */
function getDocumentDisplayName(filename: string): string {
    return (
        displayNames.get(filename) ||
        filename.substring(0, filename.lastIndexOf("."))
    );
}

/**
 * Adds a piece of training data to a collection based on POST request body.
 */
router.post("/feedback", async (req, res) => {
    const params = req.body as FeedbackBody;

    if (
        !params.documentId ||
        !params.query ||
        !params.subject ||
        params.relevancy === undefined ||
        params.relevancy === null
    ) {
        res.status(400).send("Bad request. Check POST body format");
        return;
    }

    try {
        await addTrainingExample(
            params.query,
            params.subject,
            params.documentId,
            params.relevancy
        );
        res.status(200).end();
    } catch (err) {
        console.error(JSON.stringify(err));
        res.status(400).send(JSON.stringify(err));
    }
});

export default router;
