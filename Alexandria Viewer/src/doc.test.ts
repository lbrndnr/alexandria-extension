import * as pl from "pdfjs-dist";
import { AcademicDocumentProxy } from "./doc";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

interface PDFTestCase {
    title: string,
    remoteURL: string,
    localURL: string,
    path: string,
    citationsOnPage: [number, string[]][],
    numReferences: number,
    references: { [k: string]: string }
}

function loadTestCases(): Array<PDFTestCase> {
    const dir = "res";
    const files = fs.readdirSync(dir)
                    .filter(f => path.extname(f).toLowerCase() === ".json");

    var cases = new Array<PDFTestCase>;
    for (const file of files) {
        const url = path.join(dir, file);
        const data = fs.readFileSync(url, "utf8");
        var config = JSON.parse(data) as PDFTestCase;
        config.localURL = path.join(dir, path.basename(file, ".json") + ".pdf");
        config.path = url;

        cases.push(config);
    }

    return cases;
}

async function loadDocument(url: string): Promise<AcademicDocumentProxy> {
    const pdf = await pl.getDocument(url).promise;
    return new AcademicDocumentProxy(pdf);
}

beforeAll(() => {
    const cases = loadTestCases();
    for (const c of cases) {
        if (!fs.existsSync(c.localURL)) {
            console.log("Downloading file for", c.localURL);

            return new Promise<void>((resolve, reject) => {
                const options = {
                    headers: {
                        "User-Agent": "alexandria"
                    }
                }

                const file = fs.createWriteStream(c.localURL);
                https.get(c.remoteURL, options, res => {
                    file.on("finish", function () {
                            console.log("done");
                            file.close();
                            resolve();
                    });

                    res.pipe(file)
                        .on("error", (err) => {
                            reject(err);
                    });
                });
            });
        }
    }
}, 100000);

describe("loads the title", () => {
    const cases = loadTestCases();
    for (const c of cases) {
        it(c.localURL, async () => {
            const doc = await loadDocument(c.localURL);
            const title = await doc.loadTitle();
        
            expect(title).toBe(c.title);
        });
    }
});

describe("finds the title", () => {
    const cases = loadTestCases();
    for (const c of cases) {
        it(c.localURL, async () => {
            const doc = await loadDocument(c.localURL);

            for await (const occurrences of doc.iterateOccurences(1, c.title)) {    
                var title = "";
                for (const [item, s, e] of occurrences) {
                    expect(s).toBeGreaterThanOrEqual(0);
                    expect(s).toBeLessThan(e);
    
                    title += item.str.substring(s, e);
                    if (item.hasEOL) {
                        title += " ";
                    }
                }
                title = title.trim();

                expect(title).toBe(c.title);
            }
        });
    }
});

describe("loads all citations", () => {
    const cases = loadTestCases();
    for (const c of cases) {
        if (c.citationsOnPage === undefined) continue;

        it(c.localURL, async () => {
            const doc = await loadDocument(c.localURL);
            for (const [pageNumber, expectedCitations] of c.citationsOnPage) {
                var citations = new Array<string>();
                for await (const [item, ranges] of doc.iterateCitations(pageNumber)) {    
                    expect(ranges.length).toBeGreaterThan(0);
                    for (const [s, e] of ranges) {
                        citations.push(item.str.substring(s, e));
                    }
                }
            
                expect(citations).toEqual(expectedCitations);
            }
        });
    }
});

describe("loads all references", () => {
    const cases = loadTestCases();
    for (const c of cases) {
        it(c.localURL, async () => {
            const doc = await loadDocument(c.localURL);
            const refs = await doc.loadReferences();
            const expectedRefs = Array.from({length: c.numReferences}, (x, i) => String(i + 1));
        
            expect(refs).not.toBeNull();
            expect(Array.from(refs.keys())).toEqual(expect.arrayContaining(expectedRefs));

            for (const ref of refs.values()) {
                expect(ref.length).toBeGreaterThan(0);
            }
        });
    }
});

describe("formats the references correctly", () => {
    const cases = loadTestCases();
    for (const c of cases) {
        if (c.references === undefined) continue;

        it(c.localURL, async () => {
            const doc = await loadDocument(c.localURL);
            const refs = await doc.loadReferences();

            for (const key in c.references) {
                expect(refs.get(key)).toBe(c.references[key]);
            }
        });
    }
});