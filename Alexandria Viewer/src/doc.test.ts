import * as pl from "pdfjs-dist";
import { AcademicDocumentProxy } from "./doc";

async function loadDocument(url: string): Promise<AcademicDocumentProxy> {
    const pdf = await pl.getDocument(url).promise;
    return new AcademicDocumentProxy(pdf);
}

describe("loads the title", () => {
    const cases = {
        "res/lei.pdf": "Tackling Parallelization Challenges of Kernel Network Stack for Container Overlay Networks",
        "res/miano.pdf": "A Framework for eBPF-Based Network Functions in an Era of Microservices",
        "res/mehra.pdf": "TCP-BASED VIDEO STREAMING USING RECEIVER-DRIVEN BANDWIDTH SHARING",
        "res/rajasekaran.pdf": "CASSINI: Network-Aware Job Scheduling in Machine Learning Clusters",
        "res/mahajan.pdf": "Themis: Fair and Efficient GPU Cluster Scheduling",
    };

    for (const [url, expectedTitle] of Object.entries(cases)) {
        it(url, async () => {
            const doc = await loadDocument(url);
            const title = await doc.loadTitle();
        
            expect(title).toBe(expectedTitle);
        });
    }
});

describe("loads all citations", () => {
    const cases = {
        "res/qiao.pdf": [2, ["31", "67", "46", "57"]],
        "res/zhu.pdf": [1, ["2", "2", "1", "31", "38", "4", "18", "30", "39", "4", "18", "3", "14"]],
        "res/he.pdf": [1, ["1", "16", "4", "9", "10", "12", "6", "2", "20"]],
        "res/elokda.pdf": [1, ["1", "2", "3", "4", "5", "6", "7", "8", "4", "9", "10", "4", "11"]]
    };

    for (const [url, [pageNumber, expectedCitations]] of Object.entries(cases)) {
        it(url, async () => {
            const doc = await loadDocument(url);

            var citations = new Array<string>();
            for await (const [item, ranges] of doc.iterateCitations(pageNumber as number)) {    
                expect(ranges.length).toBeGreaterThan(0);
                for (const [s, e] of ranges) {
                    citations.push(item.str.substring(s, e));
                }
            }
        
            expect(citations).toEqual(expectedCitations);
        });
    }
});

describe("loads all references", () => {
    const cases = {
        "res/he.pdf": 33,
        "res/elokda.pdf": 66,
        "res/lei.pdf": 29,
        "res/mehra.pdf": 18,
        "res/miano.pdf": 69
    };

    for (const [url, expectedNumReferences] of Object.entries(cases)) {
        it(url, async () => {
            const doc = await loadDocument(url);
            const refs = await doc.loadReferences();
            const expectedRefs = Array.from({length: expectedNumReferences}, (x, i) => String(i + 1));
        
            expect(refs).not.toBeNull();
            expect(Array.from(refs.keys())).toEqual(expect.arrayContaining(expectedRefs))
        });
    }
});

describe("finds the title", () => {
    const cases = {
        "res/qiao.pdf": [[1, 2], "Pollux: Co-adaptive Cluster Scheduling for Goodput-Optimized Deep Learning"],
        "res/zhu.pdf": [[1], "Dissecting Service Mesh Overheads"],
        "res/he.pdf": [[1], "RingGuard: Guard io_uring with eBPF"]
    };

    for (const [url, [pageNumbers, expectedTitle]] of Object.entries(cases)) {
        it(url, async () => {
            const doc = await loadDocument(url);

            for (const pageNumber of pageNumbers) {
                for await (const occurrences of doc.iterateOccurences(pageNumber as number, expectedTitle as string)) {    
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

                    expect(title).toBe(expectedTitle);
                }
            }
        });
    }
});