import * as pl from "pdfjs-dist";
import { AcademicDocumentProxy } from "./doc";

async function loadDocument(url: string): Promise<AcademicDocumentProxy> {
    const pdf = await pl.getDocument(url).promise;
    return new AcademicDocumentProxy(pdf);
}

it("extracts correct title", async () => {
    const cases = {
        "res/lei.pdf": "Tackling Parallelization Challenges of Kernel Network Stack for Container Overlay Networks",
        "res/miano.pdf": "A Framework for eBPF-Based Network Functions in an Era of Microservices"
    };

    for (const [url, title] of Object.entries(cases)) {
        const doc = await loadDocument(url);
        const title = await doc.loadTitle();
    
        expect(title).toBe("Tackling Parallelization Challenges of Kernel Network Stack for Container Overlay Networks");
    }
});