import * as pl from "pdfjs-dist";
import { AcademicDocumentProxy } from "./doc";

async function loadDocument(url: string): Promise<AcademicDocumentProxy> {
    const pdf = await pl.getDocument(url).promise;
    return new AcademicDocumentProxy(pdf);
}

test("extracts title", async () => {
    const url = "https://www.usenix.org/system/files/hotcloud19-paper-lei.pdf";
    const doc = await loadDocument(url);
    const title = await doc.loadTitle();
    
    expect(title).toBe("Tackling Parallelization Challenges of Kernel Network Stack for Container Overlay Networks");
});