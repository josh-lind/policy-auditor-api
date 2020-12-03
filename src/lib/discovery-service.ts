import DiscoveryV1 = require("ibm-watson/discovery/v1");
import Auth = require("ibm-watson/auth");
import { environment } from "../environment";
import { Relevancy } from "pizza-bot-shared";

const discovery = new DiscoveryV1({
    version: environment.discovery.version,
    authenticator: new Auth.IamAuthenticator({
        apikey: environment.discovery.apiKey,
    }),
    url: environment.discovery.url,
});

export type DiscoveryResponse = DiscoveryV1.Response<DiscoveryV1.QueryResponse>;

/**
 * Query Discovery service for documents related to `subject` related to the given `query`.
 *
 * @param subject "biden" or "trump"
 * @param query the natural language query string that should be searched for
 */
export function queryDiscovery(
    query: string,
    subject: string
): Promise<DiscoveryResponse> {
    if (!environment.discovery.collectionIds.has(subject.toLowerCase())) {
        throw `Unknown subject '${subject}'`;
    }

    const params: DiscoveryV1.QueryParams = {
        environmentId: environment.discovery.environmentId,
        collectionId:
            environment.discovery.collectionIds.get(subject.toLowerCase()) ||
            "",
        naturalLanguageQuery: query,
        passages: true,
    };

    return discovery.query(params);
}

/**
 * Adds a single training example to the indicated collection.
 *
 * @param query The natural language training query that the example should be associated with.
 * @param subject The collection subject (Trump or Biden).
 * @param docId The ID of the document that serves as a training example.
 * @param relevancy How relevant the indicated document was to the given training query.
 */
export async function addTrainingExample(
    query: string,
    subject: string,
    docId: string,
    relevancy: Relevancy
): Promise<void> {
    // Basic configuration
    if (!environment.discovery.collectionIds.has(subject.toLowerCase())) {
        throw `Unknown subject '${subject}'`;
    }
    const config = {
        environmentId: environment.discovery.environmentId,
        collectionId:
            environment.discovery.collectionIds.get(subject.toLowerCase()) ||
            "",
    };

    // List the training examples already in discovery
    const trainingData =
        (await discovery.listTrainingData(config)).result?.queries || [];

    // Attempt to find this query in the list of existing training queries, ignore differences in capitalization
    const normalizedQuery = query.trim().toLowerCase();
    const match = trainingData.find(
        (tq) => (tq.natural_language_query || "") === normalizedQuery
    );

    if (match && !match?.examples?.find((ex) => ex.document_id === docId)) {
        // If the query already exists but this document has been given a relevancy yet, add this document
        discovery.createTrainingExample({
            queryId: match.query_id || "",
            documentId: docId,
            relevance: relevancy as number,
            environmentId: config.environmentId,
            collectionId: config.collectionId,
        });
    } else if (!match) {
        // If we are already at the maximum number of training queries (10,000), we need to delete one.
        // We will delete the one with the fewest number of associated examples.
        if (trainingData.length >= 10_000) {
            let minExampleQuery = trainingData[0];
            for (const tq of trainingData) {
                if (
                    (tq.examples?.length || 0) <
                    (minExampleQuery.examples?.length || 0)
                ) {
                    minExampleQuery = tq;
                }
            }

            // delete the query
            discovery.deleteTrainingData({
                environmentId: config.environmentId,
                collectionId: config.collectionId,
                queryId: minExampleQuery.query_id || "",
            });
        }

        // Finally, add a new training query with the new example
        discovery.addTrainingData({
            environmentId: config.environmentId,
            collectionId: config.collectionId,
            naturalLanguageQuery: normalizedQuery,
            examples: [{ document_id: docId, relevance: relevancy as number }],
        });
    }
}

/**
 * Get a list of all of the entities and concepts that are in the discovery system
 */
export async function getEntitiesAndConcepts(): Promise<string[]> {
    // Run queries for each subject
    const promises = [];
    for (const subject of environment.discovery.collectionIds.keys()) {
        // Set up a base set of params for this subject
        const baseParams: DiscoveryV1.QueryParams = {
            environmentId: environment.discovery.environmentId,
            collectionId:
                environment.discovery.collectionIds.get(
                    subject.toLowerCase()
                ) || "",
        };

        // Get up to 1000 relevant entitities
        promises.push(
            discovery.query({
                aggregation: "term(enriched_text.entities.text,count:1000)",
                ...baseParams,
            })
        );

        // Get up to 1000 relevant concepts
        promises.push(
            discovery.query({
                aggregation: "term(enriched_text.concepts.text,count:1000)",
                ...baseParams,
            })
        );
    }

    // Wait for all of the queries to complete
    const subjectResults = (await Promise.all(promises))
        .map((response) => response.result || null)
        .filter((result) => !!result);

    // Aggregate all of the entities and concepts together, de-duplicate
    const terms = new Set<string>();
    for (const result of subjectResults) {
        const aggregations = result.aggregations || [null];
        const aggregation = aggregations[0];
        const results = aggregation?.results;
        const newTerms =
            results
                ?.map((result) => result.key || "")
                .filter((term) => !!term) || [];

        for (const term of newTerms) {
            terms.add(term);
        }
    }

    return Array.from(terms);
}
