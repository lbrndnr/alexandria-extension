import * as pdfLib from "pdfjs-dist";
import * as pdfViewer from "pdfjs-dist/web/pdf_viewer";
// const xref = require("crossref");

pdfLib.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

class PDFViewer {

    url: String
    pdf: pdfLib.PDFDocumentProxy | undefined
    container: HTMLDivElement;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    load() {
        pdfLib.getDocument(this.url).promise.then((pdf: pdfLib.PDFDocumentProxy) => {
            this.pdf = pdf;

            const eventBus = new pdfViewer.EventBus();
            const linkService = new pdfViewer.PDFLinkService({
                eventBus,
                externalLinkRel: "noopener noreferrer nofollow",
                externalLinkTarget: pdfViewer.LinkTarget.BLANK
            });	
            const viewer = new pdfViewer.PDFViewer({
                container: this.container,
                eventBus,
                linkService,
                l10n: pdfViewer.NullL10n,
                textLayerMode: 2
            });

            linkService.setViewer(viewer);

            eventBus.on("pagesinit", function () {
                viewer.currentScaleValue = "page-width";
            });

            viewer.setDocument(this.pdf);
            linkService.setDocument(this.pdf);
        });
    }

}

window.onload = () => {
    if (document.contentType != "application/pdf") return;

    const container = prepareBody();    
    const url = window.location.href;
    const viewer = new PDFViewer(url, container);
    viewer.load();

    // const title = "Pollux: Co-adaptive Cluster Scheduling for Goodput-Optimized Deep Learning";
    // const query = { query: title };
    // xref.works(query, (err: any, objs: any, nextOpts: any, done: boolean) => {
    //     console.log(objs);
    // });
};

function prepareBody() {
    const container = document.createElement("div");
    container.setAttribute("id", "pdf-container");

    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    container.appendChild(viewer);

    document.body.replaceChildren(container);

    return container;
}