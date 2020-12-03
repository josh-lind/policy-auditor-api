import fs = require("fs");
import path = require("path");
import { displayNames } from "../display-names";

/**
 * Check that every document has a display name. Emit warnings for any that don't.
 */
export function checkDisplayNames(): void {
    let filenames: string[] = [];
    filenames = filenames.concat(
        fs.readdirSync(path.join(__dirname, "..", "..", "assets", "documents", "biden"))
    );
    filenames = filenames.concat(
        fs.readdirSync(path.join(__dirname, "..", "..", "assets", "documents", "trump"))
    );

    for (const filename of filenames) {
        if (!displayNames.has(filename)) {
            console.error(`WARN: Missing display name for ${filename}`);
        }
    }
}
