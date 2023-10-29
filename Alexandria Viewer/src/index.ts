import * as pl from "pdfjs-dist";
import * as pv from "pdfjs-dist/web/pdf_viewer";
// const xref = require("crossref");

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

class PDFViewer {

    url: String
    pdf: pl.PDFDocumentProxy | undefined
    container: HTMLDivElement;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    load() {
        pl.getDocument(this.url).promise.then((pdf: pl.PDFDocumentProxy) => {
            this.pdf = pdf;

            const eventBus = new pv.EventBus();
            const linkService = new pv.PDFLinkService({
                eventBus,
                externalLinkRel: "noopener noreferrer nofollow",
                externalLinkTarget: pv.LinkTarget.BLANK
            });	
            const viewer = new pv.PDFViewer({
                container: this.container,
                eventBus,
                linkService,
                l10n: pv.NullL10n,
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
    container.setAttribute("id", "alexandria-pdf-container");

    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    container.appendChild(viewer);

    document.body.replaceChildren(container);

    return container;
}