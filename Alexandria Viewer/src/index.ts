import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { CrossrefClient, QueryWorksParams } from "@jamesgopsill/crossref-client"

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

            pdf.getPage(1).then(page => {
                extractTitleFromPage(page).then(value => {
                    const title = value[0];
                    document.title = title;

                    // const client = new CrossrefClient()

                    // const search: QueryWorksParams = {
                    //     queryTitle: title,
                    // };
                    // // client.works(search).then(r => {
                    // //     console.log(r);
                    // //     for (const paper of r.content.message.items) {
                    // //         console.log(paper.title);
                    // //     }
                    // // });
                });
            });

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
                l10n: pv.NullL10n
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
}

function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.replaceChildren(container);

    return container;
}

async function extractTitleFromPage(page: pl.PDFPageProxy): Promise<[string, Array<any>]> {
    let textContent = await page.getTextContent();

    var title = "";
    var maxHeight = 0;
    var rect = [0, 0, 0, 0];

    for (const elem of textContent.items) {
        const item = elem as TextItem;

        if (item.height > maxHeight) {
            maxHeight = item.height;
            title = item.str;
            rect = [item.transform[4], item.transform[5], item.width, item.height];
        }
        else if (item.height == maxHeight) {
            title += item.str;

            const nr = [item.transform[4], item.transform[5], item.width, item.height];
            rect = [Math.min(rect[0], nr[0]), Math.min(rect[1], nr[1]), Math.max(rect[2], nr[2]), Math.max(rect[3], nr[3])];
        }
    }

    return [title, rect];
}