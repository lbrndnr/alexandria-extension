import * as pl from "pdfjs-dist";
import { AcademicDocumentProxy } from "./doc";

async function loadDocument(url: string): Promise<AcademicDocumentProxy> {
    const pdf = await pl.getDocument(url).promise;
    return new AcademicDocumentProxy(pdf);
}

it("loads the title", async () => {
    const cases = {
        "res/lei.pdf": "Tackling Parallelization Challenges of Kernel Network Stack for Container Overlay Networks",
        "res/miano.pdf": "A Framework for eBPF-Based Network Functions in an Era of Microservices",
        "res/mehra.pdf": "TCP-BASED VIDEO STREAMING USING RECEIVER-DRIVEN BANDWIDTH SHARING"
    };

    for (const [url, expectedTitle] of Object.entries(cases)) {
        const doc = await loadDocument(url);
        const title = await doc.loadTitle();
    
        expect(title).toBe(expectedTitle);
    }
});

it("loads all citations", async () => {
    const cases = {
        "res/qiao.pdf": [2, ["31", "67", "46", "57"]],
        "res/zhu.pdf": [1, ["2", "2", "1", "31", "38", "4", "18", "30", "39", "4", "18", "3", "14"]],
        "res/he.pdf": [1, ["1", "16", "4", "9", "10", "12", "6", "2", "20"]]
    };

    for (const [url, [pageNumber, expectedCitations]] of Object.entries(cases)) {
        const doc = await loadDocument(url);

        var citations = new Array<string>();
        for await (const [item, ranges] of doc.iterateCitations(pageNumber as number)) {    
            expect(ranges.length).toBeGreaterThan(0);
            for (const [s, e] of ranges) {
                citations.push(item.str.substring(s, e));
            }
        }
    
        expect(citations).toEqual(expectedCitations);
    }
});

it("loads all references", async () => {
    const cases = {
        "res/he.pdf": 33
    };

    for (const [url, expectedNumReferences] of Object.entries(cases)) {
        const doc = await loadDocument(url);
        const refs = await doc.loadReferences();
    
        expect(refs).not.toBeNull();
        expect(refs.size).toEqual(expectedNumReferences);
    }
});

it("finds the title", async () => {
    const cases = {
        "res/qiao.pdf": [[1, 2], "Pollux: Co-adaptive Cluster Scheduling for Goodput-Optimized Deep Learning"],
        "res/zhu.pdf": [[1], "Dissecting Service Mesh Overheads"],
        "res/he.pdf": [[1], "RingGuard: Guard io_uring with eBPF"]
    };

    for (const [url, [pageNumbers, expectedTitle]] of Object.entries(cases)) {
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
    }
});